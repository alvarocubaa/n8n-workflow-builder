'use client';

import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import FeedbackButtons from './FeedbackButtons';
import type { AssistantMode } from '@/lib/types';

export interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  timestamp?: string;
  toolCalls?: string[]; // names of tools called during this response
  isStreaming?: boolean;
}

interface MessageBubbleProps {
  message: Message;
  conversationId?: string;
  departmentId?: string;
  messageIndex?: number;
  mode?: AssistantMode;
}

function DownloadButton({ json, filename }: { json: string; filename?: string }) {
  function handleDownload() {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? 'workflow.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-600 transition"
    >
      Download
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded bg-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-600 transition"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function DeployButton({ json, conversationId, departmentId }: { json: string; conversationId?: string; departmentId?: string }) {
  const [state, setState] = useState<'idle' | 'deploying' | 'ok' | 'err'>('idle');
  const [workflowUrl, setWorkflowUrl] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [transferWarning, setTransferWarning] = useState<string | null>(null);

  async function handleDeploy() {
    setState('deploying');
    setErrMsg(null);
    setTransferWarning(null);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowJson: json, conversationId, departmentId }),
      });
      const data = (await res.json()) as {
        workflowUrl?: string; workflowName?: string;
        error?: string; detail?: string;
        transferStatus?: string; transferError?: string;
      };
      if (!res.ok || data.error) {
        setErrMsg(data.detail ?? data.error ?? 'Deploy failed');
        setState('err');
      } else {
        setWorkflowUrl(data.workflowUrl ?? null);
        if (data.transferStatus === 'failed') {
          setTransferWarning(data.transferError ?? 'Transfer to department project failed');
        }
        setState('ok');
      }
    } catch (e) {
      setErrMsg(String(e));
      setState('err');
    }
  }

  if (state === 'ok' && workflowUrl) {
    return (
      <div className="flex flex-col items-end gap-1">
        <a
          href={workflowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 transition"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Open in n8n
        </a>
        {transferWarning && (
          <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700" title={transferWarning}>
            Transfer to project failed
          </span>
        )}
      </div>
    );
  }

  if (state === 'err') {
    return (
      <span className="rounded-lg bg-coral-50 px-3 py-1 text-xs font-medium text-coral-300 ring-1 ring-coral-100" title={errMsg ?? undefined}>
        Deploy failed
      </span>
    );
  }

  return (
    <button
      onClick={handleDeploy}
      disabled={state === 'deploying'}
      className="inline-flex items-center gap-1.5 rounded-lg bg-guesty-300 px-3 py-1 text-xs font-medium text-white hover:bg-guesty-400 disabled:opacity-50 transition"
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
      </svg>
      {state === 'deploying' ? 'Deploying...' : 'Deploy to n8n'}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="h-2 w-2 rounded-full bg-guesty-200 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-2 w-2 rounded-full bg-guesty-200 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-2 w-2 rounded-full bg-guesty-200 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

function MessageBubbleInner({ message, conversationId, departmentId, messageIndex, mode = 'builder' }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end animate-fadeIn">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-guesty-400 px-4 py-2.5 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5 animate-fadeIn">
      {/* AI Avatar */}
      <div className="flex-shrink-0 mt-1">
        <div className="h-7 w-7 rounded-full bg-guesty-100 flex items-center justify-center">
          <span className="text-xs font-bold text-guesty-300">G</span>
        </div>
      </div>

      <div className="w-full max-w-[88%] rounded-2xl rounded-tl-sm border border-warm-100 bg-white px-4 py-3 shadow-sm">
        {/* Tool call badges */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-guesty-100/40 px-2 py-0.5 text-xs font-medium text-guesty-300 ring-1 ring-guesty-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-guesty-300" />
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Message content — rendered as Markdown */}
        <div className="prose prose-sm max-w-none text-gray-800">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Syntax-highlighted code blocks with copy button
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className ?? '');
                const codeString = String(children).replace(/\n$/, '');
                const isBlock = !!match;

                if (isBlock) {
                  const isJson = match[1] === 'json';
                  // Detect n8n workflow JSON (has nodes + connections)
                  const looksLikeWorkflow = isJson && codeString.includes('"nodes"');
                  let isValidJson = false;
                  let isSingleNode = false;
                  if (looksLikeWorkflow) {
                    try {
                      const parsed = JSON.parse(codeString) as { nodes?: unknown[] };
                      isValidJson = true;
                      isSingleNode = Array.isArray(parsed.nodes) && parsed.nodes.length === 1;
                    } catch { /* truncated or invalid JSON */ }
                  }
                  const isWorkflow = looksLikeWorkflow && isValidJson;
                  const isTruncated = looksLikeWorkflow && !isValidJson;

                  if (isTruncated) {
                    return (
                      <div className="relative">
                        <div className="mb-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                          Workflow JSON was truncated. Download the partial file and ask the AI to regenerate.
                        </div>
                        <div className="flex gap-2">
                          <DownloadButton json={codeString} filename="workflow-partial.json" />
                          <CopyButton text={codeString} />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="relative my-2">
                      {/* Code block header bar */}
                      <div className="flex items-center justify-between rounded-t-lg bg-guesty-400 px-3 py-1.5">
                        <span className="text-xs font-medium text-guesty-100">{match[1].toUpperCase()}</span>
                        <div className="flex gap-2">
                          {mode === 'builder' && isWorkflow && !isSingleNode && <DeployButton json={codeString} conversationId={conversationId} departmentId={departmentId} />}
                          {mode === 'builder' && isWorkflow && <DownloadButton json={codeString} />}
                          <CopyButton text={codeString} />
                        </div>
                      </div>
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ borderRadius: '0 0 0.5rem 0.5rem', margin: 0 }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </div>
                  );
                }

                return (
                  <code
                    className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Streaming indicator — three bouncing dots */}
        {message.isStreaming && !message.content && <TypingIndicator />}

        {/* Feedback buttons (shown after streaming completes) */}
        {!message.isStreaming && (
          <FeedbackButtons conversationId={conversationId} messageIndex={messageIndex} />
        )}
      </div>
    </div>
  );
}

const MessageBubble = memo(MessageBubbleInner, (prev, next) => {
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.isStreaming !== next.message.isStreaming) return false;
  if (prev.message.toolCalls?.length !== next.message.toolCalls?.length) return false;
  if (prev.conversationId !== next.conversationId) return false;
  if (prev.departmentId !== next.departmentId) return false;
  if (prev.mode !== next.mode) return false;
  return true;
});

export default MessageBubble;
