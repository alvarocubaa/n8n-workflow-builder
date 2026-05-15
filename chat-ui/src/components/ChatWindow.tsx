'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ChatInput, { type AttachedFile } from './ChatInput';
import MessageBubble, { type Message } from './MessageBubble';
import DepartmentSelector from './DepartmentSelector';
import ModeSelector from './ModeSelector';
import type { AssistantMode, InitiativePrefill, PromoteContext } from '@/lib/types';
import { emitToParent, isAllowedParentOrigin, isEmbedMode } from '@/lib/embed';

const STUCK_TIMEOUT_MS = 180_000; // 3 minutes of silence → abort with "stuck" error

/** Memoized message list — prevents re-rendering all messages when input state changes. */
const MessageList = memo(function MessageList({
  messages,
  conversationId,
  departmentId,
  mode,
  onCancel,
  initiativeId,
  promoteContext,
}: {
  messages: Message[];
  conversationId?: string;
  departmentId: string;
  mode: AssistantMode;
  onCancel: () => void;
  initiativeId?: string;
  promoteContext?: PromoteContext;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      {messages.map((msg, i) => (
        <MessageBubble
          key={msg.id ?? i}
          message={msg}
          conversationId={conversationId}
          departmentId={departmentId}
          messageIndex={i}
          mode={mode}
          onCancel={msg.isStreaming ? onCancel : undefined}
          initiativeId={initiativeId}
          promoteContext={promoteContext}
        />
      ))}
    </div>
  );
});

interface ChatWindowProps {
  conversationId?: string;
  initialMessages?: Message[];
  initialDepartmentId?: string;
  initialMode?: AssistantMode;
}

