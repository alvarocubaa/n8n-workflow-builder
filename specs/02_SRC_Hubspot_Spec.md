# HubSpot — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or property names. Use it to generate runnable n8n JSON.

**Node policy:** **Prefer the HubSpot node** (native) for direct CRM operations (Get, Get All, Search, Create, Update). Use BigQuery only for cross-source joins, warehouse-only aggregations, or marketing analytics tables that have no HubSpot API equivalent.

**This spec covers two access paths:**
1. **HubSpot node** — real-time CRM data (contacts, companies, deals, tickets)
2. **BigQuery `marketing_data.*` tables** — pre-joined marketing analytics (funnel, attribution, email events, form submissions)

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| HubSpot CRM | `hubSpotOAuth2Api` | HubSpot node |
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | HubSpot path: OAuth2. BigQuery path: Google Service Account API. |
| **Node Type** | **Prefer HubSpot node** for direct CRM operations. Use BigQuery node for marketing analytics tables (see section 4). |
| **BigQuery project** | `guesty-data` (plain string, NOT an object with mode/value) |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (HubSpot CRM — Source of Truth)

- **Primary key / linkage**: HubSpot **object id** (e.g. contact `vid`). Use custom properties for cross-system linkage:
  - `salesforce_contactid` / `salesforcecontactid` → Salesforce Contact Id
  - `salesforce_accountid` / `salesforceaccountid` → Salesforce Account Id (= `dim_accounts.sf_account_id`)
  - `salesforceleadid` / `salesforce_lead_id` → Salesforce Lead Id
- **API property names**: Use **internal property names** (e.g. `firstname`, `lastname`, `hs_lead_status`). Custom properties use snake_case names.
- **Objects**: Contacts, Companies, Deals, Tickets. Each has a defined schema; list required properties explicitly.
- **Data types**: String, Number, Enum, Date (epoch ms or ISO), Boolean. Match CRM property types.

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by `createdate`, `lastmodifieddate` (or equivalent) to bound queries (e.g. last 30 days).
- **Status filters**: Use list membership or property filters (e.g. only contacts in "Customer" list; only deals in "Closed Won").
- **Limits**: Use pagination (after/limit); set a max per run (e.g. 100 contacts, 50 deals per run) to avoid timeouts and rate limits.
- **Properties**: Request only needed properties to reduce payload size.
- **BigQuery boolean columns** may be NULL — use `IFNULL(col, FALSE) = FALSE` instead of `col = FALSE`.

---

## 4. Downstream / Warehouse Alignment — BigQuery `marketing_data`

When HubSpot data is used in warehouse or reporting pipelines, it aligns with the following BigQuery tables. All tables are in project `guesty-data`, dataset `marketing_data`.

**BigQuery full table names (use exactly — do not invent project/dataset names):**

