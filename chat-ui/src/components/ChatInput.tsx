'use client';

import { useRef, useEffect } from 'react';

export interface AttachedFile {
  name: string;
  content: string;
  type: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  attachedFile?: AttachedFile | null;
  onAttachFile?: (file: AttachedFile) => void;
  onRemoveFile?: () => void;
}

const ACCEPTED_TYPES = '.json,.md,.pdf';
const MAX_FILE_SIZE = 50 * 1024; // 50KB

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  attachedFile,
  onAttachFile,
  onRemoveFile,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize the textarea as content grows
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onAttachFile) return;

    if (file.size > MAX_FILE_SIZE) {
      alert(`File too large (${(file.size / 1024).toFixed(0)}KB). Maximum is 50KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      onAttachFile({ name: file.name, content, type: file.type });
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {/* Attached file chip */}
      {attachedFile && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            {attachedFile.name}
            <button
              onClick={onRemoveFile}
              className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100"
              title="Remove file"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      )}

      <div className="flex items-end gap-3 rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        {/* Attach file button */}
        {onAttachFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="flex-shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
              title="Attach file (.json, .md, .pdf)"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
          </>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          placeholder="Describe the workflow you need... (Shift+Enter for newline)"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <p className="mt-1 text-center text-xs text-gray-400">
        Enter to send · Shift+Enter for newline · Attach .json, .md, or .pdf files
      </p>
    </div>
  );
}
