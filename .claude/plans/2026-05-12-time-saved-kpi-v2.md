# Plan — Time Saved KPI v2: n8n-native settings as source of truth

Refactor the Time Saved KPI rollup so the per-execution time-saved value is read from each n8n workflow's own settings (`settings.timeSavedMode` + `settings.timeSavedPerExecution`) instead of from the Hub initiative form. This deprecates the three "baseline metrics" fields on `strategic_ideas` from our pipeline and lets Kurt strip them out of the Hub UI per priority #1.

---

## Context

Per Ron + Kurt's 2026-05-12 direction:

1. **Remove baseline metrics** (processing time, frequency, people count) from the StrategicIdea form. Initiative creation must stay simple.
2. **Populate Production workflow settings** in n8n so we can track execution count, time-saved-per-execution, total per workflow, total per initiative.
3. **Refine logic:** the value configured **inside the n8n workflow** is the source of truth. If absent, fall back to `initiative_kpis.expected_impact` (the "Expected Output / Expected Impact" the user types per (initiative, KPI) pair when linking).

**Verified during investigation (2026-05-12):** n8n already has these fields natively on every workflow. No conventions, sticky-notes, or description parsing needed.

| n8n field | Type | Unit |
|---|---|---|
| `settings.timeSavedMode` | `"fixed"` \| `"dynamic"` \| null | — |
| `settings.timeSavedPerExecution` | number \| null | **minutes** |

Confirmed by surveying all 957 workflows on `guesty.app.n8n.cloud`:
- 41 (4.3%) `fixed` with a value set ✅
- 92 (9.6%) `fixed` but value missing
- 4 (0.4%) `dynamic`
- 820 (85.7%) unset

Real values in real workflows: 2, 5, 10, 15, 30, 105, 360 — sensible only as **minutes**.

**The 7 workflows linked to Marketing Time Saved today:**
- `PFR LinkedIn` → `fixed`, 5 min ✅
- `ORM` → `dynamic` (semantics TBD)
- `ORM analysis`, `PFR Social Proof` → `fixed`, no value
- `ORM Reviews`, `TrustPilot`, `PFR ongoing` → no field set

So Ron's team has started populating. Rest is a manual fill-in via n8n's workflow settings UI (gear icon → Time Saved Per Execution input).

**"Dynamic" mode is documented neither in n8n public docs nor in the workflow object beyond the enum value.** Two plausible meanings: (a) compute from each execution's real duration, (b) workflow emits the saved-minutes from an output field. Without confirmation, this plan treats `dynamic` as **"workflow contributes 0; fall through to initiative fallback"** — same as unset. Investigating semantics is a follow-up; the rollup logic doesn't depend on it.

---

## What changes

### 1. BigQuery schema — extend `n8n_ops.workflows` dim (SCD2)

Two additive nullable columns:

```sql
ALTER TABLE `agentic-workflows-485210.n8n_ops.workflows`
  ADD COLUMN time_saved_mode STRING,
  ADD COLUMN time_saved_per_execution_min NUMERIC;
```

- Additive + nullable → zero risk to existing reads (`sync-hub`, `weekly-digest`, `/workflows`, `bigquery-analytics.ts` in chat-ui — all ignore unknown columns).
- The next `/ingest` after migration populates the fields for workflows that have them; rest stay NULL.
- One-time SCD2 close-out burst (~137 workflows have non-null values — they all close out the old row + insert new). Manageable.
- No backfill script needed; the regular 15-min `/ingest` does it.

### 2. n8n-ops service — propagate the new fields end to end

**Files to modify** (all in `Agentic Workflows/services/n8n-ops/`):

#### [`src/services/n8n.ts`](Agentic Workflows/services/n8n-ops/src/services/n8n.ts)
Extend `N8nWorkflowMeta` to expose the two settings fields. `listAllWorkflows()` already returns the full workflow object (settings included) — just widen the type. ~5 LOC.

