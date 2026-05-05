// Embed-mode helpers for Direction 3 (chat-ui rendered inside Hub iframe).
// See docs/direction-3-design.md for the full protocol.

const DEFAULT_PARENT_ORIGINS = [
  'https://ai-innovation-hub-hoepmeihvq-uc.a.run.app',
  'http://localhost:3010', // local test harness
];

export function getAllowedParentOrigins(): string[] {
  if (typeof window === 'undefined') return DEFAULT_PARENT_ORIGINS;
  const env = process.env.NEXT_PUBLIC_HUB_PARENT_ORIGIN;
  if (!env) return DEFAULT_PARENT_ORIGINS;
  return env.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowedParentOrigin(origin: string): boolean {
  return getAllowedParentOrigins().includes(origin);
}

export function isEmbedMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true';
}

// Send a message to the parent frame. No-op when not embedded or parent gone.
// Posts to every allowed origin — the wrong origin silently drops it.
export function emitToParent(payload: Record<string, unknown>): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  for (const origin of getAllowedParentOrigins()) {
    try {
      window.parent.postMessage(payload, origin);
    } catch (err) {
      // Cross-origin throws are expected; silently ignore.
      void err;
    }
  }
}
