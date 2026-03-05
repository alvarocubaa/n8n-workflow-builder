# Cross-Source Join Map — Guesty Data Sources

> Single-page reference for joining Guesty data sources in n8n BigQuery nodes.
> All tables are in project `guesty-data`. Use the **Google Service Account n8n-ai-cx** credential.

---

## Universal key: Guesty account_id

Every data source connects through Guesty's internal account ID (MongoDB ObjectId, e.g. `5ce6cd0de8f5d90021be7ed6`). Each table uses a different column name for the same value:

| Source | Table | Column name for Guesty account_id |
|--------|-------|----------------------------------|
| Admin Data | `datalake_glue.accounts` | **`_id`** |
| Salesforce | `guesty_analytics.dim_accounts` | **`account_id`** |
| Salesforce | `guesty_analytics.dim_listings` | **`account_id`** |
| Salesforce | `guesty_analytics.fact_reservations` | **`account_id`** |
| Zendesk | `zendesk_analytics.tickets_clean` | **`account_id`** |
| Zuora | `zuora_analytics.invoices` | **`mongo_account_id`** ⚠️ |
| Zuora | `zuora_analytics.invoice_items` | **`mongo_account_id`** ⚠️ |
| Zuora | `zuora_analytics.product_catalog` | **`account_id`** ✓ |
| Jira | `jira.jira_hierarchy` | **`account_ids`** (REPEATED — requires `UNNEST`) |
| Modjo | `csm.modjo_transcripts_structured` | no direct column — bridge via `sf_account_id` |

> ⚠️ **Zuora invoices/invoice_items critical note:**
> `invoices.account_id` is Zuora's own internal ID — NOT the Guesty account ID.
> Always use `invoices.mongo_account_id` to join to any Guesty data source.
> `product_catalog.account_id` is correctly the Guesty account_id.

---

## Secondary key: sf_account_id (Salesforce 18-char Account ID)

Used to bridge between Salesforce CRM data and Modjo call recordings:

| Source | Table | Column |
|--------|-------|--------|
| Salesforce | `guesty_analytics.dim_accounts` | `sf_account_id` |
| Zendesk | `zendesk_analytics.tickets_clean` | `sf_account_id` |
| Modjo | `csm.modjo_transcripts_structured` | `account_crm_id` (= sf_account_id) |
| Zuora | `zuora_analytics.product_catalog` | `sf_account_id` |

---

## Join conditions (source of truth)

### Direct joins

```sql
-- Admin Data ↔ Salesforce
accounts._id = dim_accounts.account_id

-- Admin Data ↔ Zendesk
accounts._id = tickets_clean.account_id

-- Admin Data ↔ Zuora invoices  ⚠️ use mongo_account_id
accounts._id = invoices.mongo_account_id

-- Admin Data ↔ Zuora product_catalog
accounts._id = product_catalog.account_id

-- Salesforce dim_accounts ↔ Zendesk
dim_accounts.account_id = tickets_clean.account_id
-- alt: dim_accounts.sf_account_id = tickets_clean.sf_account_id

-- Salesforce dim_accounts ↔ Zuora invoices  ⚠️
dim_accounts.account_id = invoices.mongo_account_id

-- Salesforce dim_accounts ↔ Zuora product_catalog
dim_accounts.account_id = product_catalog.account_id

-- Zendesk ↔ Zuora invoices  ⚠️
tickets_clean.account_id = invoices.mongo_account_id

-- Salesforce dim_accounts ↔ Modjo (bridge via sf_account_id)
dim_accounts.sf_account_id = modjo_transcripts_structured.account_crm_id

-- Zendesk ↔ Modjo (direct via sf_account_id)
tickets_clean.sf_account_id = modjo_transcripts_structured.account_crm_id

-- Salesforce hierarchy
dim_accounts.account_id = dim_listings.account_id
dim_accounts.account_id = fact_reservations.account_id
fact_reservations.listing_id = dim_listings.listing_id

-- Zuora invoices ↔ invoice_items
invoices.invoice_id = invoice_items.invoice_id

-- Zendesk internal
tickets_clean.ticket_id = incoming_outgoing.ticket_id
tickets_clean.assignee_email = productivity_hourly.agent_email
```

### UNNEST join (Jira — required for account-level joins)

```sql
-- Any source ↔ Jira by account
FROM `guesty-data.jira.jira_hierarchy` j
CROSS JOIN UNNEST(j.account_ids) AS jira_account_id
WHERE jira_account_id = <guesty_account_id>

-- Zendesk ↔ Jira by Jira issue key (jira_ids is a comma-separated string)
WHERE tickets_clean.jira_ids LIKE CONCAT('%', jira_hierarchy.subtask, '%')
   OR tickets_clean.jira_ids LIKE CONCAT('%', jira_hierarchy.story, '%')
```

---

## n8n BigQuery node — example multi-source query

```sql
-- Accounts with ticket count, invoice total, and open Jira stories
SELECT
  a.account_id,
  a.account_name,
  COUNT(DISTINCT t.ticket_id)   AS open_tickets,
  SUM(i.invoice_amount)         AS total_invoiced,
  COUNT(DISTINCT j.story)       AS open_jira_stories
FROM `guesty-data.guesty_analytics.dim_accounts` a
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON a.account_id = t.account_id
  AND t.ticket_status IN ('open','pending')
LEFT JOIN `guesty-data.zuora_analytics.invoices` i
  ON a.account_id = i.mongo_account_id          -- ⚠️ mongo_account_id
LEFT JOIN `guesty-data.jira.jira_hierarchy` j
  ON a.account_id IN UNNEST(j.account_ids)       -- UNNEST required
  AND j.story_status NOT IN ('Done','Closed')
WHERE a.account_active = TRUE
GROUP BY a.account_id, a.account_name
ORDER BY open_tickets DESC
LIMIT 50
```

---

## Full source inventory

| Source | Spec file | BQ dataset | Tables |
|--------|-----------|------------|--------|
| Admin Data | `02_SRC_AdminData_Spec.md` | `datalake_glue` | `accounts` |
| Salesforce | `02_SRC_Salesforce_Spec.md` | `guesty_analytics` | `dim_accounts`, `dim_listings`, `fact_reservations` |
| Zendesk | `02_SRC_Zendesk_Spec.md` | `zendesk_analytics` | `tickets_clean`, `incoming_outgoing`, `productivity_hourly` |
| Zuora | `02_SRC_Zuora_Spec.md` | `zuora_analytics` | `invoices`, `invoice_items`, `product_catalog` |
| Jira | `02_SRC_Jira_Spec.md` | `jira` | `jira_hierarchy` (+ others) |
| Modjo | `02_SRC_Modjo_Spec.md` | `csm` | `modjo_transcripts_structured` |
| HubSpot | `02_SRC_Hubspot_Spec.md` | — | API only (no BQ tables) |
| HiBob | `02_SRC_Hibob_Spec.md` | — | API only (no BQ tables) |
| Gus | `02_SRC_Gus_Spec.md` | — | API only (no BQ tables) |
| Siit | `02_SRC_Siit_Spec.md` | — | API only (no BQ tables) |
