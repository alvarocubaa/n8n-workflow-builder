// Embed-mode helpers for Direction 3 (chat-ui rendered inside Hub iframe).
// See docs/innovation-hub/protocol-contract.md for the full protocol.

// Cloud Run exposes the same service under two URL formats (region-encoded
// and project-number-encoded). Allow both so the iframe→parent postMessage
// is delivered regardless of which URL the user is viewing the Hub at.
const DEFAULT_PARENT_ORIGINS = [
  'https://ai-innovation-hub-hoepmeihvq-uc.a.run.app',
  'https://ai-innovation-hub-721337864706.us-central1.run.app',
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