| Logical table | Full BigQuery path | Rows per | Description |
|---------------|--------------------|----------|-------------|
| hubspot_contacts | `guesty-data.marketing_data.hubspot_contacts` | 1 per HubSpot contact | Contacts with Salesforce IDs, analytics source, demo/opportunity tracking |
| hubspot_form_submissions | `guesty-data.marketing_data.hubspot_form_submissions` | 1 per form submission | Form submissions with full UTM attribution, SLS scoring |
| hubspot_emails_events | `guesty-data.marketing_data.hubspot_emails_events` | 1 per email event | Email engagement events enriched with Guesty account data |
| hubspot_chilipiper | `guesty-data.marketing_data.hubspot_chilipiper` | 1 per ChiliPiper booking | Form submissions routed through ChiliPiper scheduling |
| hubspot_unbounce_forms_mapping | `guesty-data.marketing_data.hubspot_unbounce_forms_mapping` | 1 per form mapping | Mapping table for Unbounce forms |
| marketing_data | `guesty-data.marketing_data.marketing_data` | 1 per lead (master) | Central marketing funnel — full attribution, geography, funnel dates, opportunity, revenue |
| leads_contacts | `guesty-data.marketing_data.leads_contacts` | 1 per SF lead/contact | Salesforce leads/contacts with funnel dates and UTM attribution |
| marketing_kpi | `guesty-data.marketing_data.marketing_kpi` | 1 per dimension combo per day | Pre-aggregated funnel KPIs by all marketing dimensions |
| main_cost | `guesty-data.marketing_data.main_cost` | 1 per UTM combo per day | Campaign-level daily cost with funnel metrics |
| events | `guesty-data.marketing_data.events` | 1 per event attendee | Event/webinar attendees with full funnel tracking |
| geo_month_actual_goal_eom | `guesty-data.marketing_data.geo_month_actual_goal_eom` | 1 per region per month | Regional monthly actuals vs goals (accounts, listings, revenue, SQL, churn) |
| daily_board | `guesty-data.marketing_data.daily_board` | 1 per day | Daily lead counts by ad platform + total cost |
| daily_cost | `guesty-data.marketing_data.daily_cost` | 1 per day | Daily ad spend by platform (Google, Facebook, LinkedIn, Bing, MNTN) |
| monthly_snapshot | `guesty-data.marketing_data.monthly_snapshot` | 1 per lead per month | Monthly snapshot of lead funnel — cohort analysis |
| sales_revenue_cohort | `guesty-data.marketing_data.sales_revenue_cohort` | 1 per account per month | Revenue cohort by type (software, GCS, commission, etc.) |
| glite_marketing_data | `guesty-data.marketing_data.glite_marketing_data` | 1 per Guesty Lite account | Lite (self-serve) account marketing with activation funnel |

**Join keys (source of truth for cross-source joins):**

| Key | Where it lives | Joins to |
|-----|---------------|----------|
| **email** / **lead_email** | hubspot_contacts, hubspot_form_submissions, hubspot_chilipiper, marketing_data, leads_contacts | All HubSpot tables join to each other on email |
| **salesforce_contactid** | hubspot_contacts | Salesforce Contact Id |
| **salesforce_accountid** | hubspot_contacts | Salesforce Account Id = `dim_accounts.sf_account_id` |
| **salesforceleadid** | hubspot_contacts | Salesforce Lead Id |
| **sf_account_id** | marketing_data | Salesforce Account Id = `dim_accounts.sf_account_id` |
| **guesty_account_id** | marketing_data | Guesty account_id = `dim_accounts.account_id` |
| **account_id** | hubspot_emails_events | Guesty account_id = `dim_accounts.account_id` |
| **ga_client_id** / **GA4_Client_id__c** | hubspot_form_submissions, marketing_data, leads_contacts | Google Analytics client ID for web analytics join |
| **contact_id** | leads_contacts, marketing_data | Salesforce Contact Id (different from HubSpot vid) |
| **lead_id** | marketing_data | Salesforce Lead Id |
| **opp_id** | marketing_data | Salesforce Opportunity Id |

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| hubspot_contacts | Salesforce dim_accounts | hubspot_contacts.**salesforce_accountid** = dim_accounts.**sf_account_id** |
| marketing_data | Salesforce dim_accounts | marketing_data.**sf_account_id** = dim_accounts.**sf_account_id** |
| marketing_data | Guesty dim_accounts | marketing_data.**guesty_account_id** = dim_accounts.**account_id** |
| hubspot_emails_events | Guesty dim_accounts | hubspot_emails_events.**account_id** = dim_accounts.**account_id** |
| marketing_data | Zuora invoices | marketing_data.**guesty_account_id** = invoices.**mongo_account_id** ⚠️ |
| marketing_data | Jira jira_hierarchy | marketing_data.**guesty_account_id** = *unnested* jira_hierarchy.**account_ids** |
| marketing_data | Zendesk tickets_clean | marketing_data.**guesty_account_id** = tickets_clean.**account_id** |

---

### 4.1 hubspot_contacts (28 columns)

**BigQuery table:** `guesty-data.marketing_data.hubspot_contacts`

