# Current architecture (Direction-3 embed)

A snapshot of how the Innovation Hub and the n8n chat-ui talk to each other today (2026-05-06). For the wire-level postMessage shapes, see [`protocol-contract.md`](protocol-contract.md). For the *intended* user flow on top of this plumbing, see [`phase-flow-design.md`](phase-flow-design.md).

## Component map

```
┌─ Hub (thehub.gue5ty.com / *.run.app) ─────────────────────────────────┐
│                                                                        │
│   ┌─ AddStrategicIdeaModal (modal) ─────────────────────────────────┐ │
│   │                                                                  │ │
│   │   ┌─ Form fields ──┐    ┌─ EmbeddedChatPanel (drawer) ────────┐│ │
│   │   │ title          │    │   ┌─ <iframe src=chat-ui?embed=1>─┐ ││ │
│   │   │ description    │◄───┤   │                                │ ││ │
│   │   │ kpi, dept, …   │    │   │  ChatWindow ─ SSE ─ ChatBubble │ ││ │
│   │   └────────────────┘    │   └────────────────┬───────────────┘ ││ │
│   │           ▲             │                    │                  ││ │
│   │           │             │   listens for      │ postMessage      ││ │
│   │           │             │   message events   │ 'extracted_      ││ │
│   │           │             │                    │  fields_updated' ││ │
│   │           │             │                    ▼                  ││ │
│   │           │             │   onMessage → onExtractedFields()     ││ │
│   │           │             └─────────────┬──────────────────────────┘│ │
│   │           │                           │                            │ │
│   │           └───── applyExtractedFields(payload) ◄──────────────────┘ │
│   │                  (auto-applies 13 fields to empty form fields)      │
│   └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ iframe
┌──────────────────────────────────▼───────────────────────────────────────┐
│  chat-ui (n8n-chat-ui-*.run.app) — Next.js + Claude Sonnet 4.6           │
│                                                                          │
│   /api/chat (server)         ChatWindow (client)                         │
│   ──────────────────────     ───────────────────                         │
│   Claude streams text   ─►   renders messages                            │
│        │                          │                                      │
│        ▼                          ▼                                      │
│   extractAndValidate         on SSE 'extracted_fields'                  │
│   PlanningFields(text)       emitToParent({                             │
│   13-key whitelist     ─►       type: 'extracted_fields_updated',       │
│        │                        initiative_id, conversation_id,         │
│        ▼                        extracted_fields, _at                   │
│   persists to Firestore         })                                       │
│   conv doc + Hub             [postMessage to *.run.app Hub origin]      │
│   Edge Function                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Code paths

### Hub side (`/Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex`)

| File | Role |
|---|---|
| `components/AddStrategicIdeaModal.tsx` | The "Add Roadmap Initiative" modal. Owns the form fields. Renders `EmbeddedChatPanel` as a sibling and applies auto-fill on the `onExtractedFields` callback. |
| `components/IdeaDetailModal.tsx` | The saved-initiative detail modal. Same panel host; "Generate workflow with AI" entry point (building mode). |
| `components/EmbeddedChatPanel.tsx` | The right-side drawer. Mounts the iframe, validates origins, relays postMessages, handles `auth_required` via on-demand GIS. Z-index `z-[60]` (above modal `z-50`). |
| `services/n8nBuilderUrl.ts` | Builds the `?prefill=<base64>&mode={planning|building}&embed=true` URL passed into the iframe. |
| `services/initiativeChatConversations.ts` | The `ExtractedPlanningFields` interface — Hub-side mirror of the 13-key whitelist. |

### chat-ui side (this repo)

| File | Role |
|---|---|
| `chat-ui/src/lib/embed.ts` | Origin allowlist + `emitToParent`. Both Cloud Run URL forms for the Hub are baked into `DEFAULT_PARENT_ORIGINS`. |
| `chat-ui/src/middleware.ts` | Sets `x-embed: 1` request header for `/chat/*` when `?embed=true` so the layout can suppress chrome. |
| `chat-ui/src/app/chat/layout.tsx` | Reads `x-embed`; in embed mode, skips header + sidebar. |
| `chat-ui/src/components/AuthGate.tsx` | Cookie-first auth; on 401 in embed mode, posts `auth_required` and waits for `auth_token`. |
| `chat-ui/src/components/ChatWindow.tsx` | Decodes prefill, locks department, sends `embed: true` flag in the `/api/chat` body, relays SSE `extracted_fields` events to parent as `extracted_fields_updated` postMessages. |
| `chat-ui/src/components/MessageBubble.tsx` | Renders assistant text. In embed mode, strips planning-shape ```json blocks (the form auto-fills, so the JSON is redundant). |
| `chat-ui/src/app/api/chat/route.ts` | Runs `extractAndValidatePlanningFields` (13-key whitelist) on the streamed assistant text, emits the SSE event. |
| `chat-ui/src/lib/system-prompt.ts` | The static system prompt. Contains `<rule name="planning_mode">` — currently **does not strongly enough forbid building workflows in planning mode** (see `phase-flow-design.md`). |

## What works today

- Cookie path for already-signed-in users (chat-ui cookie is `SameSite=None; Secure; HttpOnly`).
- GIS popup fallback when the cookie is partitioned out (Chrome storage partitioning).
- Auto-apply: 13 whitelisted fields populate the open form on the left, empty fields only.
- Both Cloud Run URL forms for the Hub are accepted as parent origins.
- Planning-mode JSON code block is hidden in embed (renders only narrative text).
- Drawer renders **above** any z-50 modal it was launched from.

## What's broken / fragile (the gap list, prioritised)

| Severity | Gap | Where the failure shows up |
|---|---|---|
| High | **Closing the modal kills the conversation reference.** Reopening starts a fresh chat — Firestore conversation_id from the prior run is forgotten. | `AddStrategicIdeaModal` owns `embedUrl` state. Should live one level up. |
| High | **No real pop-out.** "Open in new tab" strips `embed=true` and the postMessage relay stops working — the new-tab chat is a dead end for auto-fill. | `EmbeddedChatPanel.tsx:172` URL rewrite. |
| High | **Mode contamination.** Planning mode lets the AI build a workflow if asked. Output then defaults to "paste this JSON" prose. | `system-prompt.ts` `<rule name="planning_mode">` is too soft. See `phase-flow-design.md`. |
| Medium | **Draft initiatives can't carry suggestions across reopens.** A `__draft__` initiative has no Supabase row, so the visibilitychange-poll fallback can't fetch its suggestions on reopen. | Hub: needs autosave-as-draft when planning starts, OR localStorage persistence keyed by conversation_id. |
| Medium | **No visible feedback that auto-apply happened in the drawer.** "Applied N fields" banner is on the form side; users with chat focus miss it. | Hub: drawer header could show a brief toast. |

## Reference: postMessage event catalog (skim)

For full payload shapes, see [`protocol-contract.md`](protocol-contract.md).

| Direction | Type | When |
|---|---|---|
| iframe → parent | `extracted_fields_updated` | Every planning-mode turn whose final assistant message contains a parseable JSON block matching the whitelist. |
| iframe → parent | `workflow_deployed` | After a successful `/api/deploy` POST. |
| iframe → parent | `auth_required` | iframe's `/api/auth/me` returns 401. |
| parent → iframe | `auth_token` | Hub's reply to `auth_required` carrying a Google ID token (audience = chat-ui's OAuth client). |
