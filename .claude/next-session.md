# Next session brief — Sync-hub coverage fix (n8n-ops stub-row push)

**Last touched:** 2026-05-08 (post-Session 6 Jira ship). Re-derived from `.claude/session-queue.md` HEAD.

## What you're picking up

Workflow `MJhuTMoNzvfC3V3G` ("Article translations sub-workflow") is `active: false, isArchived: true`. Zero executions in 14 days → no rows in `daily_workflow_stats` → `wfStats` empty in [n8n-ops/src/routes/sync-hub.ts:96](../../Agentic%20Workflows/services/n8n-ops/src/routes/sync-hub.ts) → vanishes from the Hub WorkflowHealthCard. Diagnosed in Session 2 ([docs/sync-hub-coverage-fix.md](../docs/sync-hub-coverage-fix.md)).

The fix is small (~12 lines): when `wfStats.length === 0`, push a stub row for today with all-null/zero metrics. The Hub aggregator already returns `health: 'unknown'` for null `success_rate_pct`, so the card renders cleanly without further changes.

## Quick context

The Hub's `WorkflowHealthCard` has been the focus of multiple sessions because workflows that get archived or stop running fall off the dashboard entirely instead of degrading gracefully. This fix closes that final coverage gap so the demo trio (3 linked workflows) all show stats even when one is archived.

## Order of operations

1. **Verify the diagnosis still holds.** Quick BQ query against `daily_workflow_stats` for `MJhuTMoNzvfC3V3G` confirms zero rows.
2. **Edit [n8n-ops/src/routes/sync-hub.ts](../../Agentic%20Workflows/services/n8n-ops/src/routes/sync-hub.ts).** When iterating workflow links, if a workflow id has no stats rows, synthesize a stub row `{ workflow_id, period_date: today, total_runs: 0, success_runs: 0, error_runs: 0, success_rate_pct: null, p95_duration_sec: null, last_run_at: null, synced_at: now }`. Insert via the same upsert path the cron uses.
3. **Manual cron re-run.** Hit the `/sync-hub` endpoint manually (auth via the n8n-ops service) and confirm all 3 demo workflows now have a row in `initiative_workflow_stats`.
4. **Verify in Hub.** Open the demo initiative; the WorkflowHealthCard now lists all linked workflows including the archived one (with "no data" / unknown health).

## Files

- `Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts` (the only edit)
- Optional: `Agentic Workflows/services/n8n-ops/src/services/bigquery.ts` if the stub-insert path needs a helper

## Out of scope

- Backfilling historical periods for `MJhuTMoNzvfC3V3G` — only today's stub is needed; older windows can stay empty.
- Distinguishing archived from genuinely-zero-runs workflows in the Hub UI — leave as `health='unknown'`. UI changes are a separate session if anyone wants finer-grained "archived" pill.

## Adjacent items also worth picking up if time permits

- **Feedback-loop harvest.** Last harvest was 2026-04-15, weekly cadence — currently ~23 days overdue per [feedback-loop/STATE.md](../feedback-loop/STATE.md). Run `cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts`. The 51 candidates from Apr 15 are still pending review; this session would compound on top of that.
- **Legacy `strategic_ideas.jira_link` migration.** Session 6 left the legacy single-column `jira_link` alongside the new multi-link `initiative_jira_links` table. UX confusion ("which field?") is real but acceptable for MVP — track this as a small follow-up to backfill into the new table and drop the column once usage data justifies it.
- **Jira write-path verification.** Session 6 end-of-session data check: `initiative_jira_links` has 0 rows. The picker UI was demonstrated live (CXAU-247 fetched via Edge Function — visible in screenshot) but the user didn't click Save, so the write path through `replaceJiraLinksForInitiative` hasn't been exercised by real user flow yet. Quick smoke any time: open an initiative → add a real ticket → save → re-open and confirm the JiraTicketCard renders. Should take 60 seconds.

## User preferences (carried forward from prior sessions)

- **Direct + terse.** No fluff, no end-of-turn summaries unless meaningful.
- **"Go ahead in order"** = autonomous progression through phases.
- **Will commit + push autonomously** when given approval.
- **`gcloud auth` expires periodically.** When deploys fail with "Reauthentication failed", user re-auths interactively.
- **Loops:** comfortable with `<<autonomous-loop-dynamic>>` wakeups for waiting on long builds.
- **Quality bar:** trace bugs to root cause from code, not from logs alone.

## Quick reference

```
Live URLs
  Hub (VPN):           https://thehub.gue5ty.com/
  Hub (no VPN):        https://ai-innovation-hub-721337864706.us-central1.run.app  (revision ai-innovation-hub-00098-xdx as of 2026-05-08)
  chat-ui:             https://n8n-chat-ui-535171325336.europe-west1.run.app  (revision n8n-chat-ui-00044-ncm as of 2026-05-08)
  n8n-ops:             https://n8n-ops-fhehssni7q-ew.a.run.app
  Hub repo (sibling):  /Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex
  Hub Supabase:        ilhlkseqwparwdwhzcek
  n8n-ops repo:        Agentic Workflows/services/n8n-ops/

Hub Cloud Build approval (when needed)
  gcloud beta builds list --project=ai-innovation-484111 --limit=3 --format="value(id,status,substitutions.COMMIT_SHA)"
  gcloud beta builds approve <id> --project=ai-innovation-484111

n8n-ops trigger
  curl -X POST "https://n8n-ops-fhehssni7q-ew.a.run.app/sync-hub" -H "Authorization: Bearer $TOKEN"
```

## Estimated effort

30 min code + manual cron re-run + verify. If the harvest is bundled, add 1–2 h.
