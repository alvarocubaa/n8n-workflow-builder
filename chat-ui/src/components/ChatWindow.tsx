'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ChatInput from './ChatInput';
import MessageBubble, { type Message } from './MessageBubble';
import DepartmentSelector from './DepartmentSelector';

interface ChatWindowProps {
  conversationId?: string;
  initialMessages?: Message[];
  initialDepartmentId?: string;
}

export default function ChatWindow({
  conversationId,
  initialMessages = [],
  initialDepartmentId,
}: ChatWindowProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? 'cx');
  const departmentLocked = useRef(!!conversationId || initialMessages.length > 0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentConvId = useRef<string | undefined>(conversationId);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);

    // Append user message immediately
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    // Prepare a placeholder for the assistant response
    const assistantMsg: Message = {
      role: 'model',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    setMessages(prev => [...prev, assistantMsg]);

    // Lock department after first message
    departmentLocked.current = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: currentConvId.current,
          departmentId,
        }),
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
            <div className="mb-4 rounded-full bg-blue-100 p-4">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">
              Build an n8n workflow
            </h2>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Select your department, then describe what you want to automate.
            </p>
            <div className="mt-4 mb-4">
              <DepartmentSelector
                value={departmentId}
                onChange={setDepartmentId}
                disabled={departmentLocked.current}
              />
            </div>
            <div className="mt-2 grid max-w-md gap-2 text-sm">
              {[
                'Post a Slack message when a webhook is received',
                'Send a daily report email with data from Google Sheets',
                'Create a Jira ticket when a GitHub issue is opened',
              ].map(example => (
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
              <MessageBubble key={i} message={msg} />
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
      />
    </div>
  );
}
