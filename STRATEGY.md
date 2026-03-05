# n8n Workflow Builder -- Project Strategy

## Vision

Enable Guesty team members to build production-ready n8n workflows through a conversational AI assistant, with zero coding required. The assistant understands Guesty's data sources, credentials, and business context out of the box.

## Architecture

```
User (browser)
  |
  v
Chat UI (Next.js on Cloud Run, IAP-protected)
  |
  |--> Claude Sonnet 4.6 (Vertex AI, us-east5)
  |       |
  |       |--> get_company_spec(system)     -- Guesty data specs (on-demand)
  |       |--> get_n8n_skill(skill)         -- n8n expert guides (on-demand)
  |       |--> n8n-mcp tools (7 tools)      -- node search, validation, templates
  |       |
  |       v
  |    Workflow JSON
  |
  |--> Deploy to n8n Cloud (guesty.app.n8n.cloud)
  |
  v
Firestore (conversation history, per-department context)
```

### 4-Layer Knowledge Hierarchy

When sources conflict, higher layers take priority:

1. **System prompt** (~162 lines) -- Universal rules: node config overrides, credential keys, trigger rules, expression syntax, no-Code-node preference. Static for prompt caching.
2. **Department config** (`departments.ts`) -- Per-dept credentials, spec scope, prompt rules. Injected via first user message (preserves prompt cache).
3. **Company specs** (`specs/02_SRC_*.md`) -- On-demand via `get_company_spec()`. Schema, tables, joins, verified SQL. Department-agnostic and reusable.
4. **n8n skills** (`n8n-skills/`) -- On-demand via `get_n8n_skill()`. Deep reference for Code nodes, validation errors, complex patterns. Rarely needed.

### Phase-Gated Workflow Building

Every workflow goes through 4 phases enforced by the system prompt:

1. **Understand** -- Clarifying questions (trigger, systems, output, edge cases)
2. **Validate Data** -- Show SQL/SOQL/payload, get user confirmation. Must be a separate turn.
3. **Build** -- Construct workflow JSON using validated data. Copy SQL character-for-character.
4. **Deliver** -- Output JSON, explain nodes, mention Deploy button.

### Department Scoping

6 departments, each with scoped credentials and spec access:

| Department | Spec Scope | Credential Count |
|------------|-----------|-----------------|
| Marketing  | hubspot, join_map, credentials | 25 (24 sandbox + 1 prod) |
| CS         | salesforce, csm, zendesk, jira, join_map, credentials | ~10 |
| CX         | zendesk, jira, salesforce, admin_data, join_map, credentials | ~10 |
| OB         | salesforce, admin_data, zendesk, join_map, credentials | ~8 |
| Payments   | zuora, admin_data, salesforce, join_map, credentials | ~8 |
| Finance    | zuora, admin_data, salesforce, join_map, credentials | ~8 |

Adding a department = adding a config entry in `departments.ts`. No code changes needed.

## Current Capabilities

- **6 departments** with scoped credentials and spec access
- **11 data source specs**: Salesforce, Zendesk, Jira, HubSpot, CSM, Zuora, HiBob, Siit, Gus, AdminData (+Modjo alias to CSM)
- **7 n8n expert skills**: Code (JS/Python), expressions, validation, node config, workflow patterns, MCP tools
- **9 tools** available to Claude (7 n8n-mcp + 2 knowledge)
- **Native node support**: Salesforce, Zendesk, Jira, BigQuery, Slack, Google Sheets
- **Phase-gated** workflow building with user confirmation gates
- **One-click deploy** to n8n cloud (guesty.app.n8n.cloud), tagged "AI Generated"
- **Conversation persistence** in Firestore with department context

## Tested & Verified

| Test Case | Department | Description | Status | Date |
|-----------|-----------|-------------|--------|------|
| UC1 | Finance | Zuora product_catalog vs invoice_items fee reconciliation | REDESIGNED (untested) | Mar 5, 2026 |
| UC2 | CX | Zendesk open tickets aging report by account | REDESIGNED (boolean IFNULL fix applied) | Mar 5, 2026 |
| UC3 | CS | Salesforce native node health score alert | PASS | Mar 4, 2026 |
| Marketing dept | Marketing | Spec loading, credential scoping, phase gates | PASS | Mar 2026 |

UC1 and UC2 were redesigned after discovering original prompts targeted data that didn't exist in production (admin `payment_processing_plan_value` was NULL; Jira "Accounting" labels and Zendesk `jira_ids` were unpopulated).

### Node Config Overrides (verified across all UCs)

These override both Claude's pre-training AND get_node output:

| Node | Override | Why |
|------|---------|-----|
| BigQuery | credential key = `"googleApi"` | Pre-training says googleBigQueryOAuth2Api |
| BigQuery | projectId = plain string `"guesty-data"` | get_node returns object with mode/value |
| Salesforce | credential key = `"salesforceOAuth2Api"` | Pre-training varies |
| Salesforce | SOQL via resource=`"search"`, operation=`"query"` | Not obvious from docs |
| Slack v2.4 | `"select": "channel"`, channelId with mode/name | New in v2.4 |
| Merge v3 | `"combineBy": "combineByPosition"` (NOT `"combinationMode"`) | v2→v3 rename |

