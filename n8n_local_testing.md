# Agent Instructions

You're working inside the **WAT framework** (Workflows, Agents, Tools). This architecture separates concerns so that probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes this system reliable.

---

## The WAT Architecture

**Layer 1: Workflows (The Instructions)**
- Markdown SOPs stored in `workflows/`
- Each workflow defines the objective, required inputs, which tools to use, expected outputs, and how to handle edge cases
- Written in plain language, the same way you'd brief someone on your team

**Layer 2: Agents (The Decision-Maker)**
- This is your role. You're responsible for intelligent coordination.
- Read the relevant workflow, run tools in the correct sequence, handle failures gracefully, and ask clarifying questions when needed
- You connect intent to execution without trying to do everything yourself
- Example: If you need to pull data from a website, don't attempt it directly. Read `workflows/scrape_website.md`, figure out the required inputs, then execute `tools/scrape_single_site.py`

**Layer 3: Tools (The Execution)**
- Python scripts in `tools/` that do the actual work
- API calls, data transformations, file operations, database queries
- Credentials and API keys are stored in `.env`
- These scripts are consistent, testable, and fast

**Why this matters:** When AI tries to handle every step directly, accuracy drops fast. If each step is 90% accurate, you're down to 59% success after just five steps. By offloading execution to deterministic scripts, you stay focused on orchestration and decision-making where you excel.

### Two execution contexts — same framework

The WAT layers map onto two different execution environments, and the framework supports both without changes to the tools or workflows:

| Layer | Claude Code session (interactive) | Cloud Run + Agent SDK (unattended) |
|---|---|---|
| **Workflows** | You brief Claude; Claude reads the `.md` SOP | The `.md` SOP becomes the agent's system prompt |
| **Agent** | This Claude instance, in the session | Claude API running autonomously in an agentic loop |
| **Tools** | Claude calls `tools/` scripts via Bash | Agent SDK calls the same `tools/` scripts via `allowed_tools=["Bash"]` |

The `tools/` directory is the stable core — pure Python with no dependency on who calls it. Write a tool once; it works in both contexts identically.

**What changes between contexts** is only Layer 2: the agent mechanism switches from an interactive Claude Code session to a programmatic Agent SDK loop triggered by Cloud Scheduler, Pub/Sub, or an HTTP webhook on Cloud Run. The SOPs and tools stay the same.

**When to graduate a WAT workflow to Cloud Run + Agent SDK:**
- It needs to run unattended on a schedule or external event (same trigger as n8n)
- It requires Python libraries not available in n8n Code nodes
- The logic involves dynamic reasoning loops Claude needs to drive
- You want the entire system version-controlled in Git with CI/CD

The entry point for a Cloud Run deployment is a Python script that bootstraps the Agent SDK with the relevant workflow SOP as the prompt and `tools/` as the available tools. The SOPs are already written for this — they just need a programmatic caller instead of a human session.

---

## n8n Tools Available

Use these tools at the right phase — not all tools are equal:

