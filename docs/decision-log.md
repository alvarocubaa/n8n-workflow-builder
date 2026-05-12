# Decision Log — n8n Workflow Builder

System / config / architectural decisions worth remembering. New entries on top.

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

- [ ] **Deploy n8n-ops v0.3** (supersedes the v0.2 entry below). Same `./deploy.sh` ships everything: v0.2 work (Time Saved KPI v1 + `/sweep-zombies` + 24h-cap alert fixes + sync-hub stub-row) AND v2 (n8n-native time-saved settings as source of truth). Expect 6 schedulers idempotently created/updated.
- [ ] **First `/ingest` post-deploy** populates the new BQ dim columns. Verify with `SELECT time_saved_mode, COUNT(*) FROM n8n_ops.workflows WHERE valid_to IS NULL GROUP BY 1` — expect ~133 rows with non-NULL values (fixed/dynamic mix).
- [ ] **Second `/ingest`** is idempotent — no further SCD2 close-outs from the new fields (audit finding H).
- [ ] **`/kpi-rollup` dry-run for April 2026** returns expected source breakdown: PFR LinkedIn `workflow:fixed`, other 6 workflows `workflow:unset`/`workflow:dynamic_skipped`, both initiatives `initiative:expected_impact_fallback`, total_hours = 25.0.
- [ ] **Live re-push for April + May** (only AFTER Slack methodology message has gone out). Overwrites prior values 37.0 → 25.0 and 90.5 → 25.0.
- [ ] **First scheduled `/kpi-rollup` fires June 1, 02:00 UTC** for May 2026.
- [ ] **`/sweep-zombies` first run** reconciles ≥0 zombies cleanly.
- [ ] **Confirm with Ron Madar-Hallevi:** PFR full name + per-execution minute estimates (the 5-min PFR LinkedIn value already lives in n8n; he can confirm or adjust at the source).
- [ ] **Slack message to workflow owners** — explain the methodology change (gear icon → Time saved per execution), set expectations for the April number temporarily dropping to 25 h until owners populate.
- [ ] **chat-ui follow-up** — stop auto-extracting `current_process_minutes_per_run` / `_runs_per_month` / `_people_count` in the planning whitelist (audit finding J — harmless drift, fix in a separate PR once Kurt removes the form inputs).
- [ ] **Investigate `timeSavedMode='dynamic'` semantics** — n8n public docs don't describe it. Currently treated as "skip + fallback eligible". Schema is unaffected if it turns out to mean "real execution duration" — additive change to `/kpi-rollup` only.

---

## Older entries

(Decision log started 2026-05-08; older decisions live in MEMORY.md until extracted.)
