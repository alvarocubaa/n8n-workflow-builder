# Cross-Source Join Map — Guesty BigQuery

> Single-page reference for all cross-source joins. Use this before writing any multi-table query.
> All tables are in project `guesty-data`.

## The universal key: account_id

Every data source links via **Guesty's internal account ID** (MongoDB ObjectId string, e.g. `5ce6cd0de8f5d90021be7ed6`). Each table uses a different column name for the same value:

| Table | Column name for Guesty account_id |
|-------|----------------------------------|
| `datalake_glue.accounts` | **`_id`** |
| `guesty_analytics.dim_accounts` | **`account_id`** |
| `guesty_analytics.dim_listings` | **`account_id`** |
| `guesty_analytics.fact_reservations` | **`account_id`** |
| `zendesk_analytics.tickets_clean` | **`account_id`** |
| `zendesk_analytics.incoming_outgoing` | *(join via ticket_id, not account_id)* |
| `zendesk_analytics.productivity_hourly` | *(join via agent_email, not account_id)* |
| `zuora_analytics.invoices` | **`mongo_account_id`** ⚠️ (NOT `account_id` — that's Zuora's own ID) |
| `zuora_analytics.invoice_items` | **`mongo_account_id`** ⚠️ |
| `zuora_analytics.product_catalog` | **`account_id`** ✓ (IS the Guesty account_id here) |
| `jira.jira_hierarchy` | **`account_ids`** (REPEATED STRING — requires `UNNEST`) |
| `csm.modjo_transcripts_structured` | *(no direct account_id — join via sf_account_id bridge)* |
| `marketing_data.marketing_data` | **`guesty_account_id`** |
| `marketing_data.hubspot_emails_events` | **`account_id`** |

## Secondary key: sf_account_id (Salesforce 18-char ID)

| Table | Column |
|-------|--------|
| `guesty_analytics.dim_accounts` | `sf_account_id` |
| `zendesk_analytics.tickets_clean` | `sf_account_id` |
| `csm.modjo_transcripts_structured` | `account_crm_id` |
| `marketing_data.marketing_data` | `sf_account_id` |
| `marketing_data.hubspot_contacts` | `salesforce_accountid` / `salesforceaccountid` |

## Tertiary key: email (HubSpot / Marketing data)

| Table | Column |
|-------|--------|
| `marketing_data.hubspot_contacts` | `email` |
| `marketing_data.hubspot_form_submissions` | `email` |
| `marketing_data.hubspot_chilipiper` | `email` |
| `marketing_data.hubspot_emails_events` | `recipient` |
| `marketing_data.marketing_data` | `lead_email` |
| `marketing_data.leads_contacts` | `lead_email` |
| `marketing_data.events` | `email` |

---

## Join conditions (source of truth)

### Direct joins (account_id family)

```sql
-- accounts ↔ dim_accounts
accounts._id = dim_accounts.account_id

-- accounts ↔ dim_listings
accounts._id = dim_listings.account_id

-- accounts ↔ fact_reservations
accounts._id = fact_reservations.account_id

-- accounts ↔ tickets_clean
accounts._id = tickets_clean.account_id

-- accounts ↔ invoices  ⚠️ use mongo_account_id
accounts._id = invoices.mongo_account_id

-- accounts ↔ invoice_items  ⚠️ use mongo_account_id
accounts._id = invoice_items.mongo_account_id

-- accounts ↔ product_catalog  (account_id IS correct here)
accounts._id = product_catalog.account_id

-- dim_accounts ↔ dim_listings
dim_accounts.account_id = dim_listings.account_id

-- dim_accounts ↔ fact_reservations
dim_accounts.account_id = fact_reservations.account_id

-- dim_accounts ↔ tickets_clean (two options)
dim_accounts.account_id = tickets_clean.account_id
-- or: dim_accounts.sf_account_id = tickets_clean.sf_account_id

-- dim_accounts ↔ invoices  ⚠️
dim_accounts.account_id = invoices.mongo_account_id

-- dim_accounts ↔ product_catalog
dim_accounts.account_id = product_catalog.account_id

-- tickets_clean ↔ invoices  ⚠️
tickets_clean.account_id = invoices.mongo_account_id

-- fact_reservations ↔ dim_listings
fact_reservations.listing_id = dim_listings.listing_id
```

### UNNEST join (Jira)

```sql
-- Any table ↔ jira_hierarchy (requires UNNEST)
FROM `guesty-data.jira.jira_hierarchy` j
CROSS JOIN UNNEST(j.account_ids) AS jira_account_id
WHERE jira_account_id = '<guesty_account_id>'

-- tickets_clean ↔ jira_hierarchy (by Jira issue key)
-- tickets_clean.jira_ids is a comma-separated string of Jira keys
WHERE tickets_clean.jira_ids LIKE CONCAT('%', jira_hierarchy.subtask, '%')
   OR tickets_clean.jira_ids LIKE CONCAT('%', jira_hierarchy.story, '%')
```

