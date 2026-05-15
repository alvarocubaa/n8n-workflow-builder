// Embed-mode helpers for Direction 3 (chat-ui rendered inside Hub iframe
// or popout window). See docs/innovation-hub/protocol-contract.md and
// docs/innovation-hub/pop-out-design.md for the full protocols.

// Allowlist of every URL the Hub can be reached at. iframe→parent
// postMessages are delivered only if the parent's *actual* origin matches
// one of these — wrong origin is silently dropped by the browser.
//   - hoepmeihvq-uc.a.run.app: region-encoded Cloud Run alias
//   - 721337864706.us-central1: project-number Cloud Run alias
//   - thehub.gue5ty.com: VPN-gated CloudFront alias for end users
//   - localhost:3010: local test harness
const DEFAULT_PARENT_ORIGINS = [
  'https://ai-innovation-hub-hoepmeihvq-uc.a.run.app',
  'https://ai-innovation-hub-721337864706.us-central1.run.app',
  'https://thehub.gue5ty.com',
  'http://localhost:3010',
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

export function isPopoutMode(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('popout') === 'true';
}

// In an iframe the parent is `window.parent`. In a popout window opened
// from the Hub it's `window.opener`. Same protocol, different recipient.
function getParentTarget(): Window | null {
  if (typeof window === 'undefined') return null;
  if (isPopoutMode()) return (window.opener ?? null) as Window | null;
  if (window.parent !== window) return window.parent;
  return null;
}

// Send a message to the parent (iframe parent OR popout opener). No-op when
// not embedded or parent gone. Posts to every allowed origin — wrong origin
// is silently dropped by the browser.
export function emitToParent(payload: Record<string, unknown>): void {
  const target = getParentTarget();
  if (!target) return;
  for (const origin of getAllowedParentOrigins()) {
    try {
      target.postMessage(payload, origin);
    } catch (err) {
      // Cross-origin throws are expected; silently ignore.
      void err;
    }
  }
}