```ts
export interface N8nWorkflowMeta {
  id: string;
  name: string;
  active: boolean;
  isArchived?: boolean;
  tags?: { id: string; name: string }[];
  settings?: {
    timeSavedMode?: 'fixed' | 'dynamic' | string;
    timeSavedPerExecution?: number;
    // ...other settings fields exist but we don't care about them here
  };
}
```

#### [`src/services/bigquery.ts`](Agentic Workflows/services/n8n-ops/src/services/bigquery.ts)
- Extend `WorkflowDimRow` interface with `time_saved_mode: string | null` and `time_saved_per_execution_min: number | null`.
- Extend `syncWorkflows()`'s close-out diff: a workflow's row is SCD2-rotated when name OR active OR tags OR **time_saved_mode** OR **time_saved_per_execution_min** changes.
- Extend the INSERT statement in `syncWorkflows()` to include the new columns.

The existing SCD2 pattern uses `IS DISTINCT FROM` (NULL-safe) and JSON parsing — both already handle nullable types cleanly. ~10 LOC across two SQL templates.

#### [`src/routes/ingest.ts`](Agentic Workflows/services/n8n-ops/src/routes/ingest.ts)
- Extend `toDimRow()` to lift the two fields out of the n8n response into `WorkflowDimRow`. ~5 LOC.

#### [`src/services/supabase.ts`](Agentic Workflows/services/n8n-ops/src/services/supabase.ts)
- Modify `listKpiInitiativeBindings()`:
  - Drop the `current_process_minutes_per_run` field from the `strategic_ideas` embed.
  - Add a join to `initiative_kpis` to read `expected_impact` + `impact_period` per (kpi_id, initiative_id) pair. Currently the function queries `initiative_kpis` to find linked initiatives but ignores those two fields — switch to selecting them.
  - Update the returned `KpiInitiativeBinding` interface accordingly.

#### [`src/routes/kpi-rollup.ts`](Agentic Workflows/services/n8n-ops/src/routes/kpi-rollup.ts)
The biggest rewrite. New rollup algorithm:

```
for each workflow linked to the initiative:
  read time_saved_mode + time_saved_per_execution_min from BQ workflows dim
  if mode == 'fixed' AND value > 0:
    workflow_hours = success_runs_in_period × value / 60
    source = "workflow:fixed"
  else:
    workflow_hours = 0
    source = mode == 'dynamic' ? "workflow:dynamic_skipped" : "workflow:unset"

initiative_hours = Σ workflow_hours

if initiative_hours == 0 AND there are linked workflows:
  initiative_hours = initiative_kpis.expected_impact  (normalised to hours, see §3)
  source = "initiative:expected_impact"
```

This is the "all-or-nothing" interpretation: if **any** linked workflow has a configured fixed value, we report only the configured ones' sum (other workflows contribute 0). The initiative-level fallback fires only when **zero** workflows are configured. This is the simplest reading of "if a workflow has a value use it, else fall back to initiative expected impact" and avoids double-counting. Documented as a known interpretation; can switch to proportional later if Ron asks.

#### Webhook payload `notes` field — new audit format
```
"n8n v2 rollup: W workflows with fixed timeSavedPerExecution (X.X h),
 I initiatives fell back to expected_impact (Y.Y h),
 Z workflows skipped (mode=dynamic or unset)"
```

#### [`README.md`](Agentic Workflows/services/n8n-ops/README.md)
- Update `## /kpi-rollup` section: source of truth = n8n workflow settings; fallback = initiative `expected_impact`.
- Update "Onboarding a new KPI" — initiative-side step ("set current_process_minutes_per_run") replaced with workflow-side step ("set Time Saved Per Execution in each linked workflow's Settings → gear icon").

### 3. Unit normalization for `expected_impact` fallback

`initiative_kpis.expected_impact` is in the KPI's `unit` and `impact_period`. For Marketing Time Saved:
- `kpis.unit = 'hours'`
- `initiative_kpis.impact_period = 'monthly'`
- → use directly when rolling up a monthly period for an hours-unit KPI.

