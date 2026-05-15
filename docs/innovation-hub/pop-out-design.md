# Pop-out drawer — popup handoff with restore

**Status:** design (2026-05-06).
**Goal:** let the user move the embedded chat from the in-page drawer to a real popup window without losing the auto-fill / workflow-deploy plumbing. Replaces the current "Open in new tab" icon, which silently strips `embed=true` and breaks every postMessage event.

For the wire protocol this builds on, see [`protocol-contract.md`](protocol-contract.md). For the architecture context, see [`current-architecture.md`](current-architecture.md).

## Why this exists

Two real-user complaints map to one root cause:

1. *"If I close the modal, the chat panel disappears and reopening it gives me a fresh conversation."* — drawer state is scoped to the modal.
2. *"I want to look at the initiative card while the AI is talking — currently I can't see both."* — the drawer covers part of the form, and the existing "Open in new tab" link drops embed mode entirely.

Pop-out solves both by letting the chat live in its own OS window with full screen real estate while the Hub tab returns to a normal modal-only view. The conversation continues; the postMessages keep flowing.

## Choice: handoff (not mirroring)

The two reasonable shapes:

| Approach | Pros | Cons |
|---|---|---|
| **Mirroring** (drawer + popup show the same conversation) | User can switch focus freely. | Two copies of the streaming UI to keep in sync; doubled SSE consumers; user gets a "which one is real?" feeling. |
| **Handoff** (drawer collapses to a status bar; popup is the live chat) | One UI per conversation; clear mental model. | "Bringing it back" requires explicit action. |

Picking handoff. The status bar in the drawer keeps the message listener mounted (so postMessages still relay) and gives the user a one-click path to bring the chat back.

## UX sketch

```
   Drawer state              ↓ user clicks pop-out          Popup window opens
                                                              (chat-ui standalone-ish,
                                                               still ?embed=true&popout=true)

   ┌──────────────────┐                              ┌────────────────────────┐
   │ AI assistant   ⊟ │      ────────────────►       │  AI assistant          │
   │ ─────────────────│                              │ ┌─ chat surface ─────┐ │
   │  [chat surface]  │                              │ │ (full chat UI)      │ │
   │                  │                              │ │                     │ │
   └──────────────────┘                              │ └─────────────────────┘ │
                                                      └────────────────────────┘

   Drawer collapses to a status row in same place    Popup posts events via
   ┌──────────────────────────────────────┐          window.opener (instead of
   │ ↗ Chat is in a popup window          │          window.parent)
   │   [Bring back] [Focus popup]         │
   └──────────────────────────────────────┘          User closes popup ⇒
                                                      drawer auto-restores to
   user clicks "Bring back" or closes popup           full chat surface
                                                      (same conversation).
```

## Mechanism

### What changes in the drawer

`EmbeddedChatPanel` gets a new `panelMode` state with values `'drawer' | 'popout'`. When `popout`, the drawer renders a thin status row instead of the iframe. The message listener (currently scoped to the iframe `useEffect`) is hoisted so it stays mounted in both modes.

The "Open in new tab" icon in the drawer header is replaced with a **Pop out** icon. Click handler:

```ts
const popout = window.open(
  `${iframeUrl}&popout=true`,
  'n8n-chat-popout',
  'width=520,height=800,resizable=yes,scrollbars=yes',
);
if (popout) {
  popoutRef.current = popout;
  setPanelMode('popout');
  // Watch for popup close → restore drawer.
  const t = window.setInterval(() => {
    if (popout.closed) {
      window.clearInterval(t);
      setPanelMode('drawer');
      popoutRef.current = null;
    }
  }, 500);
}
```

(`window.open` returns `null` if blocked by the browser; in that case we keep `panelMode='drawer'` and surface a small toast.)

### What changes in chat-ui

[`chat-ui/src/lib/embed.ts`](../../chat-ui/src/lib/embed.ts) `emitToParent` becomes parent-aware:

```ts
function getParentTarget(): Window | null {
  if (typeof window === 'undefined') return null;
  // Popout flag → posts go to the opener (Hub tab), not the parent (which is null in popups).
  const isPopout = new URLSearchParams(window.location.search).get('popout') === 'true';
  if (isPopout) return window.opener;
  if (window.parent !== window) return window.parent;
  return null;
}

export function emitToParent(payload: Record<string, unknown>): void {
  const target = getParentTarget();
  if (!target) return;
  for (const origin of getAllowedParentOrigins()) {
    try { target.postMessage(payload, origin); } catch { /* expected cross-origin */ }
  }
}
```

The auth flow still works: in popout mode the chat is at chat-ui's origin (first-party), so the cookie path takes over and `auth_required` shouldn't fire. If it does, the `auth_token` reply path also routes via `window.opener` since that's where the GIS handler lives in the Hub tab.

### What stays the same

- All postMessage payload shapes (`extracted_fields_updated`, `workflow_deployed`, `auth_required`, `auth_token`).
- Origin allowlist on both sides.
- The form auto-fill behaviour. Same handler, same Hub-side state.
- AuthGate behaviour for non-popout iframes.

## Edge cases

| Case | Handling |
|---|---|
| Browser blocks the popup | Keep drawer state, show a toast: "Popup blocked — allow popups for this site to use pop-out." |
| User closes the modal while popped out | Drawer status bar unmounts → message listener unmounts → postMessages from popup are dropped. **Solution:** lift the listener up to the page (Pipeline view) so it survives modal close. Also lift `embedUrl` so the chat can be re-attached on modal reopen. This is the same lift required by gap #1 in `current-architecture.md`. |
| User pops out, then opens another initiative's modal | The popup is still tied to the original initiative. Either: (a) refuse the second pop-out and show "You already have a chat popped out", or (b) allow it and key the listeners by initiative_id. v1 should pick (a). |
| Multiple browser tabs | Each tab has its own `window.opener` graph; popups don't interfere across tabs. |

## Open questions

1. **Who owns the popup's lifecycle when the user navigates the Hub tab?** If the user navigates away from the Pipeline page, do we close the popup? Probably yes — it's tied to that view. But if we close it abruptly, mid-conversation, the user loses work.
2. **Should we add a "Mirror in drawer" toggle?** Probably not in v1 — adds complexity for a marginal use case.
3. **Native window.opener cross-origin auth: any gotchas?** Chrome treats popups opened from same-origin Hub as same-origin until they navigate; chat-ui in the popup is cross-origin. `window.opener` survives that navigation by default unless `noopener` is set. We must NOT pass `noopener` to `window.open`.

## Implementation order

1. Lift drawer state up (`embedUrl`, message listener) so it survives modal close. Independent of pop-out — also fixes the "closing modal kills chat" bug.
2. Add `panelMode` and the status-bar render path.
3. Add `popout=true` handling in `embed.ts`.
4. Replace "Open in new tab" icon with Pop out + Bring back actions.
5. Wire popup-closed detection → auto-restore.

## Out of scope

- Multiple concurrent popouts (one per initiative).
- Drag-resize handle for the drawer width.
- Persisting popup geometry across sessions.
