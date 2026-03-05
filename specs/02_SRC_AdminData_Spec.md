# Admin Data (Accounts) — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

**Node policy:** Use the **BigQuery node** only. No HTTP Request or other clients.

**This spec is read-only:** use only read operations. Do not create, update, upsert, or delete.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | Google Service Account API. |
| **Node Type** | **BigQuery node**. |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **API names**: Use field names from section 2.1 schema (e.g. `_id`, `name`, `active`, `createdat`, `companyinformation_name`).
- **Primary key / linkage**: `_id` (STRING) = the Guesty **account_id** used across all other data sources (dim_accounts.account_id, Zendesk tickets_clean.account_id, Zuora invoices.**mongo_account_id** ⚠️, Zuora product_catalog.account_id, etc.). See section 2.2 for cross-source joins.
- **Data types**: STRING, FLOAT, INTEGER, BOOLEAN, TIMESTAMP per section 2.1 schema. REPEATED RECORD fields: `taxes`, `billing_paymentmethods`, `plan`, `financials_channelcommission_manual`, `customfields`.

---

## 2.1. BigQuery Table: accounts

**BigQuery full table name (use exactly — do not invent project/dataset names):** `guesty-data.datalake_glue.accounts`

**Tables summary**

| Table | Full BigQuery path | Primary / key identifiers |
|-------|--------------------|---------------------------|
| accounts | `guesty-data.datalake_glue.accounts` | `_id` (account identifier, STRING). Joins as account_id to all other sources. |

**Table**: `accounts` — raw Guesty admin account data including plan/billing details, company information, markups, financial formulas, onboarding status, and custom fields.

**Schema (raw):** see code block below. Key identifier: `_id`. REPEATED fields: `taxes`, `billing_paymentmethods`, `plan`, `financials_channelcommission_manual`, `customfields`.

<details>
<summary>Expand: accounts full schema (JSON)</summary>