**Design & build (any stage — instance-agnostic):**
- **n8n skills** (invoke with `Skill` tool): `n8n-node-configuration` for operation-aware node parameter guidance, `n8n-code-javascript` for Code node JS, `n8n-workflow-patterns` for architectural patterns, `n8n-expression-syntax` for `{{ }}` expression help, `n8n-validation-expert` for interpreting validation errors, `n8n-mcp-tools-expert` for guidance on which MCP tool to use.
- **Schema & validation tools** (load via `ToolSearch` first): `search_nodes` (find node types by keyword), `get_node` (parameter details for a specific node), `validate_node` (validate one node's config), `n8n_validate_workflow` (validate full workflow JSON). These query node schemas, not a live instance — safe to use at any stage.

**Cloud promotion only:**
- **Workflow management MCP tools** (`n8n_create_workflow`, `n8n_update_full_workflow`, `n8n_update_partial_workflow`, `n8n_get_workflow`, `n8n_list_workflows`): These are hardcoded to cloud n8n (`guesty.app.n8n.cloud`) via the `n8n-mcp-claude` container. **Do NOT use during local development.** Only invoke them when promoting a validated local workflow to cloud.

**Standard workflow:** `search_nodes` → `get_node` → n8n-skills for config guidance → build JSON → `n8n_validate_workflow` → deploy to local via REST API → test with webhook feedback loop → promote via MCP tools.

---

## Two Execution Modes: WAT vs n8n

**The clearest test: "Would this still need to run if Claude were offline?"**
- Yes → **n8n** (runs unattended on its own)
- No → **WAT** (Claude is in the loop, doing it now)

| Scenario | Use |
|---|---|
| Triggered by a schedule, Gmail, webhook, or external event | **n8n** |
| Repeatable pipeline: fetch → transform → send/store | **n8n** |
| You're asking Claude to do it right now in this session | **WAT** |
| Requires judgment, reasoning, or dynamic decision-making mid-task | **WAT** |
| One-off task (research, generate a report once, ad-hoc analysis) | **WAT** |
| Needs a Python library n8n Code nodes don't have (pandas, PIL, etc.) | **WAT** |
| Multi-step with human checkpoints ("review this before sending") | **WAT** |

They can compose: a WAT tool can call an n8n webhook to kick off an automated chain; n8n can call the Claude API for a single judgment step mid-pipeline.

**Note on unattended WAT:** WAT workflows can also run unattended by deploying the Agent SDK on Cloud Run with the appropriate trigger (Cloud Scheduler, Pub/Sub, HTTP webhook). This gives WAT the same "runs without me" capability as n8n, with the added flexibility of full Python and dynamic Claude reasoning. Use this path when the task outgrows what n8n Code nodes can handle.

**When building an n8n workflow:**
- The only WAT artifact to create is a folder in `workflows/` with an SOP `.md` and a `workflow.json`
- **Always build and test on local n8n first.** Only promote to cloud once it passes testing.
- Deploy to local using the REST API directly (see n8n Environments below) — do NOT use the MCP tools for initial deployment, as they target cloud n8n.
- After testing passes, promote to cloud via MCP tools.

---

## How to Operate (WAT mode)

**1. Look for existing tools first**
Before building anything new, check `tools/` based on what your workflow requires. Only create new scripts when nothing exists for that task.

**2. Learn and adapt when things fail**
When you hit an error:
- Read the full error message and trace
- Fix the script and retest (if it uses paid API calls or credits, check with me before running again)
- Document what you learned in the workflow (rate limits, timing quirks, unexpected behavior)

**3. Keep workflows current**
Workflows should evolve as you learn. When you find better methods, discover constraints, or encounter recurring issues, update the workflow. Don't create or overwrite workflows without asking unless explicitly told to.

---

## The Self-Improvement Loop

Every failure is a chance to make the system stronger:
1. Identify what broke
2. Fix the tool or workflow
3. Verify the fix works
4. Update the workflow and CLAUDE.md with what was learned
5. Move on with a more robust system

---

## File Structure

```
.tmp/                        # Temporary files (scraped data, intermediate exports). Regenerated as needed.
tools/                       # Python scripts for deterministic execution
workflows/                   # One folder per workflow
  {workflow_name}/
    {workflow_name}.md       # SOP: objective, inputs, outputs, credentials, edge cases
    workflow.json            # Cloud-ready workflow definition (see standard below)
.env                         # API keys and environment variables (NEVER store secrets anywhere else)
credentials.json, token.json # Google OAuth (gitignored)
```

**Workflow folder standard:** Every workflow gets its own folder under `workflows/`. The `.md` is the human-readable SOP; `workflow.json` is the **cloud-ready** workflow definition — Webhook test node removed, cloud credential IDs in place. Update it after each cloud promotion, not during local iteration. The local n8n instance is the working copy; `workflow.json` is the committed production version.

**Core principle:** Local files are just for processing. Anything I need to see or use lives in cloud services. Everything in `.tmp/` is disposable.

---

## n8n Environments

### Local n8n (development & testing)
**URL:** `http://localhost:5678` | **Container:** `n8n-local` | **Version:** 2.4.6
**API key:** stored in `.env` as `N8N_LOCAL_API_KEY`
**Deploy here first.** Test until stable, then promote to cloud.

```bash
# Discover credential IDs on local instance
docker exec n8n-local n8n export:credentials --all

# Inspect webhook_entity table (find actual registered webhook paths)
docker cp n8n-local:/home/node/.n8n/database.sqlite /tmp/n8n_db.sqlite && \
sqlite3 /tmp/n8n_db.sqlite "SELECT webhookPath, method, workflowId FROM webhook_entity;"

# Create workflow on local (POST — use python3 or curl with local API key)
# Activate / deactivate
curl -X POST "http://localhost:5678/api/v1/workflows/{id}/activate" -H "X-N8N-API-KEY: $N8N_LOCAL_API_KEY"
curl -X POST "http://localhost:5678/api/v1/workflows/{id}/deactivate" -H "X-N8N-API-KEY: $N8N_LOCAL_API_KEY"

# Trigger manually (replace with actual path from webhook_entity)
curl "http://localhost:5678/webhook/{workflowId}/{nodeName}/{path}"
```

### Cloud n8n (production)
**URL:** `https://guesty.app.n8n.cloud/`
**API key:** in `n8n-mcp-claude` container env var `N8N_API_KEY`
**MCP tools (`mcp__n8n-mcp__*`) target this instance.** Use them to promote tested workflows.

```bash
# Activate / deactivate on cloud (use python3 — curl has header encoding issues)
python3 -c "
import urllib.request, json
key = '...'  # cloud API key from n8n-mcp-claude container
req = urllib.request.Request('https://guesty.app.n8n.cloud/api/v1/workflows/{id}/activate', method='POST')
req.add_header('X-N8N-API-KEY', key); req.add_header('Content-Length', '0')
print(urllib.request.urlopen(req).read())
"
```

**Important:** Local and cloud have **completely different credential IDs** for the same services. Always map credentials when promoting a workflow.

### Deployment workflow

**Phase 1 — Design**
Use n8n-skills and schema tools (`search_nodes`, `get_node`, `validate_node`) to figure out node parameters and build the workflow JSON. These are knowledge tools — no live instance needed.

**Phase 2 — Local build**
- Deploy to local via REST API with local credential IDs
- Add a **Webhook trigger node** alongside the real trigger (Gmail Trigger, Schedule, etc.)
  - Name it with no spaces (e.g. `"TestWebhook"`)
  - For Gmail-triggered workflows: `TestWebhook` → `Gmail: Get Messages` (limit=1, Label_1, `simple:false`) → feeds into the same first processing node as the real trigger
  - This lets you fire the pipeline on demand without waiting for real events or modifying `lastTimeChecked`

**Phase 3 — Feedback loop (local testing)**
1. Activate the workflow
2. Trigger it: `curl "http://localhost:5678/webhook/{workflowId}/TestWebhook/{path}"`
3. Check result: `GET /api/v1/executions?workflowId={id}&limit=1` or inspect the n8n UI
4. Fix Code nodes → deactivate → PUT the updated workflow JSON → reactivate → repeat
5. Continue until all nodes produce expected output and the final output (email, Slack, etc.) looks correct

**Phase 4 — Promote to cloud**
1. Fetch the final local workflow JSON
2. **Remove the Webhook trigger node** and its connections — production uses only the real trigger
3. Use `n8n_create_workflow` MCP tool to deploy on cloud
4. Swap all credential IDs to their cloud equivalents
5. Activate on cloud
6. **Deactivate local immediately** — this is required, not optional. Both instances maintain independent trigger state (e.g. `lastTimeChecked` for Gmail, poll cursors for other triggers). If both run simultaneously they process the same events independently, producing duplicate outputs (double Slack messages, double emails, etc.). Local stays as an inactive staging reference for future edits.
7. **Save `workflow.json`** in the workflow folder — export the cloud version (Webhook node already removed, cloud credential IDs in place). This is the committed production snapshot.

**n8n public API limitations:**
- No "run now" endpoint — use the Webhook trigger pattern above for on-demand execution
- PUT replaces the full workflow; PATCH is not supported
- Deactivate → PUT → Reactivate to update a live workflow (reregisters webhooks)
- The internal `/rest/` API requires session cookie auth, not the API key

---

## n8n Workflow Building Checklist

Before deploying any workflow, verify each item:

**Node structure**
- [ ] All node `id` fields are valid UUID v4 (not strings like "node-webhook")
- [ ] Webhook trigger node name has **no spaces** (use "Webhook", not "Webhook Trigger")
- [ ] Merge node has `"mode": "append"` explicitly set
- [ ] Any optional branch feeding a Merge emits a **sentinel item** when empty (e.g. `{_noDocs: true}`) so the Merge never stalls
- [ ] `continueOnFail: true` on any external API node that may 403/404

**AI / LLM nodes**
- [ ] Use `chainLlm` + a sub-node connected via `ai_languageModel` — NOT the standalone `googleGemini` "Message a model" node
- [ ] System prompt is in a `SystemMessagePromptTemplate` message value on the chain node
- [ ] Context is passed via `"text": "={{ $json.context }}"` on the chain node

**Credentials**
- [ ] Credential IDs are from the **local n8n instance** for initial deployment (discover with `docker exec n8n-local n8n export:credentials --all`)
- [ ] Cloud n8n and local n8n have completely different credential IDs — never mix them; swap when promoting
- [ ] The GCP project behind each OAuth credential has the required API enabled (Gmail API, Google Docs API, etc.)

**Webhook test trigger (local only — remove before cloud promotion)**
- [ ] A Webhook trigger node is added alongside the real trigger for local feedback loops
- [ ] The webhook node name is a single word (no spaces), e.g. `"TestWebhook"`
- [ ] For Gmail-triggered workflows, the Webhook feeds into `Gmail: Get Messages` (limit=1) → then into the same first processing node as the real trigger
- [ ] After deploying: deactivate → PUT → reactivate to register the webhook
- [ ] Confirm the actual webhook URL from `webhook_entity` in SQLite (format: `/{workflowId}/{nodeName}/{path}`)
- [ ] **Before cloud promotion:** remove the Webhook node and its connections from the workflow JSON

**Gmail nodes**
- [ ] Set `simple: false` on `getAll` to get full email body (`text`, `html`, `textAsHtml` fields)
- [ ] Read body as `e.text || e.textPlain` (plain) and `e.html || e.textHtml` (HTML)
- [ ] Read metadata as `e.subject`, `e.from`, `e.date` (lowercase with `simple: false`)

**LLM Chain output**
- [ ] Read output as `$json.text || $json.output` — `chainLlm` stores result in `text`, not `output`

**PUT payload**
- [ ] Strip to only `{name, nodes, connections, settings, staticData}` before PUT — extra fields cause validation errors

**Testing**
- [ ] Use `newer_than:30d` (or wider) for Gmail queries during testing; revert to `newer_than:7d` for production
- [ ] Trigger via webhook and check execution via `GET /api/v1/executions?workflowId={id}&limit=1`
- [ ] Inspect per-node item counts and errors before marking the workflow as done
- [ ] Verify email body has actual content (not just headers) by checking `emailsText` length in Format Emails node

---

## n8n Technical Gotchas (Learned in Production)

**Webhook node names must not contain spaces (n8n 2.x)**
In n8n 2.x, the production webhook path is `{workflowId}/{nodeName}/{path}`. If the node name has a space (e.g. "Webhook Trigger"), it gets stored URL-encoded (`webhook%20trigger`) in the DB. At query time, Express decodes the URL before the lookup, causing a mismatch — the webhook is permanently unreachable. Always name webhook nodes with no spaces: "Webhook", "TriggerNode", etc.

**Webhook URL format changed in n8n 2.x**
The production URL is `/webhook/{workflowId}/{nodeName}/{path}`, not the simple `/webhook/{path}` that existed in earlier versions. To find the real path: query `webhook_entity` in SQLite or check the n8n editor URL.

**Node IDs must be UUID v4**
Workflow JSON imported with custom string IDs (e.g. `"id": "node-webhook"`) will activate and appear healthy but silently fail to register webhooks. Always generate proper UUIDs: `python3 -c "import uuid; print(uuid.uuid4())"`.

**LangChain AI pattern**
Do NOT use `@n8n/n8n-nodes-langchain.googleGemini` ("Message a model") as a standalone node. It lacks proper context-passing and system prompt support. The correct pattern:
```
chainLlm node  ←(ai_languageModel connection)←  lmChatGoogleGemini node
```
The Gemini model node connects to the chain via the `ai_languageModel` port, not `main`.

**Merge node with parallel branches**
If one branch of a Merge can produce zero items (e.g. no Google Doc URLs found), that branch will block the Merge forever. Fix: always return a sentinel item from optional branches:
```js
if (items.length === 0) { return [{ json: { _noDocs: true, docText: '' } }]; }
```

**n8n execute CLI conflicts with running Docker instance**
`n8n execute --id=...` spawns a new n8n process that tries to bind port 5679 (task broker). If n8n is already running in Docker, this fails. Use the webhook trigger approach instead.

**Credential IDs are instance-specific**
A credential ID from cloud n8n (e.g. `6iZgonUfVmke99un`) does not exist on local n8n. Always run `docker exec n8n-local n8n export:credentials --all` to get the correct local IDs before deploying.

**GCP API enablement**
Google OAuth2 credentials will authenticate successfully but fail on the first API call if the corresponding API (Gmail, Docs, Drive, etc.) is not enabled in the GCP project. Enable it at `https://console.developers.google.com/apis/api/{api}/overview?project={projectId}`. The project ID appears in the first API error message.

**Gmail Trigger `lastTimeChecked` initializes to "now" on first activation**
On first activation with no prior `staticData`, the Gmail Trigger sets `lastTimeChecked` to the current timestamp — meaning it will only pick up emails that arrive *after* activation. Historical emails are ignored. For testing, manually set `staticData` with a past timestamp before activating, or use the Webhook → Gmail: Get Messages pattern to pull specific emails on demand.

**Gmail node `simple` parameter changes field names**
The n8n Gmail node returns different field names depending on `simple`:
- `simple: true` (default): `Subject`, `From`, `Date` (capitalized) — **no body text**
- `simple: false`: `subject`, `from`, `date`, `text` (plain), `html`, `textAsHtml` — **full body included**

Always set `simple: false` on Gmail `getAll` when you need the email body. Write code nodes to handle both variants: `e.text || e.textPlain` for body, `e.html || e.textHtml` for HTML.

**LLM Chain output field is `text`, not `output`**
`@n8n/n8n-nodes-langchain.chainLlm` stores the response in `$json.text`, not `$json.output`. Always read `$json.text || $json.output` to be safe in downstream nodes.

**`chainLlm` replaces `$json` — upstream fields are lost**
After a `chainLlm` node, `$json` contains only `{text: "..."}`. Any fields from upstream nodes (subject, from, date, etc.) are gone from the item. To access them in downstream nodes, reference the upstream node directly: `$node["Build Context"].json.subject`. Always pass needed metadata through a dedicated context-building node before the LLM chain, and read it back via `$node[...]` after.

**Slack node v2 required parameter structure**
The n8n Slack node (v2+) fails activation with "Missing or invalid required parameters" if not structured correctly. Required fields for posting a message:
```json
{
  "select": "channel",
  "channelId": { "__rl": true, "value": "C0AGW3F7H43", "mode": "id" },
  "messageType": "text",
  "text": "={{ $json.slackText }}"
}
```
`select` and the `__rl` resource-locator format on `channelId` are both required — omitting either causes silent failure or activation error.

**PUT /workflows/{id} rejects extra fields**
When fetching a workflow via GET and re-submitting via PUT, strip all read-only fields first. The PUT endpoint only accepts: `name`, `nodes`, `connections`, `settings`, `staticData`. Everything else (`createdAt`, `updatedAt`, `versionId`, `active`, `tags`, etc.) will return a validation error.

**Google Docs node: use document ID, not the full URL**
The n8n Google Docs node v2 `get` operation returns "Bad request" if passed a bare URL like `https://docs.google.com/document/d/{id}` (without `/edit`). Pass the document ID directly (`={{ $json.docId }}`) to avoid ambiguity. Extract the ID from the URL with regex and store it separately from the full URL.

---

## Bottom Line

You sit between what I want (workflows) and what actually gets done (tools). Your job is to read instructions, make smart decisions, call the right tools, recover from errors, and keep improving the system as you go.

Stay pragmatic. Stay reliable. Keep learning.
