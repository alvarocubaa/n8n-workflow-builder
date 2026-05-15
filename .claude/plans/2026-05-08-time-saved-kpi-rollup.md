# Plan — Time Saved KPI source + n8n-ops stuck-alert fix

Two tracks. (A) Build the n8n measurement layer that feeds the Hub's "Time Saved" KPI via the existing `kpi-webhook-ingest` Edge Function — **as a new endpoint in the existing `n8n-ops` Cloud Run service**, reusing what's already there. (B) Fix the n8n-ops Slack spam where zombie running executions re-alert every 60 min.

---

## Context

**What's already running** (most of the foundation is in place — this plan plugs into it):

- `Agentic Workflows/services/n8n-ops` Cloud Run service does four things on schedulers:
  - `POST /ingest` every 15 min — pulls n8n executions into BQ `agentic-workflows-485210.n8n_ops.executions` (MERGE, idempotent).
  - `POST /loop-alerts` every 10 min — writes alerts to Slack `#n8n-ops` (this is the source of the spam).
  - `POST /weekly-digest` Mondays 09:00 — Slack digest.
  - `POST /sync-hub` daily 06:15 UTC — **upserts per-initiative workflow stats to Hub Supabase `initiative_workflow_stats`**.
- The service already has Supabase service-role key + BQ ADC + Slack bot token wired through Secret Manager. SA: `n8n-ops-sa@agentic-workflows-485210.iam.gserviceaccount.com`.
- `GET /suggest-links?threshold=0.6` already fuzzy-matches initiatives ↔ workflows for the Hub.
- BQ has a daily-rollup table `n8n_ops.daily_workflow_stats` (per workflow, per day). Plus a parallel safety-net Python Cloud Function `n8n_kpi_freshness_alarm` for staleness alerts.
- Hub side: Phase 1 (canonical KPI registry + webhook ingest), Phase 2 (`kpi_initiative_contributions` linking initiatives → KPIs), and Phase 2.5 are LIVE in prod. Webhook contract for ingest is locked: `POST kpi-webhook-ingest` with `Authorization: Bearer <token>`, body `{ period_date, value, notes? }`. Token binds to one `kpi_id` server-side.
- Hub specs explicitly carve out **"Phase 5 (n8n Time-Saved consumption with Alvaro)"** — that's this work.
- Ron created a Marketing **"Time Saved"** KPI and linked initiatives to it; ready to receive numbers.

**The n8n_kpi_loop_alerts n8n workflow** in `Agentic Workflows/workflows/n8n_kpi_loop_alerts/` is **inactive** — it was Meir's blocked version, superseded by the Cloud Run service. Don't touch it.

**The bug.** `services/n8n-ops/src/routes/loop-alerts.ts` (and equivalent SQL in the legacy workflow) flags any `executions` row with `status='running'` and `started_at < 30min ago`, with a 60-min dedup. When BQ rows are *zombie-running* (the execution actually died but the BQ row was never updated to a terminal status because it fell outside `/api/v1/executions` pagination), the alert refires every 60 min forever. Zombies happen when n8n's API stops returning a stuck row (older than the ingest checkpoint window in `n8n.ts`'s `listExecutionsSince`). Today's spam: workflow `CkmAmA31lNYVpr0E` ("QA production hourly @ Omri Algazi"), executions 30156 (since 2026-05-05), 30402 (since 2026-05-05), 36783 (since 2026-05-07) — all >4000 min "running" and growing.

---

## Track A — Add `/kpi-rollup` to the existing `n8n-ops` service

### A.1 Why colocate (vs. add to chat-ui)

`n8n-ops` already has all four things this rollup needs:

1. BQ ADC for the `n8n_ops.daily_workflow_stats` read.
2. Hub Supabase **service-role** key (for reading `kpi_initiative_contributions`, `strategic_ideas`, `initiative_workflow_stats`).
3. Cloud Scheduler integration (deploy.sh creates jobs).
4. Established Slack alerting path for failures.

`chat-ui` would need a new Supabase service-role secret, a new scheduler, and would mix a backend cron concern into a user-facing app. So the new endpoint goes in `n8n-ops`.

