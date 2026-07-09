# BI mart — `guesty-data.csm.csm_churn_report`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ Source last refreshed 2026-04-19 (~12 weeks ago) — verify logic hasn't drifted before relying on it.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2022-01-01', '2050-12-31'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `csm.csm_churn_report` AS

WITH 
dim as (
SELECT account_id, next_renewal_date,
from `guesty_analytics.dim_accounts` a
WHERE partition_Date = current_date-1
),
c as (
SELECT 
  account_id,
  account_name, 
  from_date, 
  cancelled_by, 
  customer_churn_reason, 
  flag,
  package,


FROM `guesty_churn.churn_summary`
WHERE to_date = '2050-12-31'
AND from_date >= '2022-01-01'
AND lower(package) <> 'lite'
-- AND account_id in ('63d2ca87ff7191005591f0df', '5b8ed796c8df85003ff4939a')
), 
cd as (
SELECT 
  account_id, 
  onboarder, 
  csm, 
  manager,
  director,
  account_manager, 
  months_in_guesty, 
  onboarding_status, 
  account_segmentation, 
  etf,
  sales_person, 
  expected_mrr__c, 
  case when onboarding_status = 'Completed' then account_segmentation else 'Onboarding' end as account_segmentation_ob, minimum_fee,
  last_month_paid_listings,
  avg_mrr,
  Onboarding_Completion_Date, 
  churn_reason, 
  churn_reason_modified, 
  churn_type, 
  geo_area, 
  account_country, 
  Renewal_Declined_Details__c, 
  PMS_Replacing_Guesty__c,
  churn_mrr_including_payments,
  Onboarding_Stage__c, 
  Number_of_Listings__c,


FROM `guesty_churn.churn_account_details`
WHERE to_date = '2050-12-31'
AND from_date >= '2022-01-01'
), 
list_drop_pre_calc as (
SELECT 
  a.account_id, 
  case when partition_date = date_sub(from_Date, INTERVAL 3 MONTH) then last_month_paid_listings end as ld_3,
  case when partition_date = date_sub(from_Date, INTERVAL 2 MONTH) then last_month_paid_listings end as ld_2,
  case when partition_date = date_sub(from_Date, INTERVAL 1 MONTH) then last_month_paid_listings end as ld_1,
  case when partition_date = from_Date then last_month_paid_listings end as ld_0,
  case when partition_date = from_Date then last_month_rev_from_account end as last_month_rev_from_account,
FROM `guesty_analytics.dim_accounts` a
JOIN c on a.account_id = c.account_id
WHERE partition_date in (date_sub(from_Date, INTERVAL 3 MONTH), date_sub(from_Date, INTERVAL 2 MONTH),date_sub(from_Date, INTERVAL 1 MONTH),from_Date)
),
list_drop as (
SELECT
 account_id,
 MAX(ld_3) as ld_3, 
 MAX(ld_2) as ld_2, 
 MAX(ld_1) as ld_1,  
 MAX(ld_0) as ld_0,  
 MAX(last_month_rev_from_account) as last_month_rev_from_account, 

FROM list_drop_pre_calc
group by 1
),
ad as (
SELECT 
  a.account_id, 
  advanced_analytics_revenue, gcs_revenue_total, rentals_united_revenue, onboarding_revenue, manual_revenue, application_fee_revenue,  other_revenue, stirpe_fee_revenue, collected_revenue, accounting_revenue, accounting_onboarding_revenue, trust_accounting_revenue, insurance_revenue, minimum_monthly_fee_revenue, guesty_damage_protection_revenue, website_revenue, price_optimizer_revenue, smart_locks_revenue, gdh_revenue
FROM `guesty_analytics.accounts_summary` a
JOIN c on a.account_id = c.account_id
WHERE partition_date = c.from_date
),
sub as (
SELECT
  a.account_id,
  plan_name,
  plan_value, 
  case when plan_name in ('Guesty PMS - Per Listing', 'Guesty Ultimate - Per Listing') then '$' 
  when plan_name = 'Guesty PMS - Reservation Commission RP' then '%'
  end as plan_type
FROM `guesty-data.zuora_analytics.product_catalog` a
WHERE a.partition_date = current_date()
 AND plan_name in ('Guesty PMS - Per Listing', 'Guesty Ultimate - Per Listing', 'Guesty PMS - Reservation Commission RP')
 AND plan_value is not null
 AND default_subscription is true
),
hs as (
SELECT  
    a.account_id,  
    AVG(total_score) AS total_score,  
    AVG(ticket_score) AS ticket_score,  
    AVG(product_score) AS product_score,  
    AVG(profit_score) AS profit_score,  
    AVG(channel_score) AS channel_score,  
    AVG(eng_score) AS eng_score,  
    AVG(critical_tickets) AS critical_tickets,  
    AVG(knowledge_tickets) AS knowledge_tickets  
FROM `csm.health_score` a
JOIN c on c.account_id = a.account_id
WHERE partition_date = from_date-7   
GROUP BY ALL
), 
addons_avg_mrr AS (
SELECT * 
FROM `addons.account_addon_mrr`
),
pre_churn_stars AS (
SELECT
c.account_id,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 1 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_1_stars,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 2 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_2_stars,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 3 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_3_stars,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 4 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_4_stars,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 5 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_5_stars,
SUM(CASE WHEN month = DATE_TRUNC(DATE_SUB(c.from_date, INTERVAL 6 month), MONTH) AND domain_flag IS FALSE THEN features_val END) AS mpc_6_stars,

FROM c
LEFT JOIN  `csm.cs_product_adoption_pivot` p
  ON c.account_id = p.account_id
GROUP BY ALL),
max_pcs AS (
SELECT DISTINCT
       account_id,
       GREATEST(COALESCE(mpc_1_stars,0),COALESCE(mpc_2_stars,0),COALESCE(mpc_3_stars,0),COALESCE(mpc_4_stars,0),COALESCE(mpc_5_stars,0),COALESCE(mpc_6_stars,0)) AS max_stars_6_mpc
FROM pre_churn_stars
),