function decodePrefill(b64: string | null): InitiativePrefill | null {
  if (!b64) return null;
  try {
    const utf8 = atob(b64);
    // Mirror the encoder's UTF-8 round-trip (Hub encodes via unescape(encodeURIComponent(json))).
    const json = decodeURIComponent(escape(utf8));
    const parsed = JSON.parse(json) as InitiativePrefill;
    if (!parsed.initiative_id || !parsed.mode || !parsed.initiative_metadata?.title) {
      console.warn('Prefill payload is missing required fields, ignoring:', parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to decode prefill param, ignoring:', err);
    return null;
  }
}

function decodePromoteContext(b64: string | null): PromoteContext | null {
  if (!b64) return null;
  try {
    const utf8 = atob(b64);
    const json = decodeURIComponent(escape(utf8));
    const parsed = JSON.parse(json) as PromoteContext;
    if (!parsed.workflow_id || !parsed.innovation_item_id || !parsed.initiative_id || !parsed.department_id) {
      console.warn('Promote payload is missing required fields, ignoring:', parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to decode promote param, ignoring:', err);
    return null;
  }
}

export default function ChatWindow({
  conversationId,
  initialMessages = [],
  initialDepartmentId,
  initialMode,
}: ChatWindowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Decode the Hub-supplied prefill on first mount only. After the first turn
  // is sent, the prefill is persisted on the conversation doc server-side and
  // travels with `conversationId`, so we don't need to resend it.
  const [prefill] = useState<InitiativePrefill | null>(() => {
    if (conversationId) return null; // existing conversation — server already knows
    return decodePrefill(searchParams?.get('prefill') ?? null);
  });
  const [promoteContext] = useState<PromoteContext | null>(() => {
    if (conversationId) return null;
    return decodePromoteContext(searchParams?.get('promote') ?? null);
  });
  const prefillSentRef = useRef(false);
  const promoteContextSentRef = useRef(false);

  // Strip the URL params after decode so a refresh doesn't double-seed.
  useEffect(() => {
    if ((prefill && searchParams?.get('prefill')) || (promoteContext && searchParams?.get('promote'))) {
      router.replace('/chat');
    }
  }, [prefill, promoteContext, searchParams, router]);

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [departmentId, setDepartmentId] = useState(
    initialDepartmentId ?? promoteContext?.department_id ?? prefill?.initiative_metadata?.department_id ?? 'cx',
  );
  const [mode, setMode] = useState<AssistantMode>(initialMode ?? 'builder');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [retryable, setRetryable] = useState(false);
  const departmentLocked = useRef(
    !!conversationId || initialMessages.length > 0 || !!prefill?.initiative_metadata?.department_id || !!promoteContext?.department_id,
  );
  const modeLocked = useRef(!!conversationId || initialMessages.length > 0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentConvId = useRef<string | undefined>(conversationId);
  const abortRef = useRef<AbortController | null>(null);
  const lastEventAtRef = useRef<number>(0);
  const lastPromptRef = useRef<{ text: string; file: AttachedFile | null } | null>(null);
  // Direction-3 Phase 3 handoff: when the Hub auto-saves a draft initiative
  // and posts back `{ type: 'initiative_saved', initiative_id }`, we cache it
  // here and pass it to /api/chat on the next turn so the server swaps the
  // conversation's initiativeId from `__draft__` to the real UUID.
  const handoffInitiativeIdRef = useRef<string | null>(null);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Abort in-flight request when the component unmounts
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Take-to-Production: auto-fire the first turn when the page loads with a promote_context.
  // The system prompt's <promote_to_production> rule is deterministic on the presence of
  // <promote_context>, but the AI still needs SOMETHING to react to. The synthetic first
  // user message just kicks off the checklist; the rule does the heavy lifting.
  const promoteAutoFiredRef = useRef(false);
  useEffect(() => {
    if (!promoteContext) return;
    if (conversationId) return;            // existing conversation already handled
    if (promoteAutoFiredRef.current) return;
    if (streaming) return;
    promoteAutoFiredRef.current = true;
    void runRequest('Run the production checklist for this workflow.', null, false);
    // We intentionally only depend on promoteContext + conversationId; runRequest is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoteContext, conversationId]);

  // Direction-3 Phase 3 handoff (parent → iframe): listen for the Hub's
  // `initiative_saved` postMessage. Cache the new id; the next /api/chat
  // turn ships it as `current_initiative_id` and the server swaps the
  // conversation's stored id.
  useEffect(() => {
    if (!isEmbedMode()) return;
    const onMessage = (event: MessageEvent) => {
      if (!isAllowedParentOrigin(event.origin)) return;
      const data = event.data as { type?: string; initiative_id?: string } | null;
      if (!data || data.type !== 'initiative_saved') return;
      if (typeof data.initiative_id !== 'string' || !data.initiative_id) return;
      if (data.initiative_id === '__draft__') return;
      handoffInitiativeIdRef.current = data.initiative_id;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  async function runRequest(text: string, fileToSend: AttachedFile | null, isRetry: boolean) {
    setRetryable(false);
    setStreaming(true);

    const start = Date.now();
    lastEventAtRef.current = start;
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: 'model',
      content: '',
      toolCalls: [],
      isStreaming: true,
      startedAt: start,
      lastEventAt: start,
    };

    if (isRetry) {
      // Replace the last assistant message (the errored one) with a fresh placeholder.
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
          updated[lastIdx] = assistantMsg;
        } else {
          updated.push(assistantMsg);
        }
        return updated;
      });
    } else {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: fileToSend ? `[${fileToSend.name}] ${text}` : text,
      };
      setMessages(prev => [...prev, userMsg, assistantMsg]);
    }

    // Lock department and mode after first message
    departmentLocked.current = true;
    modeLocked.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let stuckTimeout = false;

    // Inactivity watchdog — abort after STUCK_TIMEOUT_MS of silence
    const watchdog = setInterval(() => {
      if (Date.now() - lastEventAtRef.current > STUCK_TIMEOUT_MS) {
        stuckTimeout = true;
        controller.abort();
      }
    }, 5000);

    const touch = () => { lastEventAtRef.current = Date.now(); };

    try {
      const requestBody: Record<string, unknown> = {
        message: text,
        conversationId: currentConvId.current,
        departmentId,
        mode,
      };
      if (fileToSend) {
        requestBody.file = {
          name: fileToSend.name,
          content: fileToSend.content,
          encoding: fileToSend.encoding,
          mediaType: fileToSend.mediaType,
        };
      }
      // Send prefill exactly once — on the very first request of a Hub-initiated
      // session. After that, server-side conversation state has the initiative_id.
      if (prefill && !prefillSentRef.current && !currentConvId.current) {
        requestBody.prefill = prefill;
        prefillSentRef.current = true;
      }
      // Same one-shot semantics for the Take-to-Production promote_context payload.
      if (promoteContext && !promoteContextSentRef.current && !currentConvId.current) {
        requestBody.promote_context = promoteContext;
        promoteContextSentRef.current = true;
      }
      // Direction-3: the /chat/* page route's middleware sets x-embed:1, but
      // that header doesn't propagate to /api/chat XHRs. Signal embed mode
      // explicitly so the server can derive `source = 'hub_embed'`.
      if (isEmbedMode()) {
        requestBody.embed = true;
      }
      // Direction-3 Phase 3 handoff: pass the Hub-issued real initiative_id
      // once, so the server swaps the conversation's stored id from
      // `__draft__` to the real UUID. Cleared after we send it.
      if (handoffInitiativeIdRef.current) {
        requestBody.current_initiative_id = handoffInitiativeIdRef.current;
        handoffInitiativeIdRef.current = null;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: {
            type: string;
            text?: string;
            name?: string;
            args?: Record<string, unknown>;
            message?: string;
            conversationId?: string;
            initiative_id?: string;
            conversation_id?: string;
            extracted_fields?: Record<string, string | number>;
            extracted_fields_at?: string;
            // Redesign-v2 server-write events:
            url?: string;
            action?: 'created' | 'updated' | 'no_changes';
            updated_fields?: string[];
            reason?: string;
            mode?: string;
          };

          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === 'text_chunk' && event.text) {
            touch();
            const now = Date.now();
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.text!,
                  lastEventAt: now,
                };
              }
              return updated;
            });
          } else if (event.type === 'tool_call' && event.name) {
            touch();
            const now = Date.now();
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = {
                  ...last,
                  toolCalls: [...(last.toolCalls ?? []), event.name!],
                  lastEventAt: now,
                };
              }
              return updated;
            });
          } else if (event.type === 'done') {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = { ...last, isStreaming: false };
              }
              return updated;
            });

            if (event.conversationId && !currentConvId.current) {
              currentConvId.current = event.conversationId;
              if (!event.conversationId.startsWith('local-')) {
                router.replace(`/chat/${event.conversationId}`);
              }
            }
          } else if (event.type === 'extracted_fields') {
            // Direction 3: when running inside the Hub iframe, relay the
            // server-extracted planning fields up to the parent so the Hub
            // form's apply-suggestions pill refreshes without waiting for the
            // Supabase round trip. No-op outside embed mode.
            if (
              isEmbedMode() &&
              event.initiative_id &&
              event.conversation_id &&
              event.extracted_fields &&
              event.extracted_fields_at
            ) {
              emitToParent({
                type: 'extracted_fields_updated',
                initiative_id: event.initiative_id,
                conversation_id: event.conversation_id,
                extracted_fields: event.extracted_fields,
                extracted_fields_at: event.extracted_fields_at,
              });
            }
          } else if (event.type === 'request_workflow_handoff') {
            // Direction-3 Phase 3: AI emitted the <request_workflow_handoff />
            // sentinel. Ask the Hub to auto-save the draft initiative so the
            // workflow can be linked to a real id. Hub replies via postMessage
            // `initiative_saved` (handled in the message listener below).
            if (isEmbedMode() && event.initiative_id && event.conversation_id) {
              emitToParent({
                type: 'request_save_initiative',
                initiative_id: event.initiative_id,
                conversation_id: event.conversation_id,
              });
            }
          } else if (event.type === 'initiative_upserted') {
            // Redesign-v2 server-write: chat-ui's backend already created /
            // updated the initiative in the Hub. Append a synthetic assistant
            // message with the deep link and cache the new id for any
            // subsequent workflow build in this conversation.
            if (event.initiative_id && event.url) {
              handoffInitiativeIdRef.current = event.initiative_id;
              const verb = event.action === 'updated'
                ? 'updated'
                : event.action === 'no_changes'
                  ? 'already saved'
                  : 'created';
              const linkMsg: Message = {
                id: crypto.randomUUID(),
                role: 'model',
                content: `✓ Initiative ${verb}. **[Open in Hub →](${event.url})**`,
              };
              setMessages(prev => [...prev, linkMsg]);
              // Tell the Hub iframe parent so it can refresh its list / nav.
              if (isEmbedMode()) {
                emitToParent({
                  type: 'initiative_saved',
                  initiative_id: event.initiative_id,
                  url: event.url,
                  action: event.action ?? 'created',
                });
              }
            }
          } else if (event.type === 'initiative_upsert_failed') {
            // Show the failure inline so the user knows the AI's "Saving now…"
            // didn't take. The AI's next turn can recover conversationally.
            const reason = event.reason ?? 'Unknown error.';
            const errMsg: Message = {
              id: crypto.randomUUID(),
              role: 'model',
              content: `⚠ Couldn't save the initiative: ${reason}`,
            };
            setMessages(prev => [...prev, errMsg]);
          } else if (event.type === 'error') {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = {
                  ...last,
                  content: `Error: ${event.message ?? 'Unknown error'}`,
                  isStreaming: false,
                };
              }
              return updated;
            });
            setRetryable(true);
          }
        }
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const friendly = stuckTimeout
        ? 'No response for 3 minutes — connection likely dropped. Try again or refresh.'
        : isAbort
          ? 'Request cancelled.'
          : `Failed to get response: ${String(err)}`;
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'model') {
          updated[updated.length - 1] = {
            ...last,
            content: last.content ? `${last.content}\n\n_${friendly}_` : friendly,
            isStreaming: false,
          };
        }
        return updated;
      });
      setRetryable(true);
    } finally {
      clearInterval(watchdog);
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    const fileToSend = attachedFile;
    setInput('');
    setAttachedFile(null);
    lastPromptRef.current = { text, file: fileToSend };
    await runRequest(text, fileToSend, false);
  }

  async function retryLast() {
    if (streaming || !lastPromptRef.current) return;
    const { text, file } = lastPromptRef.current;
    await runRequest(text, file, true);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            {/* Welcome hero */}
            <div className="mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-guesty-100">
                <svg className="h-6 w-6 text-guesty-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-guesty-400">
                {mode === 'data' ? 'What data would you like to explore?' : 'What would you like to build?'}
              </h2>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                {mode === 'data'
                  ? 'Discover data sources, write queries, and plan AI agent architectures across Guesty systems.'
                  : 'Describe your automation in plain language and get a production-ready n8n workflow in minutes.'}
              </p>
            </div>

            {/* Mode selector */}
            <div className="mb-5">
              <ModeSelector
                value={mode}
                onChange={setMode}
                disabled={modeLocked.current}
              />
            </div>

            {/* Department selector */}
            <div className="mb-6">
              <DepartmentSelector
                value={departmentId}
                onChange={setDepartmentId}
                disabled={departmentLocked.current}
              />
            </div>

            {/* Example prompts as styled chips */}
            <div className="max-w-lg">
              <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-gray-400">Try an example</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(mode === 'data'
                  ? [
                      'Where does customer churn data live?',
                      'Join Zendesk tickets to Salesforce accounts',
                      'Plan data sources for an upsell AI agent',
                    ]
                  : [
                      'Post a Slack message on webhook',
                      'Daily report email from Google Sheets',
                      'Create Jira ticket from GitHub issue',
                    ]
                ).map(example => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="rounded-full border border-guesty-200/60 bg-white px-4 py-2 text-sm text-gray-600 transition hover:border-guesty-300 hover:bg-guesty-100/20 hover:text-guesty-400"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={messages}
              conversationId={currentConvId.current}
              departmentId={departmentId}
              mode={mode}
              onCancel={cancelStream}
              initiativeId={prefill?.initiative_id ?? promoteContext?.initiative_id}
              promoteContext={promoteContext ?? undefined}
            />
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Retry affordance — shown when the last turn failed/cancelled and there's a prompt to retry */}
      {retryable && !streaming && lastPromptRef.current && (
        <div className="mx-auto max-w-3xl px-4 pb-2">
          <button
            onClick={retryLast}
            className="inline-flex items-center gap-1.5 rounded-full border border-guesty-200 bg-white px-3 py-1 text-xs font-medium text-guesty-400 hover:bg-guesty-100/40 transition"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 9a7 7 0 0111.9-4.1M19 15a7 7 0 01-11.9 4.1" />
            </svg>
            Retry last message
          </button>
        </div>
      )}

      {/* Initiative pill — visible whenever a Hub-supplied prefill is in scope */}
      {prefill && (
        <div className="mx-auto max-w-3xl px-4 pb-1.5">
          <a
            href={prefill.initiative_metadata.hub_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-guesty-100 px-3 py-1 text-xs text-guesty-400 hover:bg-guesty-100/70 transition"
            title={`Open initiative in the Hub: ${prefill.initiative_metadata.title}`}
          >
            <span className="font-semibold uppercase tracking-wide">
              {prefill.mode === 'planning' ? 'Planning' : 'Building'}
            </span>
            <span className="text-guesty-400/60">·</span>
            <span className="max-w-[36ch] truncate">{prefill.initiative_metadata.title}</span>
            <svg className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      )}

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        disabled={streaming}
        attachedFile={attachedFile}
        onAttachFile={setAttachedFile}
        onRemoveFile={() => setAttachedFile(null)}
        mode={mode}
      />
    </div>
  );
}
