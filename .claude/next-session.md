# Next session brief — Session 10: PoC Builder CTA + `<rule name="poc_mode">` end-to-end

**Last touched:** 2026-05-15 — Session 9 (Track A) initiative-KPI auto-sync shipped + verified live. This brief promotes Session 10 to HEAD.

## What you're picking up

Hub PR #52 (shipped 2026-05-15) added `innovation_items.solution_url` + Edge Function `n8n-builder-callback` write path that auto-populates it from chat-ui deploys. But the column stays empty in real usage because chat-ui has no concept of "this conversation belongs to a PoC card." Session 10 plumbs PoC context end-to-end so the auto-fill actually fires.

**Full design + decisions + verification:** [`.claude/plans/let-s-plan-and-execute-enumerated-cherny.md`](plans/let-s-plan-and-execute-enumerated-cherny.md) (Part B).

## Architecture goal

```
USER on Hub PoC card → "Generate workflow with AI"
   → /chat?poc=<base64>&embed=true
   → chat-ui decodes poc=, conversation persisted with pocContext
   → first turn injects <poc_context> → AI in poc_mode (skip Phase 1/2)
   → build + deploy → /api/deploy passes innovation_item_id from pocContext.poc_id
   → Edge Function writes innovation_items.solution_url + (where applicable) initiative_workflow_links row
   → next morning's /sync-hub auto-fills initiative_kpis
```

## Critical design points (do NOT skip)

### Two PoC pipelines

PoCs reach the Builder via two paths (verified live in `services/api.ts:1058` + `:1099`):
- **From Roadmap Initiative** — `createPocFromInitiative` inserts new `innovation_items` row with `source_strategic_idea_id` set. **Has parent initiative.**
- **From Team Idea** — `markAsPocActive` flips status on the existing idea row. `source_strategic_idea_id` IS NULL. **No parent initiative.**

So `PocContext.initiative_id` MUST be optional:

```typescript
export interface PocContext {
  poc_id: string;            // innovation_items.id
  poc_title: string;         // denormalized snapshot
  initiative_id?: string;    // set iff PoC was forked from a Roadmap Initiative
  idea_id?: string;          // set iff PoC came from a Team Idea (= same row as poc_id)
  department_id: string;     // chat-ui canonical
  poc_description?: string;
  poc_guidelines_doc?: string;
  hub_url?: string;          // ${origin}/#/item/${poc_id}
}
// Invariant: exactly one of initiative_id or idea_id MUST be present.
```

### Precedence: `prefill=` / `promote=` / `poc=` are mutually exclusive

When a PoC has a parent initiative, `GeneratePocButton` embeds the parent's id into `PocContext.initiative_id` and does NOT emit a `prefill=` URL param. Single source of truth per URL. Defensive check in `decodePocContext`: if `prefill=` or `promote=` is also present, log warning and discard those (poc wins — leaf scope).

### Hub URL pattern (don't get tripped up)

Hub uses `HashRouter` (verified `App.tsx:416`). Item deep-links are `${origin}/#/item/<uuid>`, NOT numeric `/innovation/<item_number>`. See existing pattern at `IdeaDetailModal.tsx:582`.

## Files to touch (with verified line refs)

**Hub** (`/Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex/`):
- `services/n8nBuilderUrl.ts:69–74, 117–123` — add `PocContext` + `buildPocModeUrl()` mirroring `buildPromoteModeUrl`. Reuse the existing `encode` helper.
- `components/GeneratePocButton.tsx` (NEW) — mirror `components/GenerateWorkflowButton.tsx` (79 lines). Props: `poc: InnovationItem`, `parentInitiative: StrategicIdea | null`.
- `components/IdeaDetailModal.tsx:859–887` — inside the existing PoC details block (gated by `isPOC(item.status)`), add `<GeneratePocButton …/>` just before line 886's closing `</div>`. Caller fetches parent via `item.source_strategic_idea_id`.