```json
[
  {"name": "_id", "mode": "", "type": "STRING", "description": "Account identifier — equivalent to account_id in other data sources", "fields": []},
  {"name": "_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "accountcategorization", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "active", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "airbnb_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "airbnb_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "api_access_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "api_access_plan_value", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "billing_balance_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "billing_billingcycle", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "billing_nextbillingdate", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "canceledat", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "commissionformula", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "commissiontaxpercentage", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "companyinformation__id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_address", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_businesstype", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_city", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_contactemail", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_contactfirstname", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_contactlastname", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_contactphone", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_corporationplace", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_country", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_name", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_state", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_submittedat", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "companyinformation_vatnum", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_zipcode", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "createdat", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "extra_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "extra_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "guesty_subscription_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "guesty_subscription_fee_plan_value", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "internaldata_accountmanager", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "internaldata_onboardingstatus", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "internaldata_professionalservicesconsultant", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "internaldata_salesperson", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_agoda_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_agoda_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_airbnb2_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_airbnb2_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_airbnb_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_airbnb_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_bookingcom_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_bookingcom_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_manual_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_manual_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "markups_tripadvisor_amount", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "markups_tripadvisor_units", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "monthly_activation_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "monthly_activation_fee_plan_value", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "name", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "netincomeformula", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "onboarding_fee__one_time_fee__plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "onboarding_fee__one_time_fee__plan_value", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "onboarding_one_time_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "onboarding_one_time_fee_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "onboarding_service__one_time_fee__installment_1_out_of_2__plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "onboarding_service__one_time_fee__installment_1_out_of_2__plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "ownerrevenueformula", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "payment_processing_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "payment_processing_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "receptionists_service_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "receptionists_service_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "renatls_united_monthly_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "renatls_united_monthly_fee_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "rental_united__fixed_rate__plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "rental_united__fixed_rate__plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "rentals_united__fixed_rate__plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "rentals_united__fixed_rate__plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "rentals_united_monthly_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "rentals_united_monthly_fee_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "rentals_united_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "rentals_united_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "rufeeactivation", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "software_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "software_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "timezone", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "website_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "website_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "white_labeling_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "white_labeling_plan_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
  {"name": "billing_nofreezingflow", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "freezingflow_started", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "freezingflow_ended", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "pms_paymentprocessing_paymentproviders_stripe_payload_stripe_user_id", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "currency", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "recognizedRevenueMode", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "sisenseaccess", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "companylogo", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "taxes", "mode": "REPEATED", "type": "RECORD", "description": "", "fields": [
    {"name": "_id", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "name", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "type", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "units", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "quantifier", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "amount", "mode": "", "type": "FLOAT", "description": "", "fields": []}
  ]},
  {"name": "billingv2enabled", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "ownerstatementsettings_templatefeatures_ownersrevenueincludescommission", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "ownerstatementsettings_templatefeatures_pmccommissionIncludeschannelcommission", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
  {"name": "billing_paymentmethods", "mode": "REPEATED", "type": "RECORD", "description": "", "fields": [
    {"name": "stripe_card_brand", "mode": "", "type": "STRING", "description": "", "fields": []}
  ]},
  {"name": "origin", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "companyinformation_vatstatus", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "payment_platform_fee_plan_value", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "payment_platform_fee_plan_type", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "plan", "mode": "REPEATED", "type": "RECORD", "description": "", "fields": [
    {"name": "name", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "plantype", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "value", "mode": "", "type": "FLOAT", "description": "", "fields": []}
  ]},
  {"name": "offset", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "kafka_timestamp", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "operationtype", "mode": "", "type": "STRING", "description": "", "fields": []},
  {"name": "financials_channelcommission_manual", "mode": "REPEATED", "type": "RECORD", "description": "", "fields": [
    {"name": "commission_value", "mode": "", "type": "FLOAT", "description": "", "fields": []},
    {"name": "commission_of", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []}
  ]},
  {"name": "customfields", "mode": "REPEATED", "type": "RECORD", "description": "", "fields": [
    {"name": "_id", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "key", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "ispublic", "mode": "", "type": "BOOLEAN", "description": "", "fields": []},
    {"name": "displayname", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "object", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "type", "mode": "", "type": "STRING", "description": "", "fields": []},
    {"name": "isrequired", "mode": "", "type": "BOOLEAN", "description": "", "fields": []}
  ]},
  {"name": "_glue_input_path", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "publish_bq_time", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "publish_time", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "updatetimestamp", "mode": "", "type": "TIMESTAMP", "description": "", "fields": []},
  {"name": "kafka_offset", "mode": "", "type": "INTEGER", "description": "", "fields": []},
  {"name": "kafka_partition", "mode": "", "type": "INTEGER", "description": "", "fields": []}
]
```

</details>

### Key field groups

| Group | Fields | Description |
|-------|--------|-------------|
| Identity | `_id`, `name`, `active`, `origin` | Account identifier, name, active status, origin platform |
| Plan & Billing | `_plan_type`, `software_plan_*`, `airbnb_plan_*`, `guesty_subscription_fee_plan_*`, `billing_*`, `plan` (REPEATED) | Subscription plan types, values, and billing cycle details |
| Company Information | `companyinformation_*` | Contact details, address, business type, VAT |
| Internal Data | `internaldata_*` | Account manager, salesperson, onboarding status, PS consultant |
| Markups | `markups_*` | Channel-specific markup amounts and units (Agoda, Airbnb, Booking.com, TripAdvisor, Manual) |
| Financial Formulas | `commissionformula`, `netincomeformula`, `ownerrevenueformula`, `commissiontaxpercentage` | Revenue recognition and commission formulas |
| Freezing Flow | `billing_nofreezingflow`, `freezingflow_started`, `freezingflow_ended` | Account freezing/suspension lifecycle |
| Onboarding Fees | `onboarding_fee_*`, `onboarding_one_time_fee_*`, `onboarding_service_*`, `monthly_activation_fee_*` | Onboarding and activation fee plans |
| Rentals United | `rentals_united_*`, `rental_united_*`, `renatls_united_*`, `rufeeactivation` | Rentals United integration plan details |
| Taxes | `taxes` (REPEATED RECORD) | Account-level tax definitions |
| Custom Fields | `customfields` (REPEATED RECORD) | Account custom field definitions |
| Metadata | `createdat`, `canceledat`, `updatetimestamp`, `publish_bq_time`, `publish_time`, `kafka_*`, `offset`, `operationtype`, `_glue_input_path` | Record timestamps, Kafka/pipeline metadata |

