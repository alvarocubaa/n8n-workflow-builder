# Zendesk — BigQuery Reference

## Tables
| Table | Full path | Description |
|-------|-----------|-------------|
| tickets_clean | `guesty-data.zendesk_analytics.tickets_clean` | Main ticket table (~30K tickets/month) |
| incoming_outgoing | `guesty-data.zendesk_analytics.incoming_outgoing` | Ticket event stream (replies, comments) |
| productivity_hourly | `guesty-data.zendesk_analytics.productivity_hourly` | Agent hourly availability stats |

---

## tickets_clean

Primary Zendesk table. Each row = one support ticket. Contains sentiment scoring, account linking, and Jira cross-reference.

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `ticket_id` | STRING | Ticket identifier |
| `account_id` | STRING | Guesty account ID (= `accounts._id`) |
| `sf_account_id` | STRING | Salesforce Account ID (= `dim_accounts.sf_account_id`) |
| `account_name` | STRING | Account name (denormalized) |
| `ticket_url` | STRING | Zendesk ticket URL |
| `created_at` | TIMESTAMP | Ticket creation time |
| `updated_at` | TIMESTAMP | Last update time |
| `ticket_status` | STRING | open / pending / solved / closed |
| `subject` | STRING | Ticket subject |
| `description` | STRING | First message body |
| `assignee_email` | STRING | Assigned agent email |
| `assignee_name` | STRING | Assigned agent name |
| `sentiment` | STRING | Positive / Negative / Neutral |
| `negative_sentiment` | INTEGER | Risk score (higher = more negative) |
| `satisfaction_rating` | STRING | CSAT score |
| `urgency` | STRING | Urgency classification |
| `jira_ids` | STRING | Comma-separated Jira issue keys linked to this ticket |
| `csm` | STRING | Customer Success Manager |
| `months_in_guesty` | FLOAT | Account tenure in months |
| `onboarding_status` | STRING | Onboarding phase |

### Joins

| Target | Join condition |
|--------|----------------|
| `datalake_glue.accounts` | `tickets_clean.account_id = accounts._id` |
| `guesty_analytics.dim_accounts` | `tickets_clean.account_id = dim_accounts.account_id` OR `tickets_clean.sf_account_id = dim_accounts.sf_account_id` |
| `csm.modjo_transcripts_structured` | `tickets_clean.sf_account_id = modjo.account_crm_id` |
| `zendesk_analytics.incoming_outgoing` | `tickets_clean.ticket_id = incoming_outgoing.ticket_id` |
| `zuora_analytics.invoices` | `tickets_clean.account_id = invoices.mongo_account_id` ⚠️ |
| `jira.jira_hierarchy` by account | `tickets_clean.account_id` IN `UNNEST(jira_hierarchy.account_ids)` |
| `jira.jira_hierarchy` by issue | `tickets_clean.jira_ids LIKE CONCAT('%', jira_hierarchy.subtask, '%')` |

### Verified stats (as of 2026-02)
- ~30,601 tickets in last 30 days across ~6,163 unique accounts

---

## incoming_outgoing

Event stream for ticket interactions (incoming messages / outgoing replies).

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | STRING | Event identifier |
| `ticket_id` | STRING | Parent ticket |
| `ticket_url` | STRING | Ticket URL |
| `e_created_at` | TIMESTAMP | Event timestamp |
| `event_user_name` | STRING | User name |
| `event_user_email` | STRING | User email |
| `direction` | STRING | incoming / outgoing |
| `channel` | STRING | Communication channel |
| `status` | STRING | Event status |

### Join
```sql
incoming_outgoing.ticket_id = tickets_clean.ticket_id
```

---

## productivity_hourly

Agent-level hourly availability metrics (no ticket-level keys).

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `agent_email` | STRING | Agent email (join to `tickets_clean.assignee_email`) |
| `agent_name` | STRING | Agent name |
| `month` | DATE | Month |
| `active_hour` | TIMESTAMP | Hour slot |
| `position_hrs` | FLOAT | Hours in queue |
| `avail_hrs` | FLOAT | Available hours |
| `break_hrs` | FLOAT | Break hours |
| `queue_hrs` | FLOAT | Queue hours |
| `overtime_hrs` | FLOAT | Overtime hours |
| `tickets` | INTEGER | Tickets handled in hour |
| `positive` | INTEGER | Positive sentiment count |
| `negative` | INTEGER | Negative sentiment count |

### Join
```sql
productivity_hourly.agent_email = tickets_clean.assignee_email
```

---

## Common query patterns

```sql
-- Ticket volume + sentiment last 30 days
SELECT
  COUNT(*)                                AS total_tickets,
  COUNT(DISTINCT account_id)              AS unique_accounts,
  COUNTIF(sentiment = 'Negative')         AS negative_count,
  AVG(negative_sentiment)                 AS avg_neg_score
FROM `guesty-data.zendesk_analytics.tickets_clean`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);
-- Verified: 30,601 tickets, 6,163 accounts (Feb 2026)

-- Top accounts by ticket count (with Modjo calls)
SELECT
  t.account_id,
  t.account_name,
  COUNT(DISTINCT t.ticket_id)   AS ticket_count,
  COUNT(DISTINCT m.callId)      AS call_count
FROM `guesty-data.zendesk_analytics.tickets_clean` t
LEFT JOIN `guesty-data.csm.modjo_transcripts_structured` m
  ON t.sf_account_id = m.account_crm_id
WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY t.account_id, t.account_name
ORDER BY ticket_count DESC
LIMIT 10;

-- Tickets linked to a Jira issue
SELECT t.ticket_id, t.subject, t.ticket_status, t.account_name
FROM `guesty-data.zendesk_analytics.tickets_clean` t
WHERE t.jira_ids LIKE '%PROJ-1234%';

-- Agent productivity last month
SELECT
  p.agent_name,
  SUM(p.tickets)     AS total_tickets,
  SUM(p.avail_hrs)   AS total_avail_hrs,
  SUM(p.positive)    AS positive_count,
  SUM(p.negative)    AS negative_count
FROM `guesty-data.zendesk_analytics.productivity_hourly` p
WHERE p.month >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
GROUP BY p.agent_name
ORDER BY total_tickets DESC;
```

## Filters & limits
- Default date filter: last 30 days (`created_at >= TIMESTAMP_SUB(...)`)
- Status filter: `WHERE ticket_status = 'closed'` or `IN ('open','pending')`
- Max ~50 tickets per account per run for n8n workflows
