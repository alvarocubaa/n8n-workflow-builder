# Direction 3 — embedded chat panel inside the Hub

**Status:** Design locked, implementation in progress (Session 4, 2026-05-04).
**Goal:** chat-ui's chat surface lives **inside** the Hub via iframe (no new tab). User clicks "Plan with AI" or "Generate with AI" on a Hub initiative → drawer opens in-page → user converses → workflow ships → drawer closes.

This document is the protocol contract between chat-ui (iframe) and the Hub (parent). Read this before adding any cross-frame messaging on either side.

---

## Why this needs design before code

Direction 2 (new-tab prefill) shipped successfully but four things break the moment chat-ui moves into a Hub iframe:

1. **`visibilitychange` won't fire** — the user never leaves the tab → the Hub-side "Apply AI suggestions" pill (PR #19) never refreshes. Need a real event channel.
2. **No iframe ↔ parent channel** — `window.postMessage` protocol must be defined on both sides.
3. **WorkflowHealthCard waits for next-cron sync** (06:15 UTC) — the embedded UX expects "deploy → see stats" within seconds.
4. **6-key planning whitelist** is too narrow — the embedded UX wants the AI to fill most of the StrategicIdea form, not just KPI + 3 ROI fields.

Items 2 + 4 are addressed in this design. Item 1 disappears once postMessage replaces visibilitychange. Item 3 is solved with an optimistic placeholder row (deferred to a follow-up — additive, not on the demo critical path).

---

## Origin allowlist

Both sides MUST verify `event.origin` on every received message and pass an explicit `targetOrigin` on every send. No `'*'` anywhere.

**chat-ui side (iframe):**
- Reads `NEXT_PUBLIC_HUB_PARENT_ORIGIN` env (set in `deploy-cloudrun.sh`). Default: `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app`.
- Future tenant: when `thehub.gue5ty.com` flips to direct CNAME, add to a comma-separated list.
- Reject silently — log to console at `warn` level for debugging, but never error to the user.

