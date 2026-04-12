# CSM (Customer Success) — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details for the CSM BigQuery dataset (`guesty-data.csm.*`), which includes Modjo call transcripts, health scores, portfolio data, churn reports, NPS (Delighted), listing performance, MRR analytics, and segmentation data.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| BigQuery warehouse | `googleApi` | BigQuery node |
| Modjo API (alternative) | `httpHeaderAuth` | HTTP Request node |

| Item | Value |
|------|--------|
| **Auth Type** | BigQuery path: Google Service Account API. Modjo API: Bearer Auth (HTTP Request). |
| **Node Type** | **BigQuery node** for all CSM data (preferred). HTTP Request for Modjo API if not using BQ. |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary identifier**: **account_id** (Guesty internal) across most tables. Use **sf_account_id** for Salesforce linkage.
- **Modjo linkage**: **account_crm_id** in modjo_transcripts_structured_master = **sf_account_id** in dim_accounts.
- **Key fields**: Use field names from section 2.1 schemas. Do not invent column names.
- **Data types**: Match section 2.1 schemas (STRING, INTEGER, FLOAT, DATE, TIMESTAMP, BOOLEAN).

> ### CSM / Account Owner Lookup Rule (CRITICAL)
>
> When the user asks for "CSM", "account owner", or "who owns the account", and your workflow already queries **any** of these BQ tables, **SELECT the `csm` column directly from the table you already have** — do NOT add a Salesforce round-trip.
>
> | Table | Column |
> |-------|--------|
> | `guesty_analytics.dim_accounts` | `csm` |
> | `csm.portfolio` | `csm` |
> | `csm.health_score` | `csm` |
> | `csm.csm_churn_report` | `csm` |
> | `csm.mrr_calculator` | `csm` |
> | `csm.segmentation_report` | `csm` |
>
> **Why this matters:**
> - `dim_accounts.csm` is **100% populated** on active accounts (verified Apr 10, 2026 — 18,626 / 18,626).
> - The Salesforce account owner (`Owner.Name` via `OwnerId`) is also 100% populated, but is a **different concept** (sales-side ownership). It disagrees with the BQ CSM on **~80% of random active accounts**.
> - The two are **NOT interchangeable**. Use the BQ `csm` column when a BQ table is already in the workflow.
> - Only fall back to SF `Owner.Name` if the workflow has **no BQ data source** at all.
> - **Avoid** `Account_Owner_F__c`, `Success_Program_CSM__c`, and `Acc_Owner_Id__c` for general CSM lookups — they're tier-specific custom fields populated on only 4–11% of accounts.

---

## 2.1. BigQuery Tables (Source of Truth)

**BigQuery full table names (use exactly — do not invent project/dataset names):**

| Logical table | Full BigQuery path | Cols | Purpose |
|---------------|--------------------|------|---------|
| modjo_transcripts_structured_master | `guesty-data.csm.modjo_transcripts_structured_master` | 14 | Modjo call transcripts with AI-extracted risk signals (45K rows, Aug 2025–present). **Use this table, NOT `modjo_transcripts_structured` (only 17 test rows).** |
| health_score | `guesty-data.csm.health_score` | 52 | Account health scoring (composite score from tickets, revenue, channel, product, engagement) |
| portfolio | `guesty-data.csm.portfolio` | 48 | CSM portfolio view — account assignments, status, risk levels |
| csm_churn_report | `guesty-data.csm.csm_churn_report` | 74 | Churn analysis with reasons, ETF, revenue impact |
| delighted_data | `guesty-data.csm.delighted_data` | 42 | NPS survey data from Delighted (scores, comments, SFDC linkage) |
| listing_performance | `guesty-data.csm.listing_performance` | 86 | Listing-level performance: revenue, occupancy, guest review sentiment |
| mrr_calculator | `guesty-data.csm.mrr_calculator` | 53 | MRR analytics: plan value, reservation metrics, Stripe revenue |
| segmentation_report | `guesty-data.csm.segmentation_report` | 41 | Account segmentation history with health score trends |

