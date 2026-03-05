# n8n Workflow Builder — Guesty

AI-powered n8n workflow builder for the Guesty team. Describe a workflow in plain English → the AI asks clarifying questions, validates the data layer (SQL/payloads confirmed before building), then produces production-ready n8n JSON you can deploy directly to the n8n instance.

## Architecture

```
Browser
  → Google IAP (SSO — injects user email)
    → chat-ui  (Next.js, Cloud Run)
        ├── Gemini 2.5 Pro (streaming + tool-call loop)
        ├── n8n skills: get_n8n_skill() → n8n-skills/skills/
        ├── Company specs: get_company_spec() → specs/
        ├── n8n-mcp tools (search, validate, CRUD) → n8n-mcp service
        ├── Deploy button → POST /api/deploy → guesty.app.n8n.cloud
        └── Firestore: per-user conversation history
              ↓ internal
    → n8n-mcp  (MCP server, Cloud Run)
        └── 80+ n8n tools via HTTP JSON-RPC
```

## Repository Structure

```
n8n-builder-cloud-claude/
├── chat-ui/          # Next.js chat app (the main product)
├── n8n-mcp/          # MCP server (80+ n8n tools)
├── n8n-skills/       # n8n expert skill guides (SKILL.md per skill)
├── specs/            # Guesty company specs (credentials, schemas, join keys)
├── bigquery/         # BigQuery reference docs (dev/verification use only)
├── docker-compose.yml
├── deploy-cloudrun.sh
└── .env              # API keys (gitignored)
```

## Knowledge Layers

| Layer | Folder | Loaded by |
|-------|--------|-----------|
| n8n skills | `n8n-skills/skills/` | `get_n8n_skill()` tool |
| Company specs | `specs/` | `get_company_spec()` tool + auto-injection — includes credentials, schemas, join keys, and SQL patterns |
| n8n tools | n8n-mcp HTTP | MCP bridge |

## Local Development

```bash
# 1. Ensure .env exists at root
# (fill in N8N_API_KEY, AUTH_TOKEN, GEMINI_API_KEY, MOCK_USER_EMAIL)

# 2. Start both services
docker-compose up -d

# 3. Open the chat UI
open http://localhost:3002
```

n8n-mcp runs on `:3001`, chat-ui on `:3002`. Auth is bypassed locally via `MOCK_USER_EMAIL` in `.env`.

## Required `.env` Values

```env
# n8n Cloud instance
N8N_API_URL=https://guesty.app.n8n.cloud
N8N_API_KEY=<from n8n Settings → API>

# n8n-mcp auth
AUTH_TOKEN=<random token>

# Gemini
GEMINI_API_KEY=<from Google AI Studio>

# Local dev auth bypass
MOCK_USER_EMAIL=your@guesty.com
```

## Workflow Deployment

Every workflow JSON the AI produces includes a **"Deploy to n8n"** button.
Clicking it:
1. Creates the workflow in `guesty.app.n8n.cloud` (inactive, prefixed `[AI]`)
2. Tags it **"AI Generated"** for easy filtering in the n8n UI
3. Returns an "Open in n8n ↗" link

Users configure their own personal credentials (Gmail, Sheets, personal Slack, Jira) after deploying.
Shared credentials (BigQuery, Salesforce, Zendesk, Slack bot, Modjo, Zuora, HiBob) are pre-configured
in the instance — see `specs/01_INFRA_Credentials_Guide.md`.

## Cloud Run Deployment

```bash
export GCP_PROJECT_ID=agentic-workflows-485210
./deploy-cloudrun.sh
```

IAP fronts `chat-ui` — users authenticate with their Guesty Google account automatically.

Both services run as the `n8n-workflow-builder` dedicated SA. chat-ui calls n8n-mcp using SA-to-SA auth:
Google identity token in `Authorization` (satisfies Cloud Run IAM) + MCP token in `X-MCP-Auth` (satisfies n8n-mcp app auth).
Detection: `K_SERVICE` env var (set automatically in Cloud Run) switches mcp-bridge to identity-token mode.

## BigQuery Reference

`bigquery/` contains SQL-first docs for all Guesty data sources — useful when verifying
schemas or writing test queries with the MCP Toolbox (`toolbox --prebuilt bigquery --stdio`).

**Key gotcha:** `zuora_analytics.invoices` joins to Guesty accounts via `mongo_account_id`, NOT `account_id`. See `bigquery/JOIN_MAP.md`.
