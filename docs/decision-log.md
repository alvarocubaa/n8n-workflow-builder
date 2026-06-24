# Decision Log — n8n Workflow Builder

System / config / architectural decisions for the **chat-ui + n8n-mcp + n8n-skills + specs**
workflow builder. New entries on top.

> **Repo split — 2026-06-11.** This log's prior contents (2026-05-08 → 2026-05-24)
> were entirely the **Time-Saved KPI sync saga** and the **chat-ui↔Hub integration
> saga** — both of which now live with their owning products:
>
> | Topic | Now maintained in |
> |---|---|
> | n8n-ops service: KPI sync, cron, rollup, BigQuery ingest, alerts | `alvarocubaa/n8n-ops` → `docs/decision-log.md` |
> | Cross-product integration (chat-ui↔Hub: PoC builder, prefill, form sections, baseline-strip, Session 10/11/13) | `cubaalvaro/claude-workspace-roots` → `AI Innovation Integration/decision-log.md` |
>
> The **full pre-split combined history** (all entries, fully cross-referenced) is
> preserved immutably at the **`pre-split-2026-06-11` git tag**:
> `git show pre-split-2026-06-11:docs/decision-log.md`.
>
> Builder-only decisions (prompt engineering, n8n-mcp, departments, credential
> guardrails, feedback-loop) historically lived in `MEMORY.md` and `CLAUDE.md`,
> not here. **New chat-ui / MCP / skills / specs decisions go below, newest on top.**

---

## 2026-06-23 — Phase 8: relocated builder repo out of Drive to `~/Code`

**Decision.** The builder repo's working copy moved from `…/My Drive/n8n-builder-cloud-claude` to **`~/Code/n8n-workflow-builder`** (fresh `gh repo clone`, NOT `mv` — avoids `.git/objects` corruption under Drive sync). This completes the 2026-06-11 repo split (n8n-ops and the Hub already relocated). **Context:** working a git repo from a 4.9 G Drive-synced folder is slow and risks index corruption. **Outcome:** clone at `2be8a31` (= origin/main, PR #6), `chat-ui` builds clean (`next build` exit 0, "Compiled successfully").

Carried over (not in git): top-level `.env`, `chat-ui/credentials.json`, and two not-yet-committed docs (`docs/agent-infra-assessment.md`, `docs/mcp-strategy-2026-06.md`). Config repointed: `~/.claude/settings.json` `additionalDirectories` (+`~/Code/n8n-workflow-builder`); workspace router `…/My Drive/CLAUDE.md` project path; project CLAUDE.md WAT imports switched from `@../WAT_*.md` to absolute Drive paths (the shared WAT files stay in the Drive workspace). Project auto-memory copied to the new cwd namespace `-Users-alvaro-cuba-Code-n8n-workflow-builder`.

**Not done (per decision):** the old Drive copy is **left in place** — user deletes it manually via the Drive web UI once confident.

**Verification queue:** confirm a *new* Claude Code session started from `~/Code/n8n-workflow-builder` (a) loads the migrated memory, (b) resolves the absolute WAT imports, (c) sees the repointed `additionalDirectories`.

## 2026-06-23 — Builder modernization session (MCP re-vendor, telemetry fix, agent-infra, Hermes skills)

**Decision 1 — Disabled MCP telemetry (security).** The deployed `n8n-mcp-cloud` is a *pristine vendored copy of czlonkowski/n8n-mcp* (not home-grown); its telemetry pipeline (→ czlonkowski's Supabase) was **ON by default** in production. Disabled immediately on the live service (`N8N_MCP_TELEMETRY_DISABLED=true`, rev `n8n-mcp-cloud-00011-zn6`) and durably in the Dockerfile via the re-vendor. *Context:* anonymized workflow-mutation metadata was leaving our infra. *Outcome:* leak stopped; must stay off across all future re-vendors.

**Decision 2 — Re-vendored MCP v2.33.5 → v2.59.3.** Strategy doc: [`docs/mcp-strategy-2026-06.md`](mcp-strategy-2026-06.md). Kept our vendored copy (rejected hosted service = data egress, and official n8n MCP = bypasses our credential scoping). Both copies verified pristine, so it was a clean overlay + re-apply of 4 Guesty deltas (no-BuildKit Dockerfile, Cloud Run ports, telemetry-off, our `cloudbuild.yaml`/`deploy-cloudrun.sh`). Prebuilt node DB shipped in the tag → no rebuild. *Outcome:* node DB **1,084 → 1,845 nodes** (n8n 2.4.4 → 2.26.2), now aware of `dataTable`/`evaluation`/`mcpClient`/`mcpTrigger` etc. PR `alvarocubaa/n8n-mcp-cloud#1`. Live on rev `n8n-mcp-cloud-00017-paq` (100% traffic); old `00011-zn6` retained for rollback.

**Finding — merge does NOT auto-shift traffic.** Merging to `main` on `n8n-mcp-cloud` triggered a Cloud Build that succeeded but did **not** create a new serving revision / shift traffic; go-live required an explicit `update-traffic`. Corrects the earlier "merge == deploy" assumption (this is *safer*). **Verification queue:** investigate why the trigger build didn't produce a serving revision; reconcile the repo `cloudbuild.yaml` (defaults to service `n8n-mcp`/`us-central1`, `gcr.io` path) vs the actual auto-generated source-deploy trigger (`n8n-mcp-cloud`/`europe-west1`/`cloud-run-source-deploy`).

**Decision 3 — Agent infra: keep the custom loop.** Assessment: [`docs/agent-infra-assessment.md`](agent-infra-assessment.md). No ADK/LangChain — a hand-rolled Vertex tool-use loop, kept deliberately. Top improvement = expose diff-based editing (already in the MCP, unexposed).

**Decision 4 — Two autonomous Hermes skills authored** (`wb-feedback-harvest`, `wb-mcp-watchdog`) in `[HERMES] Orchestrator/skills/`, **report+PR mode**, audit-tightened gates. VM install + cron deferred (gated on VM readiness + wb-ci/branch-protection/wb-pr-review activation).

**Deferred (verification queue):** A2/A3 expose `n8n_update_partial_workflow`/`n8n_autofix_workflow` — needs server-side sandbox-project allowlist + credential-strip extension + regression net first (instance-wide n8n API key = the risk). Re-verify chat-ui node-config overrides (BigQuery/Slack/Merge/Salesforce) against new typeVersions. Consolidate redundant monorepo `n8n-mcp/` copy. Finance BI pilot (Track D, queued).

---

## Older entries

(Decision log started 2026-05-08; older decisions live in MEMORY.md until extracted. The 2026-05-08 → 2026-05-24 entries were carved to the n8n-ops and integration logs on 2026-06-11 — see the split notice above.)