**Additional tables (available but less commonly used):**
- `cs_product_adoption` (104 cols) — detailed product feature adoption
- `monthly_cs_product_adoption` (103 cols) — monthly product adoption snapshot
- `product_opt_dash` (67 cols) — product optimization dashboard
- `mrr_listing_change` (65 cols) — MRR changes correlated with listing changes
- `account_snapshot` (46 cols) — periodic account snapshots
- `pre_churn_stars` (36 cols) — pre-churn risk indicators
- `geo_reservations` / `geo_breakdown` (31 cols each) — geographic analysis

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| modjo_transcripts_structured_master | Salesforce / dim_accounts | modjo.**account_crm_id** = dim_accounts.**sf_account_id** |
| modjo_transcripts_structured_master | Zendesk tickets_clean | modjo.**account_crm_id** = tickets_clean.**sf_account_id** |
| modjo_transcripts_structured_master | Zuora invoices | Via dim_accounts: modjo.account_crm_id = dim_accounts.sf_account_id → dim_accounts.account_id = invoices.mongo_account_id |
| modjo_transcripts_structured_master | Jira jira_hierarchy | Via dim_accounts: modjo.account_crm_id = dim_accounts.sf_account_id → dim_accounts.account_id = UNNEST(jira_hierarchy.account_ids) |
| health_score / portfolio / segmentation_report | dim_accounts | **account_id** = dim_accounts.account_id |
| health_score / portfolio / segmentation_report | Zendesk tickets_clean | **account_id** = tickets_clean.account_id |
| health_score / portfolio | Zuora invoices | **account_id** = invoices.mongo_account_id ⚠️ |
| delighted_data | Salesforce sf_account | delighted_data.**sfdc_account_id** = sf_account.Id |
| listing_performance | dim_listings | listing_performance.**listing_id** = dim_listings.listing_id |
| listing_performance | dim_accounts | listing_performance.**account_id** = dim_accounts.account_id |

### Sentiment & Risk Fields Across Tables

The CSM dataset provides risk and sentiment signals across multiple tables:

| Table | Field | Type | Description |
|-------|-------|------|-------------|
| modjo_transcripts_structured_master | `sentiment` | STRING | Overall call sentiment |
| modjo_transcripts_structured_master | `risk_commercial` | STRING | Commercial risk signal |
| modjo_transcripts_structured_master | `risk_technical` | STRING | Technical risk signal |
| health_score | `total_score` | FLOAT | Composite health score |
| health_score | `ticket_score` | INT64 | Ticket-based health component |
| health_score | `profit_score` | INT64 | Profitability component |
| health_score | `channel_score` | INT64 | Channel mix component |
| health_score | `product_score` | INT64 | Product adoption component |
| health_score | `eng_score` | FLOAT | Engagement component |
| portfolio | `health_score` | FLOAT | Current health score |
| portfolio | `csm_overall_risk_level` | STRING | CSM-assessed risk level |
| delighted_data | `score` | INT64 | NPS score (0-10) |
| delighted_data | `comment` | STRING | NPS free-text comment |
| listing_performance | `sentiment_positive` | INT64 | Positive guest review count |
| listing_performance | `sentiment_negative` | INT64 | Negative guest review count |
| listing_performance | `sentiment_neutral` | INT64 | Neutral guest review count |
| listing_performance | `overall_rating` | FLOAT | Overall listing rating |
| segmentation_report | `account_owner_sentiment` | STRING | Account owner sentiment |
| csm_churn_report | `churn_reason` | STRING | Churn reason |
| csm_churn_report | `churn_reason_modified` | STRING | Modified churn reason |
| csm_churn_report | `customer_churn_reason` | STRING | Customer-stated churn reason |

