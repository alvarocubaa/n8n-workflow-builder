# Plan — Auto-fill the per-initiative "Contributes to" KPI card from our data

**Date:** 2026-05-15
**Owner:** Alvaro Cuba (n8n Workflow Builder)
**Why now:** Ron + Kurt's direction is "we have the data; the user shouldn't have to type Expected Impact (Hours) into the Hub's KPI Tracking card." Today's state: 5 initiatives have workflow links; only 2 of those have manually-typed `initiative_kpis` rows (Ron filled them in). We want this auto-filled going forward.

---

## Upstream data flow — already shipped (do NOT rebuild)

The auto-fill we're designing in this session is the **last hop** of a chain that already exists. Knowing the full chain saves a fresh session from re-implementing earlier links.

```
USER  → opens Plan-with-AI on a Hub initiative
        chat-ui Phase 2 fires <create_initiative />
        → Edge Function n8n-initiative-upsert
        → strategic_ideas row materialised
             (impact_category='Time Savings', department='Marketing')

USER  → "build the workflow"
        chat-ui Builder produces JSON → Deploy → workflow #X live in n8n

        Edge Function n8n-builder-callback fires:
             INSERT initiative_workflow_links (initiative_id=…, n8n_workflow_id=X)    ← THE JOIN KEY
             UPDATE innovation_items.solution_url (when Phase 2.2 plumbs poc id;
                                                    informational mirror — NOT what
                                                    our rollup reads)

USER  → in n8n, edits Workflow Settings → Time Saved Per Execution = 8 min
        Next /ingest (≤15 min) updates BQ n8n_ops.workflows
             time_saved_per_execution_min = 8

CRON  → 06:15 UTC, the new /initiative-kpi-sync runs from /sync-hub:    ← THIS SESSION'S WORK
        For each strategic_ideas row:
          SKIP if impact_category ≠ 'Time Savings'
          SKIP if no rows in initiative_workflow_links
          RESOLVE dept → canonical KPI (kpis.name LIKE '%time saved%' AND is_active)
          COMPUTE expected_impact = Σ(runs_30d × time_saved_per_execution_min / 60)
          UPSERT initiative_kpis (initiative_id, kpi_id, expected_impact,
                                  impact_period='monthly',
                                  created_by='<auto-sync-uuid>')

HUB UI → IdeaDetailModal "Contributes to KPI" card auto-populated.
         /business-kpis/<kpi_id> dept-level chart rolls this up with others.
```

**Two non-obvious pieces (already-shipped facts the fresh session should know but not re-build):**

1. **`initiative_workflow_links` is the join key.** The `n8n-builder-callback` Edge Function has been auto-writing this row since Direction-2 (2026-05-04) for every chat-ui deploy whose conversation has an `initiative_id`. This row already exists when our auto-sync runs. If it doesn't (e.g. workflow built outside the Builder, or initiative not yet linked), the initiative falls into the `skipped_no_workflows` bucket — correct behaviour.

2. **`innovation_items.solution_url` is a PoC-level mirror, NOT the rollup data source.** PR #52 (shipped 2026-05-15) added auto-write for PoC cards keyed on `innovation_item_id`. It's a human-readable column for the PoC card's "Open workflow →" affordance. Our rollup reads `initiative_workflow_links`, not `solution_url`. **Soft gap to watch (not in this session's scope):** if a PoC owner manually types a `solution_url` for a workflow built outside the Builder, no `initiative_workflow_links` row gets created → workflow doesn't roll up into any KPI. A future "fill-the-gaps" job could backfill link rows from `solution_url` strings when they match a known n8n workflow id, but that's a separate session.

---

## Context for a fresh session

