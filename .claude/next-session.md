# Next session brief — Builder modernization (continuation) + carried-over threads

**Derived from the 2026-06-23 modernization session gap audit.** Plan file: `~/.claude/plans/the-feedback-loop-has-hashed-micali.md`. Decisions: `docs/decision-log.md` (2026-06-23), `docs/mcp-strategy-2026-06.md`, `docs/agent-infra-assessment.md`.

## What shipped 2026-06-23 (context)
- MCP **re-vendored v2.33.5 → v2.59.3**, LIVE 100% (rev `n8n-mcp-cloud-00017-paq`); node DB 1,084 → 1,845 (n8n 2.26). PR `n8n-mcp-cloud#1`. Old `00011-zn6` retained for rollback.
- 🔒 MCP telemetry leak disabled (live + durable in Dockerfile).
- Builder docs PR #6 merged. Hermes skills committed to apps-deployment.
- Two Hermes skills installed on the `workflow-builder` VM profile: **`wb-mcp-watchdog` ACTIVE** (monthly), **`wb-feedback-harvest` PAUSED**.

## Pending — do in priority order

### 1. A2/A3 — expose diff-edit + autofix (the real agent-quality win) — HIGH, but gated
Expose `n8n_update_partial_workflow` + `n8n_autofix_workflow` in `chat-ui/src/lib/mcp-bridge.ts`. **Do NOT just whitelist** — the audit gates require, FIRST:
- **Server-side sandbox-project allowlist in the bridge** (instance-wide n8n API key = can write any dept/prod). Edit tools target sandbox project IDs only. (Audit S2)
- **Extend `stripCredentialsFromResult`** to edit/management tool results + define write-back so it doesn't null creds. (Audit S3)
- **Regression safety net must exist first** (item 2). (Audit R1/R2)
Then add a `system-prompt.ts` rule to edit-via-diff instead of full-JSON regen.

### 2. Regression safety net — HIGH (unblocks 1 + 4)
- Merge **wb-ci PR #5** (lint/typecheck) for the basic gate.
- Wire `tools/run_regression.py` into CI — needs a deployed chat-ui + Vertex creds (it's an end-to-end HTTP test), so this is its own setup. Gate = **"no new failures vs pinned baseline"** (suite is ~27/32, not green). (Audit R1)

### 3. Un-pause `wb-feedback-harvest` — MEDIUM
- Provision on the VM: `gh repo clone alvarocubaa/n8n-workflow-builder` + `cd chat-ui && npm ci` (+ confirm Firestore ADC). Then `hermes --profile workflow-builder cron resume <id>`.
- First run = **backlog catch-up** (51 candidates since 2026-04-15). First 2-3 PRs human-merged.

### 4. Override re-verification — MEDIUM (R4 follow-up of the re-vendor)
- With n8n now 2.26, re-check chat-ui node-config overrides (BigQuery `googleApi`/projectId, Slack v2.4, Merge v3, Salesforce SOQL) against new typeVersions via a regression run. The re-vendor shipped without the before/after regression (deferred).

### 5. MCP deploy-pipeline cleanup — LOW
- Investigate why the merge-triggered Cloud Build **succeeded but created no serving revision** (go-live needed an explicit `update-traffic`). Reconcile repo `cloudbuild.yaml` (defaults: service `n8n-mcp`/`us-central1`/`gcr.io`) vs the actual source-deploy trigger (`n8n-mcp-cloud`/`europe-west1`/`cloud-run-source-deploy`).
- **Consolidate** the redundant monorepo `n8n-mcp/` copy (make `n8n-mcp-cloud` the single source).
- Delete the stray no-traffic canary revision if not auto-cleaned.

### 6. Finance BI pilot (Track D) — MEDIUM, needs access
- Verify shared BQ SA `h7fJ82YhtOnUL58u` can read `payments_processing` (likely restricted → admin grant). Then build `specs/02_SRC_FinanceBI_Spec.md` from `guesty_churn` (placeholders, no real PII; add payments-PII prompt rule). 3-location sync + scope to `finance`.
- Broader BI-corpus harvest gated on the BI-team reply (message drafted 2026-06-23, awaiting send).

## Carried-over (from the pre-empted 2026-06-19 HEAD)
- ✅ **Builder relocation Phase 8 — DONE 2026-06-24.** Canonical working copy now at `~/Code/n8n-workflow-builder` (clone, not `mv`); build verified; `settings.json`/router CLAUDE.md/WAT imports/auto-memory all repointed. Old Drive copy left for manual deletion. See `docs/decision-log.md` (2026-06-23 Phase 8 entry) + memory `builder-relocated-to-code-2026-06-23`.
- ✅ **CloudFront 502 — cleared.** `thehub.gue5ty.com` now returns 403 (auth-gate), origin healthy. Integration walkthrough remains user-driven.
- ⏳ Still open: **Ron PRD V1 reply** (pro-rated vs full-month MTD) + **Kurt reply** — both blocked on unsent drafts / no replies. Detail in `docs/decision-log.md` + memory `prd-v1-time-saved-2026-06-18`.