### 2.1.1. modjo_transcripts_structured_master (Modjo call transcripts)

**BigQuery table:** `guesty-data.csm.modjo_transcripts_structured_master`

> **Use `modjo_transcripts_structured_master` (45,612 rows, Aug 2025–present), NOT `modjo_transcripts_structured` (only 17 test rows).** Verified Apr 1, 2026.

Call transcripts from Modjo with AI-extracted risk/sentiment signals and summaries.

**Important — Account linking**: **`account_crm_id`** = **`sf_account_id`** in dim_accounts (Salesforce). Use this join when linking Modjo data to other sources.

**Note:** **account_id** in this table is INTEGER (Modjo internal). For cross-source joins always use **`account_crm_id`**.

| Column | Type | Notes |
|--------|------|-------|
| `callId` | INT64 | Primary key |
| `account_id` | INT64 | Modjo internal — do NOT use for cross-source joins |
| `account_crm_id` | STRING | **= sf_account_id from dim_accounts** — use for all joins |
| `startDate` | DATE | Call date |
| `call_timestamp` | TIMESTAMP | Call start timestamp |
| `duration` | FLOAT64 | Duration in seconds — filter `> 120` to exclude short calls |
| `transcript` | STRING | Full call transcript |
| `sentiment` | STRING | Overall call sentiment |
| `sentiment_examples` | STRING | Examples supporting sentiment classification |
| `summary_interaction` | STRING | AI-generated call summary |
| `risk_commercial` | STRING | Commercial risk signal |
| `risk_commercial_explanation` | STRING | Explanation of commercial risk |
| `risk_technical` | STRING | Technical risk signal |
| `risk_technical_explanation` | STRING | Explanation of technical risk |

### 2.1.2. health_score (account health scoring)

**BigQuery table:** `guesty-data.csm.health_score`

Composite health score built from 5 dimensions: tickets, profit, channel mix, product adoption, and engagement. Includes daily snapshots.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID — join key |
| `account_name` | STRING | Account name |
| `sf_account_id` | STRING | Salesforce Account ID |
| `partition_date` | DATE | Snapshot date |
| `total_score` | FLOAT | **Composite health score** |
| `previous_score` | FLOAT | Previous period score |
| `total_score_bucket` | INT64 | Score bucket/tier |
| `ticket_score` | INT64 | Ticket health component |
| `tickets` | INT64 | Total tickets |
| `critical_tickets` | FLOAT | Critical ticket count |
| `profit_score` | INT64 | Profitability component |
| `profit` | FLOAT | Profit amount |
| `revenue` | FLOAT | Revenue |
| `cost` | FLOAT | Cost |
| `channel_score` | INT64 | Channel mix component |
| `top_channel` | STRING | Top distribution channel |
| `ratio` | FLOAT | Channel ratio |
| `product_score` | INT64 | Product adoption component |
| `adoption_rate` | FLOAT | Feature adoption rate |
| `eng_score` | FLOAT | Engagement component |
| `friction_perc` | FLOAT | % friction tickets |
| `pricing_perc` | FLOAT | % pricing tickets |
| `channel_perc` | FLOAT | % channel tickets |
| `csm` | STRING | CSM name |
| `account_segmentation` | STRING | Segment |
| `avg_mrr` | FLOAT | Average MRR |
| `account_active` | BOOLEAN | Is active |
| `months_in_guesty` | INT64 | Tenure |
| `active_listings` | INT64 | Active listings |
| `churn_date` | DATE | Churn date (if applicable) |

### 2.1.3. portfolio (CSM portfolio view)

**BigQuery table:** `guesty-data.csm.portfolio`

