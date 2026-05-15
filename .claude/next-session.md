# Next session brief — Auto-fill the per-initiative "Contributes to" KPI card

**Last touched:** 2026-05-15 (planning only; context was running thin so we deferred execution to a fresh session).

## What you're picking up

Ron + Kurt's direction is "users shouldn't have to type Expected Impact (Hours) into the Hub's KPI Tracking card on each initiative — we have the data, populate it automatically." This session designs + builds that auto-fill flow.

**Full design + decisions + verification steps live in:** [`.claude/plans/2026-05-15-initiative-kpi-auto-sync.md`](plans/2026-05-15-initiative-kpi-auto-sync.md).

**Read that first.** It contains:
- The flow diagram + procedure (skip checks → resolve KPI → compute → upsert)
- The three conflict-policy options (A: auto-overwrite, B: respect manual, C: dual-track schema)
- File-level implementation map
- Verification commands
- Quick-reference URLs/IDs + OIDC token helper

## Single decision to lock in before coding

**Conflict policy when an `initiative_kpis` row exists with a manual `expected_impact`** (today: Ron set 20h on PFR Celebration, 5h on ORM analysis; live data measures ~1h and ~47h respectively).

The plan recommends **Option A (auto-overwrite)** as the default. If you concur, the implementation is straightforward (~2-3 hours). If you want Option B or C, the plan documents the additional code/schema work needed.

## What's already shipped (do NOT redo)

- Marketing Time Saved KPI live in Hub at `/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53` (April 38 h, May 88 h).
- n8n-ops Cloud Run service at `n8n-ops-00007-tmm`. Routes: `/ingest`, `/loop-alerts`, `/weekly-digest`, `/sync-hub`, `/sweep-zombies`, `/kpi-rollup`, plus `/workflows` + `/suggest-links`.
- 111 n8n workflows bulk-populated with `settings.timeSavedPerExecution` via node-count heuristic. 24 errored (documented in decision-log).
- Hub PR #51 merged — "Baseline Metrics" form section stripped. Cloud Build `00104-nsw` live.
- chat-ui PR #2 commit `1564204` + follow-ups — planning whitelist clean.
- Edge Function `n8n-conversation-callback` v10 — empty `numberSpec`.

## What's pending in the cleanup queue (lower priority than the main task)

1. **Feedback-loop harvest** — Apr 15 last run, weekly cadence — currently overdue ~30 days. Run `cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts`.
2. **24 errored workflows from the bulk populate** — 21 IS production + 2 Cura (API key scope) + 1 self-conflicting webhook in CS. Revisit when affected dept's KPI lands in Hub.
3. **Kurt DM** — drafted in Slack channel `D0A9V1YRRQT` since 2026-05-13. Send when ready.

## Files most relevant to this task

**Read these first** (they show the existing patterns to mirror):
- [`Agentic Workflows/services/n8n-ops/src/routes/kpi-rollup.ts`](../../Agentic%20Workflows/services/n8n-ops/src/routes/kpi-rollup.ts) — the most similar existing route. Mirror its shape: dry-run flag, BQ-driven computation, Supabase write, structured logging.
- [`Agentic Workflows/services/n8n-ops/src/routes/sync-hub.ts`](../../Agentic%20Workflows/services/n8n-ops/src/routes/sync-hub.ts) — where to fold the new auto-sync call so it runs daily 06:15 UTC.
- [`Agentic Workflows/services/n8n-ops/src/services/supabase.ts`](../../Agentic%20Workflows/services/n8n-ops/src/services/supabase.ts) — Hub Supabase REST client. Add helpers here (don't introduce a different client).
- [`Agentic Workflows/services/n8n-ops/src/services/bigquery.ts`](../../Agentic%20Workflows/services/n8n-ops/src/services/bigquery.ts) — `runQuery` + `fq` helpers; reuse the workflows dim + daily_workflow_stats join pattern from `kpi-rollup.ts`.
- [`docs/decision-log.md`](../docs/decision-log.md) — full architectural history (entries 2026-05-08 through 2026-05-14). Reference, don't re-read end-to-end.

## User preferences (carried forward)

- **Direct + terse.** No fluff.
- **Verify-before-destructive** especially when writing to live Hub data. Dry-run first; eyeball the planned upserts; then apply.
- **`gcloud auth` expires periodically.** When it does, user runs `gcloud auth login` interactively. The OIDC token helper in the plan file uses IAM Credentials REST (carries `email` claim, which n8n-ops's `requireOidc` middleware requires).
- **Will commit + push autonomously** when given approval.

## Estimated effort

Half-a-session (~2-3 hours code + 30 min docs/commit) if Option A is approved on the conflict policy. Longer if Option C dual-track is chosen (becomes a 3-PR sequence including a Hub schema migration + Kurt UI work).