**chat-ui** (`n8n-builder-cloud-claude/chat-ui/`):
- `src/lib/types.ts:17–24` — add `PocContext` interface mirroring `PromoteContext`.
- `src/components/ChatWindow.tsx:76–91, ~110` — add `decodePocContext` mirroring `decodePromoteContext`. Extract via `searchParams?.get('poc')`. Required-field check: `poc_id`, `poc_title`, `department_id`, AND (`initiative_id` OR `idea_id`). Discard `prefill=` / `promote=` if also present.
- `src/lib/firestore.ts:50–59` — extend `Conversation` with `pocId?` + `pocContext?`.
- `src/lib/system-prompt.ts:176–188` — add `<rule name="poc_mode" priority="critical">`. Precedence clause: "if `<poc_context>` is present, ignore any `<initiative_context>` block — PoC scope wins. Treat `<poc_context>.initiative_id` as informational parent only."
- `src/app/api/chat/route.ts:127–151` — add `buildPocContext(poc)` mirroring `buildPromoteContext`. Wire into first-turn user message.
- `src/app/api/deploy/route.ts:110–125` — replace stub `(conv as { innovationItemId?: string }).innovationItemId` with `conv.pocContext?.poc_id` as `innovation_item_id` source.

## Verification (must test BOTH PoC pipelines)

- **Initiative-path PoC** (`source_strategic_idea_id` non-null) → after deploy, `initiative_workflow_links` row written with parent initiative_id.
- **Idea-path PoC** (`source_strategic_idea_id` IS NULL) → verify Edge Function `n8n-builder-callback` handles no-parent case. May legitimately skip the link row (FK constraint to `strategic_ideas`). If skipped, document in decision-log: Idea-path PoCs won't roll up into a dept KPI until promoted to Initiative or schema gains `(idea_id, n8n_workflow_id)` link table.

E2E for each:
1. Open PoC card in Hub (`/#/item/<uuid>`) → click "Generate workflow with AI" → URL contains `?poc=<base64>&embed=true`
2. Chat-ui decodes; first AI turn skips Phase 1/2 (no goal-interview)
3. AI builds + deploys
4. `curl ${SUPA_URL}/rest/v1/innovation_items?id=eq.<poc_id>&select=solution_url` → populated
5. Where applicable: `curl ${SUPA_URL}/rest/v1/initiative_workflow_links?…` → new row
6. Re-deploy → callback returns `solution_url_updated: 'preserved'`

## Sequencing

1. Hub: `PocContext` + `buildPocModeUrl` + `GeneratePocButton` (no `IdeaDetailModal` wire-up yet). Build clean.
2. chat-ui: types + decoder + Firestore + system-prompt rule + chat route + deploy route source. `npx tsc --noEmit` clean.
3. Local smoke: hand-craft `?poc=<base64>` → confirm decoder + Firestore + `<poc_context>` injection.
4. Wire `GeneratePocButton` into `IdeaDetailModal.tsx`. Commit + open PR on Hub repo.
5. Deploy chat-ui (`./deploy-cloudrun.sh --ui-only`). E2E smoke both pipelines.
6. Update `docs/decision-log.md` + `docs/innovation-hub/end-to-end-flow.md`.
7. End-of-session ritual: commit + push, refresh queue + next-session.

## Adjacent items (lower priority)

- **Kurt DM** — Slack draft `D0A9V1YRRQT` since 2026-05-13 (UI label ask). Review + send when ready.
- **Phase 1.9 live UI smoke** of Track B Session 9's Plan-with-AI fix. Trivial; surfaces in `planning_turn` logs.
- **Feedback-loop harvest** — Apr 15 last run, weekly cadence, currently overdue ~30 days. `cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts`.
- **24 errored workflows from Session 8 bulk-populate** — 21 IS production + 2 Cura + 1 self-conflicting webhook. Revisit when affected dept's KPI lands in Hub.

## User preferences (carried forward)

- **Direct + terse.** No fluff.
- **Verify-before-destructive** especially with live Hub writes. Smoke before merging.
- **`gcloud auth` expires periodically.** Run `gcloud auth login` interactively when needed.
- **Will commit + push autonomously** when given approval.

## Estimated effort

3-4 hours for the full Part B implementation + verification + docs.

## Quick reference

```
Hub repo path:           /Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex/
chat-ui Cloud Run:       n8n-chat-ui (last rev: n8n-chat-ui-00046-k9b)
n8n-ops Cloud Run:       n8n-ops (rev: n8n-ops-00008-vqf, deployed 2026-05-15)
Hub Supabase:            ilhlkseqwparwdwhzcek
Edge Functions:          n8n-builder-callback (deployed --no-verify-jwt), n8n-initiative-upsert, n8n-conversation-callback v10
```
