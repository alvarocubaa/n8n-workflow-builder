# BI mart — `guesty-data.guesty_analytics.accounts_summary`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ Source last refreshed 2026-04-19 (~12 weeks ago) — verify logic hasn't drifted before relying on it.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2019-01-01', '2019-07-18', '2024-01-01', '2025-01-31', '2025-05-31', '2025-07-31', '2025-09-30', '2025-12-31'. These will age out — surface them to the user for confirmation instead of copying blindly.

## What this table is
This script extracts account and financial data, then filters out test and internal accounts. It enriches accounts with Salesforce CRM details like CSM, onboarder, and contract information. It aggregates detailed financial transactions to calculate various revenue streams and paid listing counts. It also incorporates data from enterprise billing systems, failed/future payments, and credit transactions. Finally, it joins with geographic mapping, account segmentation, and churn data to produce a comprehensive account summary, calculating occupancy rates and new/retained account flags.

**Grain:** One row per account per day.

**Upstream sources:** guesty-data.silver.dim_accounts, guesty-data.assistive_data.test_accounts, guesty-data.guesty_analytics.dim_orgs, guesty-data.salesforce.sf_opportunity, salesforce.sf_account, salesforce.sf_users, guesty-data.guesty_analytics.detailed_financials, guesty-data.product_smart_locks.gfp_new_billing_smart_lock_v2, guesty-data.product_smart_locks.smart_locks_data_gfp_gfh, guesty-data.enterprise_billing.houst, guesty-data.enterprise_billing.renters, guesty-data.enterprise_billing.grand_welcome, guesty-data.enterprise_billing.joivy, guesty-data.enterprise_billing.alloggio, enterprise_billing.casago_gbv, enterprise_billing.hostgenius, guesty-data.guesty_analytics.guesty_invoices, guesty-data.guesty_analytics.accounts_summary, guesty-data.guesty_analytics.calendars_summary, guesty-data.guesty_analytics.accounts_country_mapping, guesty-data.guesty_analytics.account_segmentation, guesty-data.guesty_analytics.sf_account_segmentation, guesty-data.datalake_glue.payment_providers, guesty-data.zuora_silver.CurrencyRate, guesty-data.stripe.balance_transaction, guesty-data.guesty_analytics.credits, guesty-data.guesty_churn.churn_summary, guesty-data.product_glite.lite_accounts, guesty-data.zuora_silver.account, guesty_analytics.hq_account_revenue_allocation

