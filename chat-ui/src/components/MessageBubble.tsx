'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import FeedbackButtons from './FeedbackButtons';

export interface Message {
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
      className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
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
      <div className="flex flex-col items-end gap-0.5">
        <a
          href={workflowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-500"
        >
          Open in n8n ↗
        </a>
        {transferWarning && (
          <span className="rounded bg-yellow-600 px-2 py-0.5 text-xs text-white" title={transferWarning}>
            Transfer to project failed
          </span>
        )}
      </div>
    );
  }

  if (state === 'err') {
    return (
      <span className="rounded bg-red-700 px-2 py-0.5 text-xs text-white" title={errMsg ?? undefined}>
        Deploy failed
      </span>
    );
  }

  return (
    <button
      onClick={handleDeploy}
      disabled={state === 'deploying'}
      className="rounded bg-orange-600 px-2 py-0.5 text-xs text-white hover:bg-orange-500 disabled:opacity-50"
    >
      {state === 'deploying' ? 'Deploying...' : 'Deploy to n8n'}
    </button>
  );
}

export default function MessageBubble({ message, conversationId, departmentId, messageIndex }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
        {/* Tool call badges */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {message.toolCalls.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
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
                  const isWorkflow = isJson && codeString.includes('"nodes"') && codeString.includes('"connections"');
                  // Single-node snippet: only 1 node — show "Copy for n8n" instead of Deploy
                  let isSingleNode = false;
                  if (isWorkflow) {
                    try {
                      const parsed = JSON.parse(codeString) as { nodes?: unknown[] };
                      isSingleNode = Array.isArray(parsed.nodes) && parsed.nodes.length === 1;
                    } catch { /* ignore parse errors */ }
                  }
                  return (
                    <div className="relative">
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ borderRadius: '0.5rem', margin: '0.5rem 0' }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                      <div className="absolute right-2 top-2 flex gap-1.5">
                        {isWorkflow && !isSingleNode && <DeployButton json={codeString} conversationId={conversationId} departmentId={departmentId} />}
                        <CopyButton text={codeString} />
                      </div>
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

        {/* Streaming indicator */}
        {message.isStreaming && (
          <span className="mt-1 inline-block h-4 w-1 animate-pulse rounded-sm bg-gray-400" />
        )}

        {/* Feedback buttons (shown after streaming completes) */}
        {!message.isStreaming && (
          <FeedbackButtons conversationId={conversationId} messageIndex={messageIndex} />
        )}
      </div>
    </div>
  );
}
