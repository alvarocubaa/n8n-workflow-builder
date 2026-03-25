'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatInput, { type AttachedFile } from './ChatInput';
import MessageBubble, { type Message } from './MessageBubble';
import DepartmentSelector from './DepartmentSelector';
import ModeSelector from './ModeSelector';
import type { AssistantMode } from '@/lib/types';

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
    const userMsg: Message = { role: 'user', content: fileToSend ? `[${fileToSend.name}] ${text}` : text };
    setMessages(prev => [...prev, userMsg]);

    // Prepare a placeholder for the assistant response
    const assistantMsg: Message = {
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
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="text-lg font-semibold text-gray-800">
              n8n Workflow Assistant
            </h2>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Choose how you want to work, then select your department.
            </p>

            {/* Mode selector */}
            <div className="mt-5 mb-4">
              <ModeSelector
                value={mode}
                onChange={setMode}
                disabled={modeLocked.current}
              />
            </div>

            {/* Department selector */}
            <div className="mb-4">
              <DepartmentSelector
                value={departmentId}
                onChange={setDepartmentId}
                disabled={departmentLocked.current}
              />
            </div>

            {/* Mode-specific example prompts */}
            <div className="mt-2 grid max-w-md gap-2 text-sm">
              {(mode === 'data'
                ? [
                    'Where does customer churn data live?',
                    'How do I join Zendesk tickets to Salesforce accounts?',
                    'Help me plan data sources for an AI agent that detects upsell opportunities',
                  ]
                : [
                    'Post a Slack message when a webhook is received',
                    'Send a daily report email with data from Google Sheets',
                    'Create a Jira ticket when a GitHub issue is opened',
                  ]
              ).map(example => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-left text-gray-600 transition hover:border-blue-300 hover:text-blue-600"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                conversationId={currentConvId.current}
                departmentId={departmentId}
                messageIndex={i}
                mode={mode}
              />
            ))}
            <div ref={bottomRef} />
          </div>
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
      />
    </div>
  );
}
