# Zuora — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Zuora API | `oAuth2Api` | HTTP Request node |
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | Zuora path: OAuth2. BigQuery path: Google Service Account API. |
| **Node Type** | HTTP Request (Zuora REST API); no native n8n Zuora node. Use BigQuery node for warehouse queries. |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: **account_id**, **invoice_id** (see section 2.1). Use account_id for cross-system linkage (dim_accounts, Zendesk tickets_clean).
- **Field names**: Use field names from section 2.1 schema (e.g. account_id, invoice_id, status, invoice_amount, invoice_date). For Zuora API use API names per Zuora docs.
- **Data types**: String, Float, Integer, Date, Timestamp, Boolean per section 2.1 schema.

---

## 2.1. BigQuery Tables (Source of Truth)

**BigQuery full table names (use exactly — do not invent project/dataset names):**

| Logical table | Full BigQuery path |
|---------------|--------------------|
| invoices | `guesty-data.zuora_analytics.invoices` |
| invoice_items | `guesty-data.zuora_analytics.invoice_items` |
| product_catalog | `guesty-data.zuora_analytics.product_catalog` |

**Cross-table linkage**: `invoices` and `invoice_items` use **`mongo_account_id`** (MongoDB ObjectId) to join to Guesty accounts — NOT the `account_id` column (which is Zuora's own internal ID). `product_catalog.account_id` IS the Guesty account ID (MongoDB ObjectId format). `product_catalog` also carries **sf_account_id** for direct linkage to Salesforce without going through dim_accounts.

> ⚠️ **CRITICAL JOIN GOTCHA — verified by live query:**
> `invoices.account_id` = Zuora internal ID (e.g. `8a368c89...`) — DO NOT use for Guesty joins
> `invoices.mongo_account_id` = Guesty account ID (e.g. `5af9f246...`) — USE THIS for all cross-source joins
> `product_catalog.account_id` = Guesty account ID ✓ (correct column name here)

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| invoices / invoice_items | Salesforce / dim_accounts | invoices.**mongo_account_id** = dim_accounts.account_id ⚠️ |
| invoices / invoice_items | Zendesk tickets_clean | invoices.**mongo_account_id** = tickets_clean.account_id ⚠️ |
| invoices / invoice_items | AdminData accounts | invoices.**mongo_account_id** = accounts._id ⚠️ |
| invoices / invoice_items | Modjo modjo_transcripts_structured | Join via dim_accounts: invoices.**mongo_account_id** = dim_accounts.account_id, dim_accounts.**sf_account_id** = modjo_transcripts_structured.**account_crm_id** |
| invoices / invoice_items | **Jira jira_hierarchy** | invoices.**mongo_account_id** = *unnested* jira_hierarchy.**account_ids** (UNNEST in BigQuery). See Jira spec section 2.2. |
| product_catalog | Salesforce / dim_accounts | product_catalog.**account_id** = dim_accounts.account_id OR product_catalog.**sf_account_id** = dim_accounts.sf_account_id |
| product_catalog | Zendesk tickets_clean | product_catalog.**account_id** = tickets_clean.account_id |
| product_catalog | AdminData accounts | product_catalog.**account_id** = accounts._id |
| product_catalog | invoices / invoice_items | product_catalog.**account_id** = invoices.**mongo_account_id** ⚠️ |

**Note:** `invoices` and `invoice_items` have no **sf_account_id** column — join to Salesforce Account Id through dim_accounts. `product_catalog` does have **sf_account_id** and can join directly.

### 2.1.1. invoices

**BigQuery table:** `guesty-data.zuora_analytics.invoices`

**Table**: `invoices` — primary table for Zuora invoice data. **account_id** is the key to join with other data source tables.

**Schema (raw):**

```json
[
  {"name": "invoice_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "stripe_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "mongo_account_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "company_code", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "account_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_invoice_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoice_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoice_date", "mode": "NULLABLE", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "comments", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_amount_without_tax", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "amount_without_tax", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "original_currency_tax_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tax_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoice_created_at", "mode": "NULLABLE", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "updated_date", "mode": "NULLABLE", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "should_be_paid_at", "mode": "NULLABLE", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "invoice_invoicenumber", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "stripe_customer", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "stripe_balance_transaction", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "tax_amount_org_currency", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoice_includesonetime", "mode": "NULLABLE", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "balance", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tax_conversion_rate", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "integrationid__ns", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_credit_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "credit_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "org_currency", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "method", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "stripe_account_name", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "zuora_invoice_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "invoice_currentdunningstep__c", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "dunning_step_num", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "tax_kind", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_refund_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "refund_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "payment_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "invoice_paid_at", "mode": "NULLABLE", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "payment_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "paymentmethod_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_payment_refund_amount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "payment_refundamount", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "fx_rate", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []}
]
```

### 2.1.2. invoices_items

**BigQuery table:** `guesty-data.zuora_analytics.invoice_items`

**Table**: `invoices_items` — line-item level data for invoices (BQ table name may be invoice_items; use full path above). **Join to invoices on invoice_id**. **account_id** is shared for joining with other data source tables.

**Schema (raw):**

```json
[
  {"name": "invoice_item_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "account_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "company_code", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "mongo_account_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "org_currency", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "invoice_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "invoice_item_created_at", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "invoiceitem_updateddate", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "product_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "product_name", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "tax_name", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "tax_rate", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tax_kind", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "invoice_item_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "is_minimum_fee", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "isonetimepayment", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "product_payment_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "chargemodel", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "product_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "paid_at", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "subscription_name", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "listing_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "original_currency_tax_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tax_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoice_duedate", "mode": "", "type": "DATE", "description": "", "fields": []},
  {"name": "usage_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "reservation_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "reservation_host_payout_usd", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "original_currency_amount_from_product", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "amount_from_product", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "product_payment_percentage_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "invoiceitem_servicestartdate", "mode": "", "type": "DATE", "description": "", "fields": []},
  {"name": "invoiceitem_serviceenddate", "mode": "", "type": "DATE", "description": "", "fields": []},
  {"name": "invoice_listing_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "usage_startdatetime", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "usage_enddatetime", "mode": "", "type": "STRING", "description": "", "fields": []}
]
```

### 2.1.3. product_catalog

**BigQuery table:** `guesty-data.zuora_analytics.product_catalog`

**Table**: `product_catalog` — subscription plan and product charge data per account. Use this table to understand what plans and charges each account is on. Key use cases:
- Find accounts on a specific plan (`plan_name`)
- Identify **payment gateway fee** charges: filter `WHERE LOWER(plan_name) LIKE '%payment gateway%'`
- Analyse subscription tiers (`tier_startingunit`, `tier_endingunit`, `tier_price`)
- Check active subscriptions (`effective_end_date > CURRENT_DATE()`)

**Payment gateway fee note**: The `plan_name` field contains product/plan names including "Payment Gateway Fee" entries. To isolate payment gateway fee charges, filter: `WHERE LOWER(plan_name) LIKE '%payment gateway%'`. Key charge detail fields: `plan_value`, `quantity`, `charge_model`, `chargetype`, `uom`.

**Schema (raw):**

```json
[
  {"name": "account_id", "mode": "", "type": "STRING", "description": "Guesty account identifier — joins to all other sources as account_id / _id", "fields": []},
  {"name": "account_name", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "account_segmentation", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "sf_account_id", "mode": "NULLABLE", "type": "STRING", "description": "Salesforce Account Id — direct join to dim_accounts.sf_account_id (unlike invoices/invoice_items which must go via dim_accounts)", "fields": []},
  {"name": "plan_name", "mode": "", "type": "STRING", "description": "Product / plan name. Contains 'Payment Gateway Fee' for payment gateway charges — filter LOWER(plan_name) LIKE '%payment gateway%'", "fields": []},
  {"name": "uom", "mode": "", "type": "STRING", "description": "Unit of measure", "fields": []},
  {"name": "quantity", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "charge_model", "mode": "", "type": "STRING", "description": "e.g. FlatFee, PerUnit, Tiered", "fields": []},
  {"name": "chargetype", "mode": "", "type": "STRING", "description": "e.g. Recurring, OneTime", "fields": []},
  {"name": "createddate", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "subscription_name", "mode": "", "type": "STRING", "description": "Joins to invoice_items.subscription_name", "fields": []},
  {"name": "default_subscription", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "plan_value", "mode": "", "type": "FLOAT", "description": "Plan price / value", "fields": []},
  {"name": "effective_end_date", "mode": "", "type": "DATE", "description": "Filter effective_end_date > CURRENT_DATE() for active subscriptions", "fields": []},
  {"name": "partition_date", "mode": "", "type": "DATE", "description": "", "fields": []},
  {"name": "chargenumber", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rateplan_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "active_listings", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "overall_listings", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "csm", "mode": "NULLABLE", "type": "STRING", "description": "Customer Success Manager", "fields": []},
  {"name": "tier_startingunit", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tier_endingunit", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tier_price", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tier_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "tier_tier", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "tier_priceformat", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rateplancharge_id", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "subscription_zeroed_out_reason__c", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "account_currency", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []}
]
```

**Summary — joining tables:**

| Table | Join to invoices | Join to other data sources |
|-------|------------------|----------------------------|
| **invoices** | — (main table) | **account_id** |
| **invoices_items** | **invoice_id** | **account_id** |
| **product_catalog** | **account_id** (or **subscription_name** to invoice_items) | **account_id** (all sources); **sf_account_id** (direct to Salesforce/dim_accounts) |

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by `effectiveStartDate`, `effectiveEndDate`, `invoiceDate`, or `updatedDate` to bound queries and avoid large pulls.
- **Status filters**: e.g. only Active subscriptions; only Posted invoices; exclude Draft.
- **Limits**: Use Zuora pagination (e.g. `pageSize`, cursor); set max records per run to avoid timeouts and rate limits.
- **Account scope**: When possible filter by account id or account number.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://rest.zuora.com` (or sandbox base). API version in path (e.g. v1). |
| **Objects** | e.g. `GET /v1/accounts`, `GET /v1/subscriptions`, `GET /v1/invoices`. |
| **Query** | Use query parameters or Zuora query language where documented. |
| **Response** | JSON; structure per Zuora API docs (e.g. `records` array). |

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Zuora
Node Type: HTTP Request; or BigQuery node when reading from BQ (Google Service Account n8n-ai-cx).
Credential: For HTTP Sandbox usage, resolve from intake packet (no standard name in manifest yet). For BQ: Google Service Account n8n-ai-cx.
Auth Type: OAuth2 or API Key (per env) for Zuora API; Google Service Account API for BQ.
BQ tables (use these exact full names): guesty-data.zuora_analytics.invoices (main), guesty-data.zuora_analytics.invoice_items, guesty-data.zuora_analytics.product_catalog. Join invoice_items to invoices on invoice_id. Join product_catalog to invoices on account_id; to invoice_items on account_id + subscription_name. Schemas in section 2.1.
Linkage: invoices.mongo_account_id = dim_accounts.account_id = Zendesk tickets_clean.account_id = AdminData accounts._id ⚠️ (use mongo_account_id — NOT invoices.account_id, which is Zuora's internal ID). For Modjo/SF Id join via dim_accounts. Jira: invoices.mongo_account_id IN UNNEST(jira_hierarchy.account_ids). product_catalog.account_id = Guesty account_id (correct column); product_catalog has sf_account_id for direct Salesforce join. See section 2.1 join table and Jira spec section 2.2.
Payment gateway fee: query product_catalog WHERE LOWER(plan_name) LIKE '%payment gateway%'. Key fields: plan_name, plan_value, quantity, charge_model, chargetype, uom.
Query: Apply date and status filters; use pagination; limit per run.
```

---

## BigQuery: Key Columns & Common Query Patterns

### invoices — key columns

| Column | Type | Notes |
|--------|------|-------|
| `invoice_id` | STRING | Zuora invoice ID |
| `mongo_account_id` | STRING | **Guesty account ID** — use for all cross-source joins ⚠️ |
| `account_id` | STRING | Zuora internal ID — do NOT use for Guesty joins |
| `invoice_invoicenumber` | STRING | Human-readable (e.g. INV00000075) |
| `invoice_amount` | FLOAT | Total invoice amount |
| `invoice_date` | STRING | Invoice date |
| `invoice_created_at` | TIMESTAMP | Creation timestamp |
| `company_code` | STRING | Legal entity (e.g. GUESTY_INC) |
| `tax_amount` | FLOAT | Tax amount |

### invoice_items — key columns

| Column | Type | Notes |
|--------|------|-------|
| `invoice_item_id` | STRING | Primary key |
| `invoice_id` | STRING | Join to invoices |
| `mongo_account_id` | STRING | **Guesty account ID** ⚠️ |
| `product_name` | STRING | Product/charge description |
| `amount` | FLOAT | Line item amount (USD) |
| `original_currency_amount` | FLOAT | Line item amount (original currency) |
| `plan_type` | STRING | Plan type |
| `invoiceitem_servicestartdate` | DATE | Billing period start |
| `invoiceitem_serviceenddate` | DATE | Billing period end |
| `listing_id` | STRING | Join to dim_listings if applicable |
| `reservation_id` | STRING | Join to fact_reservations if applicable |

### product_catalog — key columns

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | **Guesty account ID** ✓ (correct column) |
| `sf_account_id` | STRING | Salesforce Account ID (direct join to dim_accounts) |
| `account_name` | STRING | Account name |
| `plan_name` | STRING | Product/plan name (e.g. "Payment Gateway Fee %") |
| `plan_value` | FLOAT | Rate/value |
| `charge_model` | STRING | e.g. FlatFee, PerUnit, Tiered |
| `chargetype` | STRING | e.g. Recurring, OneTime |
| `quantity` | FLOAT | Quantity |
| `effective_end_date` | DATE | Charge end — filter `> CURRENT_DATE()` for active |
| `subscription_name` | STRING | Joins to invoice_items.subscription_name |

### Common SQL patterns

```sql
-- Top accounts by total billed (must use mongo_account_id)
SELECT
  a.name            AS account_name,
  COUNT(i.invoice_id) AS invoice_count,
  SUM(i.invoice_amount) AS total_billed
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.invoices` i
  ON a._id = i.mongo_account_id
WHERE a.active = TRUE
GROUP BY a.name
ORDER BY total_billed DESC
LIMIT 10;

-- Payment gateway fees per account
SELECT
  a.name AS account_name,
  pc.plan_name,
  pc.plan_value,
  pc.quantity,
  pc.effective_end_date
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE;

-- Invoice line items for an account
SELECT
  ii.product_name,
  ii.amount,
  ii.invoiceitem_servicestartdate,
  ii.invoiceitem_serviceenddate
FROM `guesty-data.zuora_analytics.invoice_items` ii
WHERE ii.mongo_account_id = '<account_id_here>'
ORDER BY ii.invoiceitem_servicestartdate DESC
LIMIT 50;
```

### Filters & limits
- Filter invoices by `status = 'Posted'` for finalized billing data
- Always use `invoices.mongo_account_id` (NOT `account_id`) for Guesty joins
- `product_catalog.account_id` IS the Guesty account ID (no confusion there)
