# sync-hub coverage fix — workflow `MJhuTMoNzvfC3V3G`

**Status:** Diagnosis only (Phase 5 of Session 2). No code shipped. Fix is a 1-PR change in `n8n-ops` and a redeploy.

## Symptom

Demo initiative `00984539-dfab-4fee-8531-36e18ff5e429` has 3 linked workflows in `initiative_workflow_links`. Only 2 of 3 surface in `initiative_workflow_stats` — and consequently in the Hub `WorkflowHealthCard`. The missing one is `MJhuTMoNzvfC3V3G` ("Article translations - All").

## Root cause

Confirmed via `mcp__n8n-mcp__n8n_get_workflow`:

```
{ "id": "MJhuTMoNzvfC3V3G", "active": false, "isArchived": true, "updatedAt": "2026-03-19" }
```

The workflow is **archived + inactive**. It has not executed in over 14 days, so the BQ source `n8n_ops.daily_workflow_stats` returns zero rows for it.

In [Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts:96](Agentic%20Workflows/services/n8n-ops/src/routes/sync-hub.ts):

```ts
const wfStats = stats.filter((s) => s.workflow_id === link.n8n_workflow_id);
for (const s of wfStats) {  // ← empty array → loop body never runs
  rows.push({...});
}
```

When `wfStats.length === 0`, no row is pushed. The workflow disappears from `initiative_workflow_stats`, and the Hub's `WorkflowHealthCard` (which `select * from initiative_workflow_stats where initiative_id=…`) drops it from the rendered list.

## Recommended fix (n8n-ops only)

After the inner `for (const s of wfStats)` loop, push a stub row for today when `wfStats.length === 0`:

```ts
for (const link of links) {
  const wfStats = stats.filter((s) => s.workflow_id === link.n8n_workflow_id);
  if (wfStats.length === 0) {
    // Archived/inactive workflows with no executions in the last 14 days still
    // belong on the Hub WorkflowHealthCard as "No data". One stub row per
    // (initiative, workflow) so the Hub can render a row + health=unknown.
    rows.push({
      initiative_id: link.initiative_id,
      n8n_workflow_id: link.n8n_workflow_id,
      period_date: new Date().toISOString().slice(0, 10),
      total_runs: 0,
      success_runs: 0,
      error_runs: 0,
      success_rate_pct: null,
      p50_duration_sec: null,
      p95_duration_sec: null,
      loop_alert_count: 0,
      stuck_alert_count: 0,
      last_run_at: null,
    });
    continue;
  }
  for (const s of wfStats) { /* existing */ }
}
```

The Hub's [services/initiativeWorkflowStats.ts:42 `computeHealthFlag`](Code/AI-Innovation-Hub-Vertex/services/initiativeWorkflowStats.ts) already returns `'unknown'` when `success_rate_pct` is null — the existing UI handles this case (`HEALTH_LABEL.unknown = 'No data'`).

## Why not fix Hub-side instead

Alternative: extend the Hub's `WorkflowHealthCard` to list all linked workflows even if absent from `initiative_workflow_stats`. That requires a join across `initiative_workflow_links` + `initiative_workflow_stats` and a Hub deploy. The n8n-ops fix is smaller, contained to one repo, and produces a row the Hub UI already knows how to render. **Recommend the n8n-ops fix.**

## Estimated effort

- Code change: ~12 lines in `n8n-ops/src/routes/sync-hub.ts`
- Tests: extend any existing sync-hub integration test (if present) with a stub-row case; otherwise add a unit test on the row-assembly logic
- Deploy: `gcloud run deploy n8n-ops` from existing pipeline; revision should be `n8n-ops-00005-…`
- Verify: `curl https://n8n-ops-fhehssni7q-ew.a.run.app/sync-hub` (OIDC) and confirm `MJhuTMoNzvfC3V3G` appears in `initiative_workflow_stats` after.

## Why deferred to a separate session

Session 2's directive is "Hub production stability is the highest priority". n8n-ops lives in a separate repo with its own review/deploy gate. Bundling the fix here would (a) compound deploy risk during the Direction-2 ship, and (b) force a `gcloud run deploy` on a service we already touched in Session N (public `/workflows`, freshness alarm). Better to land it in a focused n8n-ops PR after Direction-2 is settled in Hub production.
