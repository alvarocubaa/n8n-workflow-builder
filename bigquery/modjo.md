# Modjo (Call Intelligence) — BigQuery Reference

## Table
`guesty-data.csm.modjo_transcripts_structured`

Call recordings and AI-analyzed transcripts from Modjo. Each row = one call. Linked to Salesforce accounts via `account_crm_id` (= `sf_account_id`). Has no direct Guesty `account_id` — requires `dim_accounts` as bridge.

## Primary key
`callId` (INTEGER)

## Key columns

| Column | Type | Description |
|--------|------|-------------|
| `callId` | INTEGER | Modjo call identifier |
| `account_id` | INTEGER | Modjo internal account ID (NOT the Guesty account_id) |
| `account_crm_id` | STRING | **Salesforce Account ID** (= `dim_accounts.sf_account_id`) — use this for joining |
| `startDate` | DATE | Call date |
| `call_timestamp` | TIMESTAMP | Call start timestamp |
| `duration` | FLOAT | Call duration in seconds |
| `transcript` | STRING | Full call transcript |
| `summary_interaction` | STRING | AI-generated call summary |
| `risk_churn` | STRING | Churn risk signal from call |
| `risk_commercial` | STRING | Commercial risk signal |
| `risk_technical` | STRING | Technical risk signal |
| `opportunity_growth` | STRING | Growth opportunity signals |
| `open_action_items` | STRING | Action items identified in call |
| `resolved_issues` | STRING | Issues resolved during call |

## ⚠️ No direct Guesty account_id

Modjo uses `account_crm_id` which equals Salesforce's `sf_account_id`. To join to Guesty accounts, always bridge through `dim_accounts`:

```
modjo.account_crm_id → dim_accounts.sf_account_id → dim_accounts.account_id → accounts._id
```

## Joins

```sql
-- Modjo → dim_accounts (bridge)
modjo_transcripts_structured.account_crm_id = dim_accounts.sf_account_id

-- Modjo → tickets_clean (direct via sf_account_id)
modjo_transcripts_structured.account_crm_id = tickets_clean.sf_account_id

-- Modjo → Jira (via dim_accounts bridge)
modjo.account_crm_id = dim_accounts.sf_account_id
dim_accounts.account_id IN UNNEST(jira_hierarchy.account_ids)
```

## Common query patterns

```sql
-- Calls per account in last 30 days
SELECT
  m.account_crm_id,
  a.account_name,
  COUNT(m.callId)       AS call_count,
  AVG(m.duration/60.0) AS avg_duration_min
FROM `guesty-data.csm.modjo_transcripts_structured` m
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON m.account_crm_id = a.sf_account_id
WHERE m.startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY m.account_crm_id, a.account_name
ORDER BY call_count DESC
LIMIT 20;

-- Calls with churn risk signals
SELECT
  m.callId,
  m.startDate,
  a.account_name,
  m.risk_churn,
  m.risk_technical,
  m.summary_interaction
FROM `guesty-data.csm.modjo_transcripts_structured` m
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON m.account_crm_id = a.sf_account_id
WHERE m.risk_churn IS NOT NULL
  AND m.risk_churn != ''
  AND m.startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
ORDER BY m.startDate DESC;

-- 3-source: accounts with both tickets and calls
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
HAVING call_count > 0
ORDER BY ticket_count DESC
LIMIT 20;
```

## Filters & limits
- Filter calls by `duration > 120` to exclude very short/test calls
- Date range: `startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)`
- Max 50-100 rows per run for transcript/summary fields
