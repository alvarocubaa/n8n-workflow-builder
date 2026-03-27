'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatInput, { type AttachedFile } from './ChatInput';
import MessageBubble, { type Message } from './MessageBubble';
import DepartmentSelector from './DepartmentSelector';
import ModeSelector from './ModeSelector';
import type { AssistantMode } from '@/lib/types';

/** Memoized message list — prevents re-rendering all messages when input state changes. */
const MessageList = memo(function MessageList({
  messages,
  conversationId,
  departmentId,
  mode,
}: {
  messages: Message[];
  conversationId?: string;
  departmentId: string;
  mode: AssistantMode;
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

export default function ChatWindow({
  conversationId,
  initialMessages = [],
  initialDepartmentId,
  initialMode,
}: ChatWindowProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? 'cx');
  const [mode, setMode] = useState<AssistantMode>(initialMode ?? 'builder');
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const departmentLocked = useRef(!!conversationId || initialMessages.length > 0);
  const modeLocked = useRef(!!conversationId || initialMessages.length > 0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentConvId = useRef<string | undefined>(conversationId);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    // Capture file before clearing state
    const fileToSend = attachedFile;

    setInput('');
    setAttachedFile(null);
    setStreaming(true);

    // Append user message immediately (show original text, not file content)
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: fileToSend ? `[${fileToSend.name}] ${text}` : text };
    setMessages(prev => [...prev, userMsg]);

    // Prepare a placeholder for the assistant response
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: 'model',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    // Lock department and mode after first message
    departmentLocked.current = true;
    modeLocked.current = true;

    try {
      // Build request body — file sent as structured object, not inlined in message
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

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
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
          };

          try {
            event = JSON.parse(raw);
          } catch {
            continue;
          }

          if (event.type === 'text_chunk' && event.text) {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.text!,
                };
              }
              return updated;
            });
          } else if (event.type === 'tool_call' && event.name) {
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'model') {
                updated[updated.length - 1] = {
                  ...last,
                  toolCalls: [...(last.toolCalls ?? []), event.name!],
                };
              }
              return updated;
            });
          } else if (event.type === 'done') {
            // Mark streaming complete and update URL if new conversation
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
              // Only update URL for real Firestore IDs — local-* IDs have no
              // persisted page to navigate to, so skip the redirect.
              if (!event.conversationId.startsWith('local-')) {
                router.replace(`/chat/${event.conversationId}`);
              }
            }
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
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'model') {
          updated[updated.length - 1] = {
            ...last,
            content: `Failed to get response: ${String(err)}`,
            isStreaming: false,
          };
        }
        return updated;
      });
    } finally {
      setStreaming(false);
    }
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
            />
            <div ref={bottomRef} />
          </>
        )}
      </div>

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