### A.2 Webhook contract (locked, do not redesign)

```
POST https://ilhlkseqwparwdwhzcek.supabase.co/functions/v1/kpi-webhook-ingest
Authorization: Bearer <raw_token>
Content-Type: application/json

{ "period_date": "2026-04-01", "value": 128.75, "notes": "n8n monthly rollup, run_id=<uuid>" }
```

Source: [`AI-Innovation-Hub-Vertex/supabase/functions/kpi-webhook-ingest/index.ts`](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/blob/main/supabase/functions/kpi-webhook-ingest/index.ts). Token is per-KPI; manual/csv rows are immutable; rate-limit 60 req/min/token.

### A.3 New files in `services/n8n-ops/`

- **`src/routes/kpi-rollup.ts`** — `POST /kpi-rollup`. Body: `{ kpiId?: string, periodDate?: 'YYYY-MM-01', dryRun?: boolean }`. If no `kpiId` → iterate every KPI in `kpis` with `data_source_type='webhook' AND data_source_label LIKE 'n8n%'` (label convention so we don't push to KPIs whose webhook isn't ours). For each KPI:
  1. Query Hub Supabase via service role:
     ```sql
     SELECT s.id              AS initiative_id,
            s.title,
            s.current_process_minutes_per_run,
            iws.workflow_id
     FROM kpi_initiative_contributions kic
     JOIN strategic_ideas s            ON s.id = kic.initiative_id
     LEFT JOIN initiative_workflow_stats iws ON iws.initiative_id = s.id
     WHERE kic.kpi_id = $1;
     ```
  2. Query BQ for execution counts in `[periodDate, periodDate + 1 month)`:
     ```sql
     SELECT workflow_id, SUM(success_runs) AS executions
     FROM `agentic-workflows-485210.n8n_ops.daily_workflow_stats`
     WHERE day >= @start AND day < @end
       AND workflow_id IN UNNEST(@ids)
     GROUP BY workflow_id
     ```
     Decision: count `success_runs`, not `total_runs` — failed runs don't save anyone time, and the Hub spec implicitly assumes successful runs.
  3. Compute hours: `Σ executions × minutes_per_run / 60`. Default `minutes_per_run = 30` if NULL on the initiative (logged in the `notes` field on the webhook so the row is auditable). Multiple initiatives sharing the same workflow → attribute the workflow's hours to **the first initiative** linked (deterministic; Hub-side breakdown table will be cleaner once `kpi_initiative_contributions` enforces uniqueness).
  4. Read per-KPI Bearer from Secret Manager (`kpi-webhook-token-<kpi_id>`); abort that KPI if secret missing (don't fail the whole batch).
  5. POST to `kpi-webhook-ingest`. Log `{ kpi_id, period_date, hours, accepted, run_id, byInitiative, byWorkflow }`.
  6. On any 401/4xx/5xx → post a single `:warning:` message to `#n8n-ops` with the failed KPI list. (Reuses existing `slack.ts`.)

  Dry-run mode: skip the POST, return the full breakdown JSON in the response so we can eyeball it.

- **`src/services/hub-supabase.ts`** — `query<T>(sql, params)` thin REST wrapper around the Supabase SQL endpoint OR `@supabase/supabase-js` (already a dep candidate). Reuses existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars.

- **`src/services/secret-manager.ts`** — `getSecret(name)` cached lookup via `@google-cloud/secret-manager`. Used for the per-KPI webhook tokens.

- **`src/index.ts`** — wire `POST /kpi-rollup` into the express router with the same OIDC-from-scheduler auth gate as the other routes.

- **`deploy.sh`** — add a fifth Cloud Scheduler job:
  ```bash
  gcloud scheduler jobs create http n8n-ops-kpi-rollup \
    --location=europe-west1 --project=agentic-workflows-485210 \
    --schedule="0 2 1 * *" --time-zone="UTC" \
    --uri="${SERVICE_URL}/kpi-rollup" --http-method=POST \
    --headers="Content-Type=application/json" --message-body='{}' \
    --oidc-service-account-email="${SCHEDULER_SA}" --oidc-token-audience="${SERVICE_URL}"
  ```
  Idempotent on re-runs (use `describe || create / update`).

### A.4 Token / KPI bootstrap (one-time, manual per KPI)

When Kurt rotates a token in the Hub UI for a webhook KPI:

```bash
echo -n "<raw_token>" | gcloud secrets create kpi-webhook-token-<kpi_id> \
  --data-file=- --project=agentic-workflows-485210
gcloud secrets add-iam-policy-binding kpi-webhook-token-<kpi_id> \
  --member="serviceAccount:n8n-ops-sa@agentic-workflows-485210.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Document in `services/n8n-ops/README.md` under a new "KPI rollup" section. Hub admins (Kurt) own when to onboard a new KPI to the rollup; the n8n-ops side picks them up automatically as long as `data_source_label` starts with `n8n` and the secret exists.

### A.5 Optional v1.5 (deferred — out of this plan's scope)

Ron's longer spec mentions a richer pull endpoint returning `by_initiative` + `by_workflow` breakdown. The Hub's Phase 4 v2 detail page (`/business-kpis/:kpiId`) doesn't currently consume it — when it does, expose the same intermediate shape from `kpi-rollup.ts` over a `GET /kpi-rollup/:kpi_id?period_start=…&period_end=…` route. No new logic needed.

---

## Track B — n8n-ops stuck-alert fix

Files: [`services/n8n-ops/src/routes/loop-alerts.ts`](../Agentic%20Workflows/services/n8n-ops/src/routes/loop-alerts.ts), [`src/services/bigquery.ts`](../Agentic%20Workflows/services/n8n-ops/src/services/bigquery.ts), [`src/services/n8n.ts`](../Agentic%20Workflows/services/n8n-ops/src/services/n8n.ts), [`src/index.ts`](../Agentic%20Workflows/services/n8n-ops/src/index.ts).

### B.1 Three changes, one PR

1. **Cap zombie age in `loop-alerts.ts:20-32`.** Add `AND e.started_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)` to the stuck-running INSERT. After 24 hours the alert goes silent for that execution; if it's actually still running after 24h, the trigger-loop heuristic catches it via volume; if it's a zombie, we stop spamming.

2. **Collapse per-workflow in `loop-alerts.ts:20-32`.** Today the same workflow with 3 stuck executions emits 3 separate Slack lines (visible in the screenshot). Change the SELECT to `GROUP BY e.workflow_id`, aggregate `ANY_VALUE(e.id) AS execution_id, COUNT(*) AS stuck_count, MAX(running_minutes) AS running_minutes`. Update `formatAlert` to render `Stuck workflow (N executions)`.

3. **Root cause: new `POST /sweep-zombies` route.** New file `src/routes/sweep-zombies.ts`. For each BQ row in `executions` with `status='running' AND started_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 6 HOUR)`, call `GET /api/v1/executions/{id}` directly via existing n8n client (add `getExecutionById(id)` to `n8n.ts`). Reconcile:
   - 200 with terminal status → MERGE-update the BQ row.
   - 404 → mark `status='abandoned'` (additive new value, no schema change needed since the column is text; document in handoff.md).
   - Other / network error → leave the row, log, continue.
   Cloud Scheduler `*/30 * * * *`. Add to `deploy.sh`.

### B.2 One-time remediation (run *before* deploying B.1/B.2)

```bash
bq --project_id=agentic-workflows-485210 --location=EU query --use_legacy_sql=false \
  'UPDATE `agentic-workflows-485210.n8n_ops.executions`
   SET status = "abandoned", stopped_at = CURRENT_TIMESTAMP()
   WHERE id IN ("30156","30402","36783")'