CSM portfolio view with account assignments, status, risk levels, and key metrics.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID — join key |
| `account_name` | STRING | Account name |
| `csm` | STRING | Assigned CSM |
| `manager` | STRING | CSM's manager |
| `director` | STRING | Director |
| `solutions_expert` | STRING | Solutions expert |
| `account_segmentation` | STRING | Segment |
| `operative_account_segmentation` | STRING | Operative segment |
| `account_active` | BOOLEAN | Is active |
| `is_churn` | BOOLEAN | Is churned |
| `is_freezingflow` | BOOLEAN | In freezing flow |
| `csm_overall_risk_level` | STRING | **CSM-assessed risk level** |
| `health_score` | FLOAT | Current health score |
| `friction_perc` | FLOAT | % friction tickets |
| `actual_mrr` | FLOAT | Actual MRR |
| `operative_mrr` | INT64 | Operative MRR |
| `active_listings` | INT64 | Active listings |
| `months_in_guesty` | INT64 | Tenure in months |
| `onboarding_status` | STRING | OB status |
| `next_renewal_date` | DATE | Next renewal |
| `package` | STRING | Package |
| `contact_email` | STRING | Primary contact |
| `geo_area` | STRING | Geographic area |

### 2.1.4. csm_churn_report (churn analysis)

**BigQuery table:** `guesty-data.csm.csm_churn_report`

Detailed churn analysis with reasons, revenue impact, and ETF (Early Termination Fee).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID |
| `account_name` | STRING | Account name |
| `from_date` | DATE | Churn date |
| `churn_reason` | STRING | Primary churn reason |
| `churn_reason_modified` | STRING | Modified/normalized reason |
| `customer_churn_reason` | STRING | Customer-stated reason |
| `churn_type` | STRING | Type of churn |
| `cancelled_by` | STRING | Who cancelled |
| `csm` | STRING | CSM at time of churn |
| `manager` | STRING | Manager |
| `director` | STRING | Director |
| `etf` | FLOAT | Early Termination Fee |
| `expected_mrr__c` | FLOAT | Expected MRR at churn |
| `avg_mrr` | FLOAT | Average MRR |
| `months_in_guesty` | INT64 | Tenure at churn |
| `account_segmentation` | STRING | Segment |
| `package` | STRING | Package |
| `onboarding_status` | STRING | OB status at churn |
| `churn_mrr_including_payments` | FLOAT | Total MRR impact |
| `geo_area` | STRING | Geographic area |
| `account_country` | STRING | Country |

### 2.1.5. delighted_data (NPS surveys)

**BigQuery table:** `guesty-data.csm.delighted_data`

NPS survey responses from Delighted with SFDC account linkage.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | STRING | Survey response ID — PK |
| `person` | STRING | Respondent identifier |
| `score` | INT64 | **NPS score (0-10)**: 0-6 = Detractor, 7-8 = Passive, 9-10 = Promoter |
| `comment` | STRING | Free-text feedback |
| `survey_type` | STRING | Survey type |
| `created_at` | TIMESTAMP | Response timestamp |
| `account_name` | STRING | Account name |
| `account_owner` | STRING | Account owner |
| `current_segment` | STRING | Account segment |
| `account_country` | STRING | Country |
| `account_area` | STRING | Geographic area |
| `onboarding_status` | STRING | OB status |
| `delighted_source` | STRING | Survey delivery source |
| `sfdc_account_id` | STRING | **Salesforce Account ID** — join to sf_account.Id |
| `sfdc_account_name` | STRING | SF account name |
| `sfdc_contact_id` | STRING | SF Contact ID |
| `sfdc_contact_name` | STRING | SF contact name |
| `sfdc_account_owner_name` | STRING | SF account owner |
| `person_question` | STRING | Custom question asked |
| `person_ans` | STRING | Custom question answer |

### 2.1.6. listing_performance (listing-level metrics + guest sentiment)

**BigQuery table:** `guesty-data.csm.listing_performance`

