# n8n Workflow Builder — operator guide

**Owner: Kurt Pabilona.** Ron Madar Hallevi and Gil Almog secondary.
Written 2026-08-19. State verified live the same day.

Companion: [the n8n bundle](https://github.com/alvarocubaa/n8n-ops/blob/main/docs/handover/HANDOVER.md).

---

## 1 · What it is

A chat product for Guesty employees. You describe an automation in plain English; it asks
clarifying questions, confirms the data layer (real SQL, real payloads) before building, then
emits production-ready n8n workflow JSON and deploys it to `guesty.app.n8n.cloud` in one click.

The value is in the **knowledge layers**, not the chat. 11 company data source specs, 7 n8n expert
skills, and a set of node-config overrides that correct what the model otherwise gets confidently
wrong. Those specs are the asset; the chat UI is the delivery mechanism.

**Users:** internal Guesty teams, department-scoped. **Auth:** Google IAP — Guesty account required.

---

## 2 · Architecture

```
Browser (Guesty Google account)
  └─ Google IAP  ── injects verified user email
      └─ n8n-chat-ui        Cloud Run · europe-west1 · Next.js
          ├─ Claude Sonnet 4.6 via Vertex AI   (streaming + tool-call loop)
          ├─ get_n8n_skill()     → n8n-skills/skills/     (7 skills)
          ├─ get_company_spec()  → specs/                 (11 specs)
          ├─ MCP tools           → n8n-mcp-cloud          (80+ n8n tools)
          ├─ Deploy button       → POST /api/deploy       → guesty.app.n8n.cloud
          └─ Firestore                                    (per-user chat history)
              │ SA-to-SA: Google identity token + X-MCP-Auth
              ▼
       n8n-mcp-cloud            Cloud Run · europe-west1 · internal-only
          └─ revendored czlonkowski/n8n-mcp @ v2.59.3
```

**Project:** `agentic-workflows-485210`, region `europe-west1`.

**Repos:** [`n8n-workflow-builder`](https://github.com/alvarocubaa/n8n-workflow-builder) (chat-ui,
MCP source, skills, specs) and [`n8n-mcp-cloud`](https://github.com/alvarocubaa/n8n-mcp-cloud) (the
revendored MCP server, deployed separately).

**Service account:** both services run as
`n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com`. Note that despite the name
this account is **shared** — it also runs `n8n-ops` and the Hermes VM, around eight services in
total. Treat it as shared infrastructure: you need `iam.serviceAccountUser` on it to deploy, and it
should not be rotated or renamed without checking who else is attached.

---

## 3 · How a change reaches production

The two services deploy differently. Worth committing to memory, because it's the opposite of what
most people assume:

| Service | Deploys how |
|---|---|
| `n8n-chat-ui` | **Manually** — `./deploy-cloudrun.sh --ui-only` |
| `n8n-mcp-cloud` | **Automatically on push to `main`** (Cloud Build trigger) |

```bash
export GCP_PROJECT_ID=agentic-workflows-485210
./deploy-cloudrun.sh --ui-only     # chat-ui — the common case
```

So merging to `main` ships the MCP server, and the chat UI waits for someone to run the script.
`cloudbuild-chat.yaml` and `cloudbuild-mcp.yaml` in this repo are **build-only** — they produce an
image and stop; the live MCP trigger is attached to the `n8n-mcp-cloud` repo, not to those files.

**Rollback** is a Cloud Run traffic split to the previous revision:
```bash
gcloud run services update-traffic n8n-chat-ui --region=europe-west1 --to-revisions=<PREVIOUS>=100
```

**Blast radius is small by design.** Generated workflows land in n8n **inactive**, tagged `[AI]`
(tag `8pUFynxIQ58Bfpba`). A generated workflow cannot run until a human activates it.

---

## 4 · The knowledge layers — where the real work lives

| Layer | Path | Loaded by | Notes |
|---|---|---|---|
| Company specs | `specs/` | `get_company_spec()` + auto-injection | 11 files. Credentials, schemas, join keys, **verified SQL** |
| n8n skills | `n8n-skills/skills/` | `get_n8n_skill()` | 7 expert guides |
| Node overrides | `chat-ui/src/lib/` | system prompt | corrections to model pre-training |
| BigQuery reference | `bigquery/` | humans only, not the AI at runtime | `JOIN_MAP.md` is the useful one |

**The single most useful thing we learned building this:** *verified SQL examples in a spec produce
roughly 95% adherence; text rules like "use the spec's column names" get about 70%.* When you add a
query pattern, add working SQL, not a sentence. This is the highest-leverage habit for anyone
maintaining the specs.

**Adding or renaming a spec is a three-location sync** — miss one and it silently doesn't load:
1. `chat-ui/src/lib/knowledge.ts` → `SPEC_FILE_MAP`
2. `chat-ui/src/lib/claude.ts` → `ALL_SPEC_KEYS`
3. `chat-ui/src/lib/system-prompt.ts` → `<tools_guidance>` spec list

**`chat-ui/src/lib/departments.ts` is the single source of truth for credentials** — department
config, spec scope, prompt rules. If a workflow deploys with the wrong credential, start there.

Keep `system-prompt.ts` static and concise — it's the prompt-cache key. Per-department context
belongs in the user message.

---

## 5 · Node-config overrides — deliberate, not bugs

These override both the model's pre-training and the MCP's own `get_node` output, because both are
wrong for our instance. They look like mistakes and are not:

- BigQuery credential key is `"googleApi"` — **not** `googleBigQueryOAuth2Api`
- BigQuery `projectId` is a plain string `"guesty-data"` — **not** a `{mode, value}` object
- Salesforce: credential `"salesforceOAuth2Api"`; for SOQL use resource `"search"`, operation `"query"`
- Slack v2.4: `"select": "channel"` with `"channelId": {"mode":"name","value":"#channel"}`

Three BigQuery data facts that produce wrong answers when forgotten:
- Boolean columns are frequently **NULL, not FALSE** → use `IFNULL(col, FALSE) = FALSE`
- n8n's BigQuery node **cannot** do `EXISTS` inside a `JOIN ON` — pre-flatten with CTE + UNNEST
- `zuora_analytics.invoices` joins to Guesty accounts on **`mongo_account_id`**, not `account_id`

---

## 6 · Local development

```bash
docker-compose up -d          # ports 3003 (mcp), 3004 (ui)
docker-compose build chat-ui  # rebuild after chat-ui changes
```

- Vertex AI auth expires periodically → `gcloud auth application-default login`
- `MOCK_USER_EMAIL` in `docker-compose.yml` bypasses auth locally
- macOS uses `python3`, not `python`

**Testing:**
```bash
python3 tools/audit_workflow.py /tmp/workflow.json --expected-creds '{"slackApi":"abc123"}'
python3 tools/test_workflow.py --department cs --prompt "Create a daily workflow..."
python3 tools/run_regression.py
```

---

## 7 · Current state and open work

| Item | State |
|---|---|
| Product | Deployed and in use. Phase: production, maintenance and iteration. |
| `IAP → app-level OAuth` | Ticket drafted at [`it-ticket-iap-to-oauth.md`](../../it-ticket-iap-to-oauth.md). Needed **only** if we want the chat panel embedded inside the Innovation Hub — IAP enforces same-origin redirects, so no embed is possible while it's in place. Decide whether the embed is still wanted. |
| `session/2026-06-26-repo-standardization` | 11 commits, unmerged. A **BI data-dictionary context layer** and a dormant **`agent_logs` writer**. Its design notes describe `agent_logs` as a table shared with a **GenBI Slack agent**, so the decision to land or drop it is worth coordinating with the BI side. |
| MCP upstream | Revendored from `czlonkowski/n8n-mcp` at **v2.59.3**, on `main`. No automatic upstream sync — re-vendoring is a deliberate act. |
| Hermes automation | None active for this repo. Four `wb-*` skills were written but never became operational; they're preserved and documented at `hermes-orchestrator/skills/WORKFLOW-BUILDER-SKILLS-STATUS.md` if you ever want them. Note `ROADMAP.md` still describes an active profile — that's stale. |

---

## 8 · Turning things off

- **The chat product:** Cloud Run → `n8n-chat-ui` → shift traffic to a known-good revision. It's
  request/response with no queue and no scheduler, so nothing accumulates while it's down.
- **Deploy-to-n8n only:** already safe by default — workflows land inactive.
- **`n8n-mcp-cloud`** is internal-only; taking it down degrades the chat UI's n8n tooling and
  exposes nothing.