### What's already live in prod (do NOT redo this)
- **Marketing Time Saved KPI live in Hub** (`/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53`): April 2026 = 38.08 h, May = 87.57 h. Source of truth = each n8n workflow's `settings.timeSavedPerExecution` (minutes), bulk-populated via node-count heuristic + owner-editable.
- **n8n-ops Cloud Run service** (`Agentic Workflows/services/n8n-ops/`) runs:
  - `/ingest` every 15 min — mirrors every n8n workflow into BQ `n8n_ops.workflows` SCD2 dim. Columns include `time_saved_mode`, `time_saved_per_execution_min`, `project_id`, `project_env`.
  - `/sync-hub` daily 06:15 UTC — upserts per-initiative workflow stats to Hub `initiative_workflow_stats`.
  - `/kpi-rollup` monthly (1st @ 02:00 UTC) — dept-centric sum, POSTs to Hub `kpi-webhook-ingest`.
- **Hub side**: form Baseline Metrics section stripped (Cloud Build `00104-nsw` 2026-05-14). chat-ui side cleaned. Edge Function `n8n-conversation-callback` at v10.
- Cloud Run revision currently serving n8n-ops: **`n8n-ops-00007-tmm`**.

### Current state of `initiative_kpis` (the table we'd auto-write)
Only 5 initiatives have rows in `initiative_workflow_links` across the whole Hub. Breakdown:

| Item | Title | Dept | impact_category | Has initiative_kpis row? | Live data |
|---|---|---|---|---|---|
| 193 | ORM analysis and insights | Marketing | Improved Quality | yes (`expected_impact=5h`) | ~47 h/month measured |
| 213 | PMM HubSpot Reporting Automation | Marketing | Time Savings | **no** | Workflow inactive in n8n; 239 historical runs in last 30d; no `timeSavedPerExecution` set |
| 214 | Automate PFR Celebration Process | Marketing | Time Savings | yes (`expected_impact=20h`) | ~1 h/month measured |
| 232 | Monitoring and follow up for inactive accounts | **Payments** | Time Savings | no | Workflow `mode=fixed`, 60 min/run, 0 runs/30d. **Blocked**: no Payments Time Saved KPI exists |
| 248 | Guesty Marketing Cowork Slack MAS | Marketing | Improved Quality | no | Skip (impact_category not Time Savings) |

So practically: net-new auto-link target is just #213, plus refresh candidates #214 (downgrade 20→1h) and #193 (upgrade 5→47h). #232 is blocked behind a missing dept KPI. #248 is a different KPI dimension.

### Schema reality (verified live)
- `initiative_kpis(id, initiative_id, kpi_id, signal_kpi_id, impact_period, expected_impact, created_at, updated_at)` — `kpi_id` is the FK to canonical `kpis`. Partial unique index on `(initiative_id, kpi_id)` already exists per Phase 2 migration.
- `kpis(id, name, scope, department, unit, data_source_type, data_source_label, refresh_cadence, is_active, ...)` — canonical KPIs registry.
- Today the only `Time Saved` KPI with `unit='hours'` is Marketing's (`e6f47f5b-...`).

---

## The new design (FLOW)

