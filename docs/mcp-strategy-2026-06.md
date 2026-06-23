# MCP Strategy Decision — June 2026

**Status:** Decision doc (Track A4 of the 2026-06-23 modernization session).
**Author:** Alvaro Cuba (with Claude Code).
**TL;DR recommendation:** Keep our vendored czlonkowski/n8n-mcp, **re-vendor to latest (v2.59.x)**, **consolidate the two copies into the deployed repo**, keep all Guesty value in `chat-ui/`, and add a Hermes watchdog to stop the drift recurring. Do **not** migrate to the hosted service (data egress) or the official n8n MCP (bypasses our credential scoping). Re-evaluate the official MCP in ~6 months.

---

## 1. What we actually run (topology, verified 2026-06-23)

Our "home-grown n8n-mcp" is **not home-grown** — it is a vendored copy of **czlonkowski/n8n-mcp** (MIT © Romuald Czlonkowski). Two copies exist:

| Copy | Location | Version | Role | Deploys? |
|---|---|---|---|---|
| **Deployed** | repo `alvarocubaa/n8n-mcp-cloud` | **v2.33.5** (n8n 2.4.4) | Live Cloud Run `n8n-mcp-cloud` | **Yes — auto-deploys on `main` push** (in-repo `cloudbuild.yaml` + GCP trigger) |
| Local-dev | `n8n-mcp/` in the builder monorepo | v2.33.5 (n8n 2.4.4) | `docker-compose` local dev only | No |

- **Upstream is v2.59.3** (2026-06-21) → we are **~26 releases behind**.
- Both copies are **pristine** (no Guesty modifications — verified: zero Guesty strings in `src/`, clean trees). Our entire value-add lives in **`chat-ui/`** (tool whitelist in `mcp-bridge.ts`, credential stripping in `claude.ts`, `get_company_spec`/`get_n8n_skill` local tools, node-config overrides, system prompt).
- Live service has **`N8N_API_KEY` + `N8N_API_URL`** wired from Secret Manager → it already holds **instance-wide write capability** (n8n API keys are not project-scoped). Currently only read management tools are whitelisted in chat-ui.
- **Telemetry was ON in production** (czlonkowski's pipeline → their Supabase). **Disabled 2026-06-23** via `N8N_MCP_TELEMETRY_DISABLED=true` (rev `n8n-mcp-cloud-00011-zn6`); durable fix (Dockerfile) to land in the re-vendor PR.

**Implication:** "node DB stale at n8n v2.4.4" is a *symptom of the stale vendor copy*, not a separate problem. The fix is a version bump, not a rebuild-in-place. Autofix (`n8n_autofix_workflow`) and the diff engine (v2.7.0) **already exist** in the code — they only need exposing in `chat-ui`.

---

## 2. Options

### (a) Re-vendor latest czlonkowski into our repo — **RECOMMENDED**
Drop the v2.59.x source into `n8n-mcp-cloud`, rebuild the node DB (current n8n), keep telemetry off, redeploy.
- **Pros:** current node DB + 2 years of upstream fixes (diff/autofix/rollback/template search) in one move; full version pinning + control; runs in our VPC; instance key never leaves our infra; clean swap (copies are pristine).
- **Cons:** manual re-vendor recurs (mitigated by the watchdog skill A5); a major n8n version jump can shift node typeVersions our overrides depend on (mitigated by before/after regression + spot-check).

### (b) Consume czlonkowski's hosted service or Docker image
Point `mcp-bridge.ts` at `dashboard.n8n-mcp.com` (hosted) or run `ghcr.io/czlonkowski/n8n-mcp` (Docker).
- **Hosted — REJECT:** sending our n8n API key + workflow data to a third-party SaaS; telemetry; external availability dependency for a production internal tool.
- **Docker image — VIABLE for maintenance** but we lose source-level control and the image still defaults telemetry on; we'd pin + override env. Keep as a fallback if manual re-vendoring proves too costly even with the watchdog.

### (c) Official n8n MCP server (Public Preview, 2026-04-29)
First-party server that writes workflows directly to the instance.
- **REJECT as a replacement:** it writes directly to n8n, bypassing our per-department **credential injection**, **deploy-to-folder transfer**, **node-config overrides**, and **audit** — i.e. it bypasses our entire reason for existing. Public Preview (not GA). Requires n8n ≥ v2.18.4 (our instance version unconfirmed — needs an authenticated check).
- **Complementary only:** worth a re-evaluation in ~6 months once GA, as a possible *creation* backend behind our guardrails.

---

## 3. Comparison

| Dimension | Re-vendor (a) | Hosted/Docker (b) | Official n8n (c) |
|---|---|---|---|
| Node freshness | ✅ current on bump | ✅ always | ✅ native |
| Credential scoping / overrides | ✅ (in chat-ui, unaffected) | ✅ (chat-ui) | ❌ bypassed |
| Diff edit / autofix / rollback | ✅ already present | ✅ | partial |
| Data stays in our infra | ✅ | ❌ hosted / ⚠️ docker | ⚠️ direct-to-instance |
| Version pinning / control | ✅ full | ⚠️ image tag | ❌ preview, vendor-paced |
| Maintenance cost | ⚠️ manual (→ watchdog) | ✅ low | ✅ low |
| Security of edit tools | controllable in bridge | controllable in bridge | ❌ hard to constrain |

---

## 4. Decision

1. **Re-vendor to v2.59.x** in `alvarocubaa/n8n-mcp-cloud` (the deployed repo). Keep telemetry disabled durably (Dockerfile + env).
2. **Consolidate the two copies.** Make `n8n-mcp-cloud` the single source; either delete `n8n-mcp/` from the builder monorepo or replace it with a thin pointer/submodule so local dev and prod can't drift again.
3. **Keep all Guesty logic in `chat-ui/`.** No edits inside the vendored tree (preserves clean re-vendoring forever).
4. **Expose capabilities in chat-ui** (Track A2/A3) behind the trust-model gate — not in the MCP.
5. **Watchdog skill** (Track A5) keeps us within N releases of upstream automatically.
6. **Re-evaluate official n8n MCP ~Dec 2026** once GA.

---

## 5. Security carry-forwards (feed Track A2/A3)

- **Auto-deploy = the MCP repo deploys on merge.** Any automated PR to `n8n-mcp-cloud` (e.g. the watchdog) is a *production deploy* — gate accordingly (green build/tests + canary, never blind auto-merge of a version bump straight to live).
- **Instance-wide write key.** Before whitelisting `n8n_update_partial_workflow`/management write tools in chat-ui, enforce a **server-side target-project allowlist** (sandbox IDs only) and/or a **sandbox-scoped n8n key**; never rely on the prompt.
- **Credential stripping** currently covers read tools only — extend to edit/management tool results.
- **Telemetry** must remain disabled across every re-vendor.
