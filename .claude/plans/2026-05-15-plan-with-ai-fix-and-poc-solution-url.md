# Plan — Fix Builder → Hub write, then ship UX consolidation

## Context

Redesign-v2 server-write shipped on 2026-05-11 (chat-ui rev `n8n-chat-ui-00045-rlj`, Hub Edge Function `n8n-initiative-upsert`, migration `20260511120000_add_initiative_chat_creations`, Hub PR #44 open). The user reported in the 2026-05-11 meeting that the path *"wasn't working."* Live state today (2026-05-14) confirms it:

- `initiative_chat_creations` — **0 rows** since deploy.
- `strategic_ideas` — **0 AI-drafted rows** (`description ILIKE '%AI-drafted via Plan with AI%'`).
- Cloud Run logs for `n8n-chat-ui-00045-rlj` — **0 entries** matching `create_initiative` / `initiative_upsert` / `Hub callback`, while real `/api/chat` POSTs ARE landing (e.g. today 10:20 UTC, 94s latency, status 200, conv `KdiN6dqFBVX3lex38P7a`).

**Root cause** ([chat-ui/src/app/api/chat/route.ts:512–596](chat-ui/src/app/api/chat/route.ts)): the `<create_initiative />` / `<update_initiative />` sentinel detection is nested **inside** the `if (extracted)` block. If the AI emits the sentinel without a valid 13-key JSON payload on the same turn, the entire upsert path is skipped with no log line and no SSE event — invisible failure.

The 2026-05-11 meeting also reframed the Builder's attachment point: it should live on the **PoC card** (per Kurt: "this is where the user will try to build a workflow to prove the concept"), and the PoC modal needs a `solution_url` field. That's Phase 2 in this plan.

n8n time-saved investigation: already done and shipped (`settings.timeSavedPerExecution` ingested via n8n-ops `/kpi-rollup`; April Marketing = 38 h, May = 88 h partial). No work needed.

## Approach

**Phase 1** (~2 h, chat-ui only, single deploy) — exhaustively fix the write path:
1. Decouple sentinel from JSON-extraction gate (the actual bug).
2. Add observability so silent failures become visible.
3. Harden extraction to tolerate JSON-block variants the AI emits in the wild.
4. Tighten the Phase-2 prompt instructions.
5. Restore type/constant consistency the linter trimmed.
6. Suppress the legacy handoff path when the new path fires on the same turn.
7. Idempotency hardening on the chat-ui side (don't re-call Edge Function within the same SSE stream).
8. Make link absolute under all configs (pin `HUB_PUBLIC_ORIGIN` env).

**Phase 2** (separate sequencing — Hub repo + chat-ui) — UX consolidation:
1. PoC modal grows `solution_url` field; back-filled by deploy callback.
2. "Generate workflow with AI" CTA moves to PoC card; new `poc_context` prefill + `poc_mode` system-prompt rule on chat-ui.
3. Retire `StartPocModal` in favour of `EditInnovationItemModal` PoC section.

---

## Phase 1 — Make the write path bulletproof

### 1.1 Decouple sentinel detection from `extracted` gate  ← THE bug
**File:** [chat-ui/src/app/api/chat/route.ts](chat-ui/src/app/api/chat/route.ts) (~512–596).

Restructure as:
```
if (initiativeMode === 'planning' && initiativeId) {
  const fullReply = modelChunks.join('');
  const wantsCreate = /<create_initiative\s*\/?>/i.test(fullReply);
  const wantsUpdate = /<update_initiative\s*\/?>/i.test(fullReply);

  // (a) Always try extraction; emit extracted_fields if anything parsed.
  const extractedThisTurn = extractAndValidatePlanningFields(fullReply);
  if (extractedThisTurn) { …existing SSE + n8n-conversation-callback POST… }

  // (b) Sentinel path — runs even when extractedThisTurn is null.
  if (wantsCreate || wantsUpdate) {
    let fields = extractedThisTurn;
    let extractedFromHistory = false;
    if (!fields) {
      fields = extractFromHistory(history);   // walk prior model messages
      extractedFromHistory = !!fields;
    }
    if (!fields) {
      enqueue({ type: 'initiative_upsert_failed',
                reason: 'AI emitted <create_initiative /> but no valid JSON payload was found in this turn or any prior turn. Ask the AI to re-send the JSON.',
                mode: wantsCreate ? 'create' : 'update' });
    } else {
      …existing callHubInitiativeUpsert + emit initiative_upserted / failed…
    }
  }
}
```

`extractFromHistory(history: DisplayMessage[])` — new local helper. Iterate `history` backwards, find the most-recent `role === 'model'` message whose content yields a non-null result from `extractAndValidatePlanningFields`. Return that, or null.

### 1.2 Add structured observability
Same file. After each planning-mode turn, **always** log one line:
```js
console.log(JSON.stringify({
  event: 'planning_turn',
  convId,
  hasSentinelCreate: wantsCreate,
  hasSentinelUpdate: wantsUpdate,
  extractedCurrentTurn: !!extractedThisTurn,
  extractedFromHistory,
  upsertCalled: (wantsCreate || wantsUpdate) && !!fields,
  upsertOk: upsertResult?.ok ?? null,
  upsertAction: upsertResult?.ok ? upsertResult.data.action : null,
  upsertReason: upsertResult?.ok === false ? upsertResult.reason : null,
}));
```
Cheap, greppable in Cloud Run logs (`textPayload=~"planning_turn"`), no PII (no chat content, no user email).

### 1.3 Harden `extractAndValidatePlanningFields`
Same file (~163–248). Make the JSON-block regex tolerant of:
- ` ```json ` with extra whitespace, `\r\n` line endings, or no leading newline before the brace.
- ` ```json5 ` / ` ```JSON ` / bare ` ``` ` followed by a JSON object on the next line.
- Multiple JSON blocks in one reply: prefer the LAST one (current behaviour assumes one; document it).

Concretely, change the block-finder from a single regex to:
```ts
const blockRe = /```(?:json\d?|JSON)?\s*\r?\n([\s\S]*?)\r?\n```/gi;
let lastMatch: string | null = null;
for (const m of fullReply.matchAll(blockRe)) lastMatch = m[1];
if (!lastMatch) return null;
```
Then parse `lastMatch` as before. Existing whitelist + bounds checks unchanged.

### 1.4 Tighten Phase-2 prompt
**File:** [chat-ui/src/lib/system-prompt.ts](chat-ui/src/lib/system-prompt.ts) (~190–230).

Append to the Phase 2 rule:
> "The fenced \`\`\`json block and the \`<create_initiative />\` sentinel MUST appear in the same reply. If you cannot produce the JSON in that turn for any reason, do not emit the sentinel — re-ask the user to confirm and emit both together on the next turn."

Belt-and-suspenders: 1.1's history fallback recovers from this anyway, but the prompt change reduces the rate of the fallback firing. System prompt is cached; updating it forces a one-time cache rebuild on the next call (no action needed).

### 1.5 Restore type/constant consistency
The 2026-05-14 linter pass dropped 3 number keys from two places. Either drop them everywhere, or restore them everywhere. **Restore** is the right call — the AI is still instructed to emit them (system prompt + extraction whitelist), the Edge Function still validates them, and the Hub `strategic_ideas` table has the columns.

- [chat-ui/src/lib/hub-callback.ts](chat-ui/src/lib/hub-callback.ts) `InitiativeUpsertFields` — add back:
  ```ts
  current_process_minutes_per_run?: number;
  current_process_runs_per_month?: number;
  current_process_people_count?: number;
  ```
- [chat-ui/src/components/MessageBubble.tsx](chat-ui/src/components/MessageBubble.tsx) `PLANNING_FIELD_KEYS` — add back the same three keys, so the JSON-block stripper in embed mode still recognises a payload containing only baseline-metric keys.

### 1.6 Suppress legacy handoff when new path fires
Current code still emits `<request_workflow_handoff />` SSE → Hub auto-save legacy path even when the same turn also has `<create_initiative />`. They'd race: chat-ui creates a row via Edge Function while the Hub's `AddStrategicIdeaModal` tries to create one too. Outcome with the modal closed (popout/drawer mode): legacy postMessage no-ops (no listener). Outcome with the modal open (the original drawer flow): two rows created, with the Hub's create racing the Edge Function's create.

Fix: don't emit the legacy `request_workflow_handoff` event when the redesign-v2 path is going to run this turn. In the same restructure (1.1):

```ts
const legacyHandoff = /<request_workflow_handoff\s*\/?>/i.test(fullReply)
  && !wantsCreate && !wantsUpdate;
if (legacyHandoff) { …existing enqueue… }
```

### 1.7 Idempotency hardening on chat-ui side
Two safety rails:

(a) **In-stream idempotency:** the SSE handler should call the Edge Function at most once per stream. Add a `let upsertedThisStream = false;` flag and guard the block so a regex re-match (e.g. if the same fullReply matches both `create_initiative` and a stray re-emission) doesn't double-fire.

(b) **Idempotent retry on transient error:** if the Edge Function returns 5xx (transient), retry once after 500 ms before surfacing `initiative_upsert_failed`. Hub idempotency table absorbs duplicate inserts via the conversation_id PK.

### 1.8 Pin `HUB_PUBLIC_ORIGIN`
[hub-callback.ts:60–66](chat-ui/src/lib/hub-callback.ts#L60-L66) defaults to `https://thehub.gue5ty.com` when env is unset. That default is correct for prod today, but making it implicit is fragile. Add to [deploy-cloudrun.sh](deploy-cloudrun.sh) line 158 (the chat-ui `--set-env-vars=`):
```
HUB_PUBLIC_ORIGIN=https://thehub.gue5ty.com
```
No code change — just makes the link host explicit and auditable from the Cloud Run revision env list.

### 1.9 Post-deploy smoke (replaces the standing TODO)
1. Open Plan-with-AI in Hub on a new initiative. Short interview. Confirm "yes".
2. Expect inline `✓ Initiative created — Open in Hub →` link.
3. `supabase db query --linked "select * from initiative_chat_creations order by created_at desc limit 3"` → expect new row(s).
4. `gcloud logging read 'resource.labels.service_name="n8n-chat-ui" AND textPayload=~"planning_turn"' --limit=10 --freshness=15m` → expect entries with `upsertOk:true,upsertAction:"created"`.
5. Click the chat link → `IdeaDetailModal` opens at new id with fields populated.
6. **Failure-path test:** mid-interview, ask the AI to "save without finishing" → expect either the AI to defer until enough data is collected (preferred) OR a clear `⚠ Couldn't save the initiative: …` in chat (acceptable). No silent failure.
7. **Idempotency test:** with one created initiative, ask the AI to "save again" in the same chat → expect `action: 'no_changes'` and the same id (the link in chat shouldn't change).

Rollback: `gcloud run services update-traffic n8n-chat-ui --to-revisions=n8n-chat-ui-00044-ncm=100 --region=europe-west1 --project=agentic-workflows-485210`. No DB/schema change in Phase 1, so rollback is one command.

---

## Phase 2 — UX consolidation (Builder at PoC, solution_url, modal trim)

Hub repo findings from explore agent (all paths in `/Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex`):

| Concern | File | Today |
|---|---|---|
| Start-PoC modal | `components/StartPocModal.tsx` | 6 fields: title*, description*, spec-doc URL, notes, test data source, owner*. **No `solution_url`.** |
| "Generate workflow with AI" CTA | `components/GenerateWorkflowButton.tsx` used at `components/IdeaDetailModal.tsx:2057` | Attached to **Roadmap Initiative card** only (inside `StrategicIdeaView`). |
| "Plan with AI" CTA | `components/AddStrategicIdeaModal.tsx:644–665` | Embedded in initiative create/edit form. |
| Modal overlap | `StartPocModal` vs `EditInnovationItemModal` | Two modals on PoC stage; kickoff fields are a subset of the full edit form. |

### 2.1 PoC `solution_url` field (Hub)
- DB migration: `solution_url text` column on the PoC table (need to confirm exact table — likely `innovation_items` with a `stage='POC'` discriminator, or a dedicated `innovation_items_pocs` table; explore agent didn't confirm).
- `StartPocModal.tsx` — insert one input between spec-doc URL and notes:
  ```
  Solution URL (n8n workflow / gem / AI Studio link) — optional
  ```
- `EditInnovationItemModal.tsx` — surface the same field in the PoC section.
- Auto-populate on deploy: extend `supabase/functions/n8n-builder-callback/index.ts` so when the callback ships with a `poc_id` (new optional payload field), write the workflow URL to `…solution_url` (only when currently null — preserve typed values).

### 2.2 "Generate workflow with AI" attached to PoC card
- **Hub side:** render `GenerateWorkflowButton` inside the PoC detail view in `IdeaDetailModal.tsx` (the PoC section). Pass `poc_id`, `initiative_id` or `idea_id` (parent), `department_id`.
- **chat-ui side:**
  - New `PocContext` interface in [chat-ui/src/lib/types.ts](chat-ui/src/lib/types.ts) (mirroring `PromoteContext`).
  - New `poc=<base64>` URL param decoded in [chat-ui/src/components/ChatWindow.tsx](chat-ui/src/components/ChatWindow.tsx) (copy `decodePromoteContext`).
  - New `<rule name="poc_mode" priority="critical">` in [chat-ui/src/lib/system-prompt.ts](chat-ui/src/lib/system-prompt.ts). Behaviour: skip Phase-1/2 interview entirely, treat the PoC description + spec-doc as input, run Builder mode (`search_nodes`, `validate_node`, deploy).
  - On deploy, existing `n8n-builder-callback` writes `initiative_workflow_links` AND `…solution_url` (per 2.1).
- The existing initiative-attached CTA stays — champions still draft strategic initiatives there.

### 2.3 Modal trim
Smallest valuable cut:
- **Retire `StartPocModal` as standalone.** Surface its 6 fields as an expanded section at the top of `EditInnovationItemModal` when the item is at PoC stage. Reduces 2-modal-deep nav to 1.
- Keep `AddStrategicIdeaModal` and `SmartAddIdeaModal` (different entry points / audiences).
- Add a "Skip Analysis" toggle to `SmartAddIdeaModal` for power users.

### 2.4 Phase 2 verification
- New PoC modal: open at PoC stage → see `solution_url` field, type → save → row persists.
- Builder at PoC: click "Generate workflow with AI" on a PoC card → chat-ui launches → AI proposes workflow → deploy → `…solution_url` populated automatically; check workflow opens.
- Retired `StartPocModal`: user lands on `EditInnovationItemModal` with PoC section expanded.

---

## Critical files

**Phase 1 (chat-ui only):**
- [src/app/api/chat/route.ts](chat-ui/src/app/api/chat/route.ts) — items 1.1, 1.2, 1.3, 1.6, 1.7
- [src/lib/system-prompt.ts](chat-ui/src/lib/system-prompt.ts) — item 1.4
- [src/lib/hub-callback.ts](chat-ui/src/lib/hub-callback.ts) — item 1.5 (and helper 1.7b for retry)
- [src/components/MessageBubble.tsx](chat-ui/src/components/MessageBubble.tsx) — item 1.5
- [deploy-cloudrun.sh](deploy-cloudrun.sh) — item 1.8 (one-line env var addition)
- (No new files, no Hub repo changes for Phase 1.)

**Phase 2 (split-repo):**
- Hub: `components/StartPocModal.tsx`, `components/EditInnovationItemModal.tsx`, `components/GenerateWorkflowButton.tsx`, `components/IdeaDetailModal.tsx`, `supabase/functions/n8n-builder-callback/index.ts`, new migration for `solution_url` column.
- chat-ui: [src/lib/types.ts](chat-ui/src/lib/types.ts), [src/lib/system-prompt.ts](chat-ui/src/lib/system-prompt.ts), [src/components/ChatWindow.tsx](chat-ui/src/components/ChatWindow.tsx), [src/app/api/chat/route.ts](chat-ui/src/app/api/chat/route.ts).

## Reuse

- `callHubInitiativeUpsert` ([chat-ui/src/lib/hub-callback.ts](chat-ui/src/lib/hub-callback.ts)) — already returns discriminated union; the new flow just calls it from the decoupled block.
- `extractAndValidatePlanningFields` ([chat-ui/src/app/api/chat/route.ts](chat-ui/src/app/api/chat/route.ts) ~163) — reuse for the history fallback in 1.1 and the hardened regex in 1.3.
- `updateConversationInitiativeId` ([chat-ui/src/lib/firestore.ts:191](chat-ui/src/lib/firestore.ts#L191)) — already swaps `__draft__` → real UUID.
- `n8n-builder-callback` Edge Function — extend rather than rewrite for 2.1.
- `decodePromoteContext` ([chat-ui/src/components/ChatWindow.tsx:76–91](chat-ui/src/components/ChatWindow.tsx#L76-L91)) — copy shape for `PocContext`.
- `resolveUserIdByEmail` ([Hub repo `supabase/functions/_shared/resolve-user-id.ts`](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/blob/main/supabase/functions/_shared/resolve-user-id.ts)) — already used by Edge Function for email→UUID resolution; no change needed.

## Risk + rollback

- **Phase 1:** server-side only in chat-ui, no DB/schema change. One-command revision rollback. Highest-risk item is 1.3 (extraction regex change) — mitigation: keep the old regex commented inline for one revision in case parsing regressions appear.
- **Phase 2:** new `solution_url` column is additive and nullable. Retiring `StartPocModal` is the riskiest UX move; ship behind a Hub feature flag if available, else demo to Kurt before merging the deletion.

## Sequencing — confirmed scope: **Phase 1 + full 2.1**

Single execution turn ships everything in Phase 1 and all of 2.1 (column + UI + auto-populate). Order of operations:

1. **chat-ui** changes for Phase 1 (1.1–1.8) — single branch.
2. **Hub** changes for 2.1 — same session, separate branch + PR:
   - **First**: identify the exact PoC table. Explore agent suggested `innovation_items_pocs`; need to confirm by reading the Hub repo (likely in `services/api.ts` or a `createPoc` function) and checking via `supabase db query --linked "\d table_name"`. If PoCs live in `innovation_items` with a `stage` discriminator, the migration targets that table instead.
   - Migration: `solution_url text` nullable column.
   - `StartPocModal.tsx` + `EditInnovationItemModal.tsx` — add input.
   - `supabase/functions/n8n-builder-callback/index.ts` — accept optional `poc_id` in payload, write `solution_url` when present and currently null.
3. **chat-ui deploy callback caller** (`src/app/api/deploy/route.ts`) — pass `poc_id` if known. For now, `poc_id` is unknown (no PoC context is plumbed into chat-ui yet), so this step is a placeholder: extend the request body type and stub the field, leave the wiring to Phase 2.2 when `poc_mode` and `PocContext` land. **Net: 2.1's auto-populate works only after Phase 2.2 ships `poc_context`.** Acknowledge this gap upfront.
4. **Verify:**
   - Phase 1 smoke (§1.9).
   - 2.1 partial smoke: in the Hub, open a PoC card, manually paste an n8n URL into the new `solution_url` field, save, reload, persisted. Auto-populate path is dormant until 2.2.
5. **Phase 2.2 / 2.3:** follow-up sessions.

## Deferred to follow-up sessions

- 2.2 Builder reattachment at PoC + `poc_mode` rule + `PocContext` decoder + `poc_id` plumbing from chat-ui to the deploy callback.
- 2.3 Modal trim (retire `StartPocModal`, add Skip-Analysis toggle).