```

Slack should go silent within the next `/loop-alerts` tick.

---

## Critical files

**Track A (new):**
- `Agentic Workflows/services/n8n-ops/src/routes/kpi-rollup.ts` (new)
- `Agentic Workflows/services/n8n-ops/src/services/hub-supabase.ts` (new)
- `Agentic Workflows/services/n8n-ops/src/services/secret-manager.ts` (new)
- `Agentic Workflows/services/n8n-ops/src/index.ts` (modify — add route)
- `Agentic Workflows/services/n8n-ops/deploy.sh` (modify — 5th scheduler)
- `Agentic Workflows/services/n8n-ops/README.md` (modify — KPI rollup section)
- `Agentic Workflows/services/n8n-ops/package.json` (modify — add `@google-cloud/secret-manager`, `@supabase/supabase-js` if not already present)

**Track B (modify):**
- `Agentic Workflows/services/n8n-ops/src/routes/loop-alerts.ts` (B.1 + B.2)
- `Agentic Workflows/services/n8n-ops/src/services/n8n.ts` (B.3 — add `getExecutionById`)
- `Agentic Workflows/services/n8n-ops/src/routes/sweep-zombies.ts` (new)
- `Agentic Workflows/services/n8n-ops/src/index.ts` (wire route)
- `Agentic Workflows/services/n8n-ops/deploy.sh` (6th scheduler)

**Reused, not modified:**
- [`services/n8n-ops/src/services/bigquery.ts`](../Agentic%20Workflows/services/n8n-ops/src/services/bigquery.ts) — `runQuery`, `fq`, MERGE template.
- [`services/n8n-ops/src/services/slack.ts`](../Agentic%20Workflows/services/n8n-ops/src/services/slack.ts) — `postSlack`.
- [`services/n8n-ops/src/auth.ts`](../Agentic%20Workflows/services/n8n-ops/src/auth.ts) — OIDC bearer gate.
- BQ table `agentic-workflows-485210.n8n_ops.daily_workflow_stats` — already populated daily by `daily_rollup.sql`.
- Hub Supabase tables `kpi_initiative_contributions`, `strategic_ideas`, `initiative_workflow_stats`, `kpi_webhook_tokens` (read-only).

---

## Verification

```bash
SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 \
  --project=agentic-workflows-485210 --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token --audiences=${SVC_URL})