max_listings AS (
SELECT c.account_id,
       MAX(a.last_month_paid_listings) AS max_paid_listings
FROM c
JOIN `guesty_analytics.dim_accounts` a
  ON c.account_id = a.account_id
GROUP BY ALL
)

SELECT 
  c.*, 
  cd.* EXCEPT (account_id),
  ld.* EXCEPT (account_id),
  ad.* EXCEPT (account_id), 
  hs.* EXCEPT (account_id), 
  next_renewal_date,
  COALESCE(advanced_analytics_mrr, 0) AS advanced_analytics_mrr,
  COALESCE(accounting_mrr, 0) AS accounting_mrr,
  COALESCE(gcs_mrr, 0) AS gcs_mrr,
  COALESCE(gpo_mrr, 0) AS gpo_mrr,
  COALESCE(website_mrr, 0) AS website_mrr,
  COALESCE(gdh_ru_mrr, 0) AS gdh_ru_mrr,
  COALESCE(damage_protection_mrr, 0) AS damage_protection_mrr,
  max_stars_6_mpc,
  ml.max_paid_listings

FROM c
LEFT JOIN dim on c.account_id = dim.account_id 
LEFT JOIN cd on c.account_id = cd.account_id
LEFT JOIN list_drop ld on c.account_id = ld.account_id
LEFT JOIN ad on c.account_id = ad.account_id
LEFT JOIN sub on c.account_id = sub.account_id
LEFT JOIN hs on c.account_id = hs.account_id
LEFT JOIN addons_avg_mrr av_ad on c.account_id = av_ad.account_id
LEFT JOIN max_pcs ON max_pcs.account_id = c.account_id
LEFT JOIN max_listings ml ON ml.account_id = c.account_id
```

## Documented columns (10 of 75)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `account_id` | Unique identifier for the account. | Derived from the `account_id` column in the `guesty_churn.churn_summary` table, which serves as the central account identifier for this report. | `c.account_id` |
| `guesty_damage_protection_revenue` | Revenue generated from Guesty Damage Protection. | Directly sourced from the 'accounts_summary' table for the relevant account and date. | `guesty_damage_protection_revenue` |
| `website_mrr` | Monthly Recurring Revenue (MRR) generated from website services. | This column represents the Monthly Recurring Revenue (MRR) attributed to website services for each account, defaulting to 0 if no specific website MRR is recorded. | `COALESCE(website_mrr, 0)` |
| `ticket_score` | Average score reflecting ticket-related health metrics. | This score is the average of ticket-related health metrics from the 'health_score' table, calculated for each account. | `AVG(ticket_score) AS ticket_score` |
| `trust_accounting_revenue` | Revenue generated from trust accounting services. | Directly sourced from the 'accounts_summary' table, representing the revenue attributed to trust accounting. | `trust_accounting_revenue` |
| `insurance_revenue` | Revenue generated from insurance services. | Directly retrieved from the 'accounts_summary' table for the specific account and 'from_date'. | `insurance_revenue` |
| `last_month_paid_listings` | Number of paid listings for the account in the last month. | Directly sourced from `guesty_churn.churn_account_details` for the respective account. | `last_month_paid_listings` |
| `avg_mrr` | Average Monthly Recurring Revenue for the account. | Directly sourced from the `guesty_churn.churn_account_details` table, representing the average MRR. | `avg_mrr` |
| `sales_person` | The sales person associated with the account. | Directly retrieved from the 'guesty_churn.churn_account_details' table. | `sales_person` |
| `account_segmentation_ob` | Account segmentation, showing 'Onboarding' if the account is still onboarding. | If the onboarding_status is 'Completed', then the account_segmentation value is used; otherwise, it is set to 'Onboarding'. | `case when onboarding_status = 'Completed' then account_segmentation else 'Onboarding' end as account_segmentation_ob` |
