# Decision Log — n8n Workflow Builder

System / config / architectural decisions worth remembering. New entries on top.

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

- [ ] **Deploy n8n-ops v0.2.** Run `./deploy.sh` from `Agentic Workflows/services/n8n-ops/`. Expect 6 Cloud Schedulers (4 existing updated + 2 new). Smoke each via `gcloud scheduler jobs run …`.
- [ ] **First scheduled `/kpi-rollup` fires June 1, 02:00 UTC** for May 2026. Confirm next-month measurement lands automatically (separate from today's manual May push).
- [ ] **`/sweep-zombies` first run** reconciles ≥0 zombies cleanly. Check `[sweep-zombies] reconciled N abandoned M` log line.
- [ ] **Confirm with Ron Madar-Hallevi:** PFR full name + per-run minute estimates (15 PFR / 30 ORM) are right.
- [ ] **Slack message draft** in MEMORY.md `Where We Left Off` — post when ready.
- [ ] **Sync-hub stub-row coverage fix** (deferred since Session 2) ships in the same n8n-ops v0.2 deploy.

---

## Older entries

(Decision log started 2026-05-08; older decisions live in MEMORY.md until extracted.)