```
TRIGGERS (any of these fires the recompute):
  ↳ Daily cron — fold into the existing /sync-hub route (already runs 06:15 UTC)
     so we don't add yet another scheduler.
  ↳ Manual: POST /initiative-kpi-sync (no body) for ad-hoc reruns
     (parallels the manual /kpi-rollup invocation pattern).

PROCEDURE — for every initiative in Hub:

  1. SKIP CHECKS
     a. impact_category not in {'Time Savings'} → skip (other categories need their own
        canonical KPI mapping; out of scope this session).
     b. no rows in initiative_workflow_links for this initiative_id → skip.

  2. RESOLVE CANONICAL KPI
     SELECT * FROM kpis
     WHERE scope='department' AND department=<initiative.department>
       AND unit='hours' AND name ILIKE '%time saved%' AND is_active=true
     ORDER BY created_at DESC LIMIT 1;
     If no match → log {reason: 'no_kpi_for_dept', dept: ...} and skip.
       (Currently catches Payments / OB / CS / etc. — those need a Time Saved KPI
        created in Hub before auto-fill works for them.)

  3. COMPUTE expected_impact (in hours, monthly)
     For each workflow_id in initiative_workflow_links for this initiative:
        SELECT
          IFNULL(SUM(success_runs), 0) AS runs_30d,
          ANY_VALUE(w.time_saved_per_execution_min) AS minutes_per_run
        FROM n8n_ops.daily_workflow_stats s
        JOIN n8n_ops.workflows w
          ON w.workflow_id = s.workflow_id AND w.valid_to IS NULL
        WHERE s.day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          AND s.workflow_id = <wf_id>
     workflow_hours = runs_30d × IFNULL(minutes_per_run, 0) / 60
     total_hours = SUM(workflow_hours)
     Round to 2 decimals.

  4. UPSERT initiative_kpis
     Key: (initiative_id, kpi_id).
     PostgREST endpoint:
       POST /rest/v1/initiative_kpis?on_conflict=initiative_id,kpi_id
       Prefer: resolution=merge-duplicates,return=minimal
       Body: { initiative_id, kpi_id, impact_period:'monthly', expected_impact:total_hours }
     Idempotent. Index-friendly. No data loss.

  5. CONFLICT POLICY when a row already exists with a manual expected_impact
     → DECISION POINT, see below. Pick A, B, or C.

LOG OUTPUT per run:
  {
    initiatives_scanned, eligible, linked_new, updated, total_unchanged,
    skipped_no_kpi, skipped_no_workflows, skipped_wrong_category, errors,
    duration_ms
  }
```

---

## DECISION (locked in 2026-05-15) — Option A: auto-overwrite

Confirmed by Ron's flow-diagram review on 2026-05-15. Measured data is the authority; Ron's previous manual values (PFR Celebration 20h, ORM analysis 5h) get refreshed to current measured rates on the next cron run.

### Schema reality (verified live 2026-05-15)

`initiative_kpis` columns are: `id, initiative_id, kpi_id, signal_kpi_id, impact_period, expected_impact, created_at, updated_at`. **There is no `created_by` column.** So we can't tag auto-synced rows with a principal UUID — and with Option A's "always overwrite" semantics, we don't need to. The cron rewrites every eligible row every morning. The implicit signals are:
- `updated_at` close to the most recent cron fire (within minutes) = auto-synced
- `updated_at` between cron runs (gap of hours) = manual edit; will be overwritten on the next sync

### Implications worth restating in code comments