### Bridge join (Modjo — no direct account_id)

```sql
-- Modjo requires sf_account_id bridge through dim_accounts
modjo_transcripts_structured.account_crm_id = dim_accounts.sf_account_id
-- then: dim_accounts.account_id = accounts._id (for Guesty account)

-- Modjo ↔ tickets_clean (direct)
modjo_transcripts_structured.account_crm_id = tickets_clean.sf_account_id
```

### Marketing data joins (HubSpot / marketing_data dataset)

```sql
-- marketing_data ↔ dim_accounts (via Guesty account_id)
marketing_data.guesty_account_id = dim_accounts.account_id

-- marketing_data ↔ dim_accounts (via Salesforce ID)
marketing_data.sf_account_id = dim_accounts.sf_account_id

-- hubspot_contacts ↔ dim_accounts (via Salesforce Account ID)
hubspot_contacts.salesforce_accountid = dim_accounts.sf_account_id

-- hubspot_emails_events ↔ dim_accounts (via Guesty account_id)
hubspot_emails_events.account_id = dim_accounts.account_id

-- HubSpot tables join to each other on email
hubspot_contacts.email = hubspot_form_submissions.email
hubspot_contacts.email = hubspot_chilipiper.email

-- HubSpot form_submissions ↔ marketing_data (email)
hubspot_form_submissions.email = marketing_data.lead_email

-- marketing_data ↔ invoices  ⚠️ use mongo_account_id
marketing_data.guesty_account_id = invoices.mongo_account_id

-- marketing_data ↔ tickets_clean
marketing_data.guesty_account_id = tickets_clean.account_id
```

### Zendesk internal joins

```sql
-- tickets_clean ↔ incoming_outgoing (ticket events)
tickets_clean.ticket_id = incoming_outgoing.ticket_id

-- tickets_clean ↔ productivity_hourly (agent performance)
tickets_clean.assignee_email = productivity_hourly.agent_email
```

---

## Full schema: who joins to whom

```
accounts._id ──────────────────────────────────────────────────────┐
    │                                                               │
    ├── dim_accounts.account_id ──── sf_account_id ───────────────►│
    │       │                              │                        │
    │       ├── dim_listings.account_id    └── modjo.account_crm_id│
    │       │       └── fact_reservations.listing_id               │
    │       └── fact_reservations.account_id                       │
    │                                                               │
    ├── tickets_clean.account_id ── sf_account_id ────────────────►│
    │       │                                                       │
    │       ├── incoming_outgoing.ticket_id                        │
    │       ├── productivity_hourly (via assignee_email)           │
    │       └── jira_hierarchy (via jira_ids string match)         │
    │                                                               │
    ├── invoices.mongo_account_id  ⚠️                              │
    │       └── invoice_items.mongo_account_id                     │
    │                                                               │
    ├── product_catalog.account_id                                 │
    │                                                               │
    ├── jira_hierarchy.account_ids[] (UNNEST required)            ─┘
    │
    ├── marketing_data.marketing_data
    │       ├── .guesty_account_id ── dim_accounts.account_id
    │       ├── .sf_account_id ────── dim_accounts.sf_account_id
    │       └── .lead_email ─────── hubspot_contacts.email
    │
    └── marketing_data.hubspot_*
            ├── hubspot_contacts.salesforce_accountid → dim_accounts.sf_account_id
            ├── hubspot_emails_events.account_id → dim_accounts.account_id
            └── All hubspot_* tables join on email
```

---

## Verified example: 3-source join (accounts + Zendesk + Modjo)

```sql
SELECT
  a.account_id,
  a.account_name,
  COUNT(DISTINCT t.ticket_id) AS ticket_count,
  COUNT(DISTINCT m.callId)    AS call_count
FROM `guesty-data.guesty_analytics.dim_accounts` a
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON a.account_id = t.account_id
LEFT JOIN `guesty-data.csm.modjo_transcripts_structured` m
  ON a.sf_account_id = m.account_crm_id
WHERE a.account_active = TRUE
GROUP BY a.account_id, a.account_name
ORDER BY ticket_count DESC
LIMIT 20
```

## Verified example: payment gateway fees (AdminData + Zuora)

```sql
SELECT
  a.name            AS account_name,
  pc.plan_name,
  pc.plan_value,
  pc.quantity,
  pc.charge_model,
  pc.effective_end_date
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE
```

## Verified example: invoices (use mongo_account_id)

```sql
SELECT
  a.name            AS account_name,
  COUNT(i.invoice_id) AS invoice_count,
  SUM(i.invoice_amount) AS total_billed
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.invoices` i
  ON a._id = i.mongo_account_id   -- ⚠️ NOT i.account_id
WHERE a.active = TRUE
GROUP BY a.name
ORDER BY total_billed DESC
LIMIT 20
```
