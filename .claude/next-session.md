# Next session brief — n8n-ops v0.3 deploy (Time Saved KPI v2 + zombie sweeper + sync-hub stub-row)

**Last touched:** 2026-05-12 (post Time Saved KPI v2 code complete). Bundles Sessions 7 + 8's code into one deploy.

## What you're picking up

Two sessions of code now sit `tsc`-clean in `Agentic Workflows/services/n8n-ops/` but the Cloud Run service is still on revision `n8n-ops-00005-fkt` (pre-all-this-work). A single `./deploy.sh` ships:

1. **Time Saved KPI v2** (Session 8, 2026-05-12) — source-of-truth shifts from `strategic_ideas.current_process_minutes_per_run` to each n8n workflow's native `settings.timeSavedPerExecution` (mirrored into BQ workflows dim by `/ingest`). Initiative-level `expected_impact` as fallback. Two new BQ columns ALREADY ADDED to prod via migration `migration_v2_time_saved_settings.sql` (applied 2026-05-12; columns currently NULL until v2 `/ingest` runs).
2. **Time Saved KPI v1 / `/kpi-rollup` route** (Session 7, 2026-05-08) — the v2 above replaces the body of this route; the route itself + scheduler infra were Session 7.
3. **`/sweep-zombies` route + `getExecutionById`** (Session 7) — reconciles BQ rows stuck `running >6h` against n8n's per-execution API.
4. **`loop-alerts.ts` 24h cap + per-workflow grouping** (Session 7) — silences zombie-execution alert spam.
5. **(Optional) sync-hub stub-row coverage fix** — small ~12-line addition to `routes/sync-hub.ts`. Bundle here, or punt.

The first measurements for Marketing Time Saved already live in the Hub (April 37h, May 90.5h, pushed manually 2026-05-08). After the v2 deploy + a `/ingest` cycle, re-pushing April + May with the new logic will lower them to ~25h each (both initiatives fall back to `expected_impact` — none of the 7 linked workflows except `PFR LinkedIn` have a configured fixed value yet, and PFR LinkedIn had 0 April runs). Numbers rise back as workflow owners populate.

## Order of operations

1. **Verify code state.** `cd "Agentic Workflows/services/n8n-ops"` → `npm run build` clean. Spot-check the new fields propagate:
   - `src/services/n8n.ts` has `N8nWorkflowSettings.timeSavedMode` / `timeSavedPerExecution`.
   - `src/services/bigquery.ts` `WorkflowDimRow` has `time_saved_mode` / `time_saved_per_execution_min`; `syncWorkflows()` close-out diff + INSERT both reference them.
   - `src/routes/ingest.ts` `toDimRow()` lifts the two fields.
   - `src/services/supabase.ts` `listKpiInitiativeBindings` selects `expected_impact` + `impact_period`.
   - `src/routes/kpi-rollup.ts` reads from BQ workflows dim (LEFT JOIN), new audit fields `by_workflow[].source` + `by_initiative[].source`.
2. **(Optional) Apply sync-hub stub-row fix** in `routes/sync-hub.ts` — when `wfStats.length === 0`, push a stub row for today.
3. **`./deploy.sh`** from the n8n-ops dir. Watch for build success + 6 scheduler create/update lines.
4. **Manually trigger `/ingest`:**
   ```bash
   SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')
   TOKEN=$(gcloud auth print-identity-token --audiences=${SVC_URL})
   curl -X POST "${SVC_URL}/ingest" -H "Authorization: Bearer ${TOKEN}"
   ```
5. **Verify ~133 workflows have the new dim fields populated:**
   ```bash
   bq query --use_legacy_sql=false \
     'SELECT time_saved_mode, COUNT(*) FROM `agentic-workflows-485210.n8n_ops.workflows` WHERE valid_to IS NULL GROUP BY 1 ORDER BY 2 DESC'
   # Expect: ~820 NULL, ~129 "fixed", ~4 "dynamic"
   ```
6. **Spot-check PFR LinkedIn:**
   ```bash
   bq query --use_legacy_sql=false \
     'SELECT workflow_id, name, time_saved_mode, time_saved_per_execution_min
      FROM `agentic-workflows-485210.n8n_ops.workflows`
      WHERE workflow_id = "8Hi5cnriYKKbbBEB" AND valid_to IS NULL'
   # Expect: mode=fixed, value=5
   ```
7. **`/kpi-rollup` dry-run for April 2026:**
   ```bash
   curl -X POST "${SVC_URL}/kpi-rollup" -H "Authorization: Bearer ${TOKEN}" \
     -H 'Content-Type: application/json' \
     -d '{"kpiId":"e6f47f5b-5de7-4630-84b5-441741270e53","periodDate":"2026-04-01","dryRun":true}'
   ```
   Expected breakdown:
   - `by_workflow[].source` ∈ `{"workflow:fixed", "workflow:unset", "workflow:dynamic_skipped"}` (PFR LinkedIn is the only `workflow:fixed`).
   - `by_initiative[].source` = both `"initiative:expected_impact_fallback"` (PFR contributes 20, ORM contributes 5).
   - `total_hours` = 25.0.