Listing-level performance metrics including revenue, occupancy, and **guest review sentiment**.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID |
| `listing_id` | STRING | Listing ID — join to dim_listings |
| `listing_nickname` | STRING | Listing display name |
| `date_listing` | STRING | Period identifier |
| `revenue_confirmed` | FLOAT | Confirmed revenue |
| `revenue_canceled` | FLOAT | Cancelled revenue |
| `total_listings` | INT64 | Total listings count |
| `num_guesty_reservations` | INT64 | Number of reservations |
| `num_canceled_guesty_reservations` | INT64 | Cancelled reservations |
| `cancelation_rate_guesty` | FLOAT | Cancellation rate |
| `sentiment_positive` | INT64 | **Positive guest review count** |
| `sentiment_negative` | INT64 | **Negative guest review count** |
| `sentiment_neutral` | INT64 | **Neutral guest review count** |
| `overall_rating` | FLOAT | **Overall listing rating** |
| `benchmark_review_overall_rating` | FLOAT | Benchmark rating for comparison |
| `listing_active` | BOOLEAN | Is listing active |

### 2.1.7. mrr_calculator (MRR analytics)

**BigQuery table:** `guesty-data.csm.mrr_calculator`

MRR analytics with plan details, reservation metrics, and Stripe payment data.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID |
| `account_name` | STRING | Account name |
| `csm` | STRING | CSM name |
| `plan_name` | STRING | Subscription plan name |
| `plan_value` | FLOAT | Plan value |
| `plan_value_cal` | FLOAT | Calculated plan value |
| `last_month_paid_listings` | INT64 | Last month paid listings |
| `active_listed_listings` | INT64 | Active listed listings |
| `last_month_rev_from_account` | FLOAT | Last month revenue |
| `revenue` | FLOAT | Total revenue |
| `avg_mrr_12m` | FLOAT | 12-month average MRR |
| `avg_mrr_3m` | FLOAT | 3-month average MRR |
| `reservations_per_listing` | FLOAT | Reservations per listing (current) |
| `reservations_per_listing_12m` | FLOAT | Reservations per listing (12m) |
| `fee_host_payout_usd_per_listing` | FLOAT | Payout per listing |
| `stripe_app_fee_revenue` | FLOAT | Stripe app fee revenue |
| `stripe_net_revenue` | FLOAT | Stripe net revenue |
| `revshare_revenue` | FLOAT | Revenue share amount |

### 2.1.8. segmentation_report (account segmentation history)

**BigQuery table:** `guesty-data.csm.segmentation_report`

Monthly account segmentation snapshots with health score trends and segment changes.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `partition_date` | DATE | Snapshot date |
| `month` | DATE | Month |
| `account_id` | STRING | Guesty account ID |
| `account_name` | STRING | Account name |
| `account_segmentation` | STRING | Current segment |
| `current_segment_tier` | STRING | Current segment tier |
| `previous_segment_tier` | STRING | Previous segment tier |
| `excepted_actual_segment_change` | STRING | Segment change description |
| `last_segment_change` | STRING | Last segment change |
| `segment_changes` | STRING | Segment change history |
| `health_score` | FLOAT | Health score |
| `health_score_bucket` | STRING | Score bucket |
| `pre_hs` | FLOAT | Previous health score |
| `pre_hs_bucket` | STRING | Previous HS bucket |
| `account_owner_sentiment` | STRING | **Owner sentiment** |
| `csm` | STRING | CSM |
| `manager` | STRING | Manager |
| `avg_mrr` | FLOAT | Average MRR |
| `operative_mrr` | INT64 | Operative MRR |
| `active_listings` | INT64 | Active listings |
| `onboarding_status` | STRING | OB status |
| `geo_area` | STRING | Geographic area |

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by `partition_date`, `startDate`, or `created_at` depending on the table. Use bounded windows (e.g. last 30 days) for large tables.
- **Duration filter** (Modjo): Filter `duration > 120` to exclude short/test calls.
- **Status filters**: Filter `IFNULL(account_active, FALSE) = TRUE` for current customers (Boolean columns may be NULL).
- **Limits**: Max 50-100 rows per run when fetching transcript/summary fields.
- **Account filter**: Use `account_id` or `account_crm_id` to scope queries.

