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

## 2026-06-24 — Regression safety net (audit R1): baseline-diff gate + Hermes skill, not GitHub Actions

**Decision 1 — typecheck gate landed.** Merged wb-ci PR #5 → `.github/workflows/wb-ci.yml` runs `npm ci` + `tsc --noEmit` on every PR (secret-free; `next lint` is misconfigured so `tsc` is the reliable signal). Verified green on current `main` before merging. This is the cheap per-PR gate.

**Decision 2 — `run_regression.py` gets a differential gate.** Added `--baseline <json>` / `--update-baseline <json>`. The suite is intentionally ~27/32 (not all-green), so an absolute exit-1-on-any-fail gate is wrong. New semantics: exit 1 ONLY on a **regression** (a case that was PASS in the baseline now failing, or a brand-new failing case); known/pinned failures are tolerated. Default (no `--baseline`) keeps the old strict all-green behavior. Logic unit-verified offline against 5 scenarios. **Context:** unblocks audit R1 (the gate the diff-edit/autofix work needs) and R4 (re-vendor override re-verification).

**Decision 3 — the live suite runs as a Hermes skill, NOT GitHub Actions.** The suite drives a *local, unauthenticated* chat-ui (`localhost:3004` + `MOCK_USER_EMAIL`) and needs Vertex creds — a GitHub-hosted runner would mean an SA key in repo secrets + network reach to n8n/MCP. Instead, authored **`wb-regression`** on the `workflow-builder` Hermes profile (alongside `wb-mcp-watchdog`/`wb-feedback-harvest`), files in apps-deployment `[HERMES] Orchestrator/{skills/wb-regression/SKILL.md, scripts/wb-regression.sh}`. The VM already has ADC + n8n/MCP reachability. **Trigger:** manual + nightly (NOT per-PR — 32 live LLM convos = slow/costly/flaky). **Gate:** the skill takes its verdict from the script exit code; a regression → NEEDS_HUMAN + NOTIFY (never auto-fixes, never re-pins the baseline, never merges). First run self-bootstraps `tools/regression_baseline.json` via `--update-baseline`.

**VM provisioning — done 2026-06-24 on `hermes-agent` (`europe-west1-b`):**
- Builder repo cloned to `~/n8n-workflow-builder` (HEAD = `main` incl. the baseline gate); `chat-ui && npm ci` clean; `pyyaml` present.
- `wb-regression` skill deployed to all 3 mirror locations (`~/.hermes/scripts/wb-regression.sh`, `~/.hermes/skills/wb-regression/SKILL.md`, `~/.hermes/profiles/workflow-builder/skills/wb-regression/SKILL.md`).
- Cron registered under the `workflow-builder` profile (`629abe52bfab`, nightly `0 3 * * *`) and **PAUSED** (held like `wb-feedback-harvest` until the first baseline is pinned).
- Feasibility verified: VM SA `n8n-workflow-builder@…` (= the prod chat-ui SA) reads secrets `AUTH_TOKEN`/`N8N_API_KEY`/`N8N_URL` and has `run.invoker` on `n8n-mcp-cloud` (`https://n8n-mcp-cloud-fhehssni7q-ew.a.run.app`); Vertex via metadata ADC (`us-east5`).
- A ready-to-run bring-up script `~/wb-chatui-up.sh` was placed on the VM (exports the full chat-ui env — MCP_SERVICE_URL→deployed MCP, secrets, `MOCK_USER_EMAIL`, `GCP_PROJECT_ID`; `npm run dev` on :3002).
- **System change (sudo):** `loginctl enable-linger alvaro.cuba` (was `Linger=no`) — needed so detached user processes survive.

**Blocker — chat-ui won't stay up via non-interactive `gcloud compute ssh`.** Every launch mechanism (`nohup &`, `setsid`, `setsid --fork`, foreground-over-SSH, `systemd-run --user`) returns SSH 255 and leaves no persistent server — the user systemd manager/pty isn't fully wired in non-interactive SSH, so the dev server is reaped. This is the natural interactive "first observed run" checkpoint.

**Remaining (interactive VM session, ~10 min):**
1. SSH in interactively (or tmux): `bash ~/wb-chatui-up.sh` → confirm `curl localhost:3002/api/departments` = 200.
2. `cd ~/n8n-workflow-builder && python3 tools/run_regression.py --update-baseline tools/regression_baseline.json --base-url http://localhost:3002` (~32 live cases, several min).
3. Eyeball the pinned counts (~27/32), commit `tools/regression_baseline.json` to the repo.
4. `hermes --profile workflow-builder cron resume 629abe52bfab` to arm the nightly gate.

**UPDATE (later 2026-06-24) — bring-up solved + first baseline + a real bug caught.** The blocker was `Linger=no`; after `loginctl enable-linger` + launching chat-ui as a `systemd --user` unit (`wb-chatui.service`, with `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` set), it persists. Smoke test (`uc1_finance`) passed end-to-end (84s). **First full baseline = 16 PASS / 16 FAIL** (well below the expected ~27/32). Diagnosis: failures are dominated by **stale credential fixtures**, not builder regressions — e.g. expected Slack `MkMAiC1ecfpYtIz1` was removed from `departments.ts`; the builder correctly uses real configured creds. Refreshed 4 fixtures **from the credentials table** (`tools/test_cases.yaml`): slack `MkM…→5Ii5X9IFid1S8rIE`, monday `XsK…→WNVVcnekSFyRZwnW`, sheets `LaWD…→4jA8N85DnTpkvyeV`, zendesk prod→sandbox `I0s…→OTFp18SnDgGUSn9u`. **Real builder bug the net caught (left as FAIL, feeds audit R4):** payments (`pay_invoice_aging`, `pay_zuora_sf_reconcile`) and CX (`uc2_cx`) attach the wrong `googleApi` cred to BigQuery nodes — the payments **Drive** SA `aLlYQkLWrmANkfFZ` (which `generateCredentialExamples()` *explicitly labels WRONG for BigQuery*) and the CX **Translate** SA `PAAimNTryrvB72dp` — instead of the BQ SA `h7fJ82YhtOnUL58u`. Also marketing content cases expect Google Docs nodes the builder doesn't produce (`cred_missing:googleDocsOAuth2Api`). A re-run with the refreshed fixtures was launched on the VM (writing `tools/regression_baseline.json`); **pull + commit + `cron resume` next session.** This drift is the motivation for the new weekly `wb-workspace-inventory` skill (queue HEAD).

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
