# BigQuery — Guesty Data Reference

> **Note:** For AI workflow building, use `specs/02_SRC_*.md` instead. This directory is for manual BigQuery exploration with the `execute_sql` MCP tool.

This folder is a **self-contained** BigQuery reference for Guesty data sources.
Use it in any Claude Code project to write correct SQL against the Guesty `guesty-data` GCP project.

---

## Setup

### 1. Install MCP Toolbox (Google's official BigQuery MCP)

```bash
brew install mcp-toolbox   # macOS
# or: https://github.com/googleapis/mcp-toolbox-for-databases/releases
```

### 2. Configure ADC (Application Default Credentials)

```bash
gcloud auth application-default login
# Sign in with the account that has BigQuery access to guesty-data
```

### 3. Add MCP server to `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "bigquery": {
      "command": "toolbox",
      "args": ["--prebuilt", "bigquery", "--stdio"],
      "env": {
        "BIGQUERY_PROJECT": "guesty-data"
      }
    }
  }
}
```

Restart Claude Code after updating settings. Verify with: `toolbox --version`

### Available MCP tools (after setup)

| Tool | What it does |
|------|-------------|
| `execute_sql` | Run any SQL query against `guesty-data` |
| `list_dataset_ids` | List all datasets |
| `list_table_ids` | List tables in a dataset |
| `get_table_info` | Get schema for a table |
| `search_catalog` | Search for tables/columns by keyword |

---

## GCP Project

**All tables live in:** `guesty-data`

Never use other project names (e.g. `agentic-workflows-485210`, `payments_processing`) unless explicitly confirmed.

---

## Datasets & Tables

| Dataset | Table | Description |
|---------|-------|-------------|
| `datalake_glue` | `accounts` | Raw Guesty accounts — primary source of `account_id` (= MongoDB ObjectId, e.g. `5af9f246...`) |
| `guesty_analytics` | `dim_accounts` | Salesforce-enriched accounts — has both `account_id` and `sf_account_id` |
| `guesty_analytics` | `dim_listings` | Property/listing data |
| `guesty_analytics` | `fact_reservations` | Reservation data |
| `zendesk_analytics` | `tickets_clean` | Support tickets — use `account_id` to join, `created_at` (TIMESTAMP) for time filtering |
| `zendesk_analytics` | `incoming_outgoing` | Ticket volume metrics |
| `zendesk_analytics` | `productivity_hourly` | Agent productivity data |
| `zuora_analytics` | `invoices` | Billing invoices — join via **`mongo_account_id`** ⚠️ (see critical note below) |
| `zuora_analytics` | `invoice_items` | Line items per invoice |
| `zuora_analytics` | `product_catalog` | Products/plans — `account_id` here IS the Guesty account_id |
| `jira` | `jira_hierarchy` | Issues with full hierarchy — `account_ids` is REPEATED (use UNNEST) |
| `jira` | `jira_issues_base` | Raw Jira issue data |
| `jira` | `jira_epic` | Epic-level data |
| `csm` | `modjo_transcripts_structured` | Call recordings and AI-analyzed transcripts — join via `account_crm_id = sf_account_id` |

---

## ⚠️ Critical: Zuora `mongo_account_id`

`zuora_analytics.invoices` and `invoice_items` have **TWO** account ID columns:

| Column | What it is | Use for joining? |
|--------|-----------|-----------------|
| `mongo_account_id` | Guesty account ID (format: `5af9f246...`) | ✅ YES — join to `accounts._id`, `dim_accounts.account_id`, `tickets_clean.account_id` |
| `account_id` | Zuora's internal ID (format: `8a368c89...`) | ❌ NO — never use for cross-source joins |

**Always use `invoices.mongo_account_id`** when joining Zuora data to any other Guesty source.

`product_catalog.account_id` IS the Guesty account_id (no issue there).

---

## Universal Join Map

The Guesty `account_id` is a MongoDB ObjectId string (e.g. `5af9f246ab1234...`).

| Source | Table | Column = Guesty account_id |
|--------|-------|---------------------------|
| Admin Data | `datalake_glue.accounts` | `_id` |
| Salesforce | `guesty_analytics.dim_accounts` | `account_id` |
| Zendesk | `zendesk_analytics.tickets_clean` | `account_id` |
| Zuora | `zuora_analytics.invoices` | **`mongo_account_id`** ⚠️ |
| Zuora | `zuora_analytics.product_catalog` | `account_id` |
| Modjo | `csm.modjo_transcripts_structured` | via `account_crm_id = dim_accounts.sf_account_id` |
| Jira | `jira.jira_hierarchy` | `account_ids` (REPEATED — use UNNEST) |

### Key join conditions

```sql
-- dim_accounts ↔ accounts (Admin Data)
dim_accounts.account_id = accounts._id

