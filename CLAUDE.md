# n8n Workflow Builder -- Claude Code Instructions

## Project overview
AI-powered chat UI for building production-ready n8n workflows at Guesty. Claude-only (Vertex AI), phase-gated, department-scoped.

For project strategy, architecture, and roadmap see `STRATEGY.md`.

## Folder structure
- `chat-ui/` -- Next.js app (Claude Sonnet 4.6 via Vertex AI)
- `n8n-mcp/` -- MCP server exposing n8n workflow tools (search_nodes, validate_node, etc.)
- `n8n-skills/` -- 7 expert skill guides (expressions, code, validation, patterns, etc.)
- `specs/` -- 11 company data source specs (Salesforce, Zendesk, Jira, HubSpot, CSM, Zuora, etc.)
- `bigquery/` -- SQL-first reference docs for manual BigQuery exploration (NOT used by AI at runtime)
- `tools/` -- Testing automation: audit_workflow.py, test_workflow.py, run_regression.py
- `examples/` -- Verified workflow JSON outputs from UC testing

## Key source files
- `chat-ui/src/lib/system-prompt.ts` -- The system prompt (~162 lines). Static for prompt caching.
- `chat-ui/src/lib/departments.ts` -- Department config: credentials, spec scope, prompt rules. SINGLE source of truth for credentials.
- `chat-ui/src/lib/claude.ts` -- Claude API integration, tool handling, knowledge tools.
- `chat-ui/src/lib/knowledge.ts` -- Reads specs and skills from filesystem.

## Node config overrides (critical)
These override Claude's pre-training AND get_node output:
- BigQuery credential key: `"googleApi"` (NOT googleBigQueryOAuth2Api)
- BigQuery projectId: plain string `"guesty-data"` (NOT `{ mode, value }` object)
- Salesforce credential key: `"salesforceOAuth2Api"`, SOQL: resource=`"search"`, operation=`"query"`
- Slack v2.4: `"select": "channel"`, `"channelId": { "mode": "name", "value": "#channel-name" }`

## When editing system prompt or departments
- Keep system prompt static and concise (prompt caching). Per-dept context goes in user messages.
- Three-location sync when adding/renaming specs:
  1. `knowledge.ts` -> SPEC_FILE_MAP
  2. `claude.ts` -> ALL_SPEC_KEYS
  3. `system-prompt.ts` -> `<tools_guidance>` spec list

## When doing BigQuery work
1. Read `bigquery/CLAUDE.md` for setup context
2. Read `bigquery/JOIN_MAP.md` for cross-source join conditions
3. Use `execute_sql` MCP tool to run queries
4. Gotcha: `zuora_analytics.invoices` joins to Guesty via `mongo_account_id` NOT `account_id`

## Testing
```bash
# Audit a workflow JSON
python tools/audit_workflow.py /tmp/workflow.json --expected-creds '{"slackApi":"abc123"}'

# End-to-end test (requires chat UI running on localhost:3004)
python tools/test_workflow.py --department cs --prompt "Create a daily workflow..."

# Run all regression tests
python tools/run_regression.py
```

## Local dev
```bash
docker-compose up -d          # Ports 3003 (mcp), 3004 (ui)
docker-compose build chat-ui  # Rebuild after chat-ui changes
```

## Deployment
- GCP project: `agentic-workflows-485210` (europe-west1)
- Cloud Run: `n8n-chat-ui` (IAP-protected), `n8n-mcp-cloud` (internal-only)
- n8n instance: `guesty.app.n8n.cloud`, AI Generated tag: `8pUFynxIQ58Bfpba`
- SA: `n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com`