## Verified build query
```sql
/* ! For every new change in this query please update guesty_analytics_eom_update.accounts_summary_update query as well ! */
WITH 

dates AS (
SELECT DATE_TRUNC(DATE_SUB(CURRENT_DATE(),INTERVAL 1 DAY),YEAR) as current_year,
       DATE_TRUNC(DATE_SUB(CURRENT_DATE(),INTERVAL 1 DAY),MONTH) as current_month,
       DATE_SUB(CURRENT_DATE(),INTERVAL 1 DAY) as current_day
),

pre_accounts AS (
SELECT  account_id,
        account_name,
        account_active as is_active,
        is_freezingflow,
        DATE(freezingflow_started_at) as freezingflow_started_at,
        DATE(freezingflow_ended_at) as freezingflow_ended_at,
        avoid_freezingflow,
        premium_analytics_access,
        company_city as city,
        current_credit_amount,
        account_created_at,
        account_canceled_at, 
        sales_person,
        COALESCE(a.initialpackage,'pro') package, --lite/pro,
        FALSE AS is_org,
        CAST(NULL AS STRING) AS org_id,
FROM `guesty-data.silver.dim_accounts` a
WHERE account_id NOT IN (SELECT account_id FROM `guesty-data.assistive_data.test_accounts` WHERE account_id is not null)
AND   COALESCE(a.primary_contact_email, '') NOT LIKE '%@guesty.com'
AND   COALESCE(LOWER(origin),'') NOT IN ('yourporter','porter')
AND   partition_date = CURRENT_DATE()

UNION ALL 

SELECT  
  account_id,
  account_name,
  account_active as is_active,
  is_freezingflow,
  DATE(freezingflow_started_at) as freezingflow_started_at,
  DATE(freezingflow_ended_at) as freezingflow_ended_at,
  avoid_freezingflow,
  NULL AS premium_analytics_access,
  NULL AS city,
  NULL AS current_credit_amount,
  account_created_at,
  NULL AS account_canceled_at,
  sales_person,
  package,
  TRUE AS is_org,
  account_id AS org_id,

FROM `guesty-data.guesty_analytics.dim_orgs`

),

pre_sf_opp AS (
SELECT distinct AccountId as sf_account_id,
  DATE(o.CloseDate) AS contract_closed_date,
  Competitor_Steal__c as competitor_steal,
  Opportunity_Source_F__c as source_type,
  Number_of_Listings__c as contract_listings,
  CASE WHEN  StageName = 'Closed Won (Billing in)' THEN 1 ELSE 2 END as priority,
FROM `guesty-data.salesforce.sf_opportunity` o
WHERE partition_date = CURRENT_DATE()
  AND Record_Type_Formula__c IN ('Original')
),

sf_opp AS (
SELECT sf_account_id,
       contract_closed_date,
       competitor_steal,
       source_type,
       ROW_NUMBER() OVER (PARTITION BY sf_account_id order by priority,contract_closed_date desc) as rnk,
       contract_listings
FROM pre_sf_opp
QUALIFY rnk = 1
),

sf_account as (
  select distinct
   Guesty_Admin_ID__c AS account_id,
   Onboarder__c,
   Onboarding_Status__c as onboarding_status,
   Onboarding_Completion_Date__c AS onboarding_completion_date, 
   OwnerId,
   Id as sf_account_id,
FROM `salesforce.sf_account`
WHERE partition_date = (SELECT MAX(partition_date)
      FROM `salesforce.sf_users`
      WHERE partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND CURRENT_DATE())
AND Guesty_Admin_ID__c is not null
),

csm_owner AS (
select
  distinct
  id,
  name
from `salesforce.sf_users`
WHERE partition_date = (SELECT MAX(partition_date)
      FROM `salesforce.sf_users`
      WHERE partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND CURRENT_DATE())),

onboarder AS (
select
  distinct
  id,
  name
from `salesforce.sf_users`
WHERE partition_date = (SELECT MAX(partition_date)
      FROM `salesforce.sf_users`
      WHERE partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND CURRENT_DATE())
),

pre_salesforce AS (
select
   a.account_id,
   b.name as csm,
   c.name as onboarder,
   onboarding_status,
   d.contract_closed_date,
   d.competitor_steal,
   d.source_type,
   d.contract_listings
from sf_account a
left join csm_owner b
 ON a.OwnerId = b.id
left join onboarder c
 on a.Onboarder__c = c.id
left join sf_opp d
ON a.sf_account_id = d.sf_account_id
),

accounts AS (
SELECT a.*,
       s.csm,
       s.onboarder,
       s.onboarding_status,
       s.contract_closed_date,
       s.competitor_steal,
       s.source_type,
       s.contract_listings
FROM pre_accounts a LEFT JOIN pre_salesforce s ON a.account_id = s.account_id
),

detailed_financials AS (
SELECT account_id,
--     SUM(amount_from_product) AS booked_revenue,
     SUM(CASE WHEN product_name NOT IN ('accounting module for hirum ta rp', 'accounting ob for hirum ta rp') THEN amount_from_product END) AS booked_revenue,
     -- paid_listings
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_payment_type = 'usage' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_reservation_commission,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_payment_type = 'recurring' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_fixed_monthly,
     -- paid_listings_new excluding listing_activation_fee
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name <> 'listing activation fee rp' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_total_new,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name <> 'listing activation fee rp' AND product_payment_type = 'usage' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_reservation_commission_new,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name <> 'listing activation fee rp' AND product_payment_type = 'recurring' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_fixed_monthly_new,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name IN ('guesty pms - fixed rp', 'guesty pms - per listing', 'guesty pms - reservation commission rp') AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_sw_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'guesty pms - per listing' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_fixed_monthly_sw,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'guesty pms - reservation commission rp' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_reservation_commission_sw,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name IN ('accounting module rp') AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_accounting_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name LIKE '%advanced analytics%' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_advanced_analytics_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'third party fee - rentals united rp' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_rentals_united_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'insurance' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_insurance_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'reply ai' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_replyai_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND product_name = 'listing activation fee rp' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_activation_fee,

     -- paid_listings GCS
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND LOWER(product_name) LIKE '%gcs%' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_gcs_total,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND LOWER(product_name) LIKE '%gcs%' AND coalesce(amount_from_product,0) > 0 AND product_payment_type = 'usage' THEN listing_id END) AS paid_listings_reservation_commission_gcs,
     COUNT(DISTINCT CASE WHEN listing_id <> 'unknown' AND LOWER(product_name) LIKE '%gcs%' AND product_payment_type = 'recurring' AND coalesce(amount_from_product,0) > 0 THEN listing_id END) AS paid_listings_fixed_monthly_gcs,

     -- software revenue
     SUM(CASE WHEN product_name IN ('guesty pms - fixed rp', 'guesty pms - per listing', 'guesty pms - reservation commission rp','discounts') THEN amount_from_product END) AS software_revenue_total,
     SUM(CASE WHEN product_name IN ('guesty pms - per listing','discounts') THEN amount_from_product END) AS software_fixed_monthly_revenue,
     SUM(CASE WHEN product_name = 'guesty pms - reservation commission rp' THEN amount_from_product END) AS software_reservation_commission_revenue,
     -- GCS revenue
     SUM(CASE WHEN product_name IN ('gcs (24/7) rp', 'gcs (24/7) rp per reservation', 'gcs minimum 5 listings', 'off hours gcs rp', 'gcs one time charge rp', 'gcsp') THEN amount_from_product END) AS gcs_revenue_total,
     SUM(CASE WHEN product_name IN ('gcs (24/7) rp', 'gcs (24/7) rp per reservation', 'gcs minimum 5 listings', 'off hours gcs rp', 'gcs one time charge rp', 'gcsp') AND product_payment_type = 'usage' THEN amount_from_product END) AS gcs_reservation_commission_revenue,
     SUM(CASE WHEN product_name IN ('gcs (24/7) rp', 'gcs (24/7) rp per reservation', 'gcs minimum 5 listings', 'off hours gcs rp', 'gcs one time charge rp', 'gcsp') AND product_payment_type = 'recurring' THEN amount_from_product END) AS gcs_fixed_monthly_revenue,
     SUM(CASE WHEN product_name IN ('gcs responding to reviews rp', 'gcs additional services rp', 'gcs guest registry services fee rp') THEN amount_from_product END) AS gcs_upsell_revenue,
     -- other revenue
     SUM(CASE WHEN product_name = 'refund' THEN amount_from_product END) AS refund_revenue,
     SUM(CASE WHEN product_name = 'third party fee - rentals united rp' THEN amount_from_product END) AS rentals_united_revenue,
     SUM(CASE WHEN product_name IN ('onboarding package pms rp', 'ob - single session rp', 'ob - on premise rp', 'ob - guesty express** rp') THEN amount_from_product END) AS onboarding_revenue,
     SUM(CASE WHEN product_name IN ('gcs onboarding rp', 'gcsp onboarding') THEN amount_from_product END) AS gcs_onboarding_revenue,
     SUM(CASE WHEN product_name = 'manual' THEN amount_from_product END) AS manual_revenue,
     SUM(CASE WHEN LOWER(product_name) LIKE '%payment gateway fee%' THEN amount_from_product END) AS application_fee_revenue,
     SUM(CASE WHEN LOWER(product_name) LIKE '%advanced analytics%' THEN amount_from_product END) AS advanced_analytics_revenue,
     SUM(CASE WHEN product_name IN ('accounting module rp','accounting module (fixed) rp', 'french accounting') THEN amount_from_product END) AS accounting_revenue,
     SUM(CASE WHEN product_name = 'accounting ob rp' THEN amount_from_product END) AS accounting_onboarding_revenue,
     SUM(CASE WHEN product_name = 'accounting ob for hirum ta rp' THEN amount_from_product END) AS trust_accounting_onboarding_revenue,
     SUM(CASE WHEN product_name = 'accounting module for hirum ta rp' THEN amount_from_product END) AS trust_accounting_revenue,
     SUM(CASE WHEN product_name = 'insurance' THEN amount_from_product END) AS insurance_revenue,
     SUM(CASE WHEN product_name = 'minimum monthly fee' THEN amount_from_product END) AS minimum_monthly_fee_revenue,
     SUM(CASE WHEN product_name = 'minimum monthly fee gcs' THEN amount_from_product END) AS minimum_monthly_fee_gcs_revenue,
     SUM(CASE WHEN product_payment_type = 'recurring' THEN amount_from_product END) AS total_fixed_monthly_revenue,
     SUM(CASE WHEN product_payment_type = 'usage' THEN amount_from_product END) AS total_reservation_commission_revenue,
     SUM(CASE WHEN product_name IN ('onboarding package pms rp', 'ob - single session rp', 'ob - on premise rp', 'ob - guesty express** rp','accounting ob rp','gcs onboarding rp', 'gcsp onboarding') THEN amount_from_product END) AS onboarding_total_revenue,
     SUM(CASE WHEN LOWER(product_name) LIKE '%damage protection%' THEN amount_from_product END) AS guesty_damage_protection_revenue,
     SUM(CASE WHEN product_name = 'listing activation fee rp' THEN amount_from_product END) AS listing_activation_fee_revenue,
     SUM(CASE WHEN product_name IN ('website rp') THEN amount_from_product END) AS website_revenue,
     SUM(CASE WHEN product_name = 'price optimizer' THEN amount_from_product END) AS price_optimizer_revenue,
     SUM(CASE WHEN product_name = 'smart locks rp' THEN amount_from_product END) AS smart_locks_revenue,
     SUM(CASE WHEN product_name = 'gdh premium channels' THEN amount_from_product END) AS gdh_revenue,
     SUM(CASE WHEN product_name = 'early termination fee' THEN amount_from_product END) AS early_termination_fee_revenue,
     SUM(CASE WHEN product_name IN ('advanced website plus') THEN amount_from_product END) AS website_plus_revenue,
     SUM(CASE WHEN product_name = 'reply ai' THEN amount_from_product END) AS replayai_revenue,
     SUM(CASE WHEN product_name = 'guest verify' THEN amount_from_product END) AS guest_verify_revenue,
     SUM(CASE WHEN product_name = 'travel insurance' THEN amount_from_product END) AS travel_insurance_revenue,
     SUM(CASE WHEN product_name = 'guestypay protect' THEN amount_from_product END) AS guestypay_protect_revenue,
     SUM(CASE WHEN product_name = 'guesty connect' THEN amount_from_product END) AS guesty_connect_revenue,
     SUM(CASE WHEN product_name = 'autocomply' THEN amount_from_product END) AS autocomply_revenue,
     SUM(CASE WHEN product_name = 'other' THEN amount_from_product END) AS other_revenue
FROM `guesty-data.guesty_analytics.detailed_financials`
WHERE ((billing_system = 'zuora') OR (invoice_status = 'succeeded'AND billing_system = 'old'))
AND   DATE(invoice_date) BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
-- AND (coalesce(amount_from_product,0) > 0 OR product_name = 'discounts')
GROUP BY account_id
),

bundle_locks_accounts AS (
SELECT month,
       account_id,
FROM `guesty-data.product_smart_locks.gfp_new_billing_smart_lock_v2`
WHERE remarks = 'GLite bundle 3 months free'
),

bundle_locks_listings AS (
SELECT distinct month,
       account_id,
       listing_id,
FROM `guesty-data.product_smart_locks.smart_locks_data_gfp_gfh`
JOIN bundle_locks_accounts USING(account_id,month)
WHERE listing_id IS NOT NULL
AND month BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
),

pre_bundle AS (
SELECT account_id,
       listing_id,
       CASE WHEN b.listing_id IS NOT NULL THEN TRUE ELSE FALSE END AS linked_listing,
     SUM(CASE WHEN product_name IN ('guesty pms - fixed rp', 'guesty pms - per listing', 'guesty pms - reservation commission rp','discounts') THEN amount_from_product END) AS software_revenue_total,
     SUM(CASE WHEN product_name = 'guesty pms - per listing' THEN amount_from_product END) AS software_fixed_monthly_revenue,
     SUM(CASE WHEN product_name = 'guesty pms - reservation commission rp' THEN amount_from_product END) AS software_reservation_commission_revenue,  
     SUM(CASE WHEN product_name = 'price optimizer' THEN amount_from_product END) AS price_optimizer_revenue,
     SUM(CASE WHEN product_name = 'smart locks rp' THEN amount_from_product END) AS smart_locks_revenue,
FROM `guesty-data.guesty_analytics.detailed_financials` a
LEFT JOIN bundle_locks_listings b USING(account_id,listing_id)
WHERE (billing_system = 'zuora')
AND  DATE(invoice_date) BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
AND (glite_plan = 'bundle' OR product_name IN ('glite smart locks','priceoptimizerlite commission based (on check-in)'))
GROUP BY ALL
),

bundle_accounts AS (
SELECT account_id,
       SUM(software_revenue_total) as software_revenue_total,
FROM pre_bundle
GROUP BY ALL
),

bundle_revenue AS (
SELECT account_id,
       SUM(CASE WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) >= 27 THEN COALESCE(software_revenue_total,0)
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 THEN 27 
            ELSE software_revenue_total END) as software_revenue_total,
       SUM(CASE WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) >= 27 THEN COALESCE(software_fixed_monthly_revenue,0)
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 THEN COALESCE(software_fixed_monthly_revenue,0) 
            ELSE software_fixed_monthly_revenue END) as software_fixed_monthly_revenue,
       SUM(CASE WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) >= 27 THEN COALESCE(software_reservation_commission_revenue,0)
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 THEN 27 - COALESCE(software_fixed_monthly_revenue,0) 
            ELSE software_reservation_commission_revenue END) as software_reservation_commission_revenue,
       SUM(CASE WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) >= 27 THEN COALESCE(price_optimizer_revenue,0)
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 AND linked_listing IS FALSE THEN software_revenue_total - 27 + COALESCE(price_optimizer_revenue,0) 
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 AND linked_listing IS TRUE THEN GREATEST(software_revenue_total - 27 - 4,0) + COALESCE(price_optimizer_revenue,0) 
            ELSE price_optimizer_revenue END) as price_optimizer_revenue,
       SUM(CASE WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) >= 27 THEN COALESCE(smart_locks_revenue,0)
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 AND linked_listing IS FALSE THEN COALESCE(smart_locks_revenue,0) 
            WHEN software_revenue_total >= 27 AND COALESCE(software_fixed_monthly_revenue,0) < 27 AND linked_listing IS TRUE THEN LEAST(GREATEST(software_revenue_total - 27,0),4) + COALESCE(smart_locks_revenue,0) 
            ELSE smart_locks_revenue END) as smart_locks_revenue,
FROM pre_bundle
GROUP BY ALL
),

houst_billing AS (
SELECT '65cdef5e81ac44f2fd1e7b1a' as account_id,
       count(distinct listing_id) as listings,
FROM `guesty-data.enterprise_billing.houst`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
GROUP BY 1
ORDER BY 1
),

renters_billing AS (
SELECT account_id,
       COUNT(DISTINCT CASE WHEN active_listed_days > 0 THEN listing_id END) as listings,
FROM `guesty-data.enterprise_billing.renters`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
GROUP BY 1
ORDER BY 1
),

grand_welcome_billing AS (
SELECT '649c5ae38b62b9002a43e171' as account_id,
       COUNT(DISTINCT CASE WHEN bookable_days > 0 THEN listing_id END) as listings,
FROM `guesty-data.enterprise_billing.grand_welcome`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
GROUP BY 1
ORDER BY 1
),

joivy_billing_listings AS (
SELECT account_id,
     CAST(ROUND(SAFE_DIVIDE(SUM(CASE WHEN product_name IN ('guesty pms - fixed rp', 'guesty pms - per listing', 'guesty pms - reservation commission rp','discounts') THEN amount_from_product END),10)) AS INT64) AS paid_listings,  
FROM `guesty-data.guesty_analytics.detailed_financials`
WHERE billing_system = 'zuora'
AND DATE(invoice_date) BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
AND account_id = '659d8b2e77440fcc52e7c5a4'
GROUP BY ALL
),

joivy_popup_listings AS (
SELECT '659d8b2e77440fcc52e7c5a4' as account_id,
       COUNT(DISTINCT listing_id) AS popup_listings
FROM `guesty-data.enterprise_billing.joivy`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
AND price > 0
GROUP BY ALL
),

joivy_billing AS (
SELECT account_id,
       a.paid_listings + b.popup_listings as listings,
FROM joivy_billing_listings a FULL JOIN joivy_popup_listings b USING(account_id)
),

allogio_billing AS (
SELECT '28a949ee-5279-46ed-8757-eaf46a28c3d2' AS account_id,
       COUNT(DISTINCT listing_id) AS listings
FROM `guesty-data.enterprise_billing.alloggio`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
AND (exclusive_price > 0 OR non_exclusive_price > 0)
GROUP BY ALL
),
casago_billing AS (
SELECT 
  '61a17702-a24e-4078-9609-3c9a3e1cf794' AS account_id, 
  COUNT(DISTINCT CASE WHEN gbv > 0 THEN listing_id END) AS listings
FROM `enterprise_billing.casago_gbv`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
GROUP BY ALL
),
hostgenius AS (
SELECT
    '926e4343-4029-4bc6-811c-0264a1c9ddef' AS account_id,
    SUM(active_listings) AS listings
FROM `enterprise_billing.hostgenius`
WHERE month = DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),MONTH)
GROUP BY ALL
),

enterprise_billing AS (
SELECT * FROM houst_billing
UNION DISTINCT 
SELECT * FROM renters_billing
UNION DISTINCT 
SELECT * FROM grand_welcome_billing
UNION DISTINCT 
SELECT * FROM joivy_billing
UNION DISTINCT 
SELECT * FROM allogio_billing
UNION DISTINCT 
SELECT * FROM casago_billing
UNION DISTINCT 
SELECT * FROM hostgenius
),

failed_payments AS (
SELECT account_id,
       SUM(amount_from_product) as failed_payments_amount,
FROM `guesty-data.guesty_analytics.detailed_financials`
WHERE invoice_status = 'failed'
AND   DATE(invoice_created_at) BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
-- AND   coalesce(amount_from_product,0) > 0
GROUP BY account_id
),

future_payments AS (
SELECT account_id,
       SUM(amount_from_product) as future_payments_amount,
FROM `guesty-data.guesty_analytics.detailed_financials`
WHERE invoice_status = 'pending'
AND   DATE(should_be_paid_at) BETWEEN DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY) AND LAST_DAY(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY))
-- AND   coalesce(amount_from_product,0) > 0
GROUP BY account_id
),

invoices as (
SELECT account_id,
sum(invoice_amount) as invoice_amount,
sum(credit_amount) as credit_amount
FROM `guesty-data.guesty_analytics.guesty_invoices`
WHERE invoice_status = 'succeeded'
AND invoice_created_at BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
GROUP BY account_id
),

salesforce AS (
SELECT Guesty_Admin_ID__c AS account_id,
     FALSE AS is_mickey_mouse,
     ParentId AS account_parent_id,
     Winback__c AS is_winback,
     CAST(Winback_Date__c AS DATE) AS winback_date,
     Winback_New_Retained__c AS winback_new_retained,
     MyVR_Migration__c AS myvr_migration,
     SYNC_MyVR_Account_ID__c AS myvr_account_id,
     Kigo_ID__c AS kigo_id,
     if(Source_Platform__c="Kigo",true,Kigo__c) as kigo_migration,
     First_Billing_Date__c,
     Last_Payment_Date__c,
     Enterprise_Account__c as is_enterprise,
     Source_Platform__c,
     Package__c as package,
FROM `guesty-data.salesforce.sf_account`
WHERE partition_date = (SELECT MAX(partition_date)
                      FROM `guesty-data.salesforce.sf_account`
                      WHERE partition_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY) AND CURRENT_DATE())
OR (CURRENT_DATE() < '2019-07-18' AND partition_date = '2019-07-18')
),

myvr_migrated_accounts AS (
SELECT account_id,
       myvr_account_id,
      'MYVR' AS source_platform
FROM salesforce
WHERE myvr_migration is true
),

kigo_migrated_accounts AS (
SELECT account_id,
       kigo_id,
      'KIGO' AS source_platform
FROM salesforce
WHERE kigo_migration IS TRUE
),

hirum_migrated_accounts AS (
SELECT distinct account_id,
       'HIRUM' as source_platform,
FROM accounts
WHERE competitor_steal = 'HiRUM (AUS)'
),

guesty_account_first_paid AS (
SELECT df.account_id,
     MIN(CASE WHEN amount_from_product > 0 THEN DATE(invoice_date) END) account_first_paid,
     MAX(CASE WHEN amount_from_product > 0 THEN DATE(invoice_date) END) account_last_paid
FROM `guesty-data.guesty_analytics.detailed_financials` df
WHERE ((billing_system = 'zuora') OR (invoice_status = 'succeeded'AND billing_system = 'old'))
AND DATE(invoice_date) < CURRENT_DATE()
GROUP BY 1
),

first_paid_mrr AS (
SELECT df.account_id,
     MIN(CASE WHEN amount_from_product > 0 THEN DATE(invoice_date) END) account_first_paid_mrr,
FROM `guesty-data.guesty_analytics.detailed_financials` df
WHERE ((billing_system = 'zuora') OR (invoice_status = 'succeeded'AND billing_system = 'old'))
AND DATE(invoice_date) < CURRENT_DATE()
AND product_name NOT IN ('onboarding package pms rp', 'ob - single session rp', 'ob - on premise rp', 'ob - guesty express** rp','accounting ob rp','gcs onboarding rp', 'gcsp onboarding','accounting ob for hirum ta rp')
GROUP BY 1
),

min_first_paid AS (
SELECT account_id,
MIN(DATE_TRUNC(partition_date,month)) AS min_first_paid_month
FROM `guesty-data.guesty_analytics.accounts_summary`
WHERE (is_eom IS TRUE OR partition_date = DATE_SUB(CURRENT_DATE(),INTERVAL 1 DAY))
AND (software_revenue_total + COALESCE(listing_activation_fee_revenue,0) + COALESCE(other_revenue,0)) > 0
GROUP BY 1
),

accounts_first_paid AS (
SELECT distinct 
    g.account_id,
    g.account_first_paid,
    g.account_last_paid,
    COALESCE(m.source_platform, k.source_platform,h.source_platform) AS source_platform
FROM guesty_account_first_paid g
LEFT JOIN myvr_migrated_accounts m
ON g.account_id = m.account_id
LEFT JOIN kigo_migrated_accounts k
ON g.account_id = k.account_id
LEFT JOIN hirum_migrated_accounts h
ON g.account_id = h.account_id
),

occupancy_rate AS (
SELECT account_id,
     SUM(booked) AS booked,
     SUM(available) AS available,
     SUM(reserved) AS reserved
FROM `guesty-data.guesty_analytics.calendars_summary`
WHERE first_of_month = date_trunc(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY),month)
GROUP BY 1
),

country_mapping AS (
SELECT account_id,
     MAX(country) AS country,
     MAX(country_code) AS country_code,
     MAX(state) AS state,
     MAX(state_code) AS state_code,
     MAX(region) AS region,
     MAX(old_region) AS old_region,
     MAX(area) AS area
FROM `guesty-data.guesty_analytics.accounts_country_mapping`
WHERE partition_date = CURRENT_DATE()
GROUP BY account_id

UNION ALL 

SELECT account_id,
     MAX(country) AS country,
     MAX(country_code) AS country_code,
     MAX(state) AS state,
     MAX(state_code) AS state_code,
     MAX(region) AS region,
     MAX(old_region) AS old_region,
     MAX(area) AS area
FROM `guesty-data.guesty_analytics.dim_orgs`
GROUP BY account_id
),

new_segment AS (
SELECT account_id,
     segmentation AS account_segmentation,
     old_account_segmentation,
     operative_account_segmentation,
FROM `guesty-data.guesty_analytics.account_segmentation`
WHERE ((partition_date = CURRENT_DATE()) OR (CURRENT_DATE() < DATE('2019-01-01') AND partition_date = DATE('2019-01-01')))
),

last_segment AS (
SELECT account_id,
     account_segmentation,
     old_account_segmentation,
     operative_account_segmentation,
     partition_date
FROM (SELECT account_id,
           account_segmentation,
           operative_account_segmentation,
           old_account_segmentation,
           partition_date,
           row_number() OVER(PARTITION BY account_id ORDER BY partition_date DESC) AS row_num
    FROM `guesty-data.guesty_analytics.accounts_summary`
    WHERE (is_eom = true OR partition_date = DATE_ADD(CURRENT_DATE(),INTERVAL -2 DAY))
    AND partition_date < CURRENT_DATE()
    AND account_segmentation IS NOT NULL)
WHERE row_num = 1
),

sf_account_segmentation AS (
SELECT account_id,
     sf_account_segmentation
FROM (SELECT  guesty_account_id AS account_id,
            sf_account_segmentation ,
            ROW_NUMBER() OVER(PARTITION BY guesty_account_id) AS row_num
    FROM `guesty-data.guesty_analytics.sf_account_segmentation`
    WHERE partition_date = CURRENT_DATE()
    AND guesty_account_id IS NOT NULL)
WHERE row_num = 1
),

accounts_for_stripe AS (
SELECT  accountid AS account_id,
      provideraccountid  AS stripe_account_id,
      COUNT(*) OVER (PARTITION BY provideraccountid order by null) AS accounts_w_same_stripe
from `guesty-data.datalake_glue.payment_providers` pp
where accountid NOT IN (SELECT account_id FROM `guesty-data.assistive_data.test_accounts` WHERE account_id is not null)
GROUP BY 1,2
),
currency_converter AS (
SELECT LOWER(CurrencyTo__c) as currency,
       RateDate__c as currency_rate_date,
       1/ExchangeRate__c as value,
FROM `guesty-data.zuora_silver.CurrencyRate`
WHERE CurrencyFrom__c = 'USD'
), 
stripe AS (
SELECT stripe_account AS stripe_account_id,
     DATE_TRUNC(DATE(created),month) AS paid_month,
     -- SUM(amount)/100 AS stirpe_fee_revenue, -- original currency
     SUM(amount*COALESCE(value, 1))/100 AS stirpe_fee_revenue, 
FROM `guesty-data.stripe.balance_transaction` a
LEFT JOIN currency_converter b ON LOWER(a.currency) = b.currency AND DATE(a.created) = b.currency_rate_date
WHERE DATE_TRUNC(DATE(created),month) = DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY),MONTH)
AND   DATE(created) <= DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
AND type in  ('application_fee')
AND stripe_account_name= 'GUESTY_INC'
GROUP BY 1,2
),

stripe_accounts AS (
SELECT a.account_id,
     SUM(COALESCE(s.stirpe_fee_revenue,0)/accounts_w_same_stripe) as stirpe_fee_revenue
FROM accounts_for_stripe a
LEFT JOIN stripe s
ON a.stripe_account_id = s.stripe_account_id
GROUP BY a.account_id
),

credits AS (
SELECT account_id,
     ROUND(SUM(amount_added),1) AS credit_amount_added
FROM `guesty-data.guesty_analytics.credits`
WHERE DATE(created_at) BETWEEN DATE_TRUNC(DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY), MONTH) AND DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY)
GROUP BY 1
),

churn_summary AS (
SELECT account_id, MIN(churn_date) churn_date, TRUE AS is_churn
FROM (
  SELECT DISTINCT
         account_id,
         from_date AS churn_date,
         TRUE AS is_churn
  FROM `guesty-data.guesty_churn.churn_summary`
  WHERE DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) BETWEEN from_date AND to_date
  )
GROUP BY 1
),

glite_spam AS (
SELECT account_id,
       lite_potential_spam,
FROM `guesty-data.product_glite.lite_accounts`
),

zoura_account as (
select account_accountnumber as account_id,
       CAST(account_minimumfeeamount__c AS FLOAT64) as contract_mmf
from  `guesty-data.zuora_silver.account` 
),
hybrid_hq AS (
SELECT *
FROM `guesty_analytics.hq_account_revenue_allocation`
), 
tbl AS (
SELECT a.account_id,
     a.account_name,
     COALESCE(cm.area,'unknown') AS geo_area,
     COALESCE(cm.region,'unknown') AS geo_location,
     COALESCE(cm.old_region,'unknown') AS geo_location_old,
     COALESCE(cm.country,'unknown') AS country,
     COALESCE(cm.country_code,'unknown') AS country_code,
     COALESCE(cm.state,'unknown') AS state,
     COALESCE(cm.state_code,'unknown') AS state_code,
     COALESCE(a.city,'unknown') AS city,
     COALESCE(ns.account_segmentation,ls.account_segmentation,sf_seg.sf_account_segmentation) AS account_segmentation,
     COALESCE(ns.operative_account_segmentation, ls.operative_account_segmentation, sf_seg.sf_account_segmentation) AS operative_account_segmentation,
     COALESCE(ns.old_account_segmentation,ls.old_account_segmentation, sf_seg.sf_account_segmentation) AS old_account_segmentation,
     CASE WHEN DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY) < DATE('2019-01-01') AND COALESCE(df.booked_revenue,0) > 0 THEN TRUE
          WHEN DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY) < DATE('2019-01-01') AND COALESCE(df.booked_revenue,0) <= 0 THEN FALSE
          ELSE a.is_active
     END AS is_active,
     is_org, 
     afp.account_first_paid,
     afp.account_last_paid,
     fpm.account_first_paid_mrr,
     mfp.min_first_paid_month,
     CASE WHEN date_trunc(account_first_paid_mrr,month) = current_month AND COALESCE(df.booked_revenue,0) > 0 THEN TRUE
          ELSE FALSE
     END AS new_paid_account,
     afp.source_platform,
     CASE WHEN COALESCE(df.booked_revenue,0) > 0 THEN TRUE
          ELSE FALSE
     END AS paid_account,
     CASE WHEN COALESCE(df.paid_listings_gcs_total,0) > 0 OR COALESCE(df.gcs_revenue_total,0) > 0 THEN TRUE
          ELSE FALSE
     END AS paid_account_gcs,
     COALESCE(booked,0) AS booked,
     COALESCE(reserved,0) AS reserved,
     COALESCE(available,0) AS available,
     CASE WHEN (booked + reserved + available) > 0 THEN round((booked / (booked + reserved + available)) * 100,2)
          ELSE 0
     END AS occupancy_rate,
     CASE WHEN hq.account_id IS NOT NULL THEN 0 ELSE COALESCE(eb.listings,df.paid_listings_total,0) END AS paid_listings_total,
     COALESCE(df.paid_listings_reservation_commission,0) AS paid_listings_reservation_commission,
     COALESCE(eb.listings,df.paid_listings_fixed_monthly,0) AS paid_listings_fixed_monthly,
     CASE WHEN hq.account_id IS NOT NULL THEN 0 ELSE COALESCE(eb.listings,df.paid_listings_total_new,0) END AS paid_listings_total_new,
     COALESCE(df.paid_listings_reservation_commission_new,0) AS paid_listings_reservation_commission_new,
     COALESCE(eb.listings,df.paid_listings_fixed_monthly_new,0) AS paid_listings_fixed_monthly_new,
     COALESCE(eb.listings,df.paid_listings_sw_total,0) AS paid_listings_sw_total,
     COALESCE(eb.listings,df.paid_listings_fixed_monthly_sw,0) AS paid_listings_fixed_monthly_sw,
     COALESCE(df.paid_listings_reservation_commission_sw,0) AS paid_listings_reservation_commission_sw,
     COALESCE(df.paid_listings_accounting_total,0) AS paid_listings_accounting_total,
     COALESCE(df.paid_listings_advanced_analytics_total,0) AS paid_listings_advanced_analytics_total,
     COALESCE(df.paid_listings_rentals_united_total,0) AS paid_listings_rentals_united_total,
     COALESCE(df.paid_listings_insurance_total,0) AS paid_listings_insurance_total,
     COALESCE(df.paid_listings_gcs_total,0) AS paid_listings_gcs_total,
     COALESCE(df.paid_listings_reservation_commission_gcs,0) AS paid_listings_reservation_commission_gcs,
     COALESCE(df.paid_listings_fixed_monthly_gcs,0) AS paid_listings_fixed_monthly_gcs,
     COALESCE(df.paid_listings_replyai_total,0) AS paid_listings_replyai_total,
     COALESCE(df.paid_listings_activation_fee,0) AS paid_listings_activation_fee,
     COALESCE(df.booked_revenue,0) AS booked_revenue,
     CASE WHEN df.software_revenue_total = ba.software_revenue_total THEN COALESCE(br.software_revenue_total,df.software_revenue_total,0) ELSE COALESCE(df.software_revenue_total,0) END AS software_revenue_total,
     CASE WHEN df.software_revenue_total = ba.software_revenue_total THEN COALESCE(br.software_reservation_commission_revenue,df.software_reservation_commission_revenue,0) ELSE COALESCE(df.software_reservation_commission_revenue,0) END AS software_reservation_commission_revenue,
     CASE WHEN df.software_revenue_total = ba.software_revenue_total THEN COALESCE(br.software_fixed_monthly_revenue,df.software_fixed_monthly_revenue,0) ELSE COALESCE(df.software_fixed_monthly_revenue,0) END AS software_fixed_monthly_revenue,
     COALESCE(df.gcs_revenue_total,0) AS gcs_revenue_total,
     COALESCE(df.gcs_reservation_commission_revenue,0) AS gcs_reservation_commission_revenue,
     COALESCE(df.gcs_fixed_monthly_revenue,0) AS gcs_fixed_monthly_revenue,
     COALESCE(df.gcs_upsell_revenue,0) AS gcs_upsell_revenue,
     COALESCE(df.refund_revenue,0) AS refund_revenue,
     COALESCE(df.rentals_united_revenue,0) AS rentals_united_revenue,
     COALESCE(df.onboarding_revenue,0) AS onboarding_revenue,
     COALESCE(df.manual_revenue,0) AS manual_revenue,
     COALESCE(df.application_fee_revenue,0) AS application_fee_revenue,
     COALESCE(df.other_revenue,0) AS other_revenue,
     DATE_ADD(CURRENT_DATE(), INTERVAL -1 DAY) AS partition_date,
     CASE WHEN EXTRACT(DAY FROM CURRENT_DATE()) = 1 THEN TRUE ELSE FALSE END is_eom,
     COALESCE(stirpe_fee_revenue,0) AS stirpe_fee_revenue,
     a.is_freezingflow,
     a.freezingflow_started_at,
     a.freezingflow_ended_at,
     COALESCE(a.avoid_freezingflow,FALSE) AS avoid_freezingflow,
     COALESCE(a.premium_analytics_access,FALSE) AS premium_analytics_access,
     COALESCE(a.current_credit_amount,0) AS current_credit_amount,
     COALESCE(cr.credit_amount_added,0) AS credit_amount_added,
     a.account_created_at,
     a.account_canceled_at,
     a.sales_person,
     a.csm,
     a.onboarding_status,
     a.onboarder,
     COALESCE(cs.is_churn,FALSE) AS is_churn,
     cs.churn_date,
     COALESCE(sf.is_mickey_mouse,FALSE) AS is_mickey_mouse,
     sf.account_parent_id,
     COALESCE(inv.invoice_amount,0) AS collected_revenue,
     COALESCE(inv.credit_amount,0) AS used_credits,
     COALESCE(df.gcs_onboarding_revenue,0) AS gcs_onboarding_revenue,
     COALESCE(df.advanced_analytics_revenue,0) AS advanced_analytics_revenue,
     COALESCE(df.accounting_revenue,0) AS accounting_revenue,
     COALESCE(df.accounting_onboarding_revenue,0) AS accounting_onboarding_revenue,
     COALESCE(df.trust_accounting_onboarding_revenue,0) AS trust_accounting_onboarding_revenue,
     COALESCE(df.trust_accounting_revenue,0) AS trust_accounting_revenue,
     COALESCE(df.insurance_revenue,0) AS insurance_revenue,
     COALESCE(df.minimum_monthly_fee_revenue,0) AS minimum_monthly_fee_revenue,
     COALESCE(df.early_termination_fee_revenue,0) AS early_termination_fee_revenue,
     COALESCE(df.replayai_revenue,0) as replayai_revenue,
     COALESCE(df.guest_verify_revenue,0) as guest_verify_revenue,
     COALESCE(df.travel_insurance_revenue,0) as travel_insurance_revenue,
     COALESCE(df.guestypay_protect_revenue,0) as guestypay_protect_revenue,
     COALESCE(df.guesty_connect_revenue,0) as guesty_connect_revenue,
     COALESCE(df.autocomply_revenue,0) as autocomply_revenue,
     COALESCE(df.minimum_monthly_fee_gcs_revenue,0) AS minimum_monthly_fee_gcs_revenue,
     COALESCE(df.total_fixed_monthly_revenue,0) AS total_fixed_monthly_revenue,
     COALESCE(df.total_reservation_commission_revenue,0) AS total_reservation_commission_revenue,
     COALESCE(df.onboarding_total_revenue,0) AS onboarding_total_revenue,
     COALESCE(df.guesty_damage_protection_revenue,0) AS guesty_damage_protection_revenue,
     COALESCE(df.listing_activation_fee_revenue,0) AS listing_activation_fee_revenue,
     COALESCE(df.website_revenue,0) AS website_revenue,
     COALESCE(df.website_plus_revenue,0) AS website_plus_revenue,
     CASE WHEN ROUND(df.software_revenue_total) = ROUND(ba.software_revenue_total) THEN COALESCE(br.price_optimizer_revenue,df.price_optimizer_revenue,0) ELSE COALESCE(df.price_optimizer_revenue,0) END AS price_optimizer_revenue, --split bundle revenue for 27$ software and the rest on GPO
     CASE WHEN ROUND(df.software_revenue_total) = ROUND(ba.software_revenue_total) THEN COALESCE(br.smart_locks_revenue,df.smart_locks_revenue,0) ELSE COALESCE(df.smart_locks_revenue,0) END AS smart_locks_revenue, --split bundle revenue for 27$ software, 4$ Locks and the rest on GPO
     COALESCE(df.gdh_revenue,0) as gdh_revenue,
     CASE
      WHEN DATE_TRUNC(account_first_paid,year) = current_year and source_platform is null
      THEN TRUE
      WHEN sf.is_winback IS TRUE AND
        DATE_TRUNC(sf.winback_date, YEAR) = current_year AND sf.winback_new_retained = 'New'
      THEN TRUE
      ELSE FALSE
     END as new_account,
     CASE
      WHEN sf.is_winback IS TRUE
      THEN TRUE
      ELSE FALSE
     END as winback_account,
     sf.winback_date,
     COALESCE(fap.failed_payments_amount,0) as failed_payments_amount,
     COALESCE(fup.future_payments_amount,0) as future_payments_amount,
     sf.is_enterprise as enterprise_account,
  CASE WHEN sf.package = 'lite' then 'lite'
       WHEN is_enterprise IS TRUE THEN 'enterprise'
       WHEN hq.account_id IS NOT NULL THEN hq.package
     ELSE a.package END as package, 
CASE WHEN a.account_id IN ('6556982ab00ca2fd33b320b8', '5e4fe587dfe8c6002be2e3ad') AND  current_year = '2024-01-01' THEN 'New'
             WHEN DATE_TRUNC(fpm.account_first_paid_mrr,year) = current_year THEN 'New'
             WHEN sf.is_winback IS TRUE AND DATE_TRUNC(sf.winback_date,YEAR) = current_year AND sf.winback_new_retained = 'New' THEN 'New'
             WHEN DATE_TRUNC(fpm.account_first_paid_mrr,year) < current_year THEN 'Retained'
             WHEN DATE_TRUNC(afp.account_first_paid,year) = current_year THEN 'New'
             WHEN DATE_TRUNC(afp.account_first_paid,year) < current_year THEN 'Retained'
             WHEN DATE_TRUNC(a.contract_closed_date,year) = current_year THEN 'New'
             WHEN DATE_TRUNC(a.contract_closed_date,year) < current_year THEN 'Retained'            
             END as new_retained_flag,
CASE           WHEN (hq.org_id IN ('649c5ae38b62b9002a43e171', '61a17702-a24e-4078-9609-3c9a3e1cf794', 'bd450ccb-134b-4c6e-b9c5-74ffdc6f9785') OR a.account_id IN ('649c5ae38b62b9002a43e171', '61a17702-a24e-4078-9609-3c9a3e1cf794', 'bd450ccb-134b-4c6e-b9c5-74ffdc6f9785')) THEN 'Retained' -- CasaGo, Grand Welcome and Avari -> Retained
               WHEN a.account_id = '659d8b2e77440fcc52e7c5a4' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-12-31' THEN 'New' -- Joivy
               WHEN a.account_id = '649c5ae38b62b9002a43e171' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-09-30' THEN 'New' -- Grand Welcome
               WHEN a.account_id = '6423f71bae1ccc00405466e0' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-01-31' THEN 'New' --checkmyguest
               WHEN a.account_id = '63f616b58aa2820036bb1787' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-09-30' THEN 'New' --Renters
               WHEN a.account_id = '65cdef5e81ac44f2fd1e7b1a' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-05-31' THEN 'New' --Houst
               WHEN a.account_id = '66b8767209f6eb953cb9dd73' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-07-31' THEN 'New' --AirDXB
               WHEN a.account_id = '65cdef5e81ac44f2fd1e7b1a' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-05-31' THEN 'New' --Houst
               WHEN min_first_paid_month <= DATE_SUB(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY), INTERVAL 12 MONTH) THEN 'Retained' ELSE 'New' END AS new_retained_flag_ltm, 
CASE WHEN source_type IN ('Inbound','Upgrades & Migrations') THEN 'Inbound' ELSE 'Outbound' END as inbound_outbound_type,
CASE WHEN COALESCE(za.contract_mmf,0) <= 0   THEN 0
            when COALESCE(za.contract_mmf,0) = COALESCE(df.minimum_monthly_fee_revenue,0)  THEN COALESCE(a.contract_listings,0) 
      ELSE COALESCE(df.minimum_monthly_fee_revenue,0)/20 END as mmf_listings  
FROM accounts a
LEFT JOIN detailed_financials df
ON a.account_id = df.account_id
LEFT JOIN invoices as inv
ON a.account_id = inv.account_id
LEFT JOIN accounts_first_paid afp
ON a.account_id = afp.account_id
LEFT JOIN country_mapping cm
ON a.account_id  = cm.account_id
LEFT JOIN occupancy_rate occ
ON a.account_id = occ.account_id
LEFT JOIN last_segment ls
ON a.account_id = ls.account_id
LEFT JOIN new_segment ns
ON a.account_id = ns.account_id
LEFT JOIN sf_account_segmentation sf_seg
ON a.account_id = sf_seg.account_id
LEFT JOIN stripe_accounts sa
ON a.account_id = sa.account_id
LEFT JOIN credits cr
ON a.account_id = cr.account_id
LEFT JOIN churn_summary cs
ON a.account_id = cs.account_id
LEFT JOIN salesforce sf
ON a.account_id = sf.account_id
LEFT JOIN failed_payments fap
ON a.account_id = fap.account_id
LEFT JOIN future_payments fup
ON a.account_id = fup.account_id
LEFT JOIN first_paid_mrr fpm 
ON a.account_id = fpm.account_id
LEFT JOIN bundle_revenue br 
ON a.account_id = br.account_id
LEFT JOIN enterprise_billing eb
ON a.account_id = eb.account_id
LEFT JOIN min_first_paid mfp
ON a.account_id = mfp.account_id
LEFT JOIN glite_spam gs
ON a.account_id = gs.account_id
LEFT JOIN zoura_account za
on a.account_id = za.account_id
LEFT JOIN bundle_accounts ba
ON a.account_id = ba.account_id
LEFT JOIN hybrid_hq hq
ON a.account_id = hq.account_id

CROSS JOIN dates
WHERE (lite_potential_spam IS FALSE OR lite_potential_spam IS NULL)
),

final AS (
SELECT DISTINCT tbl.account_id,
     account_name,
     geo_area,
     geo_location,
     geo_location_old,
     country,
     country_code,
     state,
     state_code,
     city,
     account_segmentation,
     is_active,
     is_org, 
     account_first_paid,
     account_first_paid_mrr,
     account_last_paid,
     new_paid_account,
     source_platform,
     paid_account,
     paid_account_gcs,
     booked,
     reserved,
     available,
     occupancy_rate,
     --- for cases a glite account was billed for 1 listings before the listing was active in the system, we count 1 as paid listings
     CASE WHEN package = 'lite' AND software_revenue_total > 0 AND paid_listings_total = 0 THEN 1
          ELSE paid_listings_total END as paid_listings_total,
     CASE WHEN package = 'lite' AND software_reservation_commission_revenue > 0 AND paid_listings_reservation_commission = 0 THEN 1
          ELSE paid_listings_reservation_commission END as paid_listings_reservation_commission,
     CASE WHEN package = 'lite' AND software_fixed_monthly_revenue > 0 AND paid_listings_fixed_monthly = 0 THEN 1
          ELSE paid_listings_fixed_monthly END as paid_listings_fixed_monthly,
     CASE WHEN package = 'lite' AND software_revenue_total > 0 AND paid_listings_total_new = 0 THEN 1
          ELSE paid_listings_total_new END as paid_listings_total_new,
     CASE WHEN package = 'lite' AND software_reservation_commission_revenue > 0 AND paid_listings_reservation_commission_new = 0 THEN 1
          ELSE paid_listings_reservation_commission_new END as paid_listings_reservation_commission_new,
     CASE WHEN package = 'lite' AND software_fixed_monthly_revenue > 0 AND paid_listings_fixed_monthly_new = 0 THEN 1
          ELSE paid_listings_fixed_monthly_new END as paid_listings_fixed_monthly_new,
     paid_listings_gcs_total,
     paid_listings_reservation_commission_gcs,
     paid_listings_fixed_monthly_gcs,
     paid_listings_replyai_total,
     paid_listings_activation_fee,
     booked_revenue,
     software_revenue_total,
     software_reservation_commission_revenue,
     software_fixed_monthly_revenue,        
     gcs_revenue_total,
     gcs_reservation_commission_revenue,
     gcs_fixed_monthly_revenue,
     gcs_upsell_revenue,
     refund_revenue,
     rentals_united_revenue,
     onboarding_revenue,
     manual_revenue,
     application_fee_revenue,
     other_revenue,
     partition_date,
     is_eom,
     stirpe_fee_revenue,
     is_freezingflow,
     freezingflow_started_at,
     freezingflow_ended_at,
     avoid_freezingflow,
     premium_analytics_access,
     current_credit_amount,
     credit_amount_added,
     account_created_at,
     account_canceled_at,
     sales_person,
     csm,
     onboarding_status,
     onboarder,
     is_churn,
     churn_date,
     is_mickey_mouse,
     account_parent_id,
     collected_revenue,
     used_credits,
     gcs_onboarding_revenue,
     advanced_analytics_revenue,
     accounting_revenue,
     accounting_onboarding_revenue,
     trust_accounting_onboarding_revenue,
     trust_accounting_revenue,
     insurance_revenue,
     minimum_monthly_fee_revenue,
     minimum_monthly_fee_gcs_revenue,
     early_termination_fee_revenue,
     replayai_revenue,
     guest_verify_revenue,
     paid_listings_sw_total,
     paid_listings_fixed_monthly_sw,
     paid_listings_reservation_commission_sw,
     paid_listings_accounting_total,
     paid_listings_advanced_analytics_total,
     paid_listings_rentals_united_total,
     paid_listings_insurance_total,
     total_fixed_monthly_revenue,
     total_reservation_commission_revenue,           
     onboarding_total_revenue,
     guesty_damage_protection_revenue,
     listing_activation_fee_revenue,
     website_revenue,
     website_plus_revenue,
     price_optimizer_revenue,
     smart_locks_revenue,
     gdh_revenue,
     new_account,
     winback_account,
     winback_date,
     enterprise_account,
     package,
     'null' as software_plan_type,
     operative_account_segmentation,
     old_account_segmentation,
     new_retained_flag,
     min_first_paid_month,
     new_retained_flag_ltm, 
     inbound_outbound_type,
     mmf_listings,
     travel_insurance_revenue,
     guestypay_protect_revenue,
     guesty_connect_revenue,
     autocomply_revenue,
FROM tbl 
)


SELECT *
FROM final
```

