# Next session brief — n8n-ops v0.2 deploy (Time Saved KPI rollup + zombie sweeper + sync-hub stub-row)

**Last touched:** 2026-05-08 (post-Session 7 Time Saved KPI ship). Re-derived from `.claude/session-queue.md` HEAD.

## What you're picking up

Session 7 wrote all the code for the Time Saved KPI rollup pipeline + n8n-ops zombie-alert fixes. **Code is complete and `tsc`-clean but the Cloud Run service has NOT been redeployed.** The first measurements landed in the Hub today via manual `curl` to `kpi-webhook-ingest` (April 37 h, May 90.5 h), but the cron + the zombie sweeper + the alert fixes only become live after `./deploy.sh` runs.

Bundle the deferred sync-hub stub-row coverage fix (Session 2 Phase 5) into the same deploy — same repo, ~12 lines, no reason to deploy twice.

## Quick context

- Affected service: `n8n-ops` Cloud Run (sibling repo at `Agentic Workflows/services/n8n-ops/`, NOT git-tracked).
- Affected schedulers: 4 existing (`-ingest`, `-loop-alerts`, `-weekly-digest`, `-sync-hub`) + 2 new (`-kpi-rollup`, `-sweep-zombies`). `deploy.sh` is idempotent (update-or-create).
- Affected SA: `n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com` (already has project-wide `secretmanager.secretAccessor` — no per-secret IAM grants needed for new KPI tokens).
- Hub side already populated by Session 7's manual writes: `data_source_label`, `current_process_minutes_per_run` on the 2 linked initiatives, 7 rows in `initiative_workflow_links` (PFR + ORM), 2 measurements, 1 active webhook token + secret in GCP Secret Manager.

## Order of operations

1. **Verify code state.** `cd "Agentic Workflows/services/n8n-ops"` → `npm run build` should be clean. Spot-check `src/routes/kpi-rollup.ts` + `src/routes/sweep-zombies.ts` exist and `deploy.sh` has 6 `schedule_or_update` lines.
2. **Apply the sync-hub stub-row fix** (~12 lines in `src/routes/sync-hub.ts`). When `wfStats.length === 0` for a workflow, push a stub row for today with all-null/zero metrics. Hub aggregator already handles `health: 'unknown'` for null `success_rate_pct`. See [docs/sync-hub-coverage-fix.md](../docs/sync-hub-coverage-fix.md).
3. **Run deploy:** `./deploy.sh` from the n8n-ops dir. Watch for `gcloud builds submit` success + 6 scheduler create/update lines.
4. **Smoke `/kpi-rollup` dry-run for April 2026:**
   ```bash
   SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')
   TOKEN=$(gcloud auth print-identity-token --audiences=${SVC_URL})
   curl -X POST "${SVC_URL}/kpi-rollup" -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
     -d '{"kpiId":"e6f47f5b-5de7-4630-84b5-441741270e53","periodDate":"2026-04-01","dryRun":true}'
   ```
   Expect `total_hours: 37.0`, byInitiative + byWorkflow populated. (No re-push needed — the April measurement already exists in `kpi_measurements`; webhook upserts on `(kpi_id, period_date)` so a re-push would just update.)
5. **Smoke `/sweep-zombies` dry-run:** `curl -X POST "${SVC_URL}/sweep-zombies" -H "Authorization: Bearer ${TOKEN}" -d '{"dryRun":true}'`. Should report 0 candidates (we cleared the 3 known zombies in Session 7's BQ remediation).
6. **Smoke `/sync-hub`** post-stub-row-fix: `curl -X POST "${SVC_URL}/sync-hub" -H "Authorization: Bearer ${TOKEN}"`. Verify archived demo workflow `MJhuTMoNzvfC3V3G` now appears in `initiative_workflow_stats` for today's date.
7. **Verify Hub UI:** open `https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53` — chart should show Apr 37h + May 90.5h. WorkflowHealthCard for the demo initiative should now list all 3 linked workflows including the archived one.

## Files

- `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts` (the only NEW edit; the rest was done in Session 7).
- `Agentic Workflows/services/n8n-ops/deploy.sh` already includes both new schedulers.
- All Session-7-touched files unchanged from end of Session 7 — no further edits expected.

## Out of scope

- Backfilling historical periods for `MJhuTMoNzvfC3V3G` — only today's stub is needed.
- Distinguishing archived vs zero-runs in Hub UI — leave as `health='unknown'`.
- Repushing April/May measurements — already in Hub.

## After-deploy followups (separate sessions)

- **Feedback-loop harvest** — Apr 15 last run, weekly cadence — currently ~23 days overdue.
- **Confirm with Ron Madar-Hallevi:** PFR full name + per-run minute estimates (15 PFR / 30 ORM) are right (we picked these from workflow names).
- **Post the Slack message** drafted in Session 7 (see MEMORY.md `Where We Left Off`) introducing the new KPI to initiative owners.

## User preferences (carried forward)

- **Direct + terse.** No fluff, no end-of-turn summaries unless meaningful.
- **"Go ahead in order"** = autonomous progression through phases.
- **Will commit + push autonomously** when given approval.
- **`gcloud auth` expires periodically.** When deploys fail with "Reauthentication failed", user re-auths interactively.
- **Quality bar:** trace bugs to root cause from code, not from logs alone. Cross-check assumptions against live DB before coding queries (see Session 7 schema-name miss).

## Quick reference

```
Live URLs
  Hub (VPN):           https://thehub.gue5ty.com/
  Hub (no VPN):        https://ai-innovation-hub-721337864706.us-central1.run.app  (revision ai-innovation-hub-00098-xdx as of 2026-05-08)
  chat-ui:             https://n8n-chat-ui-535171325336.europe-west1.run.app  (revision n8n-chat-ui-00044-ncm as of 2026-05-08)
  n8n-ops (current):   https://n8n-ops-fhehssni7q-ew.a.run.app
  Hub repo (sibling):  /Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex
  Hub Supabase:        ilhlkseqwparwdwhzcek
  n8n-ops repo:        Agentic Workflows/services/n8n-ops/

Marketing Time Saved KPI
  kpi_id:              e6f47f5b-5de7-4630-84b5-441741270e53
  Secret Manager:      kpi-webhook-token-e6f47f5b-5de7-4630-84b5-441741270e53
  Hub link:            https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53

n8n-ops trigger after deploy
  curl -X POST "${SVC_URL}/kpi-rollup" -H "Authorization: Bearer $TOKEN" -d '{"dryRun":true}'
```

## Estimated effort

45 min total (15 min sync-hub stub-row code + 20 min build + 10 min smoke). 25 min if stub-row already done.