- **Single source of truth** = the live `daily_workflow_stats × workflows_dim` join.
- **Manual values get overwritten** on the next sync. If Ron or any initiative owner types a value in the Hub UI, it's a soft override that lasts until 06:15 UTC the next morning. This is the explicit, accepted Option A behaviour.
- **UI labeling** (Kurt's repo, separate follow-up): the "Expected Impact (Hours)" field should be labelled "Auto-calculated from execution data — last updated {updated_at}". Without this label, users will type values and be surprised when they revert.
- **Long-term, Option C** (dual-track `measured_impact_hours` column rendered side-by-side with owner-typed `expected_impact`) is the cleanest UX but needs Hub schema + Kurt UI work. Defer to a separate session when Hub UI bandwidth opens up. Today's Option A is forward-compatible: when Option C lands, the auto-sync just writes a different column, no logic change.

### UPSERT semantics

PostgREST upsert on `(initiative_id, kpi_id)` with `Prefer: resolution=merge-duplicates`:

```
POST /rest/v1/initiative_kpis?on_conflict=initiative_id,kpi_id
Prefer: resolution=merge-duplicates,return=minimal
Body: { "initiative_id": "...", "kpi_id": "...",
        "impact_period": "monthly", "expected_impact": 12.34 }
```

Idempotent. Overwrites existing rows by design (Option A). The Phase 2 partial-unique index on `(initiative_id, kpi_id) WHERE kpi_id IS NOT NULL` already exists, so PostgREST has the constraint to merge on.

---

## Implementation plan (assuming **Option A** approved)

### Files to add/modify

**NEW** — `Agentic Workflows/services/n8n-ops/src/routes/initiative-kpi-sync.ts`
~150 LOC. Mirror the shape of `routes/kpi-rollup.ts`:
- Read all initiatives + their workflow links via Hub Supabase REST (extend `services/supabase.ts` with a helper).
- For each: resolve KPI, compute `expected_impact` from BQ workflows dim ⋈ daily_workflow_stats.
- UPSERT into `initiative_kpis` via PostgREST.
- Return summary JSON.
- Dry-run mode (no writes; return planned upserts).

**MODIFY** — `Agentic Workflows/services/n8n-ops/src/services/supabase.ts`
Add helpers:
- `listAllInitiativesWithCategory(impactCategory: string): Promise<{id, department, impact_category}[]>` — `GET /rest/v1/strategic_ideas?impact_category=eq.Time%20Savings`
- `listAllWorkflowLinks(): Promise<Map<initiative_id, n8n_workflow_id[]>>` — `GET /rest/v1/initiative_workflow_links?select=initiative_id,n8n_workflow_id`
- `findCanonicalKpiForDept(dept: string, unit: string, namePattern: string): Promise<KpiRow|null>` — already partly covered; add the filter.
- `upsertInitiativeKpi(initiative_id, kpi_id, expected_impact, impact_period='monthly'): Promise<void>` — PostgREST upsert with `on_conflict=initiative_id,kpi_id`.

**MODIFY** — `Agentic Workflows/services/n8n-ops/src/index.ts`
- Wire the new route: `app.post('/initiative-kpi-sync', requireOidc, wrap(initiativeKpiSync));`

**MODIFY** — `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts`
- At the end of the existing handler, call `initiativeKpiSync()` internally (not via HTTP) so the daily cron does both.

**OPTIONAL** — `Agentic Workflows/services/n8n-ops/deploy.sh`
- No new scheduler needed if we fold into `/sync-hub`. If we want a separate scheduler, add one like `*/360 * * * *` (every 6 hours).

**DECISION-LOG** — `n8n-builder-cloud-claude/docs/decision-log.md`
- New entry capturing Option A choice + rationale + observable consequence (Ron's PFR=20 → 1; ORM=5 → 47).

### Order of execution

1. **Code in place** — write `initiative-kpi-sync.ts` + supabase.ts helpers. `npm run build` clean.
2. **Dry-run smoke** — manually POST `/initiative-kpi-sync` with `{dryRun: true}` (after deploy). Inspect the planned upserts:
   - #213 PMM HubSpot → expected_impact = ? (depends on whether we count inactive-workflow historicals)
   - #214 PFR Celebration → expected_impact = ~1h (downgrade from 20h)
   - #193 ORM analysis → expected_impact = ~47h (upgrade from 5h)
3. **Live run** — drop `dryRun`, verify Supabase rows:
   ```
   curl ${SUPA_URL}/rest/v1/initiative_kpis?kpi_id=eq.e6f47f5b-...
   ```
4. **Visual confirm in Hub UI** — open each Marketing initiative, see the "Contributes to" card auto-populated.
5. **Deploy `./deploy.sh`** — ships the new route + folds into `/sync-hub`. Next daily 06:15 UTC cron picks up new initiatives automatically.

### Inactive-workflow edge case

PMM HubSpot is currently `active=false` in n8n but had 239 runs in the last 30 days. Two choices:

- **Count its historical contribution** (`expected_impact = 239 × heuristic_minutes / 60`). Honest measurement of the past month. Future months drop to 0 unless reactivated.
- **Count it as 0** since it's not running. Future-forward expected_impact.

My take: count the historical 30d window. The whole point of `expected_impact` here is "monthly contribution" — if the workflow ran 239 times last month, it contributed real time saved. If it stays off, next month's `expected_impact` will be 0 automatically (no runs in the window). Self-correcting.

---

## Verification (after first live run)

```bash
SVC_URL="https://n8n-ops-fhehssni7q-ew.a.run.app"
SA="n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com"
ACCESS=$(gcloud auth print-access-token 2>/dev/null)
TOKEN=$(curl -s -X POST \
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:generateIdToken" \
  -H "Authorization: Bearer ${ACCESS}" -H "Content-Type: application/json" \
  -d "{\"audience\":\"${SVC_URL}\",\"includeEmail\":true}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# 1) Dry-run smoke
curl -X POST "${SVC_URL}/initiative-kpi-sync" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"dryRun":true}' | python3 -m json.tool

# 2) Live run
curl -X POST "${SVC_URL}/initiative-kpi-sync" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{}'

# 3) Verify Hub state
SUPA_URL=$(gcloud secrets versions access latest --secret=supabase-hub-url --project=agentic-workflows-485210 2>/dev/null)
SUPA_KEY=$(gcloud secrets versions access latest --secret=supabase-hub-service-role --project=agentic-workflows-485210 2>/dev/null)
curl -s "${SUPA_URL}/rest/v1/initiative_kpis?kpi_id=eq.e6f47f5b-5de7-4630-84b5-441741270e53&select=initiative_id,expected_impact,impact_period,updated_at,strategic_ideas:initiative_id(item_number,title)" \
  -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}" | python3 -m json.tool

# 4) Visual confirm
# Hub: https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53
# OR https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/business-kpis/...
# Each initiative card should show "Contributes to: Time Saved (Marketing) — X hours/month" auto-filled.
```

---

## Out of scope this session

- Non-Time-Savings impact categories (Improved Quality / Reduced Cost / etc.). Each needs its own canonical KPI definition + measurement formula; build one at a time as Hub admins create the KPIs.
- Hub UI changes (Kurt's repo). The "auto-fill" lives entirely in the data layer; the existing Hub UI renders `initiative_kpis` rows as-is.
- Locking out manual edits in Hub UI. Users can still type Expected Impact (Hours); next auto-sync overwrites it. If we want a "lock" / "frozen" mode for owner overrides, that's a Hub schema change + a separate session.
- Dual-track (Option C) `measured_impact_hours` column. Defer until we have UI bandwidth.

---

## Quick reference (fresh session won't have memory of these)

```
Live URLs
  Hub (VPN):              https://thehub.gue5ty.com/
  Hub (Cloud Run direct): https://ai-innovation-hub-hoepmeihvq-uc.a.run.app/
  Hub Supabase:           ilhlkseqwparwdwhzcek
  n8n-ops Cloud Run:      https://n8n-ops-fhehssni7q-ew.a.run.app  (rev n8n-ops-00007-tmm)
  Edge Function:          n8n-conversation-callback v10 (live)

Marketing Time Saved KPI
  kpi_id:           e6f47f5b-5de7-4630-84b5-441741270e53
  Secret Manager:   kpi-webhook-token-e6f47f5b-5de7-4630-84b5-441741270e53
  Webhook URL:      https://ilhlkseqwparwdwhzcek.supabase.co/functions/v1/kpi-webhook-ingest

OIDC token helper (gcloud's print-identity-token doesn't carry email claim; n8n-ops's
requireOidc middleware requires it). Use IAM Credentials REST:

  SVC_URL="https://n8n-ops-fhehssni7q-ew.a.run.app"
  SA="n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com"
  ACCESS=$(gcloud auth print-access-token 2>/dev/null)
  TOKEN=$(curl -s -X POST \
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:generateIdToken" \
    -H "Authorization: Bearer ${ACCESS}" -H "Content-Type: application/json" \
    -d "{\"audience\":\"${SVC_URL}\",\"includeEmail\":true}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

Supabase service role + URL secrets (in GCP Secret Manager):
  supabase-hub-url           → https://ilhlkseqwparwdwhzcek.supabase.co
  supabase-hub-service-role  → service-role JWT (write-capable)

BQ tables:
  agentic-workflows-485210.n8n_ops.workflows           (SCD2 dim — has time_saved_per_execution_min)
  agentic-workflows-485210.n8n_ops.daily_workflow_stats (per-day execution counts)
  agentic-workflows-485210.n8n_ops.executions          (raw — fine-grained)
```

---

## Effort estimate

- Code + dry-run + live verify: ~2-3 hours.
- Decision-log + README + commit + push + Kurt notification: another ~30 min.
- Total: half-a-session.