---

## 4. API Endpoints (When Using HTTP Request — Modjo only)

| Item | Value |
|------|--------|
| **Base URL** | `https://api.modjo.ai/v1/` |
| **List calls** | `GET /v1/calls` — use query parameter `account_id` to filter. |
| **Single call / transcript** | `GET /v1/calls/{id}/transcript` |
| **Response structure** | Array of call objects; transcript under `transcript_text` or nested object. |

When using the **BigQuery** table, use only field names from section 2.1 schemas.

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: CSM (Customer Success — includes Modjo, Health Scores, NPS, Churn)
Node Type: BigQuery node (preferred). HTTP Request for Modjo API alternative.
Credential Type: Google Service Account API (BQ); Bearer Auth (Modjo API).
Credentials: Provided per-department in conversation context.
BQ tables (guesty-data.csm.*):
  - modjo_transcripts_structured_master (call transcripts + AI risk signals — 45K rows)
  - health_score (composite health scoring — 5 dimensions)
  - portfolio (CSM portfolio — assignments, risk levels)
  - csm_churn_report (churn analysis with reasons + ETF)
  - delighted_data (NPS scores + comments)
  - listing_performance (listing metrics + guest review sentiment)
  - mrr_calculator (MRR analytics + Stripe revenue)
  - segmentation_report (segment history + health trends)
Linkage: modjo account_crm_id = dim_accounts.sf_account_id. All other tables: account_id = dim_accounts.account_id = tickets_clean.account_id. listing_performance.listing_id = dim_listings.listing_id. delighted_data.sfdc_account_id = sf_account.Id.
Sentiment/risk fields: modjo_master (sentiment, risk_commercial, risk_technical), health_score (total_score, 5 components), portfolio (csm_overall_risk_level: 'High Risk'/'Medium Risk'/'Low Risk'/'Healthy'), delighted_data (NPS score/comment — stale since Oct 2024), listing_performance (sentiment_positive/negative/neutral, overall_rating — 532M rows, filter tightly), segmentation_report (account_owner_sentiment), csm_churn_report (churn_reason).
Query: Filter duration > 120 for Modjo; date-bound all queries; limit 50-100 rows for transcript fields.
```

---

## 5. BigQuery: Common Query Patterns & Best Practices

> All SQL patterns below verified against live BigQuery data (Apr 1, 2026).

### Key columns quick reference

| Column | Table | Notes |
|--------|-------|-------|
| `account_id` | most tables | Guesty account ID — primary join key |
| `account_crm_id` | modjo_transcripts_structured_master | **= sf_account_id** — use for Modjo joins |
| `callId` | modjo_transcripts_structured_master | Modjo call primary key |
| `csm` | `dim_accounts`, `portfolio`, `health_score`, `csm_churn_report`, `mrr_calculator`, `segmentation_report` | **Canonical CSM/account owner name.** 100% populated in `dim_accounts`. When asked for "CSM" / "account owner", use this column from whichever table is already in your query — NEVER round-trip to Salesforce. See "CSM / Account Owner Lookup Rule" in section 2. |
| `total_score` | health_score | Composite health score |
| `csm_overall_risk_level` | portfolio | CSM risk assessment — values: `'Healthy'`, `'Low Risk'`, `'Medium Risk'`, `'High Risk'` |
| `score` | delighted_data | NPS score (0-10). **Data stale since Oct 2024.** |
| `sentiment_positive/negative` | listing_performance | Guest review sentiment. **Table is 532M rows — always filter tightly.** |
| `churn_reason` | csm_churn_report | Primary churn reason |

### Common SQL patterns

```sql
-- Verified: Calls per account last 30 days (45K rows total, Aug 2025–present)
SELECT
  m.account_crm_id,
  a.account_name,
  COUNT(m.callId)       AS call_count,
  ROUND(AVG(m.duration/60.0), 1) AS avg_duration_min