Normalize defensively in `/kpi-rollup`:
- `unit='minutes'` → divide expected_impact by 60.
- `unit='hours'` → use directly.
- Any other unit → log a warning, contribute 0 from fallback (the KPI isn't time-shaped).
- `impact_period != 'monthly'` → log a warning, contribute 0 (we run a monthly cron).

Both warnings get bundled into the Slack failure DM at end of run (existing path).

### 4. Hub side — deprecation, no data migration

- Kurt removes 3 inputs from the StrategicIdea form: `current_process_minutes_per_run`, `current_process_runs_per_month`, `current_process_people_count` (priority #1).
- DB columns stay (additive deletion is risky; harmless to leave). chat-ui's planning-mode whitelist (`extracted_fields`) can keep extracting them too — they just won't drive anything.
- The 2 values we hand-populated on 2026-05-08 stay in DB as historical record. No read, no harm.

### 5. New /admin-style endpoint (optional, defer)

A `GET /kpi-rollup/audit?kpiId=...` could list every linked workflow with: workflow_id, name, active, time_saved_mode, time_saved_per_execution_min, period executions. Useful for Ron to see which of his workflows are missing the setting. Out of scope this plan; trivial follow-up once the core ships.

---

## Critical files (summary)

**Modify:**
- `Agentic Workflows/services/n8n-ops/src/services/n8n.ts` — widen `N8nWorkflowMeta` type.
- `Agentic Workflows/services/n8n-ops/src/services/bigquery.ts` — extend `WorkflowDimRow`, `syncWorkflows()` diff + INSERT.
- `Agentic Workflows/services/n8n-ops/src/routes/ingest.ts` — extend `toDimRow()`.
- `Agentic Workflows/services/n8n-ops/src/services/supabase.ts` — `listKpiInitiativeBindings()` reads `expected_impact` + `impact_period` from `initiative_kpis`; drops `current_process_minutes_per_run`.
- `Agentic Workflows/services/n8n-ops/src/routes/kpi-rollup.ts` — rewrite computation per §2; new notes-field format.
- `Agentic Workflows/services/n8n-ops/README.md` — update onboarding flow.

**BQ migration:**
- One `ALTER TABLE` adding 2 nullable columns to `n8n_ops.workflows`. Run via `bq query` from a shell with project-level `bigquery.dataEditor` (the n8n-ops SA already has it).

**Re-used, not modified:**
- `runQuery`, `fq`, `mergeExecutions` from `bigquery.ts`.
- `getSecret` from `secret-manager.ts`.
- `postSlack`, `requireOidc`.
- Existing Cloud Schedulers (no scheduler changes; the monthly cron just runs the v2 logic).
- BQ table `n8n_ops.daily_workflow_stats` (execution counts, unchanged).

**Untouched (deprecated reads removed):**
- `strategic_ideas.current_process_minutes_per_run` / `_runs_per_month` / `_people_count` — Hub-side Kurt removes from form.

---

## Implications worth thinking about (the user asked)

1. **SCD2 close-out burst** on first /ingest after migration — ~137 workflows close out one row + insert a new one. The dim grows by ~137 rows; trivial. The MERGE was designed for this.
2. **Idempotency** — second `/ingest` after migration shows no further close-outs (values match). Verified by the existing `IS DISTINCT FROM` logic on name/active/tags.
3. **Stale reads** at rollup time — `/kpi-rollup` reads BQ workflows dim, not the live n8n API. Up to 15 min lag between an owner setting the value in n8n and the rollup seeing it. Acceptable for a monthly cron.
4. **Direct n8n API fallback** — none. We commit to BQ as the read surface for rollup. If `/ingest` is failing, `/kpi-rollup` operates on stale dim data. Existing freshness-alarm Cloud Function will alert if `/ingest` itself dies.
5. **"Dynamic" mode** — treated as skip / fallback. If Ron clarifies what dynamic means in n8n (e.g. real exec duration), we can wire that in later as `workflow_hours = Σ duration_seconds / 3600` for dynamic-mode workflows. Schema doesn't change.
6. **Multi-initiative workflow attribution** — first-binding-wins (unchanged). If `WF-A` is linked to initiatives I1 and I2 and has timeSavedPerExecution=10, only I1 gets the hours.
7. **Multi-KPI participation of one initiative** — `initiative_kpis` has (kpi_id, initiative_id) pairs with different `expected_impact` per pair. `listKpiInitiativeBindings(kpiId)` already filters by `kpi_id`, so the fallback for KPI X uses I1's expected_impact-for-X, not its expected_impact-for-Y. Correct out of the box.
8. **Apr 2026 measurement re-push** — re-running `/kpi-rollup` for `period_date=2026-04-01` after deploy will upsert. The April number will likely change: today's hand-populated `current_process_minutes_per_run=15/30` go away; only PFR LinkedIn's `timeSavedPerExecution=5` from n8n applies. For Marketing Time Saved that means:
   - PFR LinkedIn: 0 runs in April × 5 min = 0 h
   - All other workflows: 0 h (unset or dynamic)
   - PFR initiative total = 0 → fallback to expected_impact = 20 h
   - ORM initiative total = 0 → fallback to expected_impact = 5 h
   - **New April total = 25 h** (vs old 37 h based on hand-populated initiative minutes).
   - May 2026 will recompute similarly on the next refresh.
   - This is more honest: it surfaces that owners haven't filled in the workflow settings yet, with the claimed monthly target as a placeholder.
9. **Hub UI form removal** is decoupled from our deploy — independent PRs on the Hub repo. We can ship the n8n-ops change first; Kurt's UI cleanup follows whenever. The new n8n-ops code never reads those fields again, so leaving the inputs in the form (for a transition window) does no harm.
10. **Webhook contract** — unchanged (`{period_date, value, notes?}`). Same Edge Function, same token, same upsert semantics. Hub side notices nothing different except updated `notes`.
11. **Re-running for May** to get current numbers: `curl /kpi-rollup -d '{"kpiId":"...","periodDate":"2026-05-01"}'` after deploy will upsert.

---

## Order of execution

1. **Apply BQ ALTER** to add the two columns. Verify with `bq show`.
2. **Edit the 6 files** above. Build with `npm run build` (tsc clean).
3. **Manually trigger `/ingest`** once (after deploy) to populate the new dim fields for the 137 workflows that have any value. Verify with a BQ query: `SELECT COUNT(*) WHERE time_saved_mode IS NOT NULL AND valid_to IS NULL`.
4. **Manually trigger `/kpi-rollup`** dry-run for April 2026 against the Marketing Time Saved KPI. Confirm the byWorkflow breakdown matches expected (PFR LinkedIn has source=`workflow:fixed`, others have `workflow:unset`, both initiatives fall back to `initiative:expected_impact`). Expected `total_hours = 25` (vs prior 37).
5. **Live re-push for Apr + May** via dropping `dryRun: false`. Hub `kpi_measurements` upserts the new values.
6. **Commit + push** project-side artefacts (plan-updates only — Agentic Workflows still isn't git-tracked).
7. **Send Slack to workflow owners**: "Open your workflow in n8n → click the gear icon → Settings → set Time Saved Per Execution (in minutes). The monthly KPI rollup will start using your value within 15 min of saving."
8. **Notify Kurt** he can strip the 3 baseline inputs from the StrategicIdea form.

---

## Verification

```bash
# 1. Schema landed?
bq query --project_id=agentic-workflows-485210 --location=EU --use_legacy_sql=false \
  'SELECT column_name FROM `agentic-workflows-485210.n8n_ops.INFORMATION_SCHEMA.COLUMNS` WHERE table_name="workflows"'
# Expect: time_saved_mode, time_saved_per_execution_min in the list.

# 2. Ingest populated them?
bq query --project_id=agentic-workflows-485210 --location=EU --use_legacy_sql=false \
  'SELECT time_saved_mode, COUNT(*) AS n FROM `agentic-workflows-485210.n8n_ops.workflows`
   WHERE valid_to IS NULL GROUP BY time_saved_mode ORDER BY n DESC'
# Expect: rows for null, "fixed", "dynamic"; counts should match the n8n adoption survey (~820 / 133 / 4).

# 3. Dry-run rollup
SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token --audiences=${SVC_URL})
curl -X POST "${SVC_URL}/kpi-rollup" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"kpiId":"e6f47f5b-5de7-4630-84b5-441741270e53","periodDate":"2026-04-01","dryRun":true}'
# Expect:
#   - byWorkflow[].source ∈ {"workflow:fixed", "workflow:unset", "workflow:dynamic_skipped"}
#   - byInitiative[].source ∈ {"workflow_sum", "initiative:expected_impact"}
#   - total_hours = 25.0 (PFR initiative falls back to 20, ORM to 5, until owners populate workflows)

# 4. Live push (upserts the prior April value 37.0 → 25.0)
curl -X POST "${SVC_URL}/kpi-rollup" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"kpiId":"e6f47f5b-5de7-4630-84b5-441741270e53","periodDate":"2026-04-01"}'

# 5. Hub UI verify
# Open /business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53 — chart should show updated April (25h).
```

After Ron's team fills in the remaining 6 workflows' `timeSavedPerExecution`, re-run the rollup — total should rise from 25 h to whatever the real number is. **No code changes needed** between owner-fills-the-field and next-month-rollup; the cron picks it up automatically.

---

## Open questions deferred to follow-ups

- What does `timeSavedMode='dynamic'` actually compute in n8n? Investigate via n8n docs / source / a settings-panel screenshot. Until clarified, dynamic-mode workflows contribute 0.
- Proportional fallback (workflow-level expected_impact split) vs all-or-nothing fallback (current). Going with all-or-nothing per simplest reading. Re-litigate if Ron pushes back.
- Audit endpoint (`GET /kpi-rollup/audit`) — defer until needed.

---

## Robustness audit

### Audit finding A — Subtle fallback bug: "configured 0 hours" ≠ "unset"

**Original algorithm:** "if initiative_hours == 0 AND there are linked workflows: fallback to expected_impact."

**Bug:** a workflow with `timeSavedPerExecution=5` and zero executions in the period legitimately contributes 0 hours. If that's the only configured workflow on the initiative, summed hours = 0 → fallback fires → we report `expected_impact` instead of the honest "0 hours saved this month because nothing ran."

**Fix:** decide fallback on **configuration coverage**, not on the **sum**:

```
configured = any(workflow in initiative with mode == 'fixed' AND value > 0)
if configured:
    initiative_hours = Σ workflow_hours    # honest 0 if no runs
    source = "workflow_sum"
else:
    initiative_hours = normalized(expected_impact, unit, impact_period)
    source = "initiative:expected_impact_fallback"
```

The algorithm section in §2 above must use this refined form. The `byInitiative[].source` audit string distinguishes the two cases for Ron to inspect.

### Audit finding B — `value=0` semantics

Owners can save `timeSavedPerExecution=0` in n8n. Two readings:
- **"This workflow saves 0 minutes per execution"** (rare, but honest)
- **"I haven't set this yet"**

Decision: treat **0 as unset** for the configuration check (i.e. `configured = mode=='fixed' AND value > 0`). Owners who genuinely mean 0 should leave the field empty. Documented in README onboarding.

### Audit finding C — Pre-deploy ordering is load-bearing

The BQ schema migration **must precede the Cloud Run deploy**, otherwise the new code's INSERT (with 9 columns) will fail on the next `/ingest` until the columns exist. Explicit order:

1. `bq query` runs `ALTER TABLE` (idempotent — see §audit-D).
2. Verify schema with `INFORMATION_SCHEMA.COLUMNS` query.
3. `cd Agentic\ Workflows/services/n8n-ops && ./deploy.sh` (rebuilds Cloud Run; rolling deploy).
4. Trigger `/ingest` manually to confirm the first new-shape MERGE succeeds.

**Rolling-deploy safety:** during the deploy, old + new pods may both run briefly. The current INSERT enumerates columns explicitly (`workflow_id, name, active, tags, valid_from, valid_to, updated_at`); new pod writes 9 columns; missing columns from old pods get NULL by default — both work. Idempotent: old pod won't close-out on the new-field diff (its diff doesn't know about the field), but the new pod will on its next run. End state converges.

### Audit finding D — BQ migration as a versioned file, not ad-hoc bq

Don't run the ALTER from a one-off `bq query` invocation in the conversation. Commit a migration SQL file under `Agentic Workflows/workflows/n8n_kpi_ingestion/migration_v2_time_saved_settings.sql` (next to the original `migration.sql`) so the schema change is traceable.

Use `IF NOT EXISTS` so re-runs are safe:
```sql
ALTER TABLE `agentic-workflows-485210.n8n_ops.workflows`
  ADD COLUMN IF NOT EXISTS time_saved_mode STRING,
  ADD COLUMN IF NOT EXISTS time_saved_per_execution_min NUMERIC;
```

### Audit finding E — Single round-trip SQL in `/kpi-rollup`

Fold the workflows-dim LEFT JOIN into the same query that pulls execution counts. Currently two separate queries planned; one round-trip is simpler + faster + atomic:

```sql
SELECT
  s.workflow_id,
  SUM(s.success_runs)                                AS executions,
  ANY_VALUE(w.time_saved_mode)                       AS time_saved_mode,
  ANY_VALUE(w.time_saved_per_execution_min)          AS time_saved_per_execution_min,
  ANY_VALUE(w.name)                                  AS workflow_name
FROM `agentic-workflows-485210.n8n_ops.daily_workflow_stats` s
LEFT JOIN `agentic-workflows-485210.n8n_ops.workflows` w
  ON w.workflow_id = s.workflow_id AND w.valid_to IS NULL
WHERE s.day >= @start AND s.day < @end
  AND s.workflow_id IN UNNEST(@ids)
GROUP BY s.workflow_id
```

**Subtle correctness check:** a configured workflow with 0 executions doesn't appear in `daily_workflow_stats` for the period → it's excluded from this query → the rollup can't see its `time_saved_mode='fixed'` configuration → `configured` flag stays false → fallback fires erroneously.

**Fix:** drive the query from the BQ workflows dim, not from daily_workflow_stats:

```sql
SELECT
  w.workflow_id,
  w.name,
  w.time_saved_mode,
  w.time_saved_per_execution_min,
  IFNULL(s.executions, 0) AS executions
FROM `agentic-workflows-485210.n8n_ops.workflows` w
LEFT JOIN (
  SELECT workflow_id, SUM(success_runs) AS executions
  FROM `agentic-workflows-485210.n8n_ops.daily_workflow_stats`
  WHERE day >= @start AND day < @end
  GROUP BY workflow_id
) s USING (workflow_id)
WHERE w.workflow_id IN UNNEST(@ids) AND w.valid_to IS NULL
```

Now every linked workflow appears in the result whether or not it ran — `configured` flag is correctly determined.

### Audit finding F — Observable regression on Apr + May numbers (managed, not silenced)

Re-pushing April after the v2 ship changes the published value from `37.0 h` to `25.0 h` (initiative fallback × 2). May (1-8 partial) goes from `90.5 h` to `25.0 h`. Big visible drop in the Hub chart.

**Mitigation:**
1. **Don't auto-re-push as part of the deploy.** Run `/kpi-rollup` for Apr + May only after the Slack message has gone out so owners know to expect the methodology change. The deploy itself only enables future months.
2. **Update the `notes` field on the new pushes** to make the methodology explicit: `"n8n v2 methodology: workflow-native timeSavedPerExecution as source of truth, initiative expected_impact as fallback (previous v1 used Hub-side current_process_minutes_per_run)."`
3. **The "honest" April number rises from 25 h back toward the original 37 h as owners fill in their workflows.** That's the intended trajectory — the number is currently *under*-reporting until owners populate.

### Audit finding G — Rollback plan

If the methodology gets rejected after deploy:
- **Code rollback:** redeploy previous Cloud Run revision (`gcloud run services update-traffic n8n-ops --to-revisions <prev>=100`).
- **BQ schema rollback:** `ALTER TABLE … DROP COLUMN IF EXISTS …` — irreversible (loses the populated values for the 137 workflows), but cheap to re-populate via one re-run of `/ingest`.
- **Measurements rollback:** the webhook upserts on `(kpi_id, period_date)` — re-push the old v1 values (37.0 April, 90.5 May) with explicit `dryRun: false` to overwrite. Both values preserved in this plan + decision-log for restorability.

### Audit finding H — Idempotency of the BQ MERGE on the *next* `/ingest`

After the migration + first new-code ingest, the SCD2 close-out will fire for ~137 workflows (those with non-null new fields). On the **second** `/ingest`, the close-out diff must NOT re-close those rows. Verify: the new diff uses `IS DISTINCT FROM` on the new fields against the new row → NULL vs NULL is "not distinct" (returns false) → no close-out. Numeric vs numeric same. The pattern is correct; explicit verification step:

```bash
# After deploy + 2 ingests, the dim should be quiet (no churn):
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) AS churn_24h FROM `agentic-workflows-485210.n8n_ops.workflows` WHERE updated_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)'
# Expect: same order of magnitude as before migration (close-outs naturally happen when owners rename workflows, etc.)
```

### Audit finding I — Hub Supabase `expected_impact` could be NULL

`initiative_kpis.expected_impact` is numeric and nullable. If NULL and no workflows configured → fallback yields NULL → can't push to the webhook. Defensive handling: treat NULL as 0; log via Slack DM at end of run ("KPI X, initiative Y: no expected_impact set, contributed 0").

### Audit finding J — Multi-source-of-truth drift risk

Today's flow: chat-ui plans an initiative → extracted_fields whitelist auto-extracts `current_process_minutes_per_run` → Hub form has it → user can override. The whitelist still extracts these fields even after Kurt removes them from the form. Harmless (writes to a column we no longer read), but **stop extracting** in a follow-up chat-ui PR to avoid stale data accumulation. Add as a Verification Queue item.

### Audit finding K — Methodology change requires a comms beat

The Slack message to workflow owners must lead with the methodology change, not bury it. Outline:
1. "**Time Saved KPI now reads directly from your n8n workflow settings.**"
2. How to set it (gear icon → Time Saved per Execution input, in minutes).
3. What happens if you don't set it ("we fall back to the initiative's Expected Impact, which is a placeholder").
4. The April number temporarily dropped from 37→25 hours until owners fill in their workflows; expected to climb back up as adoption grows.

This shapes Ron's expectations + creates the right action loop.

### Audit finding L — `signal_kpi_id` is NOT in scope

`initiative_kpis` has both `kpi_id` (primary contribution) and `signal_kpi_id` (Phase 2.5 signal link). Today's query filters on `kpi_id=eq.X` only — signal links are correctly ignored. If Kurt asks us to roll signal-linked initiatives into the Time Saved total later, that's an additive query change. Out of scope this plan.

---

## Audit-tightened algorithm (replaces §2 #kpi-rollup logic)

```typescript
for (const initiative of linkedInitiatives) {
  let initiativeHours = 0;
  let configuredWorkflowExists = false;

  for (const workflow of initiative.linkedWorkflows) {
    const isFixed = workflow.time_saved_mode === 'fixed' && (workflow.time_saved_per_execution_min ?? 0) > 0;
    if (isFixed) {
      configuredWorkflowExists = true;
      const hours = (workflow.executions ?? 0) * workflow.time_saved_per_execution_min / 60;
      initiativeHours += hours;
      byWorkflow.push({ ...workflow, hours, source: 'workflow:fixed' });
    } else {
      const reason = workflow.time_saved_mode === 'dynamic'
        ? 'workflow:dynamic_skipped'
        : 'workflow:unset';
      byWorkflow.push({ ...workflow, hours: 0, source: reason });
    }
  }

  if (!configuredWorkflowExists) {
    // ALL workflows on this initiative lack a configured fixed value → fallback
    const fallback = normalizeExpectedImpact(
      initiative.expected_impact, initiative.impact_period, kpi.unit
    );
    initiativeHours = fallback;
    byInitiative.push({ ...initiative, hours: fallback, source: 'initiative:expected_impact_fallback' });
  } else {
    byInitiative.push({ ...initiative, hours: initiativeHours, source: 'workflow_sum' });
  }
}
```

`normalizeExpectedImpact()`:
- `unit='hours' AND period='monthly'` → return value as-is.
- `unit='minutes' AND period='monthly'` → return value / 60.
- Otherwise → return null + log warning via Slack DM.

---

## Tightened order of execution

1. Commit a versioned migration: `Agentic Workflows/workflows/n8n_kpi_ingestion/migration_v2_time_saved_settings.sql` with `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`.
2. Apply it: `bq --location=EU query --use_legacy_sql=false < migration_v2_time_saved_settings.sql`.
3. Verify columns exist (INFORMATION_SCHEMA query).
4. Make code changes to the 6 files in §2. `npm run build` clean.
5. `./deploy.sh` from n8n-ops. Watch for the rebuild + scheduler idempotent updates.
6. Manually trigger `/ingest` once. Verify ~137 workflows have non-null `time_saved_mode` in the dim:
   ```bash
   bq query --use_legacy_sql=false \
     'SELECT time_saved_mode, COUNT(*) FROM `agentic-workflows-485210.n8n_ops.workflows` WHERE valid_to IS NULL GROUP BY time_saved_mode ORDER BY 2 DESC'
   ```
7. `/kpi-rollup` dry-run for April + May. Inspect byWorkflow.source + byInitiative.source breakdown for both initiatives.
8. **Pause for comms** — send Slack message to workflow owners (audit finding K) BEFORE live re-push, so the methodology change has expectations set.
9. Live re-push for April + May (overwrites prior 37.0 + 90.5). Confirm Hub UI shows ~25h each (until owners populate workflows).
10. Notify Kurt: form-input cleanup unblocked.

---

## Tightened verification

In addition to the §Verification block above:

```bash
# Idempotency check (run after 2 ingests post-migration):
bq query --use_legacy_sql=false \
  'SELECT DATE(updated_at) AS d, COUNT(*) AS rows_touched FROM `agentic-workflows-485210.n8n_ops.workflows` GROUP BY d ORDER BY d DESC LIMIT 7'
# Expect: first day after migration shows the close-out burst; subsequent days steady-state.

# Spot-check: PFR LinkedIn (the only one with a real value today)
bq query --use_legacy_sql=false \
  'SELECT workflow_id, name, time_saved_mode, time_saved_per_execution_min
   FROM `agentic-workflows-485210.n8n_ops.workflows`
   WHERE workflow_id = "8Hi5cnriYKKbbBEB" AND valid_to IS NULL'
# Expect: mode=fixed, value=5

# Per-source-of-truth audit (post first live rollup):
curl -X POST "${SVC_URL}/kpi-rollup" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"kpiId":"e6f47f5b-...","periodDate":"2026-04-01","dryRun":true}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print('Sources:', set(w['source'] for r in d['results'] for w in r['by_workflow']))"
# Expect: {"workflow:fixed", "workflow:unset", "workflow:dynamic_skipped"}
```

---

## Track B (zombie alert fix) — already shipped 2026-05-08

Code complete + committed for the loop-alerts.ts 24h cap, per-workflow grouping, `/sweep-zombies` route, `getExecutionById` helper, BQ remediation UPDATE. Pending the n8n-ops v0.2 deploy that bundles this with the Time Saved v2 work above.