# 1) Track A dry-run for the Marketing Time Saved KPI, Apr 2026
curl -X POST "${SVC_URL}/kpi-rollup" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"kpiId":"<marketing-time-saved-uuid>","periodDate":"2026-04-01","dryRun":true}'
# → { dryRun: true, hours: 128.75, byInitiative: [...], byWorkflow: [...] }

# 2) Track A live push
curl -X POST "${SVC_URL}/kpi-rollup" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"kpiId":"<uuid>","periodDate":"2026-04-01"}'
# → { results: [{ kpi_id, run_id, accepted: 1, hours }] }

# 3) Hub UI: open /business-kpis/<uuid> — Apr 2026 measurement should render.

# 4) Track B remediation now
bq query --use_legacy_sql=false 'UPDATE `agentic-workflows-485210.n8n_ops.executions` SET status="abandoned", stopped_at=CURRENT_TIMESTAMP() WHERE id IN ("30156","30402","36783")'
# Within 10 min, no more "Stuck running workflow" Slack messages for that workflow.

# 5) After /sweep-zombies deploy
curl -X POST "${SVC_URL}/sweep-zombies" -H "Authorization: Bearer ${TOKEN}"
# Inspect logs: "[sweep-zombies] reconciled N rows; abandoned M".

# 6) Scheduler check
gcloud scheduler jobs run n8n-ops-kpi-rollup --location=europe-west1
gcloud scheduler jobs run n8n-ops-sweep-zombies --location=europe-west1
```

---

## Open items / questions for the user

- Confirm MVP scope = the Marketing "Time Saved" KPI Ron seeded; richer pull endpoint deferred.
- Need from Kurt: (a) `kpi_id` UUID for Marketing Time Saved, (b) freshly-rotated webhook token (we drop into Secret Manager once), (c) confirmation that `data_source_label` for it begins with `n8n` (e.g. `"n8n: monthly rollup"`) so the rollup picks it up automatically, or pin it explicitly via `kpiId` per-call.
- Confirm `current_process_minutes_per_run` from `strategic_ideas` is the right per-execution number (or if Ron has a different per-initiative time-saved number planned).
- Track A and Track B both live in `Agentic Workflows/services/n8n-ops`. Confirm we ship both in one PR / one deploy or split (A is monthly-cadence; B is the urgent fix — splitting is fine).
