# Decision Log — n8n Workflow Builder

System / config / architectural decisions worth remembering. New entries on top.

---

## 2026-05-14 — Baseline-metric form-input strip shipped (both repos + Edge Function)

Cleanup landed for the deprecated `current_process_minutes_per_run / _runs_per_month / _people_count` triplet — surplus surface area after the v3 dept-centric rollup ship made these fields no longer drive any downstream metric.

**chat-ui side** — commit `adc7b18` on PR #2:
- `chat-ui/src/app/api/chat/route.ts` — `numberField()` helper + 3 whitelist registrations dropped; system prompt narrative trimmed.
- `chat-ui/src/lib/system-prompt.ts` — JSON-shape example + numeric-bounds rule dropped.
- `chat-ui/src/lib/hub-callback.ts` — 3 fields off `InitiativeUpsertFields` interface.
- `chat-ui/src/components/MessageBubble.tsx` — 3 fields off the planning-block hide whitelist.
- `tsc` clean.

**Hub side** — [PR #51](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/pull/51) on `kurtpabilona-code/AI-Innovation-Hub-Vertex`, branch `feat/strip-baseline-metrics-form-inputs`, commit `4f4da47`:
- `components/AddStrategicIdeaModal.tsx` — strip across 6 reference sites: 3 useState hooks, editIdea-load setters, apply-AI-suggestions handlers, save-payload entries (×2: upsert + autosave), useCallback deps, resetForm setters, JSX "Baseline Metrics" section (3 number inputs).
- `components/ROIBusinessImpactCard.tsx` — no-baseline branch copy updated. Previously: "No ROI baseline set… Set ROI baseline →" (button called `onEdit` which now leads to a form without those inputs). Now: prose pointing users to the Business AI KPIs page.
- `supabase/functions/n8n-conversation-callback/index.ts` — `numberSpec` map emptied. Unknown keys hit the existing "drop silently" else branch — provably correct fall-through, no 400.
- `tsc` clean. DB schema + `types.ts` + `services/api.ts` passthroughs preserved (existing initiatives with values still render the full ROI breakdown unchanged in `ROIBusinessImpactCard`).

**Edge Function deployed**: `supabase functions deploy n8n-conversation-callback --project-ref ilhlkseqwparwdwhzcek --no-verify-jwt` ran clean; version bumped 9 → 10 (verified via `supabase functions list`). Deployed from the feature branch's local copy ahead of merge — forward-compatible since chat-ui has already stopped sending those fields.

**Smoke test deferred**: a runtime smoke against the new Edge Function (POST with a deprecated key, confirm 200 + key dropped silently from `extracted_fields`) was blocked mid-script when the gcloud user token expired. Code path is provably correct (`numberSpec` empty → `else if (k in numberSpec)` false → falls through to `// else: unknown key, drop silently`) but a confirming smoke would be cheap once gcloud is re-auth'd. Not blocking — the deploy itself succeeded and is live.

**What's pending on Kurt's side**: review + merge PR #51. The Cloud Build path auto-deploys the React app on merge; the Edge Function is already live.

---

## 2026-05-13 — Time Saved KPI v3 SHIPPED to production

End-to-end execution of the v3 plan completed today. Live outcome:

| Period | v1 (manual baseline) | v2 (fallback-only) | **v3 (dept-centric + heuristic)** |
|---|---:|---:|---:|
| April 2026 (full) | 37.0 h | 25.0 h | **38.08 h** |
| May 2026 (1-13 partial) | 90.5 h | 25.0 h | **87.57 h** |

Whole-instance Insights sanity check: April 358 h, May (to date) 223 h. Marketing = 10.6% of April company-wide total — a sensible proportion.

### Deploy chain
- Cloud Run revisions: `n8n-ops-00006-87s` (initial v3 ship) → `n8n-ops-00007-tmm` (mode-null-tolerant rollup tweak after PUT-schema discovery).
- BQ migration v3 applied; `n8n_ops.workflows` SCD2 dim now carries `project_id`, `project_env`, `time_saved_mode`, `time_saved_per_execution_min` end to end.
- /ingest cron refreshes all five fields on each 15-min tick.

### Workflow population
- **111 workflows applied** the node-count heuristic via `tools/bulk-estimate-time-saved.ts --apply` (Marketing 19, IS 21, CX 33+18 sandbox, CS 8+2, OB 10, AI Team 12, Product 7, Payments 5, People 1).
- **24 workflows errored** (~18% of the 135 eligible):
  - Most: `HTTP 403 Forbidden` from `PUT /workflows/{id}` — n8n's per-workflow ACL blocks our API key for those specific workflows (cross-project share edge cases).
  - 2 × `HTTP 404 Not Found` — workflows present in LIST endpoint but missing from GET-by-id (deleted between fetch and write).
  - 1 × `HTTP 400 "There is a conflict with one of the webhooks"` — a workflow whose webhook URL collides with another; modifying the resource triggers n8n's webhook-uniqueness check.
- Net: 159 workflows in BQ dim now have `time_saved_per_execution_min > 0` (up from 46 pre-bulk).

### Surfaced schema limitation: n8n public API PUT
1. `PUT /api/v1/workflows/{id}` rejects unknown `settings` keys with `"settings must NOT have additional properties"`. The LIST endpoint returns extra keys (`binaryMode`, `availableInMCP`, `callerPolicy`) but PUT won't accept them. **Fix:** tools whitelist only the public-API-documented settings keys; n8n re-derives the rest server-side.
2. `PUT` also rejects `settings.timeSavedMode` (only `timeSavedPerExecution` is in the schema). **Fix:** `/kpi-rollup` semantic relaxed to treat `value > 0` as configured regardless of `mode` (numeric value IS fixed mode by definition). Workflows owned via API have `mode=null + value=N`; workflows owned via n8n UI have both. Both correctly count.

### Validated end-to-end on TrustPilot test write
- Pre-PUT: `settings={executionOrder, binaryMode, availableInMCP}`, no `timeSavedPerExecution`.
- Single PUT: only `timeSavedPerExecution=5` added to settings.
- Post-PUT: nodes hash unchanged, connections hash unchanged, name/active unchanged. Only settings differs (additive).
- SCD2 close-out worked correctly (3 generations of TrustPilot rows now in dim).

### Final outcome numbers
Marketing Time Saved KPI live in Hub:
- April 2026 = 38.08 h (21 of 184 in-scope workflows configured, 1 dynamic, 162 unset)
- May 2026 = 87.57 h (same scope distribution; partial month)
- Top April contributor: "Product Release - @aviv - PMM" (20.7 h, 31 executions, complex-pipeline 40-min tier)
- Top May contributor: "ORM - Reviews per source - @ron.madar.hallevi" (20.8 h, 50 executions)

### 24-error breakdown (investigated 2026-05-13)

| Cohort | Count | Root cause | Resolution path |
|---|---:|---|---|
| **IS production** project (`UCEMQoFhrGZ3FChz`) | 21 | API key has READ scope but not WRITE on this project. All 21 workflows on the project errored uniformly with `HTTP 403 Forbidden`. | Owner (Louie / IS team) must either (a) grant our n8n API key project-editor role, OR (b) set each value manually in n8n UI. |
| **Cura** (Product) project (`Wh25Z3w6AZxTFnWf`) | 2 | Same scope issue (HTTP 403). One workflow also carries an `editor` share row from the excluded Alvaro-personal project `4cZ5YxoOT53ysz3Y` — interesting metadata but doesn't unblock write. | Same — ask Cura team / IT for editor grant on the project. |
| **Upsell Detection 2.1** (CS, `lxx8tAERgQNsVz14`) | 1 | Self-conflicting webhook: workflow has TWO webhook nodes both with `path='upsell-approval'`. The workflow runs internally, but n8n's public PUT API re-validates webhook uniqueness and rejects the PUT with `400 "There is a conflict with one of the webhooks."` | Ronishif fixes one of the two webhook paths (or sets the value via n8n UI, which uses a different code path and accepts the existing state). |
| **2 × HTTP 404** (within the IS cohort above) | 2 (subset) | Workflow id present in LIST endpoint but not in GET-by-id — likely transient state or deleted between list and PUT. | Re-run on the next bulk pass; or skip silently. |

**Net impact on KPI numbers:**
- The 21 IS workflows would have contributed an estimated 21 × ~12 min/exec avg × actual executions per month. Without a real execution count handy for IS production, rough order of magnitude is **15-30 h/month**. Not catastrophic; an IS Time Saved KPI in Hub would see 0 until resolved.
- The 2 Cura workflows are tiny (3-4 nodes) and rarely run; contribution likely <2 h/month.
- The 1 Upsell Detection workflow is 142 nodes and probably high-firing — could be 10+ h/month for the CS KPI. Worth Ronishif resolving the dup webhook.

**Not fixable from our side via the public API surface today.** Documented for follow-up rather than ad-hoc unblocking.

### Open follow-ups (post-v3 ship)
- IS / Cura write-scope: needs a key with broader project access. Defer until there's an actual IS or Cura Time Saved KPI created in Hub.
- Ronishif: fix `Upsell Detection 2.1` dup webhook OR set value via UI — only matters once a CS Time Saved KPI lands in Hub.
- chat-ui whitelist cleanup: stop extracting `current_process_minutes_per_run` / `_runs_per_month` / `_people_count` from planning mode (harmless drift today; cleaner once Kurt removes the form inputs).
- `tools/bulk-estimate-time-saved.ts` eligibility check still uses `mode==='fixed'` — workflows we populated via API have `mode=null + value=N` so they show up as eligible on re-runs. Idempotent (no-op writes) but noisy in dry-run output. Minor follow-up.
- Kurt notification: DM drafted in `kurt.pabilona`'s Slack drafts (channel `D0A9V1YRRQT`), pending review-and-send by alvaro.

---

## 2026-05-13 — Time Saved KPI v3: department-centric rollup + bulk-populated workflow defaults

**Context:** Ron + Kurt clarified the scope: the Time Saved KPI infrastructure belongs to us for **every n8n workflow**, not just workflows linked to a Hub initiative. They expect us to *populate* the per-workflow time-saved values (initiative owners shouldn't have to ask their team members to fill in n8n settings). This is a structural change from v2 (initiative-centric, owner-populated) to v3 (department-centric, infrastructure-populated by default with owner override).

**Three coordinated decisions:**

### 1. Workflow → department mapping via n8n `shared[].projectId`

Every n8n workflow object carries a `shared` array; the row with `role='workflow:owner'` gives the owning project_id. n8n's `/projects` REST endpoint is forbidden by our API key, but the project_id is exposed on the workflow object — sufficient for our needs.

Audited every project_id on the live instance (962 workflows, 196 active). 81% map to project_ids already known from `chat-ui/src/lib/departments.ts`. The remaining 19% (11 unmapped projects) classified case-by-case from workflow content/naming:

| Project ID | Decision | Rationale |
|---|---|---|
| `9tf5HxwKd0IBw7iI` | AI Team / production | Innovation Hub workflows + Hub KPI feeds |
| `D0M1fZmWqfBypzkY` | AI Team / production | Cross-functional BQ/Slack agents (Revenue Mgmt, CS Data, BI Communication) |
| `vKmJqLvy5SioataV` | AI Team / production | Who Does What Agent PROD, Ask AI Team |
| `PHEMwd6NgE60OZFz` | AI Team / sandbox | Training labs, demos |
| `0E2LLwKSKdz9lMPl` | AI Team / sandbox | Building Blocks / templates |
| `pc0kDSf5Oxrrpn8i` | AI Team / sandbox | POCs (Mac Dylan + various) |
| `yU9THCCcFdPt341F` | Product / sandbox | Design ops, PD weekly sync |
| `82z4hqO9yMUv4klw` | Finance / sandbox | Dormant Netsuite catalog |
| `Wh25Z3w6AZxTFnWf` | Product / sandbox | Cura workflows (user-confirmed) |
| `4cZ5YxoOT53ysz3Y` | **EXCLUDE** | Alvaro personal experiments (DentalVoice, Canva MCP, Pre-QBR, Sync Supabase) |
| `6Kuh47QvSzvhlVnN` | **EXCLUDE** | Single inactive placeholder "Feb 4th V" |

Mapping table: `Agentic Workflows/services/n8n-ops/src/services/departments.ts`. **Net coverage after this decision: 100% of in-scope active workflows** (18 Alvaro personal + 1 placeholder explicitly excluded).

### 2. Heuristic-driven bulk-population of `timeSavedPerExecution`

Per Ron's direction "they don't want me to ask people to do it". We populate `settings.timeSavedPerExecution` on every active production workflow that doesn't already have a value, using a node-count tier heuristic (excluding sticky notes). Owners can override anytime; the heuristic is the *default*, not the authority.

| Nodes | minutes/exec | tier label |
|---:|---:|---|
| 1-2 | 5 | trivial-notify |
| 3-7 | 10 | moderate-pipe |
| 8-15 | 15 | multi-step |
| 16-30 | 25 | complex-pipeline |
| 31+ | 40 | large-pipeline |

**Rationale stored** in `src/services/time-saved-heuristic.ts` doc-block + replicated here for defence:
- Anchored to Ron's manual setting on "PFR LinkedIn Post" (5 min, ~27 nodes) — our `multi-step` and `complex-pipeline` tiers stay close.
- Upper anchor: "Slack Accountability & Update Bot" at 105 min — our `large-pipeline` (40) is conservative vs the largest manually-set values.
- Floor: 5 min even for trivial workflows — the human alternative is "check + decide + act", not zero.
- Median observed across the 41 already-configured workflows = 10 min; our tiers hug that centre.

**Live dry-run result (2026-05-13):** 136 workflows eligible for population (out of 196 active). Breakdown: CX 51, IS 21, Marketing 19, AI Team 12, CS 10, OB 10, Product 7, Payments 5, People 1.

Tool: `services/n8n-ops/tools/bulk-estimate-time-saved.ts` — dry-run by default, `--apply` to commit, `--dept <name>` to filter, `--csv-out <file>` to export the proposed CSV.

### 3. `/kpi-rollup` pivots from initiative-centric to department-centric

**Old (v2):** KPI total = walk `initiative_kpis` for the KPI → walk `initiative_workflow_links` for each initiative → sum.

**New (v3):** KPI total = look up `kpis.department` → resolve to project_ids via `departments.ts` → SUM(workflow_hours) across every workflow in those projects.

Initiative ↔ workflow links remain in the response as a `by_initiative` breakdown (info-only; useful for Kurt's future Hub UI), but they no longer gate the rollup total. Workflows in projects with `exclude:true` contribute 0; workflows in projects with no department mapping (currently zero such workflows after the audit) also contribute 0.

New response shape adds `by_env: { sandbox: N, production: M, mixed: K }` per KPI so analysis can drill in without poisoning.

### Schema delta (BQ)

`migration_v3_project_id.sql` (applied 2026-05-13) — additive nullable columns on `n8n_ops.workflows` dim:
- `project_id STRING` — from `shared[?role=owner].projectId`.
- `project_env STRING` — derived from `departments.ts` mapping (`sandbox` | `production` | `mixed`).

SCD2 close-out diff in `syncWorkflows()` extended to detect changes in either field (rare; happens on workflow project-transfer).

### Observable impact on the Marketing Time Saved KPI

| Period | v1 (Hub-side baseline) | v2 (initiative + workflow settings + fallback) | v3 (dept-centric + heuristic populate) |
|---|---:|---:|---:|
| April 2026 | 37.0 h | 25.0 h | TBD on first live rollup — likely much higher (Marketing scope expands from 7 initiative-linked workflows to all 22 active workflows in Marketing project) |
| May 2026 (so far) | 90.5 h | 25.0 h | TBD |

The v3 number reflects the actual time-saved scope (every active workflow saving time for Marketing), not just the workflows Ron manually linked. The 22-vs-7 expansion + the 136 heuristic-populated values combined should land in a defensible range — to be measured on first dry-run post-deploy.

### Outcome

Code complete + `tsc` clean on both `npm run build` and tools typecheck. Migration applied to prod BQ. **Pending:** single deploy (`./deploy.sh` from `Agentic Workflows/services/n8n-ops/`), then trigger `/ingest` once to populate the new BQ dim fields, then run `bulk-estimate-time-saved.ts --apply` to populate n8n workflow settings, then `/kpi-rollup` dry-run for April + May, then comms-before-push, then live re-push.

---

## 2026-05-13 — Three v2 enrichments after Ron shared n8n's Insights API docs

**Context:** Ron forwarded the n8n public API docs for `/insights/summary` and confirmed dynamic mode = "Time Saved nodes" placed inside the workflow (n8n computes server-side, path-dependent). Probed the API surface live to see what we should consume.

**Findings ruled in:**
- `/insights/summary` works end-to-end with URL-encoded `startDate`/`endDate` + optional `projectId`. April 2026 instance-wide = 20,609 min ≈ 343 h.
- Dynamic-mode workflows ARE captured by Insights server-side; n8n's REST API does NOT expose per-workflow Insights, so our rollup can't see them. Treating `mode=dynamic` as `workflow:dynamic_skipped` (contributes 0) is the right call until n8n adds per-workflow Insights.

**Findings ruled out:**
- `/insights/summary?workflowId=…` — not supported.
- `/insights/by-workflow`, `/insights/by-time` — 404 on this n8n version.
- `/executions/{id}` — no time-saved field on the execution object.
- `/projects` — 403 with our API key.

**Enrichments shipped (all additive, no rework of v2 core):**

1. **`/insights/summary` sanity-check** baked into `/kpi-rollup` response — new `instance_sanity_check` block with `time_saved_minutes` / `time_saved_hours` / `executions` / `failure_rate` for the same date window. Best-effort (logs + nulls on failure, never breaks the rollup). Helper added at `services/n8n.ts::getInsightsSummary()`.
2. **README clarification on `dynamic` mode** — explains Time Saved nodes vs fixed mode; recommends fixed-mode for KPI-fed workflows; points to the bulk helper for API-driven setting.
3. **Bulk-onboarding helper** at `services/n8n-ops/tools/set-time-saved.ts` — CSV-driven (`workflow_id,minutes`) `tsx` script that PUTs `settings.timeSavedMode='fixed' + timeSavedPerExecution=<n>` per row. Dry-run default; `--apply` to commit. Separate `tools/tsconfig.json` for IDE typing (not part of the deployed build).

**Outcome:** Code complete + `tsc` clean for both `npm run build` (main service) and `npx tsc -p tools/tsconfig.json` (helper). Same deploy ships v2 + these 3 enrichments together — no schema change.

---

## 2026-05-12 — Time Saved KPI v2: n8n-native settings as source of truth (replaces Hub initiative baseline fields)

**Context:** Ron + Kurt requested simpler initiative creation (remove `current_process_minutes_per_run` / `_runs_per_month` / `_people_count` from the StrategicIdea form) and a new source-of-truth: per-execution time-saved should be read from each n8n workflow's own settings. If absent, fall back to the initiative's `expected_impact` (the "Expected Output / Expected Impact" the user already types per (initiative, KPI) pair).

**Discovery:** n8n already has these fields natively. Every workflow's `settings` object can hold `timeSavedMode` (`fixed` | `dynamic`) and `timeSavedPerExecution` (number, in minutes). Owners populate them via the workflow Settings panel (gear icon → "Time saved per execution"). Surveyed all 957 workflows on `guesty.app.n8n.cloud`: 41 already have fixed values set (2, 5, 10, 15, 30, 105, 360 — sensible only as minutes), 92 have `fixed` mode with no value yet, 4 have `dynamic` mode, 820 have nothing set.

**Decision:** Refactor `/kpi-rollup` to read from n8n workflow settings instead of `strategic_ideas.current_process_minutes_per_run`. Per-workflow algorithm:
- `mode='fixed' AND value > 0` → `workflow_hours = success_runs × value / 60` (`source = 'workflow:fixed'`)
- `mode='dynamic'` → contribute 0 (`source = 'workflow:dynamic_skipped'` — dynamic semantics TBD)
- anything else → contribute 0 (`source = 'workflow:unset'`)

Per-initiative algorithm (audit finding A — refined from initial draft):
- If **any** linked workflow has a configured fixed value → `Σ workflow_hours` (`source = 'workflow_sum'`). A configured workflow with 0 executions reports honest 0 and suppresses the fallback.
- Else → fallback to `initiative_kpis.expected_impact` normalised to hours by `(impact_period, kpi.unit)` (`source = 'initiative:expected_impact_fallback'`).
- If fallback unusable (NULL expected_impact, non-monthly period, non-time-shaped unit) → contribute 0 (`source = 'initiative:no_data'`).

**Alternatives:**
- *Proportional fallback* (workflow-level expected_impact split) — more accurate when only some workflows are configured, but ambiguous (no per-workflow expected_impact field exists). All-or-nothing is the simplest reading of "if a workflow has it, use it; otherwise fall back to initiative." Re-litigate if Ron pushes back.
- *Custom tags / sticky notes / description parsing* — discarded the moment n8n's native fields were discovered. No conventions needed.
- *Live n8n API at rollup time* — discarded; we read from BQ workflows dim (refreshed every 15 min by `/ingest`). Acceptable staleness for a monthly cron; avoids 4 paginated API calls during the rollup.

**BQ schema:** additive nullable columns on `n8n_ops.workflows` dim — `time_saved_mode STRING`, `time_saved_per_execution_min NUMERIC`. Migration committed at `Agentic Workflows/workflows/n8n_kpi_ingestion/migration_v2_time_saved_settings.sql`. Applied to prod 2026-05-12 (963 rows in dim, all NULL until next `/ingest` after deploy). SCD2 close-out diff extended to detect changes in these two fields.

**Observable consequence (April + May re-push after deploy):**
- April: was `37.0 h` (v1 with hand-populated `current_process_minutes_per_run=15/30` on initiatives) → becomes `25.0 h` (PFR initiative falls back to expected_impact=20, ORM to 5; only PFR LinkedIn has a fixed value but 0 April runs).
- May (1-8 partial): was `90.5 h` → becomes `25.0 h` (same fallback path).
- Numbers will rise back as workflow owners populate `timeSavedPerExecution` in their workflow settings. Methodology change spelled out in the webhook payload's `notes` field on each push for full audit.

**Outcome:** Code complete + `tsc` clean. Deploy pending. After deploy + `/ingest` once, ~137 workflows will populate the new dim fields automatically. Re-push for April + May to overwrite the v1 values once Slack message has set expectations.

---

## 2026-05-08 — Time Saved KPI rollup colocates in `services/n8n-ops`, not `chat-ui`

**Context:** Phase 5 of the Hub roadmap ("n8n Time-Saved consumption with Alvaro") needed a new monthly cron pushing `total_time_saved_hours` per canonical KPI to the Hub's `kpi-webhook-ingest` Edge Function. The natural homes were chat-ui (already had BigQuery client) or the existing `n8n-ops` Cloud Run service.

**Alternatives:**
- **`chat-ui`** — already had `bigquery-analytics.ts` reading `n8n_ops.daily_workflow_stats`. Would need a new Supabase service-role secret + new scheduler + new Cloud Run cron concern grafted onto a user-facing app.
- **`n8n-ops`** — already had ALL of: BQ ADC (jobUser + dataViewer), Hub Supabase service-role key, Cloud Scheduler integration, Slack alerter for failures, OIDC auth. Adding `/kpi-rollup` was 1 route + 1 scheduler line.

**Decision:** Colocate in `n8n-ops`. Single deploy ships all four routes (`ingest`, `loop-alerts`, `sync-hub`, `kpi-rollup`). No new infra surface in `chat-ui`.

**Outcome:** Code complete, `tsc` clean. Pending deploy of n8n-ops v0.2.

---

## 2026-05-08 — `kpi_initiative_contributions` table doesn't exist; use `initiative_kpis`

**Context:** Hub Phase 2 spec named the new linking table `kpi_initiative_contributions`. My first implementation queried that table. It would have 404'd in production.

**Alternatives:** none (the spec name doesn't exist in live schema).

**Outcome:** Phase 2 migration (`migrations/phase2_canonical_kpis_part1_additive.sql`) actually extended the legacy `initiative_kpis` table with a nullable `kpi_id` FK column to `kpis(id)` instead of creating a new table. The contribution row IS the legacy row, repurposed. Caught only because the user pushed back asking me to verify against the live DB. Lesson logged: probe live PostgREST schema before writing queries against it (see Verification Queue).

---

## 2026-05-08 — `data_source_label` is informational; Secret Manager is the actual onboarding gate

**Context:** Initial pickup filter for `/kpi-rollup` (batch mode) was `data_source_label LIKE 'n8n%'`. Marketing's "Time Saved" KPI has `data_source_label = NULL`, so the filter would have skipped it. Hub admins don't reliably set this field.

**Alternatives:**
1. Force-set the label on every onboarded KPI (operational tax + fragility — admin can rename later).
2. Drop the label filter; gate purely on the per-KPI Secret Manager secret existing.

**Decision:** Option 2. Auto-pickup matches every active webhook KPI. The route then looks up `kpi-webhook-token-<kpi_id>` and skips the KPI silently if no secret. KPIs fed by non-n8n webhooks (Salesforce, scripts) won't have an n8n-ops-side secret so they pass through untouched. The secret-existence is the actual onboarding gate.

**Outcome:** README updated; auto-pickup is now self-onboarding via Secret Manager.

---

## 2026-05-08 — n8n-workflow-builder SA already has project-wide secretmanager.secretAccessor (no IT ticket)

**Context:** README onboarding step said "grant the SA access to each new token secret" with a `gcloud secrets add-iam-policy-binding` command. Running that as `alvaro.cuba@guesty.com` failed with 403 (`secretmanager.secrets.setIamPolicy` denied) — would have needed an IT ticket.

**Verification:** `gcloud projects get-iam-policy agentic-workflows-485210 --filter "bindings.members:serviceAccount:n8n-workflow-builder@..."` shows project-level `roles/secretmanager.secretAccessor` already granted (alongside `aiplatform.user`, `bigquery.dataViewer`, `bigquery.jobUser`, `datastore.user`).

**Outcome:** README onboarding step trimmed to just `gcloud secrets create kpi-webhook-token-<kpi_id> --data-file=-`. No per-secret IAM grant required. No IT ticket.

---

## 2026-05-08 — First-binding-wins for shared workflows in `/kpi-rollup`

**Context:** A single n8n workflow could in principle be linked to multiple initiatives (the `initiative_workflow_links` schema doesn't enforce uniqueness on `n8n_workflow_id`). Ambiguous which initiative gets credit for the hours saved.

**Alternatives:**
- Split execution-count attribution proportionally (overcomplicated).
- Sum into every linked initiative (double-counts the KPI total).
- First-binding-wins (deterministic, simple).

**Decision:** First-binding-wins. Workflow attribution iterated in initiative-binding order; once claimed by one initiative, skipped for others. Documented in route comment + README.

**Outcome:** Operational behaviour is "if your numbers look off, check whether a workflow is double-linked." Single-direction fixable by editing `initiative_workflow_links` rows.

---

## 2026-05-08 — Default `current_process_minutes_per_run = 30` when NULL on initiative

**Context:** The 2 initiatives linked to Marketing Time Saved both had `current_process_minutes_per_run = NULL` on `strategic_ideas`. Treating NULL as zero would have produced 0 hours regardless of execution volume.

**Decision:** Default 30 min/run when NULL, surfaced in the webhook payload's `notes` field for audit ("`N initiative(s) used default 30min/run`"). Initiative owners can override anytime by editing the StrategicIdea form.

**Outcome:** Honest measurements (with a documented assumption) instead of silent zeros. The notes string makes it visible in the Hub's Recent Activity log.

---

## 2026-05-08 — 24h cap on stuck-running alerts + per-workflow grouping

**Context:** `#n8n-ops` Slack channel was getting hourly "Stuck running workflow" alerts for the same 3 zombie executions (30156/30402/36783) on workflow `CkmAmA31lNYVprOE`, running >4000 min. Root cause: BQ executions table never gets terminal-status update for stuck rows that fall outside `listExecutionsSince`'s pagination window — the alerter refires every 60 min forever.

**Alternatives:**
- Just bump dedup window to 24h (still re-fires once a day).
- Drop stuck-running alert entirely (loses real value when an execution is actually stuck).
- Cap at 24h + add a sweeper that reconciles via per-execution API (real fix).

**Decision:** Both. (a) `loop-alerts.ts` SQL gets `started_at > NOW() - 24h` upper bound + `GROUP BY workflow_id` collapse so multi-execution stuck workflows emit one alert. (b) New `/sweep-zombies` route + 30-min Cloud Scheduler reconciles BQ rows stuck `running >6h` against `GET /api/v1/executions/{id}` directly (bypasses the pagination cutoff). 200+terminal → MERGE update; 404 → mark `abandoned`; still running → leave alone.

**Outcome:** Code complete + tested. One-time `bq UPDATE` already silenced today's 3 known zombies (Track B.2 of plan). Pending deploy.

---

## Verification Queue

Items below are decisions made but NOT yet verified end-to-end. Once verified, move to a dated entry above.

- [ ] **Deploy n8n-ops v0.3** — single `./deploy.sh` ships everything: Session 7 (`/kpi-rollup` route + `/sweep-zombies` route + 24h-cap loop-alerts), Session 8 v2 (n8n-native time-saved settings + Insights sanity-check), Session 8 v3 (department-centric rollup + workflow dim project_id/env). Expect 6 schedulers idempotently created/updated.
- [ ] **First `/ingest` post-deploy** populates the new BQ dim fields (`time_saved_mode`, `time_saved_per_execution_min`, `project_id`, `project_env`). Verify: `SELECT project_env, COUNT(*) FROM n8n_ops.workflows WHERE valid_to IS NULL GROUP BY 1` should show ~133 sandbox + ~76 production + N excluded.
- [ ] **Bulk-populate via `tools/bulk-estimate-time-saved.ts --apply`** — 136 workflows to receive heuristic values via PUT to n8n. Validate write scope of the API key first (dry-run already passed; live PUT may 401/403). If blocked, escalate for a key with write scope; if it works, archive the CSV output.
- [ ] **Re-`/ingest`** after the bulk-populate so the new `timeSavedPerExecution` values land in BQ workflows dim.
- [ ] **`/kpi-rollup` dry-run for April 2026** returns Marketing dept-centric total (22 active wf in Marketing project, varying tier values). Expected total in the 30-80 h range (vs v1's 37 h or v2's 25 h fallback).
- [ ] **Live re-push for April + May** AFTER Slack methodology message goes out. Overwrites prior values; explains the shift to dept-centric + heuristic-populated.
- [ ] **First scheduled `/kpi-rollup` fires June 1, 02:00 UTC** for May 2026.
- [ ] **`/sweep-zombies` first run** reconciles ≥0 zombies cleanly.
- [ ] **Slack message to workflow owners** — frame as "we set sensible defaults based on your workflow size; here's the table; you can override any time via Settings → Time saved per execution." Not asking them to set values; telling them we set values they can refine.
- [ ] **chat-ui follow-up** — stop auto-extracting `current_process_minutes_per_run` / `_runs_per_month` / `_people_count` in the planning whitelist (harmless drift, fix in a separate PR once Kurt removes the form inputs).
- [ ] **Investigate `timeSavedMode='dynamic'` semantics** — confirmed via Ron: it's driven by "Time Saved" nodes inside the workflow canvas; n8n computes server-side. Public REST API does not expose per-workflow dynamic values. Our rollup correctly treats dynamic as `workflow:dynamic_skipped`; n8n's `/insights/summary` (our sanity-check field) captures them globally.
- [ ] **Notify Kurt** that the v0.3 deploy is live so he can strip the 3 baseline inputs from the StrategicIdea form.

---

## Older entries

(Decision log started 2026-05-08; older decisions live in MEMORY.md until extracted.)
