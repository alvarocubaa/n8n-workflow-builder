# Next session brief — Ron + Kurt follow-ups + Builder relocation (Phase 8)

**Date:** 2026-06-19 or later
**Style:** mix of async Ron/Kurt response handling + Phase 8 (Claude autonomous, deferred from 2026-06-16)

## State snapshot (what shipped 2026-06-18 — full day)

**PRD V1 Time Saved KPI revision (Ron) — fully closed end-to-end in one day.** All 26 of 26 acceptance criteria shipped, deployed, and audited live. Full detail in [`~/Code/n8n-ops/docs/decision-log.md`](file:///Users/alvaro.cuba/Code/n8n-ops/docs/decision-log.md) (2026-06-18 entries) and memory file `prd-v1-time-saved-2026-06-18.md`.

Highlights:
- 11 PRs merged (6 n8n-ops + 5 Hub) + 3 Supabase migrations applied + 3 edge-fn redeploys
- Marketing May 2026 locked total moved 220.07h → 950.64h (spec-compliant: now includes 644h manual estimates)
- Breakdown sum == locked total verified live (Δ=0.00); 14 rows including 1 "Department-level workflows (unassigned)" sentinel @ 220.06h
- Live revs: n8n-ops `n8n-ops-00043-f2m`, Hub `ai-innovation-hub-00172-gjx`

## Do these, in order

### 1. First — check Slack drafts status

Two DM drafts prepared 2026-06-18, awaiting user review/send:
- **Ron Madar-Hallevi** — full PRD V1 status (26/26 closed) with the one open semantics question (pro-rated vs full-month MTD).
- **Kurt Pabiloña** — FYI of what landed in his repo + reminder to NOT apply Phase 2 destructive migration.

If user hasn't sent them yet, ask if they want help finalizing.

### 2. React to Ron's reply

- **Pro-rated MTD?** ~1-line patch in `~/Code/n8n-ops/src/routes/initiative-kpi-sync.ts`: replace `capped = Math.min(estimate, …)` with `Math.min(estimate * daysSoFar / daysInMonth, …)`. PR + merge + verify.
- **Full monthly is fine?** Close the question; nothing to do.
- **Asks about 220h "unassigned" row?** Explain: workflows in Marketing's n8n projects (Wordpress publishing etc.) not linked to a specific initiative; the amber "(link these to track them)" nudge in the modal points to this.

### 3. React to Kurt's reply

- **Architecture sync request?** Note: I chose S-B (jsonb on `kpi_measurements`) rather than the initial S-A recommendation in the design doc, and shipped it. Design doc at `~/Code/claude-workspace-roots/AI Innovation Integration/design-docs/locked-breakdown-persistence-2026-06-18.md` is historical reference.
- **Phase 2 destructive migration?** Deferred indefinitely per #9 decision (keep `initiative_kpi_measurements` as MTD-snapshot store; new `kpi_measurements.breakdown` jsonb is locked-monthly).

### 4. Builder relocation Phase 8 (autonomous, deferred from 2026-06-16)

Was prior HEAD; got bumped because PRD V1 took the whole day. Steps:
- `gh repo clone alvarocubaa/n8n-workflow-builder ~/Code/n8n-workflow-builder` (NOT `mv` — avoids `.git` corruption under Drive). `main` already has everything (PR #3 squash `eda3691`).
- Verify the clone builds; optionally delete the Drive copy after confirming via Drive web UI.
- Repoint `~/.claude/settings.json` `additionalDirectories` + any CLAUDE.md path roots from the Drive builder path to `~/Code/n8n-workflow-builder`.

### 5. CloudFront 502 follow-up — when DevOps clears it

`thehub.gue5ty.com` returns 502. Cloud Run origin is healthy. Once DevOps fixes CloudFront, run the integration walkthrough (`~/Code/claude-workspace-roots/AI Innovation Integration/plans/2026-05-20-integration-walkthrough.md`) — now also validate today's new breakdown modal in the browser.

## Pre-flight checks (Claude, ~5 min)
- `gcloud auth status --active` == `alvarocubaa`. Re-auth interactively if `application-default` is stale.
- Confirm n8n-ops rev ≥ `n8n-ops-00043` and Hub ≥ `ai-innovation-hub-00172`.
- `git status` clean in `~/Code/n8n-ops`, `~/Code/AI-Innovation-Hub-Vertex`, and `~/Code/claude-workspace-roots`.

## Optional / deferred (do NOT start unprompted)
- **#12 admin override audit log** in Hub — purely hardening; trigger or service-side log entry when `kpi_measurements` UPDATE happens via admin UI. Kurt's scope.
- **Backfill April 2026 Marketing breakdown** — April locked before today's work has `breakdown=null`. PRD §26 doesn't require backfill, but if Ron wants the trend chart to render older months, easy re-push.
- **First token rotation** per `~/Code/n8n-ops/docs/kpi-webhook-token-rotation-runbook.md` — first one due ~90 days from secret creation.