### BigQuery Query Gotchas (verified across UCs)

| Gotcha | Impact | Fix |
|--------|--------|-----|
| Boolean columns NULL not FALSE | `col = FALSE` returns 0 rows | `IFNULL(col, FALSE) = FALSE` |
| EXISTS in JOIN ON | n8n BQ node error | CTE+UNNEST to pre-flatten, then equality JOIN |
| Column name hallucination | Wrong table/column for query | Verified SQL examples in specs (95% effective) |

### Guardrail Effectiveness Ranking

| Guardrail Type | Effectiveness | Example |
|---------------|--------------|---------|
| Verified SQL examples in specs | ~95% | AI adapts working SQL rather than constructing from scratch |
| Correct/wrong JSON examples | ~90% | BigQuery projectId, Merge v3 combineBy |
| Text rules in system prompt | ~70% | "Use spec column names", "never invent credentials" |
| Pre-training knowledge | ~60% (often wrong for node configs) | Gets credential keys, param names wrong |

## Known Weaknesses

1. **jira_ids substring matching** -- Spec guidance exists (SQL SPLIT, JS split+includes) but Claude doesn't always follow it. Uses LIKE or indexOf ~30% of the time. Documented as soft gap.
2. **Phase 1 skip soft gap** -- Even with strict escape clause ("must have ALL details explicit"), AI occasionally embeds questions inside Phase 2 SQL. ~80% compliance.
3. **No automated regression testing** -- Manual UC testing via Python scripts. `tools/` directory has test harness but requires running chat UI.
4. **No chat-ui unit/integration tests** -- Auth, MCP bridge, deploy logic untested programmatically.
5. **bigquery/ and specs/ partially overlap** -- bigquery/ is for manual SQL exploration, specs/ is for AI workflow building.
6. **Cloud Run IAP toggle is manual** -- Not yet automated in deploy scripts.
7. **UC1 and UC2 need re-verification** -- Both redesigned (Mar 5) but not yet fully tested end-to-end with new prompts.

## Immediate Next Actions

1. ~~Flatten folder structure~~ -- DONE (Mar 2026). Monorepo at root, `_archive/` for old versions.
2. ~~Testing automation~~ -- DONE. tools/ directory with test_workflow.py, audit_workflow.py, run_regression.py.
3. ~~CLAUDE.md rewrite~~ -- DONE. Updated for departments, node config overrides, BigQuery gotchas.
4. ~~Deploy to Cloud Run~~ -- DONE (Mar 5, 2026). GitHub repo: `alvarocubaa/n8n-workflow-builder`.
5. **Re-verify UC1 and UC2** -- Both redesigned, need end-to-end testing with new prompts.
6. **Automated regression** -- Wire `run_regression.py` into CI/CD pipeline.

## Future Improvements

### Short-term (weeks)
- Automated regression test suite (run all UCs on every rebuild)
- CI/CD pipeline (Cloud Build: test -> deploy)
- Chat-ui unit tests (auth, mcp-bridge, deploy logic)
- Add deprecation note to bigquery/CLAUDE.md

### Medium-term (months)
- More department-specific prompt rules (04_DEPT_* guides)
- Webhook-triggered workflows (not just schedule+BQ patterns)
- User feedback loop (thumbs up/down on generated workflows)
- Workflow version history in Firestore
- Template library: save successful workflows as reusable templates

### Long-term (architectural)
- **Vector database for specs** -- As specs grow beyond ~25 files or 500KB total, flat .md loading with string matching won't scale. Options: Vertex AI Vector Search, Pinecone, pgvector. Trigger: when spec count exceeds ~25 or total spec size exceeds 500KB.
- **Multi-model routing** -- Haiku for simple workflows (schedule+BQ+Slack), Sonnet for complex (AI agents, parallel branches). Could reduce cost 80% for simple cases.
- **Self-improving loop** -- Capture deployed workflow execution results, feed back into specs (e.g., "this SQL pattern failed in production, use X instead").
- **Workflow diff and versioning** -- Track changes to deployed workflows, show diffs, enable rollback.

## Performance Benchmarks

| Workflow Type | Latency | Tool Calls | Skills Loaded |
|--------------|---------|------------|---------------|
| Standard (schedule+BQ+Slack) | ~18s | 2 | 0 |
| Code node (webhook+JS+BQ) | ~18s | 2 | 1 (javascript) |
| Complex AI agent (Zendesk+Claude) | ~165s | 21 | 1 (patterns) |

## Claude 4.6 Prompt Engineering Learnings

Key discoveries from iterative testing:

- **Calm language over aggressive**: "WILL fail", "MANDATORY" causes overtriggering (loading 6 skills when 0-1 suffice). Factual descriptions work better.
- **On-demand skill loading wins**: Upfront "mandatory" skills = 152s latency + skipped Phase 2. On-demand = 18s + correct behavior.
- **SKILL.md only, not supporting files**: Concatenating all supporting files (200-722% overhead) causes "Lost in the Middle" attention degradation.
- **Phase gates need structural enforcement**: "Phase 2 and Phase 3 must be separate conversation turns" works.
- **No spec auto-injection needed**: Claude reliably calls get_company_spec() on its own.
- **Credentials: inline top-4, tool for rest**: Full credentials guide in system prompt was redundant.
