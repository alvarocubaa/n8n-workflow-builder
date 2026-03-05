// ─── Event types streamed to the client ──────────────────────────────────────

export type ChatEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'text_chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