| Field | Type | Description |
|-------|------|-------------|
| vid | INT64 | HubSpot contact ID (primary key) |
| addedAt | TIMESTAMP | When contact was added to HubSpot |
| email | STRING | Contact email (join key to other HubSpot tables) |
| leadstatus | STRING | HubSpot lead status |
| country | STRING | Contact country |
| ga_client_id | STRING | Google Analytics client ID |
| hs_analytics_source | STRING | HubSpot analytics original source |
| hs_analytics_first_url | STRING | First URL visited |
| hs_analytics_first_referrer | STRING | First referrer URL |
| lastname | STRING | Last name |
| firstname | STRING | First name |
| lead_source | STRING | Lead source |
| lead_sub_source | STRING | Lead sub-source |
| event | STRING | Event participation |
| event_participation | STRING | Event participation detail |
| demo_scheduled | TIMESTAMP | Demo scheduled date |
| demo_completed | TIMESTAMP | Demo completed date |
| opportunity_stage | STRING | Current opportunity stage |
| salesforce_contactid | STRING | **Salesforce Contact Id** (cross-system join) |
| salesforce_accountid | STRING | **Salesforce Account Id** → `dim_accounts.sf_account_id` |
| salesforce_lead_id | STRING | Salesforce Lead Id |
| salesforceleadid | STRING | Salesforce Lead Id (alternate field) |
| salesforceaccountid | STRING | Salesforce Account Id (alternate field) |
| salesforceopportunitystage | STRING | Salesforce opportunity stage |
| is_contact | BOOL | Whether record is a contact (vs lead) |
| salesforcecontactid | STRING | Salesforce Contact Id (alternate field) |
| meetups | STRING | Meetup participation |
| webinars | STRING | Webinar participation |

---

### 4.2 hubspot_form_submissions (24 columns)

**BigQuery table:** `guesty-data.marketing_data.hubspot_form_submissions`

| Field | Type | Description |
|-------|------|-------------|
| insert_date | DATE | Date row was inserted |
| email | STRING | Submitter email (join key) |
| form_name | STRING | HubSpot form name |
| form_guid | STRING | HubSpot form GUID |
| submitted_at | INT64 | Submission timestamp (epoch ms) |
| country | STRING | Submitter country |
| utm_source | STRING | UTM source |
| utm_medium | STRING | UTM medium |
| utm_campaign | STRING | UTM campaign |
| utm_content | STRING | UTM content |
| utm_term | STRING | UTM term |
| last_click | STRING | Last click source |
| last_click_path | STRING | Last click URL path |
| ga_client_id | STRING | Google Analytics client ID |
| country_classification | STRING | Country tier/classification |
| number_of_listings_2021 | STRING | Number of listings (from form) |
| occupancy_rate__segment_ | STRING | Occupancy rate segment |
| average_nightly_rate_segment | STRING | Average nightly rate segment |
| first_sls | STRING | First SLS (Smart Lead Scoring) score |
| form_page_url | STRING | URL of the page containing the form |
| sls_verdict | STRING | SLS verdict (qualified/unqualified) |
| marketing_flow | STRING | Marketing flow (e.g. GFP, GFH) |
| sub_marketing_flow | STRING | Sub marketing flow |
| page_url | STRING | Page URL |

---

### 4.3 hubspot_emails_events (20 columns)

**BigQuery table:** `guesty-data.marketing_data.hubspot_emails_events`

| Field | Type | Description |
|-------|------|-------------|
| partition_date | DATE | Partition date |
| recipient | STRING | Email recipient |
| event_created_time | TIMESTAMP | Event timestamp |
| event_created_date | DATE | Event date |
| event_type | STRING | Event type (OPEN, CLICK, DELIVERED, BOUNCE, etc.) |
| event_duration_sec | FLOAT64 | Duration in seconds (for opens) |
| subject | STRING | Email subject line |
| email_id | STRING | HubSpot email ID |
| email_name | STRING | Email name |
| campaign | STRING | Campaign ID |
| campaignName | STRING | Campaign name |
| type | STRING | Email type |
| state | STRING | Email state |
| subcategory | STRING | Email subcategory |
| account_id | STRING | **Guesty account_id** → `dim_accounts.account_id` |
| account_name | STRING | Guesty account name |
| account_segmentation | STRING | Account segmentation tier |
| avg_mrr | FLOAT64 | Account average MRR |
| package | STRING | Account package |
| onboarding_status | STRING | Account onboarding status |

