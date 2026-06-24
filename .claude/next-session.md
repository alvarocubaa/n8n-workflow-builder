# Next session brief — Weekly n8n workspace inventory skill + finish arming the regression net + fix caught cred bugs

**Derived from the 2026-06-24 session.** Decisions: `docs/decision-log.md` (2026-06-24). Queue HEAD: `.claude/session-queue.md`.

## Context (what shipped 2026-06-24)
- **Phase 8 ✅** — builder now lives at `~/Code/n8n-workflow-builder` (PR #7). Old Drive copy left for manual delete.
- **Regression net built ✅** — typecheck gate live (PR #5); `run_regression.py` baseline-diff gate (PR #8); `wb-regression` Hermes skill deployed to the `workflow-builder` VM + nightly cron `629abe52bfab` registered **PAUSED**; VM fully provisioned (clone + deps + linger + chat-ui as `systemd --user` unit `wb-chatui.service` on :3002).
- **First baseline 16/32** was mostly **stale cred fixtures**; 4 refreshed from the cred table (slack/monday/sheets/zendesk). A re-run with the refreshed fixtures was launched on the VM (writing `tools/regression_baseline.json`).
- **Net caught a real bug:** payments/CX put the wrong `googleApi` cred on BigQuery nodes (Drive/Translate SA vs the BQ SA `h7fJ82YhtOnUL58u`).
- **CloudFront 502 ✅ cleared** (now 403/auth-gate).

## Pre-flight (~5 min)
- `gcloud auth application-default print-access-token` ok; active account `alvaro.cuba`.
- VM state: `gcloud compute ssh hermes-agent --zone=europe-west1-b --project=agentic-workflows-485210` → `systemctl --user is-active wb-bootstrap` (re-run done?) + `wb-chatui` (chat-ui up?). Remember `export XDG_RUNTIME_DIR=/run/user/$(id -u)` for `--user` systemctl.
- `git -C ~/Code/n8n-workflow-builder status` clean on `main`.

## Do these, in order

### 1a. Build `wb-workspace-inventory` weekly skill — USER PRIORITY
Weekly, walk the **whole Guesty n8n workspace** (all dept projects/folders), gather every workflow + the **credentials each references**, and keep an updated inventory so `chat-ui/src/lib/departments.ts` (cred single-source-of-truth) and `tools/test_cases.yaml` stay current. **Root cause it fixes:** this session's 16/32 was stale-fixture drift between the live workspace and our cred table.
- **Form:** Hermes skill on `workflow-builder` profile — mirror `wb-mcp-watchdog`: `[HERMES] Orchestrator/{skills/wb-workspace-inventory/SKILL.md, scripts/wb-workspace-inventory.sh}`, `--no-agent` cron, weekly. Deploy to the VM (3 mirror locations) like `wb-regression`.
- **Mechanism:** n8n API — `GET /api/v1/projects` → workflows per project → per workflow extract `nodes[].credentials` (type+id+name). Build per-dept inventory `{project_id, project_env, workflows[], credentials[{type,id,name,used_by[]}]}`.
- **Output:** versioned snapshot in the repo (`reference/n8n-workspace-inventory.json` + a human `.md`). **Diff vs `departments.ts`** → NOTIFY / open PR on NEW / CHANGED / REMOVED creds.
- Reuse n8n API patterns from `~/Code/n8n-ops` + `tools/`. Share the VM repo + list-workflows helper with `wb-feedback-harvest`.

### 1b. Finish arming the regression net (quick)
- On the VM: confirm `wb-bootstrap` finished; `python3 -c "import json,collections;d=json.load(open('tools/regression_baseline.json'));print(collections.Counter(d.values()))"`. Eyeball counts (expect well above 16/32).
- `scp` the baseline down; commit `tools/regression_baseline.json` (+ `tools/test_cases.yaml` if the session-close PR didn't already land it).
- `hermes --profile workflow-builder cron resume 629abe52bfab` → arm the nightly gate.
- **Decide chat-ui lifecycle on the VM:** persistent `wb-chatui.service` (dev, current) vs `next build && next start` vs cron-managed bring-up in the skill.

### 1c. Fix the cred bugs the net caught (audit R4 / override re-verify)
- **payments + CX BigQuery cred confusion** — builder attaches Drive SA (`aLlYQkLWrmANkfFZ`) / CX Translate SA (`PAAimNTryrvB72dp`) to BigQuery nodes instead of the BQ SA. `departments.ts` already flags `aLl…` as WRONG → the guardrail isn't holding for these depts. Cases: `pay_invoice_aging`, `pay_zuora_sf_reconcile`, `uc2_cx`. Investigate `generateCredentialExamples()` scoping + system-prompt cred rule for payments/CX.
- **marketing Docs-node gaps** — content cases expect Google Docs nodes the builder doesn't produce (`cred_missing:googleDocsOAuth2Api`). Decide intended behavior vs fixture update (don't auto-paper-over).

## Then (still open, priority order)
2. **A2/A3** expose `n8n_update_partial_workflow` + `n8n_autofix_workflow` in `chat-ui/src/lib/mcp-bridge.ts` behind a server-side sandbox-project allowlist + cred-strip extension. Now unblocked once the net is armed (1b).
3. **Un-pause `wb-feedback-harvest`** — VM repo+deps now provisioned; `hermes --profile workflow-builder cron resume` + backlog catch-up (51 candidates). Shares infra with 1a.
4. **MCP pipeline cleanup** — why the merge built but didn't serve; consolidate dup monorepo `n8n-mcp/`; delete stray canary.
5. **Finance BI pilot** — `payments_processing.guesty_churn` (verify BQ SA access first).

## Blocked / external
- **Ron + Kurt async** (queue #2) — pro-rated-vs-full-month MTD reply; Kurt FYI. Blocked on unsent drafts / replies.
- **Integration walkthrough** — CloudFront cleared; user-driven (VPN-gated). Plan in `~/Code/claude-workspace-roots/AI Innovation Integration/plans/2026-05-20-integration-walkthrough.md`.