---

## 2.2. Cross-source joins (Admin Data to other data sources)

The primary join key is **`_id`** in this table, which equals **`account_id`** in all other data sources.

**Join keys (source of truth for cross-source joins):**

| Key | Description | Use for joining |
|-----|-------------|-----------------|
| **`_id`** | Guesty account identifier (STRING). Equivalent to `account_id` across all other specs. | Join to dim_accounts, Zendesk tickets_clean, Zuora invoices/invoice_items, Jira jira_hierarchy, dim_listings, fact_reservations. |

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| accounts | **Salesforce** dim_accounts | accounts.**`_id`** = dim_accounts.**account_id** |
| accounts | **Salesforce** dim_listings | accounts.**`_id`** = dim_listings.**account_id** |
| accounts | **Salesforce** fact_reservations | accounts.**`_id`** = fact_reservations.**account_id** |
| accounts | **Zendesk** tickets_clean | accounts.**`_id`** = tickets_clean.**account_id** |
| accounts | **Zuora** invoices / invoice_items | accounts.**`_id`** = invoices.**mongo_account_id** ⚠️ (`account_id` in invoices is Zuora's internal ID — use `mongo_account_id` to join to Guesty accounts) |
| accounts | **Zuora** product_catalog | accounts.**`_id`** = product_catalog.**account_id**. Filter `WHERE LOWER(product_catalog.plan_name) LIKE '%payment gateway%'` to get payment gateway fee charges. Key fields: `plan_name`, `plan_value`, `quantity`, `charge_model`, `chargetype`, `uom`, `effective_end_date`. |
| accounts | **Jira** jira_hierarchy | accounts.**`_id`** = *unnested* jira_hierarchy.**account_ids** (`UNNEST(jira_hierarchy.account_ids) AS jira_account_id`). See Jira spec section 2.2. |
| accounts | **Modjo** modjo_transcripts_structured | Via **dim_accounts**: accounts.**`_id`** = dim_accounts.**account_id**, then dim_accounts.**sf_account_id** = modjo_transcripts_structured.**account_crm_id**. Modjo has no direct account_id; use dim_accounts as bridge. |

### Payment Gateway Fees (cross-source note)

The `accounts` table contains high-level payment plan fields (`payment_processing_plan_type`, `payment_processing_plan_value`, `payment_platform_fee_plan_type`, `payment_platform_fee_plan_value`), but **detailed payment gateway fee line items** are stored in Zuora's `product_catalog` table.

To retrieve payment gateway fees for an account:

```sql
SELECT
  a._id            AS account_id,
  a.name           AS account_name,
  pc.plan_name,
  pc.plan_value,
  pc.quantity,
  pc.charge_model,
  pc.chargetype,
  pc.uom,
  pc.effective_end_date
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE
```

See `02_SRC_Zuora_Spec.md` section 2.1.3 for the full `product_catalog` schema.

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by `createdat`, `canceledat`, `updatetimestamp`, or `publish_bq_time` to bound queries (e.g. last 30 days).
- **Status filters**: e.g. `WHERE active = TRUE`; exclude canceled accounts (`canceledat IS NULL`); filter by `operationtype`.
- **Limits**: Use `LIMIT` and `OFFSET` in SQL to paginate; set max records per run to avoid timeouts.
- **Scope**: When possible, filter by `_id` (account identifier) for targeted queries.
- **REPEATED fields**: Use `UNNEST()` when querying into `taxes`, `plan`, `billing_paymentmethods`, `financials_channelcommission_manual`, or `customfields`.

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Admin Data (Guesty Accounts)
Node policy: Use BigQuery node only. No HTTP Request or other clients.
Read-only: Use only read (SELECT) operations. No create, update, or delete.
Node Type: BigQuery node (per 01_INFRA_Credentials_Guide.md).
Credential: **Google Service Account n8n-ai-cx** (Google Service Account API).
Auth Type: Google Service Account API.
BQ table (use this exact full name): guesty-data.datalake_glue.accounts. Schema in section 2.1.
Primary key: _id (STRING) = account_id in all other data sources.
Linkage: _id = dim_accounts.account_id = tickets_clean.account_id = invoices.account_id = product_catalog.account_id = dim_listings.account_id = fact_reservations.account_id. Jira: _id IN UNNEST(jira_hierarchy.account_ids). Modjo: via dim_accounts bridge (account_id → sf_account_id → account_crm_id). Payment gateway fees: JOIN product_catalog ON _id = product_catalog.account_id WHERE LOWER(plan_name) LIKE '%payment gateway%'. See section 2.2 join tables, section 2.2 Payment Gateway Fees note, and Jira spec section 2.2.
Query: Apply date and status filters; use LIMIT/OFFSET pagination; UNNEST for REPEATED fields; limit per run.
```

---

## BigQuery: Key Columns & Common Query Patterns

### Key columns quick reference

| Column | Type | Notes |
|--------|------|-------|
| `_id` | STRING | **Universal join key** = account_id everywhere else |
| `name` | STRING | Account/company name |
| `active` | BOOLEAN | Filter: `WHERE active = TRUE` |
| `createdat` | TIMESTAMP | Account created date |
| `canceledat` | TIMESTAMP | NULL if still active |
| `internaldata_accountmanager` | STRING | CSM name |
| `software_plan_type` | STRING | Main plan type |
| `software_plan_value` | FLOAT | Main plan value |
| `billing_billingcycle` | STRING | monthly / annual |
| `companyinformation_country` | STRING | Country |
| `companyinformation_contactemail` | STRING | Contact email |

### REPEATED fields (require UNNEST)
| Column | Description |
|--------|-------------|
| `plan` (RECORD) | plan name, plantype, value |
| `taxes` (RECORD) | Tax definitions |
| `billing_paymentmethods` (RECORD) | stripe_card_brand |
| `customfields` (RECORD) | Custom field definitions |

### Common SQL patterns

```sql
-- Active accounts created last 30 days
SELECT _id, name, createdat, internaldata_accountmanager
FROM `guesty-data.datalake_glue.accounts`
WHERE createdat >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND active = TRUE
ORDER BY createdat DESC;

-- Accounts with plan info
SELECT _id, name, software_plan_type, software_plan_value, billing_billingcycle
FROM `guesty-data.datalake_glue.accounts`
WHERE active = TRUE AND software_plan_value > 0;

-- UNNEST the plan REPEATED field
SELECT a._id, a.name, p.name AS plan_name, p.plantype, p.value
FROM `guesty-data.datalake_glue.accounts` a
CROSS JOIN UNNEST(a.plan) AS p
WHERE a.active = TRUE;

-- Cross-source: accounts + payment gateway fees
SELECT a.name, pc.plan_name, pc.plan_value, pc.quantity
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE;
```

### Filters & limits
- Always filter `WHERE active = TRUE` for current customers
- Exclude cancelled: `WHERE canceledat IS NULL`
- Use `LIMIT` for exploration — full table has ~100K+ rows (including historical)
- UNNEST REPEATED fields when filtering or selecting nested values