FROM `guesty-data.csm.modjo_transcripts_structured_master` m
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON m.account_crm_id = a.sf_account_id
WHERE m.startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND m.duration > 120
GROUP BY m.account_crm_id, a.account_name
ORDER BY call_count DESC
LIMIT 20;

-- Verified: Calls with commercial/technical risk signals
SELECT
  m.callId,
  m.startDate,
  a.account_name,
  m.risk_commercial,
  m.risk_technical,
  m.summary_interaction
FROM `guesty-data.csm.modjo_transcripts_structured_master` m
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON m.account_crm_id = a.sf_account_id
WHERE (m.risk_commercial IS NOT NULL AND m.risk_commercial != ''
       OR m.risk_technical IS NOT NULL AND m.risk_technical != '')
  AND m.startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
ORDER BY m.startDate DESC;

-- Verified: Health score trends (current vs previous). Note: previous_score often NULL for new accounts.
SELECT
  h.account_id,
  h.account_name,
  h.total_score,
  h.previous_score,
  ROUND(h.total_score - h.previous_score, 2) AS score_change,
  h.ticket_score,
  h.profit_score,
  h.channel_score,
  h.product_score,
  h.eng_score
FROM `guesty-data.csm.health_score` h
WHERE h.partition_date = (SELECT MAX(partition_date) FROM `guesty-data.csm.health_score`)
  AND IFNULL(h.account_active, FALSE) = TRUE
ORDER BY score_change ASC
LIMIT 20;

-- Verified: Portfolio at-risk accounts. Risk levels: 'High Risk', 'Medium Risk', 'Low Risk', 'Healthy' (NOT 'High'/'Critical').
SELECT
  p.account_name,
  p.csm,
  p.csm_overall_risk_level,
  p.health_score,
  p.actual_mrr,
  p.active_listings,
  p.next_renewal_date
FROM `guesty-data.csm.portfolio` p
WHERE IFNULL(p.account_active, FALSE) = TRUE
  AND p.csm_overall_risk_level IN ('High Risk', 'Medium Risk')
ORDER BY p.actual_mrr DESC;

-- Verified: NPS score distribution (5,248 total responses). WARNING: data stale (latest Oct 2024).
-- Verified results (all-time): Detractor 2,606 (avg 2.1), Promoter 2,075 (avg 9.8), Passive 567 (avg 7.6)
SELECT
  CASE
    WHEN d.score >= 9 THEN 'Promoter'
    WHEN d.score >= 7 THEN 'Passive'
    ELSE 'Detractor'
  END AS nps_category,
  COUNT(*) AS cnt,
  ROUND(AVG(d.score), 1) AS avg_score
FROM `guesty-data.csm.delighted_data` d
-- WHERE d.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)  -- uncomment when data is fresh
GROUP BY nps_category;

-- Verified: NPS detractors with comments
SELECT
  d.account_name,
  d.score,
  d.comment,
  d.current_segment,
  d.created_at
FROM `guesty-data.csm.delighted_data` d
WHERE d.score <= 6
  AND d.comment IS NOT NULL
  AND d.comment != ''
ORDER BY d.created_at DESC
LIMIT 50;

-- Verified: Listing performance with guest sentiment. WARNING: 532M rows — always filter by account_id or listing_active.
SELECT
  lp.account_id,
  a.account_name,
  SUM(lp.sentiment_positive) AS total_positive,
  SUM(lp.sentiment_negative) AS total_negative,
  ROUND(AVG(lp.overall_rating), 2) AS avg_rating,
  ROUND(AVG(lp.benchmark_review_overall_rating), 2) AS benchmark_rating
