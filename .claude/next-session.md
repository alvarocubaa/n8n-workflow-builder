# Next session brief — Builder relocation (Phase 8) + post-cutover end-to-end verification

**Date:** 2026-06-16 or later
**Style:** Phase 8 by Claude (first action, from a fresh session); verification user-driven once DevOps clears the 502.

## State snapshot (what happened 2026-06-11 → 06-16)

Two big arcs landed. Read the memory files first: `repo-split-2026-06-11` and `ih2-cutover-incident-2026-06-16` (in this project's `~/.claude/.../memory/`).

1. **3-way repo split — SHIPPED + merged.** The tangle is now three clean repos:
   - **Builder** `alvarocubaa/n8n-workflow-builder` (this repo, still in Drive). Reorg merged to `main` via **PR #3** (squash `eda3691`). `docs/innovation-hub/` + `hub-ui-demo/` stripped; `agent-card.json` added; `docs/decision-log.md` is now a redirect. Recovery tag `pre-split-2026-06-11`.
   - **n8n-ops** `alvarocubaa/n8n-ops` at **`~/Code/n8n-ops`** (moved out of `Agentic Workflows/services/`). Cloud Build deploy-on-push live (trigger `n8n-ops-deploy`); `deploy.sh` = schedulers + break-glass.
   - **Hub** `kurtpabilona-code/AI-Innovation-Hub-Vertex` at `~/Code/AI-Innovation-Hub-Vertex` (unchanged owner).
   - **Cross-cutting home:** `cubaalvaro/claude-workspace-roots` → `AI Innovation Integration/` (A2A agent cards, registry, contract, ROLES-AND-RESPONSIBILITIES, integration decision-log + relocated design-docs/plans).

2. **IH 2.0 "unified pipeline cutover" incident — fixed.** Kurt's Hub cutover archived `strategic_ideas`→`innovation_items` + renamed `source_strategic_idea_id`→`parent_item_id`, which silently broke n8n-ops's Time-Saved KPI sync. Fixed + deployed (`n8n-ops-00029`), verified writing measurements. OAuth origin for `thehub.gue5ty.com` added in Console + verified via live GIS. Full detail in `~/Code/n8n-ops/docs/decision-log.md` (2026-06-16) and the integration decision-log.

## Do these, in order

### 1. FIRST — Phase 8: relocate the builder working copy Drive → `~/Code` (Claude)
Deferred from the split because it's unsafe to move the repo a session is *running from*. Do it as the **first action of this fresh session** (which is NOT rooted in the Drive copy):
- `gh repo clone alvarocubaa/n8n-workflow-builder ~/Code/n8n-workflow-builder` (NOT `mv` — avoids `.git` corruption under Drive). `main` already has everything (PR #3).
- Verify the clone builds; then optionally delete the Drive copy **after** confirming in the Drive web UI.
- Repoint `~/.claude/settings.json` `additionalDirectories` + any CLAUDE.md path roots from the Drive builder path to `~/Code/n8n-workflow-builder`.

### 2. CloudFront 502 → once DevOps clears it, run the end-to-end walkthrough
`thehub.gue5ty.com` returns **502 (CloudFront → origin)** — Cloud Run origin is healthy (200, 0 5xx); this is DevOps's CloudFront config (origin domain/SSL/SNI). **Blocked on DevOps.** Once cleared, run the deferred integration walkthrough (plan now lives in `claude-workspace-roots → AI Innovation Integration/plans/2026-05-20-integration-walkthrough.md`) to validate the full idea→initiative→PoC→workflow→KPI chain **post-cutover** in the browser, incl. the auto-calculated / user-estimate / no-data KPI badges.

### 3. React to Kurt
- Confirm he dropped the compat shim `20260616120000_compat_source_strategic_idea_id_for_n8n_ops.sql` (n8n-ops now uses `parent_item_id`).
- Answer his `/suggest-links` semantics call — we kept `origin_type='roadmap'` (old behavior); change to all innovation_items if he wants.

### 4. Quick
- Confirm the old `Agentic Workflows/services/n8n-ops/` deletion propagated in the Drive web UI / Trash.

## Pre-flight checks (Claude, ~5 min)
- n8n-ops live rev ≥ `n8n-ops-00029`; `/health` 200; trigger `/sync-hub` and confirm `[initiative-kpi-sync] done` with no PGRST200.
- Builder `main` HEAD = `eda3691` (PR #3 squash) or newer.
- `gh auth status --active` == `alvarocubaa`.