---

### 4.4 hubspot_chilipiper (20 columns)

**BigQuery table:** `guesty-data.marketing_data.hubspot_chilipiper`

| Field | Type | Description |
|-------|------|-------------|
| email | STRING | Contact email (join key) |
| form_name | STRING | Form name |
| submitted_date | DATE | Form submission date |
| sls_verdict | STRING | SLS verdict |
| country | STRING | Country |
| utm_source | STRING | UTM source |
| utm_medium | STRING | UTM medium |
| utm_campaign | STRING | UTM campaign |
| marketing_flow | STRING | Marketing flow |
| sub_marketing_flow | STRING | Sub marketing flow |
| number_of_listings_2021 | NUMERIC | Number of listings |
| form_page_url | STRING | Form page URL |
| occupancy_rate_segment | STRING | Occupancy rate segment |
| average_nightly_rate_segment | STRING | Average nightly rate segment |
| first_sls | INT64 | First SLS score |
| daily_form_submissions | INT64 | Daily form submission count |
| sdr_call_request_date | DATE | SDR call requested date |
| sdr_call_date | INT64 | SDR call date |
| agd_call_request_date | DATE | AGD call requested date |
| agd_call_date | INT64 | AGD call date |

---

### 4.5 hubspot_unbounce_forms_mapping (5 columns)

**BigQuery table:** `guesty-data.marketing_data.hubspot_unbounce_forms_mapping`

| Field | Type | Description |
|-------|------|-------------|
| hubspot_form_guid | STRING | HubSpot form GUID |
| hubspot_form_name | STRING | HubSpot form name |
| unbounce_form_id | STRING | Unbounce form ID |
| unbounce_page_name | STRING | Unbounce page name |
| mapping_date | DATE | Mapping effective date |

---

### 4.6 marketing_data (140 columns — central marketing funnel table)

**BigQuery table:** `guesty-data.marketing_data.marketing_data`

This is the **master lead-level table** with one row per lead. It combines Salesforce lead/contact data, HubSpot attribution, geography, funnel milestone dates, opportunity data, and revenue. It is the primary table for marketing analytics queries.

**Key column groups:**

| Group | Columns | Description |
|-------|---------|-------------|
| Identity | lead_email, lead_company, lead_id, contact_id, sf_account_id, guesty_account_id | Lead/account identifiers |
| Status | lead_status, lead_sub_status, lead_owner, sdr, IsConverted, is_lead, is_new, is_nurturing, record_type | Lead lifecycle status |
| Attribution | channel, marketing_type, marketing_team, utm_source/medium/campaign/content/term, source, medium, campaign, keyword, first_URL, original_source, conversion_origin, lead_source, lead_sub_source, lead_source_type, first_referrer, ga_client_id | Full marketing attribution |
| Geography | country, country_code, state, state_code, region, area, country_tier | Geographic dimensions |
| Product | rental_type, number_of_listings, number_of_listings_new, listings_buckets, sdr_listings_buckets, Guesty_Product_Fit__c | Product fit dimensions |
| Scoring | original_sls_score, sls_marketing_verdict, recent_form_sls, lead_score_num, SLS_Chosen_Verdict__c | Lead scoring |
| Funnel dates | lead_created_date, get_started_date, lead_request_demo_date, demo_scheduled_date, demo_completed_date, revival_demo_date, demo_group_date, grouped_sql_date, sql_date, opp_closed_date, first_paid_date, winback_date | Full funnel milestone dates |
| Revenue | opp_amount, expected_mrr__c, gfh_total_revenue, total_revenue, avg_mrr | Revenue metrics |
| Events | event_participation, event_category, event_name, event_date, opp_closed_from_event, webinars, webinar_date, meetups | Event/webinar participation |
| SDR | sdr_connect, sdr_touch, orginal_sdr_touch, call_connected, call_connected_date | SDR activity timestamps |
| Flags | account_active, is_churn, resurrection, reseller_outbound, agd, is_valid_status, is_top_country, is_valid_sdr, is_20plus_listings, demo_from_opp | Boolean filters |