## Documented columns (4 of 117)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `booked` | Number of booked days for an account's listings. | Aggregates the sum of booked days from the calendars_summary table for the current month, grouped by account_id. | `SUM(booked) AS booked` |
| `new_retained_flag_ltm` | Flag indicating if an account is new or retained based on a 12-month lookback. | Determines if an account is 'New' or 'Retained' based on its first paid month (MRR) within the last 12 months, with specific overrides for certain enterprise accounts. | `CASE           WHEN (hq.org_id IN ('649c5ae38b62b9002a43e171', '61a17702-a24e-4078-9609-3c9a3e1cf794', 'bd450ccb-134b-4c6e-b9c5-74ffdc6f9785') OR a.account_id IN ('649c5ae38b62b9002a43e171', '61a17702-a24e-4078-9609-3c9a3e1cf794', 'bd450ccb-134b-4c6e-b9c5-74ffdc6f9785')) THEN 'Retained' -- CasaGo, Grand Welcome and Avari -> Retained                WHEN a.account_id = '659d8b2e77440fcc52e7c5a4' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-12-31' THEN 'New' -- Joivy                WHEN a.account_id = '649c5ae38b62b9002a43e171' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-09-30' THEN 'New' -- Grand Welcome                WHEN a.account_id = '6423f71bae1ccc00405466e0' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-01-31' THEN 'New' --checkmyguest                WHEN a.account_id = '63f616b58aa2820036bb1787' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-09-30' THEN 'New' --Renters                WHEN a.account_id = '65cdef5e81ac44f2fd1e7b1a' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-05-31' THEN 'New' --Houst                WHEN a.account_id = '66b8767209f6eb953cb9dd73' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-07-31' THEN 'New' --AirDXB                WHEN a.account_id = '65cdef5e81ac44f2fd1e7b1a' AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) <= '2025-05-31' THEN 'New' --Houst                WHEN min_first_paid_month <= DATE_SUB(DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY), INTERVAL 12 MONTH) THEN 'Retained' ELSE 'New' END` |
| `other_revenue` | Revenue from products not categorized elsewhere. | Sums the 'amount_from_product' for products explicitly labeled as 'other' in the detailed_financials table. | `SUM(CASE WHEN product_name = 'other' THEN amount_from_product END) AS other_revenue` |
| `paid_account` | Indicates if an account has made a payment. | True if the booked revenue for the account is greater than 0, otherwise False. Booked revenue is derived from detailed financial records. | `CASE WHEN COALESCE(df.booked_revenue,0) > 0 THEN TRUE           ELSE FALSE      END AS paid_account` |
