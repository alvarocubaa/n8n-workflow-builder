# Session Queue — n8n-builder-cloud-claude

Multi-session pipeline. The **HEAD** (first entry) is the next session to execute. After completing a session, move it to the Session Log at the bottom and promote the next entry to HEAD.

`.claude/next-session.md` always reflects the HEAD session brief; update both files together when promoting.

**Current focus track:** Sessions 9 + 10 BOTH shipped 2026-05-15. Session 9: initiative-KPI auto-sync (`n8n-ops-00008-vqf`) — live data confirms #214 PFR=1h, #213 PMM=0h, #193 ORM untouched. Session 10: PoC Builder CTA + `poc_mode` plumbing — chat-ui rev `n8n-chat-ui-00047-wgk` deployed; Hub PR #53 open pending Kurt review. Next focus = Session 11, **PoC modal trim + Smart-Add Skip Analysis** (Hub-only, smallest UX cut).

---

## Plan files index

All plans live in [`.claude/plans/`](plans/). Two parallel tracks running:

**Track A — Time Saved KPI rollup** (v1 → v2 → v3 → auto-sync)

| Date | Plan file | Status |
|---|---|---|
| 2026-05-15 | [`2026-05-15-initiative-kpi-auto-sync.md`](plans/2026-05-15-initiative-kpi-auto-sync.md) | ✅ Shipped Session 9 (deployed `n8n-ops-00008-vqf`; verified live) |
| 2026-05-13 | [`2026-05-13-time-saved-kpi-v3-dept-centric.md`](plans/2026-05-13-time-saved-kpi-v3-dept-centric.md) | ✅ Shipped Session 8 |
| 2026-05-12 | [`2026-05-12-time-saved-kpi-v2.md`](plans/2026-05-12-time-saved-kpi-v2.md) | ✅ Shipped Session 8 (superseded by v3 same week) |
| 2026-05-08 | [`2026-05-08-time-saved-kpi-rollup.md`](plans/2026-05-08-time-saved-kpi-rollup.md) | ✅ Shipped Session 7 (initial v1) |

**Track B — Hub × n8n-builder UX** (redesign-v2 → write-path fix → PoC integration)

| Date | Plan file | Status |
|---|---|---|
| 2026-05-15 | [`let-s-plan-and-execute-enumerated-cherny.md`](plans/let-s-plan-and-execute-enumerated-cherny.md) | ✅ Phase 2.2 (PoC Builder CTA + poc_mode) shipped Session 10 — chat-ui `n8n-chat-ui-00047-wgk`, Hub PR #53. |
| 2026-05-15 | [`2026-05-15-plan-with-ai-fix-and-poc-solution-url.md`](plans/2026-05-15-plan-with-ai-fix-and-poc-solution-url.md) | ✅ Phase 1 + Phase 2.1 shipped earlier same day. Phase 2.3 queued below as Session 11. |

End-to-end flow tying both tracks together (team-shareable): [`docs/innovation-hub/end-to-end-flow.md`](../docs/innovation-hub/end-to-end-flow.md).

Architecture history + every design decision is captured in [`docs/decision-log.md`](../docs/decision-log.md) — entries 2026-05-08 through 2026-05-15 cover the whole journey.

---

## Queue

### 1. [HEAD] Session 11 — Phase 2.3: PoC modal trim + Smart-Add bypass

**Goal:** The smallest UX win on Track B — reduce modal stacking and surface a power-user shortcut.

**Scope (Hub only):**
- **Retire `StartPocModal` as a standalone modal.** Fold its 6 fields (title, description, poc_guidelines_doc, solution_url, validation_notes, test_data_source, owner) into `EditInnovationItemModal`'s PoC section as a top-of-modal expanded group. Update both call sites in `components/views/InnovationPipeline.tsx` (`handlePocSubmitFromIdea` + `handlePocSubmitFromInitiative`) to open `EditInnovationItemModal` with a `startPocFlow=true` prop instead.
- **Add a "Skip Analysis" toggle to `SmartAddIdeaModal`** for power users who already know the idea is real and don't need the AI feasibility/dedupe pass. Defaults off; one checkbox; bypasses the 3-step flow to a single submit.

Verification:
- Start a PoC from an approved idea → no two-modal-deep nav; lands directly on the consolidated edit form with PoC fields populated.
- Smart Add Idea with "Skip Analysis" on → idea row created without AI analysis fields; idea still appears in "New Ideas" column.

**Risk + rollback:** Retiring `StartPocModal` is the only meaningful UX change. Gate behind a Hub feature flag if one exists; otherwise demo to Kurt before merging the deletion.

**Estimated effort:** 2-3 hours.

---

### ✅ SHIPPED 2026-05-15 — Session 10 (Track B) — Phase 2.2: PoC Builder CTA + `poc_mode` plumbing end-to-end