FROM `guesty-data.csm.listing_performance` lp
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON lp.account_id = a.account_id
WHERE IFNULL(lp.listing_active, FALSE) = TRUE
GROUP BY lp.account_id, a.account_name
HAVING total_negative > 5
ORDER BY total_negative DESC
LIMIT 20;

-- Verified: Churn analysis by reason (2,960 rows). Use 180-day window for meaningful results.
-- Verified top reasons: Unknown Reason (83), Inactive/Silent User (82), Non-Responsive (54), Pricing (41), Product Fit (37)
SELECT
  c.churn_reason_modified,
  COUNT(*) AS churn_count,
  ROUND(AVG(c.avg_mrr), 0) AS avg_mrr_at_churn,
  ROUND(AVG(c.months_in_guesty), 0) AS avg_tenure
FROM `guesty-data.csm.csm_churn_report` c
WHERE c.from_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
GROUP BY c.churn_reason_modified
ORDER BY churn_count DESC;

-- Verified: Account 360 — health + tickets + risk level
SELECT
  h.account_id,
  h.account_name,
  h.total_score AS health_score,
  p.csm_overall_risk_level,
  COUNT(DISTINCT t.ticket_id) AS recent_tickets
FROM `guesty-data.csm.health_score` h
LEFT JOIN `guesty-data.csm.portfolio` p
  ON h.account_id = p.account_id
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON h.account_id = t.account_id
  AND t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
WHERE h.partition_date = (SELECT MAX(partition_date) FROM `guesty-data.csm.health_score`)
  AND IFNULL(h.account_active, FALSE) = TRUE
GROUP BY h.account_id, h.account_name, h.total_score, p.csm_overall_risk_level
ORDER BY h.total_score ASC
LIMIT 20;

-- ════════════════════════════════════════════════════════════════════════════
-- CSM lookup pattern: USE THE IN-QUERY `csm` COLUMN, do NOT round-trip to SF
-- ════════════════════════════════════════════════════════════════════════════
-- ✅ CORRECT: Daily churn report including the CSM, no SF round-trip needed.
-- The csm.csm_churn_report table already has a `csm` column — just SELECT it.
-- Verified Apr 10, 2026: c.csm is populated for all churned accounts in this table.
SELECT
  c.account_id,
  c.account_name,
  c.from_date           AS churn_date,
  c.churn_reason_modified,
  c.csm,                              -- ← canonical CSM, no Salesforce needed
  c.avg_mrr,
  c.account_segmentation
FROM `guesty-data.csm.csm_churn_report` c
WHERE c.from_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY c.from_date DESC
LIMIT 100;

-- ❌ WRONG: Same workflow, but adding an unnecessary Salesforce round-trip.
-- This pattern was observed in harvested_cs_005 — the AI queried csm_churn_report
-- (which already has c.csm) and then made a second SF call to Owner.Name. The two
-- values disagree on ~80% of accounts and the workflow ends up showing both with
-- conflicting data. Don't do this:
--
--   SELECT c.account_id, c.csm, da.sf_account_id
--   FROM csm.csm_churn_report c JOIN dim_accounts da USING (account_id)
--   → then a Salesforce node: SELECT Id, Owner.Name FROM Account WHERE Id = '...'
--
-- The c.csm column already has the answer. Skip the SF call entirely.
```

### Filters & limits
- Filter `duration > 120` for Modjo to exclude short/test calls
- Always use `account_crm_id` (NOT `account_id`) for Modjo cross-source joins
- Date-bound all queries: `partition_date`, `startDate`, `created_at` as appropriate
- Health score: use latest `partition_date` for current state, historical for trends
- NPS: 0-6 = Detractor, 7-8 = Passive, 9-10 = Promoter
- Max 50-100 rows when fetching transcript/summary/comment fields
- Boolean columns (account_active, is_churn, etc.) may be NULL in BigQuery — use `IFNULL(col, FALSE) = FALSE` instead of `col = FALSE`