---

### 4.7 marketing_kpi (48 columns — pre-aggregated funnel KPIs)

**BigQuery table:** `guesty-data.marketing_data.marketing_kpi`

Pre-aggregated table with funnel counts broken down by all marketing dimensions. Use this instead of aggregating `marketing_data` when you need summary counts.

**Dimension columns:** date, lead_status, lead_sub_status, sdr, reseller_outbound, channel, marketing_type, marketing_team, conversion_origin, utm_source/medium/campaign, source, medium, campaign, keyword, first_URL, original_source, lead_source, lead_sub_source, lead_source_type, first_referrer, event_participation, opp_closed_from_event, meetups, webinars, country, country_tier, rental_type, region, state, area, listings_buckets, number_of_listings_new, request_a_demo_type

**Metric columns (INT64 counts):**

| Metric | Description |
|--------|-------------|
| lead_created | New leads created |
| qualified_lead_created | Qualified leads created |
| demo_request | Demo requests |
| demo_scheduled | Demos scheduled |
| day_demo_scheduled | Same-day demos scheduled |
| demo_completed | Demos completed |
| revival_demo | Revival demos |
| demo_group | Group demos |
| total_demo | Total demos (all types) |
| customers | New customers |
| winback | Winback customers |
| first_paid | First paid accounts |
| demo_number_of_listings | Listings from demo leads |

---

### 4.8 main_cost (31 columns — campaign cost data)

**BigQuery table:** `guesty-data.marketing_data.main_cost`

Daily campaign-level cost data with funnel metrics. Join to `marketing_data` or `marketing_kpi` via UTM parameters.

| Field | Type | Description |
|-------|------|-------------|
| date | DATE | Date |
| utm_source | STRING | UTM source (raw) |
| utm_medium | STRING | UTM medium (raw) |
| utm_campaign | STRING | UTM campaign (raw) |
| utm_content | STRING | UTM content |
| utm_term | STRING | UTM term |
| c_source_name | STRING | Cleaned source name |
| c_utm_campaign | STRING | Cleaned UTM campaign |
| c_utm_content | STRING | Cleaned UTM content |
| c_utm_term | STRING | Cleaned UTM term |
| source | STRING | Mapped source |
| campaign | STRING | Mapped campaign |
| content | STRING | Mapped content |
| term | STRING | Mapped term |
| cost | FLOAT64 | Ad spend ($) |
| leads | INT64 | Total leads |
| pro_leads | INT64 | Pro leads |
| lite_leads | INT64 | Lite leads |
| null_leads | INT64 | Unclassified leads |
| chilipiper_call | INT64 | ChiliPiper calls |
| demo_scheduled | INT64 | Demos scheduled |
| grouped_sql | INT64 | Grouped SQLs |
| number_of_listings | INT64 | Total listings |
| avg_number_of_listings | FLOAT64 | Average listings per lead |
| lite_accounts | INT64 | Lite accounts created |
| lite_verifications | INT64 | Lite verifications |
| lite_airbnb | INT64 | Lite Airbnb integrations |
| lite_first_listing | INT64 | Lite first listings |
| lite_listings | INT64 | Total Lite listings |
| lite_credit_cards | INT64 | Lite credit card entries |
| lite_paid_accounts | INT64 | Lite paid accounts |

---

### 4.9 events (23 columns)

**BigQuery table:** `guesty-data.marketing_data.events`

Event/webinar attendees with full funnel tracking. Related tables: `events_contacts`, `events_leads`, `events_meetups` (same schema, filtered subsets).