> **Outcome:** PoC owners can now click "Generate workflow with AI" on a PoC card. Chat-ui receives `?poc=<base64>` → decodes `PocContext` → runs in `poc_mode` (skips Phase 1/2 interview) → builds → deploys → `innovation_items.solution_url` populated automatically.
>
> **Plan file:** [`.claude/plans/let-s-plan-and-execute-enumerated-cherny.md`](plans/let-s-plan-and-execute-enumerated-cherny.md).
>
> **What landed:**
>
> *chat-ui* (commit `6877f21` on `session/2026-05-08-jira-integration`, Cloud Run rev **`n8n-chat-ui-00047-wgk`**):
> - NEW `PocContext` interface in `src/lib/types.ts` mirroring `PromoteContext`. Optional `initiative_id?` / `idea_id?` (at-least-one invariant).
> - NEW `decodePocContext` in `src/components/ChatWindow.tsx`. Reads `?poc=`. Discards co-present `prefill=`/`promote=` (precedence: PoC = leaf scope, wins).
> - NEW `<rule name="poc_mode" priority="critical">` in `src/lib/system-prompt.ts`. Skips initiative interview when `<poc_context>` block present.
> - NEW `buildPocContext()` in `src/app/api/chat/route.ts`. Injected ABOVE all other context blocks.
> - MODIFY `src/lib/firestore.ts` — `Conversation.innovationItemId?` field persisted at create-time.
> - MODIFY `src/app/api/deploy/route.ts` — relaxed Hub-callback gate from `conv.initiativeId` only to `(conv.initiativeId || conv.innovationItemId)`. `innovation_item_id` sourced from `conv.innovationItemId` (replaces stub from `9d46348`).
>
> *Hub* (PR #53 on `kurtpabilona-code/AI-Innovation-Hub-Vertex`, branch `session-10-poc-builder-cta` — pending Kurt review):
> - NEW `services/n8nBuilderUrl.ts` — `PocContext` + `buildPocModeUrl()`.
> - NEW `components/GeneratePocButton.tsx` — mirrors `GenerateWorkflowButton`. Resolves `parentInitiative` from `item.source_strategic_idea_id`.
> - MODIFY `components/IdeaDetailModal.tsx` — wires `<GeneratePocButton>` into PoC details block.
>
> **Two PoC pipelines handled** (verified `services/api.ts:1058` + `:1099`):
> - Initiative-path (`source_strategic_idea_id` non-null) → writes both `solution_url` AND `initiative_workflow_links`.
> - Idea-path (`source_strategic_idea_id` IS NULL) → writes only `solution_url`. Link row skipped (no FK target). Idea-path PoCs won't roll up into dept KPI until promoted to Initiative.
>
> **User-caught design bug** (caught in plan review before code shipped): initial `PocContext` made `initiative_id` REQUIRED. That would have broken Idea-path PoCs (no parent initiative). Fix: both `initiative_id?` and `idea_id?` optional with at-least-one invariant in `decodePocContext`.
>
> **Decision-log:** [`docs/decision-log.md` 2026-05-15 Session 10 entry](../docs/decision-log.md).
>
> **Pending follow-ups:**
> - Browser-driven E2E smoke for both PoC pipelines (IAP-protected; user-driven).
> - Hub PR #53 merge — pending Kurt review.
> - Re-deploy preservation check (`solution_url_updated: 'preserved'`).

---

### ✅ SHIPPED 2026-05-15 — Session 9 (Track A) — Initiative-KPI auto-sync (Option A: auto-overwrite)

> **Outcome:** Per-initiative "Contributes to KPI" cards now auto-fill from measured n8n execution data. Cron folded into existing `/sync-hub` daily 06:15 UTC handler — no new scheduler.
>
> **Plan file:** [`.claude/plans/2026-05-15-initiative-kpi-auto-sync.md`](plans/2026-05-15-initiative-kpi-auto-sync.md).
>
> **What landed:**
> - NEW `services/n8n-ops/src/routes/initiative-kpi-sync.ts` (261 LOC) — single BQ round-trip via `JSON_QUERY_ARRAY` over flattened `{initiative_id, workflow_id}` array; dry-run mode.
> - MODIFY `services/n8n-ops/src/services/supabase.ts` — added `listAllInitiativesWithCategory`, `listAllWorkflowLinks`, `findCanonicalKpiForDept`, `upsertInitiativeKpi`.
> - MODIFY `services/n8n-ops/src/index.ts` — wired `POST /initiative-kpi-sync` (requireOidc).
> - MODIFY `services/n8n-ops/src/routes/sync-hub.ts` — folded `runInitiativeKpiSync({ dryRun:false })` into the daily handler; errors isolated (failure can't break workflow-stats sync).
> - Cloud Run revision: `n8n-ops-00008-vqf` (deployed 2026-05-15 11:57 UTC).
>
> **Live verification (via Supabase REST, 2026-05-15 11:59 UTC):**
> - #214 PFR Celebration: 20h → **1h** (auto-overwrote Ron's manual seed; matches measured rate).
> - #213 PMM HubSpot Reporting: **0h** (newly inserted; workflow has 239 runs but `time_saved_per_execution_min` unset).
> - #193 ORM analysis: 5h untouched (`impact_category='Improved Quality'`, correctly excluded by Time-Savings-only filter).
>
> **Decision:** Option A (auto-overwrite) over B (respect manual) and C (dual-track schema). Measured data is the authority. Manual UI edits last until next 06:15 UTC sync. Forward-compatible with future Option C.
>
> **Schema discovery:** `initiative_kpis` has a *partial* unique index on `(initiative_id, kpi_id) WHERE kpi_id IS NOT NULL`, not a full unique constraint. PostgREST `on_conflict` upsert against partial uniques is fragile, so `upsertInitiativeKpi` uses `SELECT → UPDATE | INSERT` instead. Two HTTP hops per row; negligible at <100 initiatives.
>
> **Decision-log:** [`docs/decision-log.md` 2026-05-15 entry](../docs/decision-log.md).
>
> **Pending follow-ups:**
> - Visual confirm in Hub UI for #213 + #214 (manual; URLs are `${origin}/#/item/<uuid>`).
> - Kurt DM about UI label "Auto-calculated from execution data — last updated {updated_at}" so users don't get confused when their manual edits revert at 06:15 UTC. Slack draft in `D0A9V1YRRQT` since 2026-05-13.
> - 24 errored workflows from Session 8 bulk-populate — revisit when affected dept's KPI lands in Hub.

---

### ✅ SHIPPED 2026-05-15 — Track B Session 9 — Plan-with-AI write-path bug fix + PoC `solution_url` field

> **Outcome:** Two parallel sub-tracks shipped in one session.
>
> **Plan file:** [`.claude/plans/2026-05-15-plan-with-ai-fix-and-poc-solution-url.md`](plans/2026-05-15-plan-with-ai-fix-and-poc-solution-url.md).
>
> **Track B.1 — Plan-with-AI write-path bulletproofed (chat-ui rev `n8n-chat-ui-00046-k9b`, commit `9d46348`):**
> - **Root cause** (silent failure since redesign-v2 deploy on 2026-05-11): the `<create_initiative />` sentinel detection sat inside the `if (extracted)` clause. Replies emitting the sentinel without same-turn JSON skipped the upsert with no log + no SSE event. Verified live: 0 rows in `initiative_chat_creations`, 0 AI-drafted `strategic_ideas` rows, 0 `create_initiative` log entries since deploy.
> - Fix: decoupled sentinel from JSON-extraction gate; added `extractFromHistory()` fallback that walks prior model messages for the most-recent valid JSON; sentinel without any extractable JSON surfaces `⚠ Couldn't save the initiative: …` to the user instead of silence.
> - Observability: every planning-mode turn logs one structured `planning_turn` line — greppable via `gcloud logging read 'textPayload=~"planning_turn"'`. Captures sentinel-detected, extracted-current-turn, extracted-from-history, upsert-called, upsert-ok, upsert-action, upsert-reason.
> - Hardened JSON-block regex: accepts ```` ```JSON ````, ```` ```json5 ````, ```` ```js ````, bare ```` ``` ```` variants; iterates candidates last-to-first.
> - Phase-2 prompt tightened (co-emit contract). Edge Function call retries once on 5xx/network error.
> - Suppressed legacy `<request_workflow_handoff />` SSE when the new path fires on the same turn — closes a race where the AddStrategicIdeaModal autosaves while the Edge Function inserts a row.
> - `HUB_PUBLIC_ORIGIN=https://thehub.gue5ty.com` pinned explicitly in `deploy-cloudrun.sh` (was implicit default).
>
> **Track B.2 — PoC `solution_url` field (Hub PR #52, migration `20260514120000_…` applied):**
> - New nullable column `innovation_items.solution_url`. Distinct from `production_workflow_url` (post-promotion URL).
> - New `Solution URL` input in `StartPocModal` (between Specs Doc and Notes) and `EditInnovationItemModal` (PoC section). Helper text explains auto-fill.
> - `n8n-builder-callback` Edge Function extended: accepts optional `innovation_item_id` + `n8n_workflow_url`. When both present + column currently null/empty, writes `solution_url`; preserves owner-typed values. Response carries `solution_url_updated: 'set'|'preserved'|'skipped'|'failed'`.
> - chat-ui deploy callback caller extended with stub `innovation_item_id` field — full plumbing follows in Session 10.
>
> **Smoke (server-side, what I could verify without driving the UI):**
> - Cloud Run rev `n8n-chat-ui-00046-k9b` serving 100% traffic; `HUB_PUBLIC_ORIGIN` env confirmed.
> - Edge Function `n8n-initiative-upsert` still ACTIVE; auth-gate 401 without `X-Hub-Secret`.
> - Edge Function `n8n-builder-callback` redeployed with `--no-verify-jwt` (matching prior config); auth-gate verified.
> - `npx tsc --noEmit` clean on both repos.
>
> **Pending:** Phase 1.9 live UI smoke (browser-driven; trivial). Track in HEAD's adjacent items.
>
> **Decision-log entries:** sentinel decoupling, history fallback, `planning_turn` observability schema, `solution_url` vs `production_workflow_url` semantics, `--no-verify-jwt` invariant for server-to-server Edge Functions.

---

### ✅ SHIPPED 2026-05-12 through 2026-05-14 — Session 8 — Time Saved KPI v2 + v3 + Hub form strip + n8n-ops v0.3 deploy

> **Outcome:** Three coordinated landings. Architecture pivoted twice in 48h (v1 → v2 → v3) as scope expanded from initiative-linked workflows to department-wide.
>
> **Plan files:**
> - v2: [`.claude/plans/2026-05-12-time-saved-kpi-v2.md`](plans/2026-05-12-time-saved-kpi-v2.md)
> - v3: [`.claude/plans/2026-05-13-time-saved-kpi-v3-dept-centric.md`](plans/2026-05-13-time-saved-kpi-v3-dept-centric.md)
>
> **What landed:**
> - **v2 (2026-05-12)** — moved per-execution time-saved from `strategic_ideas.current_process_minutes_per_run` to each n8n workflow's native `settings.timeSavedPerExecution`. BQ migration v2 added `time_saved_mode` + `time_saved_per_execution_min` to `n8n_ops.workflows` SCD2 dim. `/kpi-rollup` rewrote to read from BQ dim. Initiative `expected_impact` as fallback. `/insights/summary` cross-check baked into response.
> - **v3 (2026-05-13)** — pivoted from initiative-centric to **department-centric** rollup. BQ migration v3 added `project_id` + `project_env`. Workflow → project → department mapping in `src/services/departments.ts`. 100% coverage of active workflows; 18 personal-experiment workflows + 1 placeholder explicitly excluded; 11 unmapped projects classified (6 → AI Team sub-projects, 2 → Product, 1 → Finance, 1 each → exclusions).
> - **Bulk-populated 111 workflows** with `settings.timeSavedPerExecution` via node-count tier heuristic (5 / 10 / 15 / 25 / 40 min). Rationale in `src/services/time-saved-heuristic.ts`. 24 errored (21 IS production + 2 Cura — API key write-scope; 1 self-conflicting webhook in CS).
> - **Hub form strip (PR #51 merged + Cloud Build deployed `00104-nsw`)** — `AddStrategicIdeaModal` Baseline Metrics section gone, `ROIBusinessImpactCard` no-baseline copy updated, Edge Function `n8n-conversation-callback` v10 with empty `numberSpec`.
> - **chat-ui side cleaned** — planning whitelist, system prompt, hub-callback type, MessageBubble display all updated.
>
> **Live Marketing Time Saved KPI:**
> - April 2026: **38.08 h** (21 of 184 in-scope workflows currently configured)
> - May 2026: **87.57 h** (partial — full-month re-run lands June 1)
> - Whole-instance Insights sanity: April 358 h, Marketing ≈ 11% of company-wide.
>
> **API gotchas surfaced and worked around:**
> - n8n's public `PUT /workflows/{id}` rejects extra `settings` keys (`binaryMode`, `availableInMCP`, `timeSavedMode`). Tools whitelist only public-spec keys; `/kpi-rollup` treats `value > 0` as configured regardless of mode.
> - `gcloud auth print-identity-token` doesn't carry `email` claim; n8n-ops's `requireOidc` middleware requires it. Use `iamcredentials.googleapis.com/.../generateIdToken` with `includeEmail:true` (OIDC helper script in next-session.md).
> - CloudFront-vs-Cloud Run routing: `thehub.gue5ty.com` returns 403 on OAuth redirects. Use Cloud Run URL directly (`ai-innovation-hub-hoepmeihvq-uc.a.run.app`) — Supabase auth `uri_allow_list` patched to include it.
>
> **Decisions logged** ([docs/decision-log.md](../docs/decision-log.md) entries 2026-05-12 through 2026-05-14): n8n-native settings as source of truth, all-or-nothing fallback, department mapping + Alvaro exclusion, heuristic tier rationale + anchors, Option A auto-overwrite reasoning, observable Apr/May regression (37 → 25 → 38 h vs v1 → v2 → v3).

---

### Superseded HEAD (kept for context — content rolled up into Session 8 shipped entry above)

> Originally: "n8n-ops v0.2 deploy — bundle Time Saved KPI rollup + zombie sweeper + alert fixes + sync-hub stub-row". Replaced by the bundled Session 8 ship which did all of that PLUS v3 + form strip.

---

### 1.OLD [archived HEAD content — for reference only] n8n-ops v0.2 deploy — bundle Time Saved KPI rollup + zombie sweeper + alert fixes + sync-hub stub-row

**Goal:** One deploy ships everything coded in Sessions 2 (sync-hub diagnosis) + 7 (Time Saved KPI + zombie sweeper). Single `cd "Agentic Workflows/services/n8n-ops" && ./deploy.sh` rebuilds Cloud Run + idempotently creates/updates 6 schedulers (4 existing + 2 new: `n8n-ops-kpi-rollup` `0 2 1 * *` UTC, `n8n-ops-sweep-zombies` `*/30 * * * *` UTC).

**Prereqs:**
- `Agentic Workflows` is NOT git-tracked — code lives on Drive only. Verify the working tree at `Agentic Workflows/services/n8n-ops/src/` matches MEMORY.md description before deploying.
- `gcloud auth` valid + project `agentic-workflows-485210` selected.
- Optional but recommended: still-pending sync-hub stub-row fix (~12 lines in `src/routes/sync-hub.ts`) — bundle into the same deploy. See [docs/sync-hub-coverage-fix.md](../docs/sync-hub-coverage-fix.md).

**Order of operations:**
1. **Stub-row fix in sync-hub.ts** (if not already done): when `wfStats.length === 0` for a workflow, push `{ workflow_id, period_date: today, total_runs: 0, success_runs: 0, error_runs: 0, success_rate_pct: null, p50_duration_sec: null, p95_duration_sec: null, last_run_at: null, ...alerts: 0 }`. Hub aggregator already renders `health: 'unknown'` for null success_rate_pct.
2. **Run deploy:** `cd "Agentic Workflows/services/n8n-ops" && ./deploy.sh`. Watch for `gcloud builds submit` success and 6 scheduler create/update lines.
3. **Smoke `/kpi-rollup` dry-run for Apr 2026:**
   ```
   SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')
   TOKEN=$(gcloud auth print-identity-token --audiences=${SVC_URL})
   curl -X POST "${SVC_URL}/kpi-rollup" -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
     -d '{"kpiId":"e6f47f5b-5de7-4630-84b5-441741270e53","periodDate":"2026-04-01","dryRun":true}'
   ```
   Expect `total_hours: 37.0`, byInitiative + byWorkflow populated. (Live push for Apr/May already done manually in Session 7 — `kpi_measurements` has both rows.)
4. **Smoke `/sweep-zombies` dry-run:** `curl -X POST "${SVC_URL}/sweep-zombies" -d '{"dryRun":true}'`. Should return 0 candidates (we cleared the 3 known zombies in Session 7).
5. **Smoke `/sync-hub`** post-stub-row-fix: `curl -X POST "${SVC_URL}/sync-hub"`. Verify `MJhuTMoNzvfC3V3G` (archived demo workflow) now appears in `initiative_workflow_stats` for today's date.
6. **Verify Hub UI:** open `/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53` — chart should show Apr 37h + May 90.5h. WorkflowHealthCard for the demo initiative should now list all 3 linked workflows including the archived one.

**Files:**
- New deploy: all of `Agentic Workflows/services/n8n-ops/src/{routes/kpi-rollup.ts, routes/sweep-zombies.ts, services/secret-manager.ts}` + extended `services/supabase.ts` + modified `services/n8n.ts` + modified `routes/loop-alerts.ts` + modified `index.ts` + modified `deploy.sh` + updated README.md.
- Stub-row fix: `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts` (~12 lines).

**Estimated effort:** 45 min if stub-row not yet done (15 min code + 20 min build/deploy + 10 min smoke). 25 min if stub-row already done.

**After-deploy followups (separate sessions):**
- Confirm with Ron Madar-Hallevi the PFR meaning + per-run minute estimates (15 PFR / 30 ORM) are right.
- Post the Slack message drafted in Session 7 (see MEMORY.md `Where We Left Off`).
- Feedback-loop harvest — Apr 15 last run, weekly cadence — currently overdue ~23 days.

---

### ✅ SHIPPED 2026-05-08 — Session 7 — Time Saved KPI rollup ship + n8n-ops zombie-alert fix

> **Outcome:** Phase 5 of Hub roadmap shipped. Marketing's "Time Saved" canonical KPI (`e6f47f5b-5de7-4630-84b5-441741270e53`) is now auto-populated from BigQuery → Hub via `kpi-webhook-ingest`. April 2026 = 37.0 h, May 2026 (1-8 partial) = 90.5 h, both visible in Hub `kpi_measurements`.
>
> **What's coded** (all in `Agentic Workflows/services/n8n-ops/`, NOT YET DEPLOYED — see HEAD session):
> - `src/routes/kpi-rollup.ts` — new `POST /kpi-rollup`. Reads `kpis` + `initiative_kpis` + `strategic_ideas` + `initiative_workflow_links` from Hub Supabase, sums `success_runs` from BQ for the period, multiplies by `current_process_minutes_per_run` (defaults 30), POSTs to Hub `kpi-webhook-ingest`. Per-KPI bearer from Secret Manager `kpi-webhook-token-<kpi_id>`. Dry-run mode.
> - `src/routes/sweep-zombies.ts` — new `POST /sweep-zombies`. Reconciles BQ rows stuck `running >6h` against n8n's per-execution API.
> - `src/services/secret-manager.ts` — ADC-auth Secret Manager reader (5-min cache).
> - `src/services/n8n.ts` — added `getExecutionById`.
> - `src/services/supabase.ts` — added `listN8nWebhookKpis`, `getKpiById`, `listKpiInitiativeBindings`.
> - `src/routes/loop-alerts.ts` — capped stuck-running at 24h, collapsed multi-execution alerts per workflow.
> - `deploy.sh` — added 5th + 6th schedulers.
> - `tsc` clean.
>
> **What's live in Hub today** (manual writes via service-role REST):
> - `kpis.data_source_label` set to "n8n Workflow Builder (alvaro.cuba)".
> - 7 rows in `initiative_workflow_links` (3 PFR + 4 ORM workflows mapped to the 2 linked initiatives).
> - 2 `strategic_ideas` rows updated with `current_process_minutes_per_run` (15 + 30) and `current_process_runs_per_month` (120 + 80).
> - 1 fresh row in `kpi_webhook_tokens` with raw token in GCP Secret Manager `kpi-webhook-token-e6f47f5b-...`.
> - 2 measurements in `kpi_measurements`.
>
> **Critical schema correction (caught only because user pushed back):** Hub's Phase 2 spec named the linking table `kpi_initiative_contributions`. The migration actually extended `initiative_kpis` with a `kpi_id` FK column. The named table never existed. Fixed before deploy.
>
> **IAM win — no IT ticket:** SA `n8n-workflow-builder@…` already has project-wide `roles/secretmanager.secretAccessor`. README onboarding step trimmed to just `gcloud secrets create`.
>
> **Track B (zombie alert spam):** `#n8n-ops` Slack was getting hourly "Stuck running workflow" alerts for 3 zombie executions on `CkmAmA31lNYVprOE`. One-time `bq UPDATE` marked them `abandoned` (silenced today's spam); permanent fixes in `loop-alerts.ts` (24h cap + GROUP BY workflow_id) + new `/sweep-zombies` route.
>
> **Decisions logged:** [docs/decision-log.md](../docs/decision-log.md) — colocate-in-n8n-ops, Phase-2-table-rename, label-vs-secret gate, project-wide SA accessor, first-binding-wins attribution, default 30 min/run, 24h stuck-running cap.
>
> **Plan file:** [.claude/plans/2026-05-08-time-saved-kpi-rollup.md](plans/2026-05-08-time-saved-kpi-rollup.md) (migrated from `~/.claude/plans/`).
>
> **Memory updates:** new `Where We Left Off` block in MEMORY.md.

---

### ✅ SHIPPED 2026-05-08 — Session 6 — Jira integration (read-only ticket display in Hub)

> **Outcome:** End-to-end live. Hub PR #43 merged (`9a44ebed`) → Cloud Build `02eb4cd6` SUCCESS → revision `ai-innovation-hub-00098-xdx` LIVE. chat-ui v0.32 deployed (`n8n-chat-ui-00044-ncm`, commit `9ce5a5a` on session branch).
>
> **What's live:**
> - Hub Supabase: `initiative_jira_links` table (mirrors `initiative_workflow_links` pattern — RLS, partial-unique on `is_primary`, demote-then-promote 5-step write order). Migration `add_jira_links.sql` applied to project `ilhlkseqwparwdwhzcek`.
> - Hub Edge Function `jira-issue-fetch` — browser-callable (JWT verify ON, default — explicitly NOT `--no-verify-jwt` like the server-to-server callbacks). HTTP Basic auth to Jira REST v3 with `JIRA_EMAIL` + `JIRA_API_TOKEN` Edge-Function secrets. POST single + batch shapes (max 20). 5-min in-memory cache. Maps Jira 401/403→502, 404→404.
> - Hub Edge Function `n8n-conversation-callback` redeployed with `arrayPatternSpec` for `jira_ticket_ids` (uppercased, deduped, regex-filtered, max 5 entries).
> - Hub UI: `JiraTicketCard` in `IdeaDetailModal` (status pill / link-out / graceful warning + error states); `JiraTicketPicker` tag-input in `AddStrategicIdeaModal` Links & Notes section (live-fetch summary on Enter, warning chip for `not_found`, error chip for `auth_failed`); apply-suggestions merges `jira_ticket_ids` into `jiraLinks` state with `role='related'`, `is_primary=false`, never overwriting existing chips. DB write at form-save via `replaceJiraLinksForInitiative`.
> - chat-ui: planning_mode whitelist 13→14 keys; new `arrayPatternField` validator closure in `extractAndValidatePlanningFields` ([chat-ui/src/app/api/chat/route.ts](../chat-ui/src/app/api/chat/route.ts)); SSE `extracted_fields` event payload widened to `Record<string, string | number | string[]>`.
>
> **Smoke results:**
> - `jira-issue-fetch`: 5/5 cases (no-auth 401, valid CXAU-669 200+DTO, invalid format 400, nonexistent 404, batch 200).
> - `n8n-conversation-callback`: end-to-end POST persisted `jira_ticket_ids` to `initiative_chat_conversations.extracted_fields` with values cleaned and uppercased.
> - Bad-token Edge Function smoke: setting `JIRA_API_TOKEN=invalid_for_test` and re-querying — Atlassian quirk returned 404 (issue-or-permission obscurity) rather than 401, so the canonical 401→502 mapping path didn't trigger; UI's "Couldn't load" state covers both gracefully. Token restored.
> - Live e2e on `https://thehub.gue5ty.com/`: picker fetched real summary for `CXAU-247` ("[Ent] Structured ENT Knowledge Arc…") — full chain working end-to-end in production.
> - `npx tsc --noEmit` clean on both repos.
>
> **Coexistence:** legacy single-column `strategic_ideas.jira_link` is preserved alongside the new multi-link table. UX confusion ("which field?") is real but acceptable for MVP. Follow-up: backfill into `initiative_jira_links` and drop the column once usage data justifies it (track this on a future session as a small follow-up).
>
> **Estimate vs actual:** Plan estimated 6.5–8h (after review-driven bump from 5.5–6.5h); actual ~5h. RLS just worked, the chip UX didn't iterate, and the existing `WorkflowHealthCard`/`WorkflowLinkPicker` patterns transplanted cleanly.
>
> **Memory updates:** new `project_jira_integration.md` documenting schema, Edge Function URL, secrets layout, Atlassian-404-on-bad-creds quirk, and the JWT-verify-default-vs-no-verify-jwt distinction. Indexed in `MEMORY.md`.
>
> **Blockers addressed in plan review (2026-05-08):**
> 1. Original Step 0 was stale — TtP had already shipped (chat-ui v0.31, Hub PR #33). Replaced with 5-min sanity check.
> 2. Edge Function JWT verification: explicit comment locks in default-on (browser-callable). Avoids accidentally copying `--no-verify-jwt` from server-to-server `n8n-promote-callback`.
> 3. Live `initiative_workflow_links` schema verified via `supabase db query` before mirroring (caught nothing — schema dump matches live, but the check itself is the cheap insurance worth keeping).

---

### ✅ SHIPPED 2026-05-05 — Session 5 — Direction-3 ship + scope-confinement source field

> Outcome: chat-ui v0.30 deployed (`n8n-chat-ui-00037-6nj`, commit `b2bfd1c`) — Direction-3 embed mode + planning whitelist 6→13 keys + scope-confinement `source` field with subsequent-turn invariant. Hub PR #21 merged (`686943c8`) → Hub revision `ai-innovation-hub-00079-9z9` LIVE — `<EmbeddedChatPanel>` drawer (480px right-side) replaces new-tab handoff for Plan/Generate-with-AI buttons; postMessage protocol with origin allowlist; AddStrategicIdeaModal planning auto-pop bypasses 30s visibilitychange poll for sub-second "Apply suggestions" UX (poll kept as safety net). Hub Supabase migration `add_conversation_source.sql` LIVE on project `ilhlkseqwparwdwhzcek` (nullable + backfill `hub_prefill` + CHECK constraint). Both Edge Functions (`n8n-conversation-callback`, `n8n-builder-callback`) redeployed with source defense (reject `'standalone'`, treat missing as `hub_prefill` for v0.29 backward-compat) + planning whitelist parity. Bonus fix: `deploy-cloudrun.sh` flipped `--no-allow-unauthenticated` → `--allow-unauthenticated` (commit `bd13fc6`) so future deploys preserve the Session 3 IAP-off `allUsers run.invoker` binding. Verified end-to-end via Playwright: standalone regression intact, embed chrome suppression, cross-origin iframe + cookie auth, drawer mounts/unmounts cleanly, prod smoke against `00079-9z9` confirms drawer + 5s-timeout fallback. Auth-token postMessage flow deferred (Hub Supabase JWT ≠ Google ID token with chat-ui audience; cookie path covers most cases). See Session Log + memory `project_hub_n8n_builder_integration.md` §Session 5.

---

### ✅ SHIPPED 2026-05-05 — Session 4 — Direction-3 protocol design + embedded chat panel MVP

> Outcome: Hub PRs #18 + #19 self-merged + Cloud Build approved → Hub `00078-5cz` LIVE with Direction-2 buttons. chat-ui side: `docs/direction-3-design.md` written, planning-mode whitelist expanded 6 → 13 keys with enum validation, `?embed=true` mode wired end-to-end (middleware + layout + AuthGate hybrid + SSE events + postMessage), local test harness verifies the full flow on `localhost:3010 → localhost:3002`. Playwright-verified: embed hides chrome, non-embed regression intact, `auth_required` postMessage fires with correct origin, 5s timeout fallback renders. **chat-ui v0.30 is UNCOMMITTED + UNDEPLOYED** — pending regression in Session 5. See Session Log + memory `project_hub_n8n_builder_integration.md` §Session 4.

<details><summary>Original brief (kept for archive)</summary>
### Original brief — Session 4

**Goal:** Design the iframe ↔ parent communication protocol that Direction 3 needs, expand the planning_mode field whitelist so the embedded UX feels useful (not 6-of-20 fields), then start the implementation. Intentionally a design-heavy session; if Steps 1-3 take all the time, that's fine — protocol design before typing prevents rework.

**Why this is design-first:** Direction 2 (new-tab) shipped successfully but four things break the moment chat-ui moves into a Hub iframe:
1. **`visibilitychange` won't fire** — the user never leaves the tab; the "Apply AI suggestions" pill never refreshes.
2. **No iframe ↔ parent channel** — `window.postMessage` protocol needs to be defined for both directions.
3. **WorkflowHealthCard waits a day** for the next-cron sync; embedded UX expects "deploy → see stats" within seconds.
4. **6-field whitelist is too narrow** — the embedded UX wants AI to fill most of the StrategicIdea form, not just KPI + 3 ROI fields.

**Prereqs:** Sessions 2 + 3 shipped. PRs #18 and #19 should be merged + deployed before this session starts so we're working against a known Hub baseline (not deferred — Direction-3 changes Hub UI again).

**Step 0 (15 min): Smoke**
- Visit `https://n8n-chat-ui-535171325336.europe-west1.run.app/chat` in incognito → GIS sign-in → cookie persists.
- Visit a Hub initiative → "Generate with AI" → Direction 2 still works.

**Step 1 (1-2 h): postMessage protocol design**

Three minimum event flows:

| Direction | Event | Payload | When |
|---|---|---|---|
| iframe → parent | `extracted_fields_updated` | `{initiative_id, extracted_fields, extracted_fields_at}` | After every planning turn that emits a JSON block |
| iframe → parent | `workflow_deployed` | `{initiative_id, n8n_workflow_id, n8n_workflow_name}` | On successful deploy |
| parent → iframe | `auth_token` | `{id_token}` | iframe load (Chrome may quarantine SameSite=None cookie inside iframes — partitioned storage) |

**Decisions to capture in `docs/direction-3-design.md`:**
- Origin allowlist on both sides (`event.origin === 'https://ai-innovation-hub-…'`).
- Whether parent passes the Google ID token via postMessage in addition to / instead of cookies.
- Whether deploy events trigger Hub-side immediate insert into `initiative_workflow_stats` (placeholder row, `total_runs=0`, `success_rate_pct=null`, health=`unknown`), OR call a new on-demand `/sync-hub?workflow_id=X` endpoint on n8n-ops.

**Step 2 (1 h): Expand planning_mode JSON whitelist**

From 6 keys to ~12, mirroring the `StrategicIdea` form:

```
title, description, improvement_kpi, business_justification, current_state,
department, data_sources, level_of_improvement, impact_category, effort,
current_process_minutes_per_run, current_process_runs_per_month, current_process_people_count
```

Update:
- `<rule name="planning_mode">` in `chat-ui/src/lib/system-prompt.ts` — extended JSON shape with enum values listed.
- `extractAndValidatePlanningFields` in `chat-ui/src/app/api/chat/route.ts` — new validators for enums (`level_of_improvement`, `impact_category`, `effort`, `department`).
- `n8n-conversation-callback/index.ts` — defense-in-depth re-validators for the new keys.

**Step 3 (1 h): Embedded UI sketch**
- Pick one: side drawer | bottom sheet | full-screen takeover with breadcrumb. Document why.
- Decide chat-ui sidebar visibility in iframe mode (probably hidden; Hub manages the conversation switcher).
- Decide chat-ui header visibility (probably hidden; Hub already has its own header).
- Capture in `docs/direction-3-design.md`.

**Step 4 (rest of session): Implementation kickoff**
- chat-ui: support `?embed=true` → renders chat surface only + posts the postMessage events.
- Hub: new `<EmbeddedChatPanel>` used in `IdeaDetailModal` and `AddStrategicIdeaModal`.

**Success criteria:**
- `docs/direction-3-design.md` written.
- planning_mode prompt rule expanded; smoke verifies at least 2 new fields (e.g. `department`, `level_of_improvement`) round-trip.
- (Stretch) Embedded panel renders in dev with chat-ui in `?embed=true` posting at least the `extracted_fields_updated` event.

**Estimated effort:** 6-8 h.

**Files likely touched:**
- chat-ui: `src/lib/system-prompt.ts`, `src/app/api/chat/route.ts`, `src/app/chat/layout.tsx` (embed mode), `src/components/EmbedHostBridge.tsx` (NEW — postMessage sender).
- Hub: `components/EmbeddedChatPanel.tsx` (NEW), `components/IdeaDetailModal.tsx`, `components/AddStrategicIdeaModal.tsx` (replace new-tab buttons with panel triggers).
- Edge Function: `supabase/functions/n8n-conversation-callback/index.ts` (extended validators).
- Docs: `docs/direction-3-design.md` (NEW).

</details>

---

### ✅ SHIPPED 2026-05-04 — Session 2 — Deploy Session 1 + ROI Business Impact card + planning-mode field auto-fill + sync-hub coverage debug

> Outcome: chat-ui v0.27 + v0.28 deployed. Hub PRs #18 + #19 (stacked) opened against `kurtpabilona-code/AI-Innovation-Hub-Vertex` awaiting Kurt's review. ROI card mounted, planning auto-pop wired with apply-suggestions UI (visibilitychange-based). Sync-hub diagnosed only — promoted as queue item #2 above. See Session Log + memory `project_hub_n8n_builder_integration.md` §Session 2.

<details><summary>Original brief (kept for archive)</summary>

**Goal:** Land Session 1's uncommitted work to production (Hub + chat-ui), then layer the ROI Business Impact card in IdeaDetailModal, wire planning-mode form auto-population, and finally fix the sync-hub partial coverage so all 3 demo workflows have stats.

**Prereqs:** Session 1 (Hub × n8n-builder integration foundation) shipped May 4 2026 — code + schema + Edge Functions all live. Cloud Run / Cloud Build deploys still pending. See [memory: project_hub_n8n_builder_integration.md](../../../.claude/projects/-Users-alvaro-cuba-Library-CloudStorage-GoogleDrive-alvaro-cuba-guesty-com-My-Drive-n8n-builder-cloud-claude/memory/project_hub_n8n_builder_integration.md).

**Step 0 — Land Session 1 to production (~30 min):**
1. chat-ui: `git add` + `git commit` Session 1 changes (chat-ui/ + deploy-cloudrun.sh) → `./deploy-cloudrun.sh --ui-only` → verify revision `n8n-chat-ui-00033-…` shows new prefill plumbing.
2. Hub: cut a new branch from `main`, cherry-pick the AddStrategicIdeaModal/IdeaDetailModal/services/migrations changes from `fix/picker-primary-flip-and-ux-polish`, push, open PR → approve Cloud Build → verify Hub revision `ai-innovation-hub-00076-…` shows the new buttons.
3. Smoke-test the building/planning URLs from `it-ticket-iap-to-oauth.md` adjacent (or regenerate against demo initiative `00984539-…`).

**Step 1 — ROI Business Impact card:**
- New `<BusinessImpactCard>` component placed BELOW `<WorkflowHealthCard>` in IdeaDetailModal (and ABOVE the new GenerateWorkflowButton).
- Reads from `strategic_ideas` (the 5 baseline columns shipped Session 1) AND `initiative_workflow_stats` (BQ-driven n8n_ops cron).
- Computes: baseline_hours_per_month vs automated_hours_per_month → hours_saved → × hourly_rate ($25 default; column override).
- Renders: hours saved + dollars saved + sparkline of `actual_hours_saved` over last 8 weeks.
- States: "Add baseline" CTA (3 inputs missing) | "Awaiting stats" (no `initiative_workflow_stats` rows) | live numbers.

**Step 2 — Planning-mode field auto-fill on tab return:**
- chat-ui's planning-mode AI emits a JSON code block with form-population values (already wired in system_prompt rule `planning_mode`).
- Hub: when the user closes the chat-ui tab and returns to the Hub, IdeaDetailModal reads the latest planning conversation summary from `initiative_chat_conversations`, parses the JSON, and shows a "Apply suggested values" banner that auto-fills the form on click.
- Stretch: chat-ui's `n8n-conversation-callback` upserts `summary` with the parsed JSON for direct Hub consumption (no need to fetch the whole conversation from Firestore).

**Step 3 — Sync-hub coverage debug:**
- Workflow `MJhuTMoNzvfC3V3G` (Article translations sub-workflow) STILL doesn't sync to `initiative_workflow_stats` per May 4 probe.
- Instrument `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts`: log `links.length`, `workflowIds.length`, `stats.length`, `rows.length`, `synced` at each step.
- Likely a sub-workflow filter in the BQ rollup query — check `Agentic Workflows/services/n8n-ops/src/services/bigquery.ts`.
- Re-run the cron manually after fix; verify all 3 demo workflows now show stats.

**Files likely touched:**
- Hub: `components/BusinessImpactCard.tsx` (NEW), `components/IdeaDetailModal.tsx`, services/initiativeChatConversations.ts (add `getLatestPlanningConversation`)
- chat-ui: `src/lib/system-prompt.ts` (refine planning_mode JSON shape), `src/app/api/chat/route.ts` (extract summary from final assistant message and POST to conversation-callback with summary populated)
- Agentic Workflows / n8n-ops: `src/routes/sync-hub.ts`, `src/services/bigquery.ts`

**Success criteria:**
- Both repos deployed; demo URLs land on real chat-ui, Hub buttons present
- BusinessImpactCard renders accurate $/hours-saved when both baseline AND `initiative_workflow_stats` data are present
- Planning conversation auto-fills the create-initiative form on tab return for at least 1 e2e test
- All 3 demo workflows show `initiative_workflow_stats` rows within 24h of cron fire

**Estimated effort:** 6-9 h (Step 0: 30 min · Step 1: 3-4 h · Step 2: 2-3 h · Step 3: 1-2 h).

</details>

---

### ✅ SHIPPED 2026-05-04 — Session 3 — IAP → OAuth migration on chat-ui (Direction-3 prereq, IT-ticket gated)

> Outcome: chat-ui v0.29 (rev `n8n-chat-ui-00036-8xh`) live with app-level Google OAuth via GIS, IAP DISABLED, Console-created Web OAuth client active. Browser smoke verified end-to-end. Direction-3 unblocked. See Session Log + memory `project_hub_n8n_builder_integration.md` §Session 3 + gotchas in `feedback_iap_to_oauth_gotchas.md`.

<details><summary>Original brief (kept for archive)</summary>

**Goal:** Replace Cloud IAP on n8n-chat-ui with app-level Google OAuth so the service can serve cross-origin requests from the Hub origin. This is the engineering gate for Direction 3 (embedded chat panel inside Hub).

**Prereqs:** IT ticket `it-ticket-iap-to-oauth.md` (drafted Session 1) approved + actioned by IT/security. Externally gated — promote to HEAD only when IT confirms.

**Scope:**
1. Create OAuth client in project `agentic-workflows-485210` with authorized origins for chat-ui domain + Hub domain.
2. Rewrite `chat-ui/src/lib/auth.ts` — replace `getUserFromHeaders` IAP-header parsing with `verifyIdToken` via `google-auth-library`. Maintain return shape so callsites don't change.
3. CORS middleware allowing `https://ai-innovation-hub-hoepmeihvq-uc.a.run.app` (and future `thehub.gue5ty.com`).
4. Cloud Run config: remove ingress restrictions, remove IAP from LB, allow `--allow-unauthenticated` (auth is now in app code).
5. Define cross-origin API contract: `/api/chat`, `/api/conversations?initiative_id=X`, `/api/deploy`. SSE-streamed responses confirmed working cross-origin.
6. (Optional) Multi-region deploy `n8n-chat-ui-us` to us-central1 to match Hub. Skip if 150ms latency is fine.

**Success criteria:**
- chat-ui accepts requests from Hub origin with valid Google ID token
- Same `@guesty.com` / `@rentalsunited.com` domain restriction enforced
- Existing IAP-protected user journeys (browser login, conversation persistence) work unchanged
- Curl-from-Hub-origin smoke test: `fetch('https://chat-ui/api/chat', { headers: { Authorization: 'Bearer <id_token>' }})` returns 200

**Estimated effort:** 8-12 h, fully gated by IT.

</details>

---

### Merged into HEAD — Original Session 4 (Direction-3 embedded chat) brief

> Promoted to HEAD with expanded protocol-design scope above. Original brief retained for archive.

<details><summary>Original brief</summary>

**Goal:** Ship the manager's vision — chat-ui's chat surface lives INSIDE the Hub (no new tab). Click "Plan with AI" or "Generate workflow with AI" → drawer opens in-page → user converses → workflow ships → drawer closes. Single app experience.

**Prereqs:** Session 3 done. chat-ui APIs cross-origin authenticated.

**Scope:**
1. Hub-native thin chat panel UI (`<EmbeddedChatPanel>` component) inside IdeaDetailModal + AddStrategicIdeaModal. Calls chat-ui's `/api/chat` directly with the user's Google ID token.
2. Streaming response rendering matching chat-ui's UX.
3. Conversation history loaded via `/api/conversations?initiative_id=X` — past planning + building sessions surfaced as a switcher.
4. Workflow JSON preview + Deploy button rendered in the Hub (calls chat-ui's `/api/deploy`).
5. Demo capture: full Hub → click button → embedded chat → AI builds workflow → deploy → Workflow Health card lights up — all without leaving the Hub.

**Success criteria:**
- Direction 3 demo recorded: 90-second flow from initiative-detail to deployed-workflow-with-stats, no new tabs opened
- Conversation history viewable inline without leaving Hub
- Existing chat-ui standalone UX still works for users who go directly there

**Estimated effort:** 12-16 h.

</details>

---

### Older queue (deferred / merged into above)

The original Session 1 — Hub × n8n-builder integration full bidirectional loop:
**Goal:** Close the Strategy → Workflow loop **end-to-end and bidirectionally**. From any Hub initiative, the user kicks off the n8n-builder pre-loaded with **AI-generated workflow requirements** derived from the initiative's content; after the AI builds and deploys, info flows **back** into the Hub initiative's documentation, and the workflow's sticky note references the initiative so the provenance is visible inside n8n itself.

**Why now:** Today the Hub catalogs workflows (read-only via `initiative_workflow_links`); the human curates the link manually. The integration flips the loop — initiatives drive workflow creation, the AI translates initiative-language to workflow-requirements-language so the user doesn't repeat themselves, and the workflow carries the initiative back into n8n + the Hub so the trail is durable. This is the central productization story for both apps.

**The four pieces (one cohesive session, MVP all four):**

#### Forward — Hub kicks off the builder

1. **"Generate workflow with AI" button** on `IdeaDetailModal` below the Workflow Health card. Coral, prominent.
2. **AI requirements generator** — before opening chat-ui, run a single Claude API call that consumes the initiative's full record (title, description, KPI, business justification, current state, dept, owner, dataSources, jiraLink, relevantLinks, notes) and emits a **structured requirements brief**: `{trigger, data_sources, transformations, destinations, success_metric, constraints}`. This is the value-add — the user already wrote the initiative, the AI translates it into builder-language so the user doesn't re-type it.
3. **Deep-link into chat-ui** with the requirements brief + initiative metadata as `?prefill={base64}` URL param. chat-ui reads it, seeds the conversation, AI's first message acknowledges the initiative by name and confirms the requirements before generating the workflow.

#### Sticker enrichment — workflow carries the initiative

4. **Sticky note references the initiative** — extend the existing `<sticky_notes>` rule in `chat-ui/src/lib/system-prompt.ts`. When the chat-ui session has an `initiative_id` in context, the header sticky note MUST include a line like:
   ```
   Initiative: INIT-248 — Guesty Marketing Cowork Slack MAS
   Generated by: @alvaro.cuba on 2026-05-05
   Hub: https://thehub.gue5ty.com/#/initiatives/00984539-…
   ```
   Provenance becomes visible inside n8n itself — anyone opening the workflow sees where it came from.

#### Backward — builder writes back to the Hub

5. **Auto-link on deploy** — when chat-ui's `n8n-deploy.ts` Deploy succeeds AND the session has an `initiative_id`, POST to a new Hub Supabase Edge Function `n8n-builder-callback` with `{initiative_id, n8n_workflow_id, n8n_workflow_name, deployed_by, deployed_at}`. The Edge Function inserts into `initiative_workflow_links` directly (bypasses the picker UI flow from PR #13).
6. **Initiative documentation update** — the same callback also appends a line to the Hub initiative's `notes` field (or a new `generated_workflows` field if we want it structured): `Generated workflow "Daily Churn Report – @alvaro.cuba" on 2026-05-05 via n8n-builder.` Optionally include the chat-ui session ID so the conversation is recoverable.

#### Outcome

The user sees: Hub initiative → click → chat-ui conversation already framed around their initiative's KPI → AI generates a sensible workflow → they deploy it → seconds later, the Hub initiative shows the new workflow attached + a `notes` entry timestamping the AI session + the Workflow Health card starts populating from the next `/sync-hub` cycle. **Provenance and operational health both live where the user already is.**

**Prereqs:**
- ✅ Hub revision `00075-zjn` serving (post-#17)
- ✅ chat-ui revision `n8n-chat-ui-00032-9xf` serving (v0.26 has the workflow-naming + sticky-note rules that we'll extend)
- ⚠️ Auth handoff: chat-ui is IAP-protected. Hub users hit IAP on the chat-ui first redirect — usually the same Guesty Google identity, so the redirect is one extra hop. Acceptable for v1.
- ⚠️ Backward callback auth: the new Edge Function needs to authenticate the callback. Options: (a) shared secret in chat-ui env + Edge Function header check, (b) Supabase service-role JWT minted in chat-ui's deploy route. Pick (a) for v1 — simpler.

**Step 0 (5 min): morning probe** — re-run yesterday's `initiative_workflow_stats` coverage check. If the 06:15 UTC cron self-healed and now syncs all 3 linked workflows, great; if still partial, log the gap and continue with this session (Session 3 will fix it). The integration doesn't strictly need the data side perfect, but the demo story is much stronger when the auto-linked workflow actually shows stats by the next cron cycle.

**Success criteria:**
- [ ] From any initiative detail in the Hub, click button → AI requirements brief shown briefly → opens chat-ui with the brief pre-filled
- [ ] AI's first reply in chat-ui acknowledges the initiative by name AND restates the structured requirements
- [ ] Deployed workflow's header sticky note includes `Initiative: …` + Hub deep-link
- [ ] On deploy success, the Hub initiative gains a new row in `initiative_workflow_links` automatically (no manual re-linking)
- [ ] Hub initiative's `notes` field updated with a timestamped "Generated workflow X" entry
- [ ] At least one full round-trip demo: Hub → AI requirements → chat-ui → deploy → Hub auto-shows the link
- [ ] Demo walkthrough screenshots added to `hub-ui-demo/` (numbered 22+)
- [ ] Memory updated: integration architecture decision, auth handoff trade-offs, the AI-requirements-generator pattern

**Files likely touched:**

Hub repo (`kurtpabilona-code/AI-Innovation-Hub-Vertex`):
- `components/IdeaDetailModal.tsx` — new "Generate with AI" button + invokes the requirements generator + opens chat-ui in new tab
- new `services/aiRequirementsGenerator.ts` — Claude API call wrapper that converts initiative → structured requirements brief
- new `services/n8nBuilderUrl.ts` — URL builder that base64-encodes `{initiative_id, requirements_brief, initiative_metadata}` into `?prefill=`
- new Supabase Edge Function `supabase/functions/n8n-builder-callback/index.ts` — receives chat-ui's deploy callback, inserts link + updates initiative notes

chat-ui (`n8n-builder-cloud-claude`):
- `chat-ui/src/app/page.tsx` — read `?prefill=` param on first render, decode, store in state
- `chat-ui/src/components/ChatWindow.tsx` — when prefill present, seed conversation history with a system message conveying initiative context + requirements brief
- `chat-ui/src/lib/system-prompt.ts` — add `<initiative_context>` injection point + extend `<sticky_notes>` rule with the initiative-reference requirement when context present
- `chat-ui/src/lib/types.ts` — new `InitiativePrefill` + `RequirementsBrief` types
- `chat-ui/src/app/api/deploy/route.ts` — on success, if `initiative_id` is in the session, POST to the Hub Edge Function with shared-secret auth
- `chat-ui/.env` — new `HUB_CALLBACK_URL` + `HUB_CALLBACK_SECRET`

Cross-project:
- New memory entry: "Hub × n8n-builder integration architecture" (covers the bidirectional flow, auth handoff, requirements-generator prompt)
- Update `Portfolio/` integration notes if applicable

**Estimated effort:** 6-8 hours for full MVP (all 4 pieces). Stretch: a "View AI session" link in the Hub initiative that re-opens the chat-ui conversation read-only.

**Risks:**
- chat-ui's IAP-redirect on first navigate means a 1-hop UX hiccup (existing limitation).
- The AI requirements generator adds latency before chat-ui opens — keep the prompt small + use Claude Haiku for sub-second response. Show a small loading state on the Hub button.
- Auto-write-back to the initiative `notes` field could surprise users who had carefully-formatted notes. Consider appending in a clearly-delimited block (`--- AI Builder ---`) so it's reversible.

---

### 2. Sync-hub coverage debug + bulk-link backlog + tell-Kurt outbox
**Goal:** Get `initiative_workflow_stats` populated for every linked workflow (not just the lucky one), bulk-link the existing initiative backlog so the Hub stops looking empty, and clear the tell-Kurt outbox.
**Prereqs:** Step 0 of Session 1 will have run a probe. If the cron self-healed overnight, this session shrinks to just the bulk-link + tell-Kurt parts (~30-60 min). If still partial, the full debug is ~2-3h.
**Success criteria:**
- All 3 linked workflows show stats `last_synced` within 24h of the cron firing
- ≥5 candidates from `/admin/n8n-link-suggestions` bulk-confirmed (75-100% match band)
- Slack DM to Kurt sent: Cloud Build approval gate, Vercel hobby-team block, sync-hub partial-coverage
- IT ticket filed: flip `thehub.gue5ty.com` CNAME from CloudFront to `ghs.googlehosted.com`
- `hub-ui-demo/18-health-card-expanded-real-data.png` re-captured with real-from-cron data (no Management API seed)
**Files likely touched:**
- `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts` (instrument: log `links.length`, `workflowIds.length`, `stats.length`, `rows.length`, `synced` at each step)
- `Agentic Workflows/services/n8n-ops/src/services/supabase.ts` (if `listInitiativeWorkflowLinks` itself is the bug)
- `Agentic Workflows/services/n8n-ops/deploy.sh` (redeploy)
**Estimated effort:** 30 min (if cron self-healed) to 2-3 h (if deep debug needed).

---

### 3. #n8n-ops Slack polish + data viz
**Goal:** Turn `#n8n-ops` from a noisy alert firehose into a useful operational view. Today it gets raw text alerts every 10 min from `/loop-alerts` plus the weekly digest plus the freshness alarms. Multiple parallel improvements ranged from "rich Block Kit cards" to "daily summary with embedded charts".

**Why now:** as more workflows attach to initiatives (Sessions 1+2), the alert volume scales. Without polish, signal gets lost in noise. Doing this AFTER Session 2 means the daily summary has reliable Hub-tied data to reference.

**Scope (ordered by impact; ship 1+2+3 as must, 4+5 as stretch):**

1. **Block Kit reformat for all 3 alert types** (loop / stuck / freshness): rich card with workflow name + owner + dept + recent error sample + link to Hub initiative (when linked) + link to n8n cloud workflow + link to BQ executions. New shared `Agentic Workflows/services/n8n-ops/src/services/slack.ts` builder.
2. **Initiative cross-link**: when an alert fires for a workflow in `initiative_workflow_links`, the Block Kit card includes the initiative title + dept + a link back to the Hub detail view. Workflow attribution becomes visible in the alert thread.
3. **Action buttons**: "Mute for 1h", "Acknowledge", "Open in Hub" (deep-links). Mute/Ack write to a new `n8n_ops.slack_actions` BQ table that loop-alerts honors before posting.
4. **Daily 09:00 IL summary** (stretch): runs alongside the existing weekly digest. Top 5 failing workflows last 24h + 3 healthy comeback stories + overall execution volume trend. Includes a small PNG sparkline rendered via quickchart.io or similar.
5. **Failed-deploy notifications** (stretch): chat-ui's `n8n-deploy` API route posts to `#n8n-ops` on failure with the user, dept, error, and last 200 chars of stack trace.

**Prereqs:** Session 2 done so the "tied to initiative" context is reliable. Session 1's `initiative_id` cross-link in chat-ui makes deep-linking from Slack to the Hub useful.

**Success criteria:**
- All 3 existing alert types render as Block Kit cards (no more raw text)
- At least 1 alert fires during the session and is visually verified in `#n8n-ops`
- Mute/Ack buttons work — clicking "Mute for 1h" suppresses the next 6 alert cycles for that workflow_id
- Daily summary scheduler created (if scope 4 ships) and fires once during the session as a smoke-test
- README updated documenting the new alert format + action buttons

**Files likely touched:**
- `Agentic Workflows/services/n8n-ops/src/services/slack.ts` (NEW — Block Kit builder + action handler)
- `Agentic Workflows/services/n8n-ops/src/routes/loop-alerts.ts` (use new builder)
- `Agentic Workflows/services/n8n-ops/src/routes/weekly-digest.ts` (use new builder)
- `Agentic Workflows/services/n8n-ops/src/routes/slack-actions.ts` (NEW — handles button callbacks)
- `Agentic Workflows/workflows/n8n_kpi_freshness_alarm/main.py` (new builder for freshness)
- New BQ table `n8n_ops.slack_actions` + scheduled query
- New route: `daily-summary` + new Cloud Scheduler (if scope 4 ships)
- `Agentic Workflows/services/n8n-ops/README.md`

**Estimated effort:** 4-6 hours for scopes 1-3. Scope 4 adds ~3 hours. Scope 5 adds ~1 hour.

---

### 4. Loop-alerts heuristic tune — `error_rate >50% over rolling 1h` dimension
**Goal:** Add a 3rd alert dimension to `n8n-ops/src/routes/loop-alerts.ts` that catches bursty short-runs which the current rules miss. Would have paged on Kurt's Apr 29 outage (3,024 errors / 100% failure on a sub-workflow that never tripped the existing >60 fires/10-min or >30-min duration rules).
**Prereqs:** Session 3 done so the new rule's alert renders in the polished Block Kit format.
**Success criteria:**
- New BQ-backed rule fires when `error_rate ≥0.5 over rolling 60-min window` AND `total_runs ≥10` (avoid noise on low-volume workflows)
- Dedup against existing `alert_state` so the same workflow doesn't page hourly while still broken
- Slack alert references the dashboard URL for the workflow + last 3 sample errors
- Backtest against the Apr 29 Get Account Calls timeline confirms it would have fired between 09:00-10:00 UTC that morning
- New rule documented in `Agentic Workflows/services/n8n-ops/README.md`
**Files likely touched:**
- `Agentic Workflows/services/n8n-ops/src/routes/loop-alerts.ts` (new rule branch)
- `Agentic Workflows/services/n8n-ops/src/services/bigquery.ts` (new helper `getRecentErrorRate(windowMins, minRuns)`)
**Estimated effort:** 2-3 hours.

---

### 5. CloudFront DNS unblock follow-through
**Goal:** Once IT flips the `thehub.gue5ty.com` CNAME (filed in Session 2), verify end-to-end signin works against the custom domain (not just the Cloud Run URL workaround), update the demo bundle to remove the workaround note.
**Prereqs:** IT ticket from Session 2 actioned. **Externally gated** — promote to HEAD only when IT confirms.
**Success criteria:**
- `dig thehub.gue5ty.com` returns Google IPs (216.239.x.x), not CloudFront (18.67.x.x)
- Fresh OAuth round-trip from `https://thehub.gue5ty.com/` lands on the Hub (not a CloudFront 403)
- `hub-ui-demo/UX-FINDINGS.md` P0 entry updated to "RESOLVED"
- Slack share to the Guesty user cohort: "thehub.gue5ty.com is back"
**Files likely touched:** docs only.
**Estimated effort:** 30 min once unblocked.

---

### 6. Track 2 — default-on quality guardrails (chat-ui, deferred from Apr 17)
**Goal:** Make new workflows generated by chat-ui ship with error handling + execution-save flags + audit-log step by default — the user shouldn't have to ask. Reduces the "broken silently" failure mode that Sessions 1-4 spent monitoring around.
**Prereqs:** Sessions 1-3 closed. **Full regression cycle required** — this changes the default workflow shape, so every existing test case in `tools/test_cases.yaml` becomes a regression risk.
**Success criteria:** new `<quality_defaults>` block in `system-prompt.ts`; new skill `n8n-skills/skills/error-handling-logging/SKILL.md`; 3 new audit checks in `tools/audit_workflow.py` (#12 missing_error_handling, #13 missing_audit_log, #14 missing_execution_save); optional `auditLogDestination` per dept; full regression run passes with no degradation.
**Files likely touched:** `chat-ui/src/lib/system-prompt.ts`, `chat-ui/src/lib/departments.ts`, `tools/audit_workflow.py`, `tools/test_cases.yaml`, new `n8n-skills/skills/error-handling-logging/SKILL.md`.
**Estimated effort:** 4-6 hours code + 2-4 hours regression debug. Plan as a half-day.

---

### 7. Review 51 harvested candidates from Apr 15 + promote to test_cases.yaml
**Goal:** Drain the queue of candidates harvested from real user conversations on Apr 15 — audit each, promote high-confidence ones to the regression suite. Closes the loop on the feedback-loop cycle.
**Prereqs:** Track 2 (Session 6) shipped — otherwise we'd be promoting tests against the old default workflow shape and have to re-run everything.
**Success criteria:** all 51 candidates triaged (kept / dropped / merged); CX coverage from 2 → 8+ in suite (out of 19 candidates); Finance from 1 → 3+ (out of 4); regression still passes; `feedback-loop/STATE.md` updated.
**Files likely touched:** `feedback-loop/candidates/`, `tools/test_cases.yaml`, `feedback-loop/STATE.md`.
**Estimated effort:** 2-3 hours.

---

### 8. v0.26 onboarding Slack to the 22-user cohort
**Goal:** Send the long-drafted Slack message to the 22 active chat-ui users introducing v0.26 features (thinking-indicator UX, 3 new departments, `/analytics` All Workflows tab) **and** the new Hub × n8n-builder integration from Session 1.
**Prereqs:** Session 1 shipped (so the integration is real and demo-able).
**Success criteria:** single Slack message in the appropriate channel(s); message includes what's new + Hub URL + ask for feedback; reply or thank-react from at least 5 users within 48h.
**Files likely touched:** none (Slack-only).
**Estimated effort:** 30 min draft + send.

---

### 9. Jira integration MVP — read-only ticket display on Hub initiatives

**Goal:** Surface Jira ticket context inside the Hub. Each initiative gets an optional `jira_ticket_id` (e.g. `CXAU-1`); the IdeaDetailModal renders a card with summary, status, assignee, priority, and a link out. Read-only, single-ticket, server-side proxied.

**Prereqs:**
- Personal API token created at https://id.atlassian.com/manage-profile/security/api-tokens (alvaro has admin on `guesty.atlassian.net`).
- Token stored as Supabase Edge Function secret `JIRA_API_TOKEN` + `JIRA_EMAIL` via `supabase secrets set` (NEVER committed, NEVER in chat-ui env — Hub-side only). After deploy, the in-conversation token gets rotated; only the Supabase secret persists.

**Architectural decisions (locked-in defaults; revisit if user wants different):**
- **Read-only MVP.** No status sync back to Jira. Cuts conflict-resolution work.
- **Single ticket per initiative.** `strategic_ideas.jira_ticket_id text` (additive nullable column). Multi-link can come later via `initiative_jira_links` table mirroring `initiative_workflow_links` if anyone asks.
- **Server-side proxy.** New Supabase Edge Function `jira-issue-fetch` that takes `?key=CXAU-1`, calls `GET /rest/api/3/issue/{key}` with HTTP Basic auth (`JIRA_EMAIL:JIRA_API_TOKEN`), strips to a thin DTO (summary, status name, assignee displayName + avatar, priority name, issuetype, url, updated). Returns 404 cleanly if ticket missing.
- **Caching.** 5-minute server-side cache via Supabase Edge Function memory (cheap; the hot path is "user opens IdeaDetailModal repeatedly within a session"). No DB-backed cache for MVP.
- **Auth model.** All Hub users read on alvaro's behalf. Acceptable for read-only display; logged in Jira's audit as alvaro. Per-user OAuth (3LO) is a follow-up if needed.

**Step-by-step:**

**Step 0 (15 min): Pre-flight**
- Verify token works: `curl -u "alvaro.cuba@guesty.com:$JIRA_API_TOKEN" https://guesty.atlassian.net/rest/api/3/myself | jq .accountId`.
- Set Supabase secrets: `supabase secrets set JIRA_API_TOKEN=… JIRA_EMAIL=alvaro.cuba@guesty.com --project-ref ilhlkseqwparwdwhzcek`.
- Rotate the token in this transcript (delete + create fresh) — the working secret lives only in Supabase.

**Step 1 (30 min): Migration**
- `migrations/add_jira_ticket_id.sql` — `ALTER TABLE public.strategic_ideas ADD COLUMN jira_ticket_id text;` with a CHECK on a sane regex (`^[A-Z][A-Z0-9_]+-\d+$` or NULL). Index optional (probably skip — initiative reads are by `id`, not by ticket key).
- Apply via `supabase db query --linked --file migrations/add_jira_ticket_id.sql`.

**Step 2 (1-1.5 h): Edge Function `jira-issue-fetch`**
- `supabase/functions/jira-issue-fetch/index.ts` — accepts `GET ?key=<KEY>`, rejects bad keys (regex), calls Jira REST v3, normalises to thin DTO, in-memory 5-min cache keyed by ticket key, CORS open (anon JWT verified by Supabase as usual — no shared-secret needed since the Hub frontend is the only caller and it's authenticated).
- Smoke: 3 curl tests — valid key (200), invalid format (400), non-existent key (404).
- Defense: log + reject if Jira returns 401 (token rotated/expired); the Edge Function should serve a 502 with a clear message so the Hub UI can render "Jira auth failed — check token".

**Step 3 (1-1.5 h): Hub UI**
- `services/jira.ts` (NEW) — typed wrapper: `getJiraIssue(key): Promise<JiraIssue | null>`.
- `components/JiraTicketCard.tsx` (NEW) — card rendering summary + status pill + assignee avatar + priority + link out. Loading skeleton + error state ("Couldn't load — open in Jira ↗"). Lazy: only fetches when the card is in viewport.
- `IdeaDetailModal.tsx` — render `<JiraTicketCard ticketKey={idea.jira_ticket_id} />` next to (or above) `<WorkflowHealthCard />`. Don't mount if `jira_ticket_id` is null.
- `AddStrategicIdeaModal.tsx` — add a `Jira ticket` text field next to `data_sources`; placeholder `e.g. CXAU-1`; validate format on blur; save to `strategic_ideas.jira_ticket_id`.

**Step 4 (30 min): Auto-link via planning_mode (stretch)**
- Add `jira_ticket_id` to chat-ui v0.31's planning whitelist + Edge Function `n8n-conversation-callback`. Now the planning AI can extract a ticket key from user input ("the issue is tracked in CXAU-247") and surface it in the apply-suggestions pill.

**Step 5 (15 min): Smoke**
- Open an initiative → no Jira card.
- Edit it → set `jira_ticket_id = CXAU-1` → save.
- Re-open → Jira card renders with summary, status, assignee, priority.
- Set to invalid key → save blocked at validation.
- Set to non-existent key → card shows "Couldn't load" graceful state.

**Files likely touched:**
- Hub repo: `migrations/add_jira_ticket_id.sql` (NEW), `supabase/functions/jira-issue-fetch/index.ts` (NEW), `services/jira.ts` (NEW), `components/JiraTicketCard.tsx` (NEW), `IdeaDetailModal.tsx`, `AddStrategicIdeaModal.tsx`, `types.ts`.
- chat-ui (Step 4 only): `src/lib/system-prompt.ts` planning_mode rule, `src/app/api/chat/route.ts` `extractAndValidatePlanningFields`.

**Estimated effort:** 3-4 h for read-only MVP (Steps 0-3 + 5). Step 4 adds 30-45 min.

**Risks:**
- Token leaks. Already happened once in this transcript — the queued action is rotation. After rotation, the secret lives only in Supabase Edge Function env.
- Jira rate-limits. The 5-min cache + lazy mount keep us well under any sane limit, but worth a quick check on the per-user-token quota.
- Audit-log noise. All Hub reads attribute to alvaro in Jira's audit. If anyone notices, we'd graduate to per-user OAuth.

**Open questions to confirm before starting:**
1. Single ticket per initiative or multi-link? (Default: single — simpler, ships faster.)
2. Show Jira card for everyone or gate by department? (Default: everyone — read-only, no harm.)
3. Want the Step 4 stretch (planning-mode auto-extract) or push to a separate session?

---

## Session Log

| # | Session | Date | Outcome |
|---|---------|------|---------|
| 6 | Jira integration — read-only ticket display on Hub initiatives | 2026-05-08 | Hub PR #43 merged (`9a44ebed`) → Cloud Build `02eb4cd6` SUCCESS → revision `ai-innovation-hub-00098-xdx` LIVE. chat-ui v0.32 deployed (`n8n-chat-ui-00044-ncm`, commit `9ce5a5a`). Hub Supabase migration `add_jira_links.sql` applied (new `initiative_jira_links` table mirroring workflow links — RLS + partial-unique on `is_primary` + 5-step demote-then-promote write order). Edge Function `jira-issue-fetch` deployed with JWT verify ON (browser-callable; explicitly NOT `--no-verify-jwt`). Edge Function `n8n-conversation-callback` redeployed with `arrayPatternSpec` for `jira_ticket_ids`. JiraTicketCard rendered into IdeaDetailModal; JiraTicketPicker tag-input wired into AddStrategicIdeaModal Links & Notes; apply-suggestions merges keys into `jiraLinks` state with `role='related'`, never overwriting. chat-ui's `extractAndValidatePlanningFields` learned `arrayPatternField` validator. Live e2e on `thehub.gue5ty.com` confirmed (CXAU-247 fetched real summary through full chain). Effort came in ~5h vs 6.5–8h estimate — mirroring the existing workflow links pattern was cheap. New memory `project_jira_integration.md` documents schema + Edge Function URL + Atlassian-404-on-bad-creds quirk + JWT-verify-default lock-in. |
| TtP | "Take to Production" automation (manager's request, originally bundled with Session 6) | 2026-05-06 → 2026-05-07 | Shipped end-to-end except Cloud Run / Cloud Build deploys. **Live infra:** Hub Supabase migration `add_production_workflow_url.sql` applied; Edge Function `n8n-promote-callback` deployed (with `--no-verify-jwt` and trimmed to live-DB columns: `status`, `go_live_status`, `go_live_requested_at`, `go_live_feedback`, `production_workflow_url` — schema dump's `go_live_approved_at/by`, `go_live_rejection_count`, `live_app_url` are NOT on the live DB); `n8n-builder-callback` redeployed with shared `_shared/resolve-user-id.ts` helper. **chat-ui code uncommitted/undeployed:** `serviceKey` discriminator on every credential, `n8nProductionProjectId` field populated CS=`HSINMLm9Tt4FHjL3` / CX=`W62G9hxuK9c7cKwo` / Payments=`eieaMOSUdvEI07s3`, IS prod left commented out (candidate `UCEMQoFhrGZ3FChz`); `activateWorkflow` + `hasWebhookTrigger` + `getWorkflowJson` helpers; `/api/promote` orchestration endpoint with audit hard-gate, webhook-aware activation default, transactional ordering, 207-on-partial-failure, Hub callback retry; `<promote_to_production>` system-prompt rule extended with `<promote_context>` detection + mode-boundary refusal + webhook prompt + serviceKey-based cred matching + 3 confirm-phrase variants; `get_workflow_for_promotion` AI tool; ChatWindow auto-fires first checklist turn in promote mode; `PromoteButton` component (POSTs `/api/promote`, handles 200/207/4xx). **Hub code uncommitted/undeployed:** `TakeToProductionButton.tsx` with multi-workflow chooser + multi-primary fail-visible state, wired into `IdeaDetailModal.tsx` admin row gated on Project_Testing + go_live_status≠pending + dept in `DEPT_HAS_PROD = {cs, cx, payments}`; `buildPromoteModeUrl` + `PromoteContext` type in `services/n8nBuilderUrl.ts`. **Verification:** activate endpoint shape verified (`POST /workflows/:id/activate` works on Guesty cloud, PATCH fallback dead code), Edge Function smoke-tested with auth/CORS, end-to-end simulation against PROJ-153 (Payments) succeeded — synthetic `workflow_promoted` callback wrote `status='Project Live'`, `go_live_status='approved'`, `production_workflow_url` set; parent INIT-232 status synced to `Done`. PROJ-153 then RESET to `Project Testing` for manager smoke. Linked workflow swapped from V1.7 to V2.5 (`h5rTXqjIcjx9vaKz`) per user request. **Memory:** corrected `MEMORY.md` Finance prod ID (was bogus — equal to CX sandbox); added Payments prod project; added Jira credentials reference. **Open follow-ups:** commit + deploy chat-ui + Hub for the manager-runnable demo; v0.31 of chat-ui = first version with promote endpoint + serviceKey + Payments prod project. |
| 5 | Direction-3 ship + scope-confinement source field | 2026-05-05 | chat-ui v0.30 deployed (`n8n-chat-ui-00037-6nj`, commit `b2bfd1c`); Hub PR #21 merged (`686943c8`) → Hub `ai-innovation-hub-00079-9z9` LIVE with `<EmbeddedChatPanel>` drawer + Plan/Generate buttons rewired. Hub Supabase migration `add_conversation_source.sql` applied LIVE — `source` enum column + CHECK constraint. Both Edge Functions (`n8n-conversation-callback`, `n8n-builder-callback`) redeployed with source defense + planning whitelist parity (13 keys). Planning postMessage path bypasses 30s visibilitychange poll for sub-second auto-pop UX (poll retained as safety net). Bonus: `deploy-cloudrun.sh` flipped `--no-allow-unauthenticated` → `--allow-unauthenticated` (commit `bd13fc6`) so future deploys preserve Session 3's `allUsers run.invoker` binding. Verified A-D via Playwright on prod. Auth-token postMessage flow deferred to follow-up (Hub Supabase JWT ≠ Google ID token with chat-ui audience; cookie path covers most users). Jira integration queued at #9 with locked-in decisions (multi-link table + show-everyone + bundle planning auto-extract). |
| 4 | Direction-3 protocol design + embedded chat panel MVP | 2026-05-05 | Hub PRs #18 + #19 self-merged + Cloud Build approved → Hub revision `ai-innovation-hub-00078-5cz` LIVE (Direction-2 buttons + ROI baseline fields verified via Playwright on `Add Roadmap Initiative` modal). chat-ui side: `docs/direction-3-design.md` written (origin allowlist + 4 event flows + hybrid auth + UI shape decision); `<rule name="planning_mode">` expanded 6 → 13 keys with enum validation (`title`, `description`, `data_sources`, `department`, `level_of_improvement`, `impact_category`, `effort` added; existing 6 retained); `?embed=true` mode wired end-to-end via `src/middleware.ts` (sets `x-embed:1`) + `chat/layout.tsx` (suppresses chrome) + `AuthGate.tsx` (hybrid: cookie-first, postMessage `auth_required`/`auth_token` fallback with 5s timeout); SSE `extracted_fields` event in `/api/chat` → ChatWindow relays via `extracted_fields_updated` postMessage; DeployButton emits `workflow_deployed` postMessage in embed mode; `src/lib/embed.ts` centralises `emitToParent`/origin allowlist via `NEXT_PUBLIC_HUB_PARENT_ORIGIN` env. Local test harness `chat-ui/test-harness/embed-host.html` runs on port 3010 (cross-origin to chat-ui dev port 3002). Playwright-verified: embed mode hides chrome ✓, non-embed regression intact ✓, `auth_required` fires with origin `http://localhost:3002` ✓, 5s timeout renders "Open in new tab" fallback ✓. Bug fixed mid-session: AuthGate effect cleanup race killed timer when status transitioned inside the effect — refactored to self-clean. **chat-ui v0.30 UNCOMMITTED + UNDEPLOYED** — Session 5 must run regression + deploy. User flagged scope-confinement concern (standalone vs Hub-tied conversations) → answered current `initiativeId`-presence gate is sufficient but recommended explicit `source` field as belt-and-suspenders + audit trail. Queued for Session 5. |
| 3 | IAP → OAuth migration on chat-ui (Direction-3 prereq) | 2026-05-04 | chat-ui v0.29 shipped (rev `n8n-chat-ui-00036-8xh`). IAP DISABLED. App-level Google OAuth via Google Identity Services (GIS) + ID token verification (`google-auth-library`) + httpOnly cookie (SameSite=None for future iframe). Server: `getUserFromRequest` resolves user from cookie → Bearer → IAP-header fallback (kept dormant) → MOCK. Frontend `<AuthGate>` handles unauthenticated state. New routes: `/api/auth/{me,exchange,logout}`. New OAuth Web client created via Console (gcloud-created IAP-flavored client was Console-locked; gotcha captured in `feedback_iap_to_oauth_gotchas.md`). Phased rollout: Phase A code with dual-auth + IAP still on (rev 00035), Phase B env swap to Console client (rev 00036), Phase C `--no-iap` + `allUsers run.invoker`. Browser smoke verified e2e. Direction-3 (embedded chat panel) is now technically unblocked. |
| 2 | Hub × n8n-builder Direction-2 ship + Session 2 backlog | 2026-05-04 | chat-ui v0.27 (rev `n8n-chat-ui-00033-jcn`) — Direction-2 prefill flow (pill, dept lock, conversation-callback first-turn fire, builder-callback on deploy). chat-ui v0.28 (rev `n8n-chat-ui-00034-wjp`) — planning-mode JSON auto-extract with whitelist + bounds + AbortSignal.timeout(5000). Hub: PR #18 (Direction-2: Plan/Generate-with-AI buttons + AISessionsCard + 3 ROI fields) + PR #19 stacked (ROIBusinessImpactCard + apply-AI-suggestions UI with 30s visibilitychange debounce + never-overwrite semantics) opened against `kurtpabilona-code/AI-Innovation-Hub-Vertex` — both awaiting Kurt's review. Supabase: `add_extracted_fields.sql` migration applied LIVE; `n8n-conversation-callback` Edge Function v2 redeployed with defense-in-depth re-validation; smoke-tested 4 cases (401, 200, 400 bounds violation, unknown-key dropped). Sync-hub fix DIAGNOSED (workflow `MJhuTMoNzvfC3V3G` archived) — promoted to queue item #2. |
| O-1 | Hub × n8n-builder integration foundation (Direction 2) | 2026-05-04 | Schema migration `add_initiative_planning_and_roi.sql` applied LIVE to project ilhlkseqwparwdwhzcek (5 ROI columns on strategic_ideas, NEW table initiative_chat_conversations, NEW provenance column initiative_workflow_links.created_via). 2 Edge Functions deployed (`n8n-conversation-callback`, `n8n-builder-callback`) with `--no-verify-jwt`; smoke-tested green. Hub services + components written (n8nBuilderUrl, initiativeChatConversations, GenerateWorkflowButton, AISessionsCard) + edits to IdeaDetailModal, AddStrategicIdeaModal, services/api.ts, types.ts, vite-env.d.ts, cloudbuild.yaml, Dockerfile. chat-ui plumbing: types.ts +InitiativePrefill, ChatWindow.tsx prefill decode + pill, firestore.ts createConversation +initiativeId, api/chat builds `<initiative_context>` + fires conversation-callback, system-prompt.ts sticky_notes + planning_mode rules, api/deploy fires builder-callback, env wiring. TS check zero-errors on both repos. IT ticket draft for IAP→OAuth at `it-ticket-iap-to-oauth.md`. **Code uncommitted in both repos; deploy is Session 2 Step 0.** Architectural pivot: dropped 2 Edge Functions for AI brief generation — chat-ui's first reply does it natively via Vertex Sonnet, no new Anthropic key needed. |
| EOSR | End-of-session ritual + sync-hub partial-coverage finding | 2026-05-04 | Updated next-session.md + STATUS.md + memory + saved feedback memory `feedback_playwright_walkthrough_finds_real_bugs.md`. Probed live infra: Hub `00075-zjn`, n8n-ops `00004-ff4`, chat-ui `00032-9xf`, all 5 schedulers ENABLED. Discovered `/sync-hub` 06:15 UTC cron synced 1 of 3 linked workflows (PMM HubSpot only) — promoted as Session 2 goal. Created session-queue.md following workspace template. Re-prioritized queue per user direction: Hub × n8n-builder integration as new HEAD, #n8n-ops Slack polish queued at #3. |
| Hub-UX | Hub UI walkthrough + click-test + 2 prod bug fixes | 2026-05-03 → 2026-05-04 | Playwright walkthrough caught two production bugs: (1) `VITE_N8N_OPS_URL` not in Cloud Build pipeline → fixed in PR #16; (2) `replaceLinksForInitiative` 409 on primary-flip → fixed in PR #17 with 5-step write order. Hub deployed `00073-cr9` → `00074-j9g` → `00075-zjn`. P2 polish (synced-ago cue, picker error block, lang=en-US threshold) bundled in #17. Verified end-to-end: picker autocomplete (868 workflows), chip add/remove/role/star-flip-primary, save persistence, multi-chip Health card with R/Y/G + Sparkline, admin bulk-confirm. Demo bundle at `hub-ui-demo/` (21 screenshots + 3-4 min storyboard + Slack draft + UX findings). |
| Hub-Ship | Hub UI feature work — picker, health card, admin backfill | 2026-05-03 | PRs #13 (picker), #14 (Workflow Health card), #15 (admin /n8n-link-suggestions) merged + deployed. Stack-merge gotcha: `--delete-branch` on intermediate PRs auto-closes stacked dependents → recovered by recreating base ref + reopening + retargeting. PR #12 schema (already applied to live Supabase Apr 29) merged for version control. |
| n8n-Ops | n8n-ops Cloud Run service + freshness alarm + chat-ui v0.26 | 2026-04-29 | Pivoted Meir's blocked n8n_kpi_* workflows to Cloud Run (`n8n-ops` service, 6 endpoints, 4 schedulers). 7K rows backfilled. Hub schema migration applied via Supabase Management API. chat-ui v0.26 deployed (`n8n-chat-ui-00032-9xf`): workflow naming `Name – @handle`, sticky-note rule, sandbox→prod 7-step checklist, credential naming guidance, audit checks #15-18, `/analytics` All Workflows tab. Freshness-alarm Cloud Function deployed (`n8n-kpi-freshness-alarm-00001-xoj`). Surfaced finding: Kurt's Get Account Calls 100% errors on Apr 29 (3,024 runs) vs 55.8% success on Apr 28. |
| Session-M | 3 new departments (Product/People/IS) + thinking-indicator UX | 2026-04-17 | Deployed `n8n-chat-ui-00031-9kk`. People dept has explicit `<pii_rule priority="high">`. Information Systems is first Code-nodes-allowed dept. |

(For sessions before Apr 17, see git log of `feedback-loop/STATE.md` and the memory file `Where We Left Off` log.)