-- dim_accounts ↔ tickets_clean (Zendesk)
dim_accounts.account_id = tickets_clean.account_id

-- dim_accounts ↔ invoices (Zuora) ⚠️
dim_accounts.account_id = invoices.mongo_account_id

-- dim_accounts ↔ modjo (via sf_account_id)
dim_accounts.sf_account_id = modjo_transcripts_structured.account_crm_id

-- dim_accounts ↔ jira (UNNEST required)
dim_accounts.account_id IN UNNEST(jira_hierarchy.account_ids)
-- or:
CROSS JOIN UNNEST(jira_hierarchy.account_ids) AS aid
WHERE aid = dim_accounts.account_id
```

---

## Common Patterns

### Accounts with ticket counts (Zendesk)

```sql
SELECT
  a.account_id,
  a.account_name,
  COUNT(t.ticket_id) AS ticket_count
FROM `guesty-data.guesty_analytics.dim_accounts` a
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON a.account_id = t.account_id
WHERE a.account_active = TRUE
  AND t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY a.account_id, a.account_name
ORDER BY ticket_count DESC
LIMIT 50;
```

### Billing data (Zuora — use mongo_account_id)

```sql
SELECT
  a.account_name,
  SUM(i.amount) AS total_invoiced_usd
FROM `guesty-data.zuora_analytics.invoices` i
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON i.mongo_account_id = a.account_id   -- ⚠️ mongo_account_id, not account_id
WHERE i.status = 'Posted'
  AND i.invoiceDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY a.account_name
ORDER BY total_invoiced_usd DESC
LIMIT 20;
```

### Jira issues per account (UNNEST)

```sql
SELECT
  a.account_name,
  j.story,
  j.story_summary,
  j.story_status
FROM `guesty-data.jira.jira_hierarchy` j
CROSS JOIN UNNEST(j.account_ids) AS aid
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON aid = a.account_id
WHERE j.story_status NOT IN ('Done', 'Closed')
LIMIT 50;
```

### Multi-source (accounts + tickets + calls)

```sql
SELECT
  a.account_id,
  a.account_name,
  COUNT(DISTINCT t.ticket_id)  AS ticket_count,
  COUNT(DISTINCT m.callId)     AS call_count
FROM `guesty-data.guesty_analytics.dim_accounts` a
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON a.account_id = t.account_id
LEFT JOIN `guesty-data.csm.modjo_transcripts_structured` m
  ON a.sf_account_id = m.account_crm_id
WHERE a.account_active = TRUE
  AND t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY a.account_id, a.account_name
ORDER BY ticket_count DESC
LIMIT 20;
```

---

## Best Practices

- Always add `LIMIT` during exploration (remove for production aggregations)
- Filter tickets by `created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL N DAY)` (TIMESTAMP, not DATE)
- Filter calls by `duration > 120` to exclude short/test calls
- Zuora: filter invoices by `status = 'Posted'` for finalized billing data
- Jira: use `ARRAY_LENGTH(account_ids) > 0` to get only issues linked to accounts
- For `dim_accounts`, use `account_active = TRUE` to filter to active customers

---

## File Index

| File | Contents |
|------|---------|
| `JOIN_MAP.md` | Complete join map with visual diagram and verified examples |
| `admin_data.md` | `datalake_glue.accounts` — raw account data, REPEATED fields |
| `salesforce.md` | `dim_accounts`, `dim_listings`, `fact_reservations` |
| `zendesk.md` | `tickets_clean`, `incoming_outgoing`, `productivity_hourly` |
| `zuora.md` | `invoices`, `invoice_items`, `product_catalog` — includes Zuora-specific gotchas |
| `jira.md` | `jira_hierarchy` (10+ tables) — UNNEST patterns |
| `modjo.md` | `modjo_transcripts_structured` — call recordings, AI summaries |