| Field | Type | Description |
|-------|------|-------------|
| event_category | STRING | Category (event, webinar, meetup) |
| event_name | STRING | Event name |
| email | STRING | Attendee email (join key) |
| sf_event_meetup | STRING | Salesforce event/meetup record |
| attended | BOOL | Whether attended |
| event_date | DATE | Event date |
| number_of_listings | INT64 | Attendee's listing count |
| demo_scheduled_date | DATE | Demo scheduled date |
| grouped_sql_date | DATE | Grouped SQL date |
| sql_date | DATE | SQL date |
| opp_closed_date | DATE | Opportunity closed date |
| stageName | STRING | Opportunity stage |
| demo_from_opp | BOOL | Demo sourced from opportunity |
| country | STRING | Country |
| get_started_date | DATE | Get started date |
| expected_mrr__c | FLOAT64 | Expected MRR |
| glite_verified_date | DATE | Guesty Lite verification date |
| glite_first_paid | DATE | Guesty Lite first payment date |
| mql | BOOL | Is MQL |
| sql | BOOL | Is SQL |
| pro_customer | BOOL | Became Pro customer |
| lite_verified | BOOL | Became Lite verified |
| lite_paid | BOOL | Became Lite paid |

---

### 4.10 geo_month_actual_goal_eom (52 columns)

**BigQuery table:** `guesty-data.marketing_data.geo_month_actual_goal_eom`

Regional monthly actuals vs goals. Use for quota attainment, forecasting, and regional performance dashboards.

**Key columns:**

| Group | Metrics available |
|-------|-------------------|
| Paid accounts | paid_accounts_mtd, paid_accounts_actual, paid_accounts_goal, paid_accounts_eom |
| Paid listings | paid_listings_mtd, paid_listings_actual, paid_listings_goal, paid_listings_eom |
| New paid listings | new_paid_listings_mtd, new_paid_listings_actual, new_paid_listings_goal |
| Revenue | listings_revenue_actual, listing_revenue_goal, booked_revenue_mtd/actual/goal |
| FTP (first-time paid) | ftp_mtd, ftp_actual, ftp_goal, ftp_eom |
| SQL | sql_mtd, sql_actual, sql_goal, sql_eom |
| Churn | churn_mtd, churn_actual, churn_mrr, winback_actual |
| Meta | month (DATE), region, area, ratio, mtd_days_left, mtd_days_in_month, workdays |

---

### 4.11 Other useful tables

| Table | Path | Key use |
|-------|------|---------|
| daily_board | `guesty-data.marketing_data.daily_board` | Daily lead count by ad platform (google, facebook, linkedin, bing, mntn) + total cost |
| daily_cost | `guesty-data.marketing_data.daily_cost` | Daily ad spend by platform |
| monthly_snapshot | `guesty-data.marketing_data.monthly_snapshot` | Monthly lead funnel snapshot for cohort analysis |
| sales_revenue_cohort | `guesty-data.marketing_data.sales_revenue_cohort` | Revenue by type (software, GCS, commission) per account per month |
| glite_marketing_data | `guesty-data.marketing_data.glite_marketing_data` | Guesty Lite self-serve accounts with activation funnel |
| budget_monthly / budget_weekly | `guesty-data.marketing_data.budget_monthly` | Budget targets (GFP, GFH) by month/week |
| sdr_connect | `guesty-data.marketing_data.sdr_connect` | SDR outreach tracking with touch/connect timestamps |
| mmf_accounts | `guesty-data.marketing_data.mmf_accounts` | Minimum Monthly Fee accounts with fee amounts |
| adwords_campaigns_map | `guesty-data.marketing_data.adwords_campaigns_map` | Google Ads campaign ID → name mapping |

---

## 5. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://api.hubapi.com` |
| **CRM objects** | `/crm/v3/objects/contacts`, `/companies`, `/deals`, etc. |
| **Search** | `/crm/v3/objects/contacts/search` (POST with body). |
| **Response** | JSON with `results` array; each object has `id`, `properties` (key-value). |

---

## 6. Common Query Patterns

### 6.1 Lead attribution analysis (BigQuery)