8. **Pause for comms — DO NOT live-push yet.** Send Slack to workflow owners explaining the methodology change + the temporary number drop. Template in MEMORY.md `Where We Left Off`.
9. **Live re-push for Apr + May:** drop `dryRun` from steps 7. Hub `kpi_measurements` upserts the new values; Hub UI shows ~25h both months.
10. **Notify Kurt** he can strip the 3 baseline inputs from the StrategicIdea form.
11. **`/sweep-zombies` smoke:** `curl -X POST "${SVC_URL}/sweep-zombies" -d '{"dryRun":true}'` → expect 0 candidates (the 3 zombies were cleared 2026-05-08).

## Files

All code changes already on disk (Drive sync). `Agentic Workflows` is NOT a git repo so these live on Drive only:

- `Agentic Workflows/workflows/n8n_kpi_ingestion/migration_v2_time_saved_settings.sql` (already applied to prod BQ)
- `Agentic Workflows/services/n8n-ops/src/services/n8n.ts`
- `Agentic Workflows/services/n8n-ops/src/services/bigquery.ts`
- `Agentic Workflows/services/n8n-ops/src/routes/ingest.ts`
- `Agentic Workflows/services/n8n-ops/src/services/supabase.ts`
- `Agentic Workflows/services/n8n-ops/src/routes/kpi-rollup.ts` (rewritten for v2)
- `Agentic Workflows/services/n8n-ops/src/routes/sweep-zombies.ts` (Session 7)
- `Agentic Workflows/services/n8n-ops/src/routes/loop-alerts.ts` (Session 7)
- `Agentic Workflows/services/n8n-ops/src/index.ts` (Session 7 — wires the 2 new routes)
- `Agentic Workflows/services/n8n-ops/deploy.sh` (Session 7 — 6th scheduler)
- `Agentic Workflows/services/n8n-ops/README.md` (Session 7 + 8)

## Out of scope

- Re-pushing historical periods other than April 2026 + May 2026.
- Backfilling `kpi_measurements` for periods before April 2026.
- Building the Hub-side breakdown UI (Kurt's Phase 4 v2 — separate).

## After-deploy followups (separate sessions)

- **chat-ui PR**: stop auto-extracting `current_process_minutes_per_run` / `_runs_per_month` / `_people_count` in the planning whitelist (audit finding J — harmless drift, but cleaner).
- **Investigate `timeSavedMode='dynamic'` semantics.** Currently treated as skip + fallback. If it actually means "use real execution duration", that's an additive change to `/kpi-rollup`.
- **Audit endpoint** `GET /kpi-rollup/audit?kpiId=…` listing every linked workflow's source state — useful for Ron + workflow owners. Trivial follow-up.
- **Feedback-loop harvest** — Apr 15 last run, weekly cadence — currently overdue ~4 weeks.

## User preferences (carried forward)

- **Direct + terse.** No fluff.
- **Will commit + push autonomously** when given approval.
- **`gcloud auth` expires periodically.** When deploys fail with "Reauthentication failed", user re-auths interactively.
- **Quality bar:** verify against live DB / live API before coding queries. Confirmed twice now (Session 7's `kpi_initiative_contributions` correction; Session 8's discovery of native n8n `timeSavedMode` fields).

## Quick reference

```
Live URLs
  Hub (VPN):              https://thehub.gue5ty.com/
  chat-ui:                https://n8n-chat-ui-535171325336.europe-west1.run.app
  n8n-ops (current rev):  https://n8n-ops-fhehssni7q-ew.a.run.app (rev n8n-ops-00005-fkt)
  Hub Supabase:           ilhlkseqwparwdwhzcek
  n8n-ops repo:           Agentic Workflows/services/n8n-ops/

Marketing Time Saved KPI
  kpi_id:           e6f47f5b-5de7-4630-84b5-441741270e53
  Secret Manager:   kpi-webhook-token-e6f47f5b-5de7-4630-84b5-441741270e53  (active)
  Hub link:         https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53
  Linked workflows: BBzxZi0MYnnPjkLm (PFR ongoing), XWMR0NMk1XBD4aU7ZPusK (PFR Social Proof),
                    8Hi5cnriYKKbbBEB (PFR LinkedIn — fixed:5min ✅), 751dalHime7H3X8O (ORM dynamic),
                    PLRJtK8od54KiyuY (ORM Reviews), sf4Kp6kf4HZOmcsb (ORM analysis fixed:no-value),
                    6DVVTMgx57sQ99BW (TrustPilot)
  Linked initiatives: cd0945c8-... (PFR Celebration, expected_impact=20 monthly),
                      f0fe18e6-... (ORM analysis & insights, expected_impact=5 monthly)
```

## Estimated effort

45 min total: 5 min code verify + 10 min deploy + 10 min ingest + dim-spot-check + 10 min dry-run inspect + 10 min comms + live push.