**Hub side (parent):**
- Hardcodes the chat-ui origin from `VITE_CHAT_UI_URL` (already wired in PR #18's `cloudbuild.yaml`).
- Same silent-reject policy.

---

## Event catalog

### `extracted_fields_updated` (iframe → parent)

Fires after every planning-mode turn whose final assistant message contains a parseable `\`\`\`json` block that survives the whitelist. Mirrors the server-side `n8n-conversation-callback` Edge Function call — the postMessage path is purely a UI accelerator (no Supabase round-trip needed for the Hub form to update).

```ts
{
  type: 'extracted_fields_updated',
  initiative_id: string,
  conversation_id: string,
  extracted_fields: Record<string, string | number>,
  extracted_fields_at: string,  // ISO 8601
}
```

**Idempotency.** May fire many times per conversation. Hub-side handler must debounce 500ms and accept later events superseding earlier ones. The "never-overwrite-typed-values" semantic from PR #19's apply-suggestions still holds — the pill UI controls *application* timing.

### `workflow_deployed` (iframe → parent)

Fires after a successful POST to `/api/deploy`. Lets the Hub render an optimistic placeholder in WorkflowHealthCard immediately rather than waiting for the 06:15 UTC `/sync-hub` cron.

```ts
{
  type: 'workflow_deployed',
  initiative_id: string,
  conversation_id: string,
  n8n_workflow_id: string,
  n8n_workflow_name: string,
}
```

**Idempotency.** `conversation_id` lets the Hub deduplicate retries. Hub-side optimistic insert into `initiative_workflow_stats` is deferred to a follow-up session — the postMessage event itself is harmless to land first; the listener can be a no-op for now.

### `auth_required` (iframe → parent)

Fires when the iframe's `/api/auth/me` returns 401 — i.e. the cookie didn't flow into the iframe (Chrome 3p-cookie blocking or storage partitioning).

```ts
{ type: 'auth_required' }
```

The iframe waits up to **5 seconds** for an `auth_token` reply. If none arrives, AuthGate renders a "Sign-in required — open in new tab" fallback link (degrades to Direction 2 behavior).

### `auth_token` (parent → iframe)

Hub's response to `auth_required`. The Hub already has a Google ID token from its own auth flow; it forwards it to the chat-ui iframe.

```ts
{ type: 'auth_token', id_token: string }
```

The iframe POSTs the token to `/api/auth/exchange` (existing route, unchanged), which sets the `gid_token` cookie inside the partitioned iframe context, then reloads.

**Why hybrid (cookie-first, postMessage-fallback):** Firefox + Chrome with 3p cookies on will work via the cookie path with no postMessage round-trip. Only Chrome with 3p blocking / partitioning falls back to the postMessage path. Captures every case without forcing every browser through the slower path.

---

## Deploy → stats latency

**Decision:** Hub-side optimistic placeholder insert into `initiative_workflow_stats`.

On `workflow_deployed`, the Hub `<EmbeddedChatPanel>` (or a new lightweight Edge Function `n8n-deploy-event`) INSERTs:

```sql
INSERT INTO initiative_workflow_stats
  (workflow_id, initiative_id, total_runs, success_rate_pct, last_run_at, synced_at)
VALUES
  ($1, $2, 0, NULL, NULL, now())
ON CONFLICT DO NOTHING;
```

WorkflowHealthCard already renders `health: 'unknown'` for null `success_rate_pct` (verified in [docs/sync-hub-coverage-fix.md](sync-hub-coverage-fix.md)). The next 06:15 UTC `/sync-hub` cron overwrites with real numbers.

**Why not call n8n-ops on-demand:** keeps n8n-ops surface area unchanged; the row is a durable artefact (not a UI-only optimistic update); avoids a new authentication boundary.

**Implementation:** deferred to a follow-up. Session 4 implements only the postMessage event itself; the Hub-side INSERT lands in a follow-up PR.

---

## Embedded UI shape

**Decision:** Right-side drawer, 480px default width.

| Alternative | Why not |
|---|---|
| Bottom sheet | Loses vertical chat real estate (chat needs ≥600px height for streaming legibility); awkward on tall monitors. |
| Full-screen takeover | Breaks the "single app experience" goal — if takeover hides Hub UI, the user mentally "left" the Hub, no different from Direction 2's new tab. |
| Right-side drawer | Hub form stays visible (left side); user can read AI-extracted fields populating the form in real time on the same screen — exactly the multi-tasking flow PR #19's apply-suggestions pill was approximating with `visibilitychange`. |

**Sub-decisions:**

- chat-ui sidebar (conversation list) **hidden** in embed mode — Hub manages its own conversation switcher via `AISessionsCard` (PR #18).
- chat-ui header (logo + Analytics link + user pill) **hidden** in embed mode — Hub already has its header.
- Drawer width: 480px default; manually-resizable via drag-handle is stretch.
- Esc key closes drawer; Hub form stays in flight (no submit/cancel side effects).
- Opening from `IdeaDetailModal` should grey out the modal background (drawer is the foreground).
- Opening from `AddStrategicIdeaModal` (planning mode) — drawer overlays the right pane; left pane (form) stays editable. The form's "Apply AI suggestions" pill from PR #19 is what reacts to `extracted_fields_updated`.

---

## Planning-mode JSON whitelist (expanded from 6 → 13 keys)

The embedded UX wants the AI to fill most of the StrategicIdea form. Whitelist:

| Key | Type | Bound | Source |
|---|---|---|---|
| `title` | string | ≤200 | NEW |
| `description` | string | ≤2000 | NEW |
| `improvement_kpi` | string | ≤500 | existing |
| `business_justification` | string | ≤1000 | existing |
| `current_state` | string | ≤1000 | existing |
| `department` | enum | dept name from DEPARTMENT_MAP | NEW |
| `data_sources` | string | ≤500 | NEW |
| `level_of_improvement` | enum | "Low" \| "Medium" \| "High" \| "Very High" | NEW |
| `impact_category` | enum | 7 values mirroring StrategicIdea form | NEW |
| `effort` | enum | "Low" \| "Medium" \| "High" | NEW |
| `current_process_minutes_per_run` | number | [1, 1440] | existing |
| `current_process_runs_per_month` | number | [0, 100000] | existing |
| `current_process_people_count` | number | [0, 10000] | existing |

**Validation policy:**
- Drop key silently on type/bounds/enum mismatch (consistent with existing whitelist). Don't 400.
- Defense-in-depth: chat-ui `extractAndValidatePlanningFields` whitelists; Edge Function `n8n-conversation-callback` re-validates the same shape. Never trust the model.
- Department enum source of truth: `chat-ui/src/lib/departments.ts` `DEPARTMENT_MAP` keys. Hub display names (e.g. "Customer Success") map to chat-ui ids ("cs"). Both whitelists must accept both forms.

---

## Local test harness (dev-only, NOT shipped)

Located at `chat-ui/test-harness/embed-host.html`. Serves from a different localhost port than chat-ui to genuinely test cross-origin postMessage and 3p-cookie behaviour.

**Run:**
```bash
# Terminal 1 — chat-ui dev server on port 3004
cd chat-ui && npm run dev

# Terminal 2 — harness on port 3010 (different origin)
cd chat-ui/test-harness && python3 -m http.server 3010

# Browser:
open "http://localhost:3010/embed-host.html"
```

**The harness does:**
- Iframes chat-ui at `http://localhost:3004/chat?prefill=<base64>&embed=true`.
- Listens for `message` events and prints them to a `<pre>`.
- Has buttons: "Send auth_token" (with a paste-area for the token), "Clear cookie", "Reload iframe".
- Logs origin of every received message — visually shows the origin lockdown working (or not).

**End-to-end flow tested:**
1. Iframe loads → AuthGate checks `/api/auth/me` → 401 → emits `auth_required`.
2. Harness operator pastes a Google ID token → clicks "Send auth_token" → harness postMessage with the token + correct origin.
3. AuthGate POSTs to `/api/auth/exchange` → sets cookie → reloads → chat surface renders.
4. Operator drives a planning conversation → harness `<pre>` shows `extracted_fields_updated` events with the new whitelist keys.
5. Operator drives a build conversation → triggers deploy (against a sandbox dept) → harness shows `workflow_deployed` event.
6. Operator posts a message from a non-allowlisted origin (e.g. `data:` URL via `iframe.contentWindow.postMessage(...)` from console) → AuthGate ignores it.

---

## Implementation surface

**chat-ui (this repo):**

- `src/app/chat/layout.tsx` — branch on `searchParams.embed === 'true'`. If embed: skip `<header>` and `<SidebarToggle>`; render only `<AuthGate clientId={clientId} embed>{children}</AuthGate>`.
- `src/components/AuthGate.tsx` — accept `embed?: boolean`. In embed mode skip the GIS button entirely; instead listen for `auth_token` postMessage from the parent origin. On 401 from `/api/auth/me`, emit `auth_required` once, wait 5s, fall back to "open in new tab" link if no reply.
- **NEW** `src/components/EmbedHostBridge.tsx` — client component. Hooks into the SSE stream of `/api/chat` to forward `extracted_fields` and `workflow_deployed` events as postMessages to the parent.
- `src/app/api/chat/route.ts` — when `extracted` is non-null, enqueue a new `{type:'extracted_fields', data: extracted}` SSE event before `done`. Cheap; doesn't change the existing Edge Function fire-and-forget.
- `src/app/api/deploy/route.ts` — emit a `{type:'workflow_deployed', data}` event in the SSE response.
- `src/lib/system-prompt.ts` — extend `<rule name="planning_mode">` with the expanded 13-key shape, inline correct-JSON example.
- `deploy-cloudrun.sh` — add `NEXT_PUBLIC_HUB_PARENT_ORIGIN` env var.
- **NEW** `chat-ui/test-harness/embed-host.html` — dev-only, gitignored or kept under test-harness/.

**Hub (separate repo, separate PR — `kurtpabilona-code/AI-Innovation-Hub-Vertex`):**

- **NEW** `components/EmbeddedChatPanel.tsx` — right-side drawer with iframe.
- `components/IdeaDetailModal.tsx` and `components/AddStrategicIdeaModal.tsx` — replace `<GenerateWorkflowButton>` window.open with `setEmbedOpen(true)`.
- `supabase/functions/n8n-conversation-callback/index.ts` — re-validate the expanded 13-key shape (defense-in-depth parity with chat-ui).
- (Deferred) `components/EmbeddedChatPanel.tsx` listens for `workflow_deployed` and INSERTs the optimistic placeholder row.

---

## What this design intentionally does NOT do

- Does not change the Edge Function URL or auth model.
- Does not introduce a new database column or migration.
- Does not add a new GCP secret.
- Does not change the existing Direction-2 (new-tab) flow — non-embed mode is preserved bit-for-bit. Existing users won't notice.
- Does not implement the `n8n-deploy-event` optimistic placeholder Edge Function — the postMessage event itself ships in Session 4; the Hub-side INSERT can land in a follow-up.