```sql
-- Top channels by lead volume and demo conversion
SELECT
  channel,
  marketing_type,
  COUNT(*) AS leads,
  COUNTIF(demo_completed_date IS NOT NULL) AS demos_completed,
  COUNTIF(opp_closed_date IS NOT NULL) AS customers,
  SAFE_DIVIDE(COUNTIF(demo_completed_date IS NOT NULL), COUNT(*)) AS demo_rate
FROM `guesty-data.marketing_data.marketing_data`
WHERE lead_created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  AND is_valid_status = TRUE
GROUP BY channel, marketing_type
ORDER BY leads DESC
```

### 6.2 Email campaign performance (BigQuery)

```sql
-- Email engagement by campaign
SELECT
  campaignName,
  COUNT(*) AS total_events,
  COUNTIF(event_type = 'OPEN') AS opens,
  COUNTIF(event_type = 'CLICK') AS clicks,
  SAFE_DIVIDE(COUNTIF(event_type = 'CLICK'), COUNTIF(event_type = 'OPEN')) AS click_to_open_rate
FROM `guesty-data.marketing_data.hubspot_emails_events`
WHERE event_created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY campaignName
ORDER BY total_events DESC
```

### 6.3 Form submission to demo funnel (BigQuery)

```sql
-- Form submissions joined with funnel outcomes
SELECT
  f.form_name,
  f.marketing_flow,
  COUNT(*) AS submissions,
  COUNTIF(m.demo_scheduled_date IS NOT NULL) AS demos_scheduled,
  COUNTIF(m.demo_completed_date IS NOT NULL) AS demos_completed
FROM `guesty-data.marketing_data.hubspot_form_submissions` f
LEFT JOIN `guesty-data.marketing_data.marketing_data` m
  ON f.email = m.lead_email
WHERE f.insert_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY f.form_name, f.marketing_flow
ORDER BY submissions DESC
```

### 6.4 Cross-source join: HubSpot contacts → Salesforce accounts (BigQuery)

```sql
-- Enrich HubSpot contacts with Salesforce account data
SELECT
  h.email,
  h.firstname,
  h.lastname,
  h.opportunity_stage,
  da.account_name,
  da.account_segmentation,
  da.csm,
  da.avg_mrr
FROM `guesty-data.marketing_data.hubspot_contacts` h
JOIN `guesty-data.guesty_analytics.dim_accounts` da
  ON h.salesforce_accountid = da.sf_account_id
WHERE h.leadstatus = 'Customer'
```

### 6.5 Regional goal attainment (BigQuery)

```sql
-- Current month regional performance vs goals
SELECT
  region,
  area,
  sql_actual,
  sql_goal,
  SAFE_DIVIDE(sql_actual, sql_goal) AS sql_attainment,
  ftp_actual,
  ftp_goal,
  SAFE_DIVIDE(ftp_actual, ftp_goal) AS ftp_attainment
FROM `guesty-data.marketing_data.geo_month_actual_goal_eom`
WHERE month = DATE_TRUNC(CURRENT_DATE(), MONTH)
ORDER BY region, area
```

---

## Data Source Spec (summary for prompt injection)

```
Data Source: HubSpot
Node Type: HubSpot node (native, preferred) or BigQuery node (for analytics tables).
Credential Type: hubSpotOAuth2Api (HubSpot), googleApi (BigQuery).
Credentials: Provided per-department in conversation context.
Auth Type: OAuth2 (HubSpot), Google Service Account (BigQuery).
BigQuery dataset: guesty-data.marketing_data.*
Key tables: hubspot_contacts (28 cols), hubspot_form_submissions (24 cols), hubspot_emails_events (20 cols), marketing_data (140 cols, master funnel), marketing_kpi (48 cols, pre-aggregated).
Join keys: email (across HubSpot tables), salesforce_accountid → dim_accounts.sf_account_id, guesty_account_id → dim_accounts.account_id, account_id (emails_events → dim_accounts).
Cross-source: See JOIN_MAP.md for full cross-source join conditions.
```
