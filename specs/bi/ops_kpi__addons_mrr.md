# BI mart — `guesty-data.ops_kpi.addons_mrr`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ Source last refreshed 2026-04-19 (~12 weeks ago) — verify logic hasn't drifted before relying on it.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2023-01-01', '2025-01-01'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `ops_kpi.addons_mrr` AS 

WITH

-- ACCOUNTS DATA

hq AS
(
SELECT h.account_id,
       a.csm AS hq_csm,
       TRUE as is_sub_hq
FROM `guesty-data.guesty_analytics.hq_overview` h
LEFT JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON a.account_id = h.org_id
  AND a.partition_date = CURRENT_DATE
),

dm AS (
SELECT 
  a.account_id, 
  a.account_name, 
  CASE
    WHEN hq.is_sub_hq = TRUE
    AND a.csm = 'Guesty Support'
      THEN hq.hq_csm
    ELSE
      a.csm
  END AS csm,  
FROM `guesty_analytics.dim_accounts` a
LEFT JOIN hq 
  ON hq.account_id = a.account_id
WHERE partition_date = current_date
AND account_first_paid IS NOT NULL
-- AND package <> 'lite'
), 

opps AS (
SELECT *
FROM `guesty-data.ops_kpi.addons_mrr_opps`
),
-- USAGE AND KPIS

co AS (
SELECT
  Guesty_Admin_ID__c as account_id, 
  o.Number_of_Listings__c * Occupancy_Rate__c * Average_Nightly_Rate__c AS egbv,
  ROW_NUMBER() OVER (PARTITION BY AccountId order by CloseDate desc) as rnk

  FROM `guesty-data.salesforce.sf_opportunity` o
  join `salesforce.sf_account` a on a.Id = o.AccountId 
  join `guesty-data.guesty_analytics.dim_accounts` ad on ad.account_id = a.Guesty_Admin_ID__c
where o.partition_date = current_date() 
  and a.partition_date = current_date()-1
  and ad.partition_date = current_date()-1 
  and o.StageName IN ('Closed Won (Billing in)') --, 'Testing (Trial)'
  QUALIFY rnk = 1
),

fr_pre_1 AS (
SELECT 
  account_id,
  DATE_SUB(DATE_TRUNC(check_in, month), INTERVAL -1 month) AS month, 
  SUM(fee_host_payout_usd) AS fee_host_payout_usd, 
  SUM(CASE WHEN reservation_channel = 'manual' THEN fee_host_payout_usd ELSE 0 END) AS fee_host_payout_usd_direct, 
  SUM(fee_host_payout_usd)/COUNT(DISTINCT listing_id) avg_fee_host_payout_usd

FROM `guesty_analytics.fact_reservations`
WHERE check_in BETWEEN DATE_SUB(DATE_TRUNC(CURRENT_DATE, month), INTERVAL 13 month) AND LAST_DAY(DATE_SUB(DATE_TRUNC(CURRENT_DATE, month), INTERVAL 1 month))
AND status = 'confirmed'
AND fee_host_payout_usd > 0
-- AND account_id = '679831f97f87dd47600c762f'
GROUP BY ALL 
),

fr_pre_2 AS (
SELECT
  account_id, 
  month, 
  AVG(fee_host_payout_usd) OVER (PARTITION BY account_id ORDER BY month ASC ROWS BETWEEN 11 PRECEDING AND 0 FOLLOWING) AS fee_host_payout_usd, 
  AVG(fee_host_payout_usd_direct) OVER (PARTITION BY account_id ORDER BY month ASC ROWS BETWEEN 11 PRECEDING AND 0 FOLLOWING) AS fee_host_payout_usd_direct, 
  AVG(avg_fee_host_payout_usd) OVER (PARTITION BY account_id ORDER BY month ASC ROWS BETWEEN 11 PRECEDING AND 0 FOLLOWING) AS avg_fee_host_payout_usd, 

FROM fr_pre_1
),

fr AS (
SELECT 
  fr.account_id,
  month, 
  CASE WHEN fee_host_payout_usd < 100 OR fee_host_payout_usd IS NULL THEN egbv ELSE fee_host_payout_usd END AS fee_host_payout_usd, 
  CASE WHEN fee_host_payout_usd_direct < 100 OR fee_host_payout_usd_direct IS NULL THEN egbv*0.2 ELSE fee_host_payout_usd_direct END AS fee_host_payout_usd_direct, 
  avg_fee_host_payout_usd
FROM fr_pre_2 fr
LEFT JOIN co ON fr.account_id = co.account_id
),

gdh_listing_months AS (
  SELECT
    account_id,
    listing_id,
    month,
    listing_price,
    LAG(month) OVER (PARTITION BY listing_id ORDER BY month) AS prev_month
  FROM `strategic_partnerships.gdh_billing_tool`
),

gdh_gaps AS (
  SELECT
    account_id,
    listing_id,
    month,
    listing_price,
    prev_month,
    DATE_DIFF(month, prev_month, MONTH) AS months_gap
  FROM gdh_listing_months
),

gdh_pre AS (
SELECT DISTINCT
  account_id,
  listing_id,
  month,
  listing_price AS price
FROM gdh_gaps
WHERE
  prev_month IS NULL
  OR months_gap >= 3
ORDER BY listing_id, month
),

gdh AS (
select 
  month, 
  account_id,
  'Guesty Distribution Hub' AS addon,
  GREATEST(price, 4) AS price,
  COUNT(DISTINCT listing_id) AS gdh_listings,
  SUM(GREATEST(price, 4)) AS gdh_revenue,
  
FROM gdh_pre
GROUP BY ALL
),

locks as (
SELECT
  account_id, 
  month, 
  'Guesty Locks' AS addon,
  pricing, 
  COALESCE(new_locks_in_month, 0) AS locks_listings, 
  COALESCE(new_locks_in_month, 0)*pricing AS locks_revenue, 
FROM `guesty-data.product_smart_locks.gfp_new_billing_smart_lock_v2` 
),

dp_unnested_listings AS (
  SELECT DISTINCT
    listing_id,
    partition_date
  FROM `shield.covered_listings`
  LEFT JOIN UNNEST(listings) AS listing_id
  WHERE plan_item_name != 'Shield Screen & Protect'
    AND listing_id IS NOT NULL
    AND partition_date IS NOT NULL
    AND partition_date >= '2025-01-01'
),

dp_listing_gaps AS (
  SELECT
    listing_id,
    partition_date,
    LAG(partition_date) OVER (PARTITION BY listing_id ORDER BY partition_date) AS prev_date
  FROM dp_unnested_listings
  QUALIFY
    prev_date IS NULL
    OR DATE_DIFF(partition_date, prev_date, MONTH) >= 3
),

dp_pre AS (
SELECT
  listing_id,
  partition_date AS reappearance_date
FROM dp_listing_gaps
ORDER BY listing_id, partition_date
),

dp AS (
SELECT
  DATE_TRUNC(a.reappearance_date, month) AS month, 
  account_id,
  'Damage Protection' AS addon,
  COUNT(DISTINCT a.listing_id) AS dp_listings
FROM dp_pre a 
JOIN `guesty_analytics.dim_listings` b ON a.listing_id = b.listing_id AND b.partition_date = CURRENT_DATE
GROUP BY ALL
),

sp_unnested_listings AS (
  SELECT DISTINCT
    listing_id,
    partition_date
  FROM `shield.covered_listings`
  LEFT JOIN UNNEST(listings) AS listing_id
  WHERE plan_item_name = 'Shield Screen & Protect'
    AND listing_id IS NOT NULL
    AND partition_date IS NOT NULL
    AND partition_date >= '2025-01-01'
),

sp_listing_gaps AS (
  SELECT
    listing_id,
    partition_date,
    LAG(partition_date) OVER (PARTITION BY listing_id ORDER BY partition_date) AS prev_date
  FROM sp_unnested_listings
  QUALIFY  -- Filter during window function evaluation
    prev_date IS NULL  -- First appearance
    OR DATE_DIFF(partition_date, prev_date, MONTH) >= 3  -- 3+ month gap
),

sp_pre as (
SELECT
  listing_id,
  partition_date AS reappearance_date
FROM sp_listing_gaps
ORDER BY listing_id, partition_date
),

sp AS (
SELECT
  DATE_TRUNC(a.reappearance_date, month) AS month, 
  account_id,
  'Screen & Protect' AS addon,
  COUNT(DISTINCT a.listing_id) AS sp_listings
FROM sp_pre a 
JOIN `guesty_analytics.dim_listings` b ON a.listing_id = b.listing_id AND b.partition_date = CURRENT_DATE
GROUP BY ALL
),

gv_listing_dates AS (
  SELECT DISTINCT
    listing_id,
    account_id,
    partition_date
  FROM `verify.listings`
  WHERE status = 'ENABLED'
    AND partition_date IS NOT NULL
    AND listing_id IS NOT NULL
),

gv_listing_gaps AS (
  SELECT
    listing_id,
    account_id,
    partition_date,
    LAG(partition_date) OVER (PARTITION BY listing_id ORDER BY partition_date) AS prev_date
  FROM gv_listing_dates
  QUALIFY  -- Filter during window function evaluation
    prev_date IS NULL  -- First appearance
    OR DATE_DIFF(partition_date, prev_date, DAY) >= 90  -- 3+ month gap (90 days)
),

gv_pre AS (
SELECT
  listing_id,
  account_id,
  partition_date AS reappearance_date
FROM gv_listing_gaps
ORDER BY listing_id, partition_date
),

gv AS (
SELECT
  DATE_TRUNC(reappearance_date, month) AS month, 
  account_id,
  COUNT(DISTINCT listing_id) AS listings, 
FROM gv_pre
GROUP BY ALL
),

gl_policy_dates AS (
  SELECT DISTINCT
    listing_id,
    account_id,
    partition_date
  FROM `shield.liability_policies`
  WHERE listing_enabled_at IS NOT NULL
    AND status = 'ACTIVE'
    AND partition_date IS NOT NULL
    AND listing_id IS NOT NULL
),

gl_policy_gaps AS (
  SELECT
    listing_id,
    account_id,
    partition_date,
    LAG(partition_date) OVER (PARTITION BY listing_id ORDER BY partition_date) AS prev_date
  FROM gl_policy_dates
  QUALIFY  -- Filter during window function evaluation
    prev_date IS NULL  -- First appearance
    OR DATE_DIFF(partition_date, prev_date, DAY) >= 90  -- 3+ month gap (90 days)
),

gl_pre AS (
SELECT
  listing_id,
  account_id,
  partition_date AS first_date
FROM gl_policy_gaps
ORDER BY listing_id, partition_date
),

gl_monthly_avg AS (
SELECT DISTINCT c.account_id, DATE_TRUNC(c.date, MONTH) AS month, LEAST(ROUND(SUM(booked)/COUNT(DISTINCT c.listing_id), 0 ), 31) AS monthly_average_booked 
FROM gl_pre g
LEFT JOIN `guesty-sisense.end_users_data.fact_calendar` c
  ON g.listing_id = c.listing_id
  AND DATE_TRUNC(c.date,MONTH) >= DATE_TRUNC(g.first_date,MONTH) - INTERVAL 12 MONTH
  AND DATE_TRUNC(c.date,MONTH) < DATE_TRUNC(g.first_date, MONTH)
WHERE c.bookable = 1
GROUP BY 1,2
ORDER BY 1, 2 DESC
),

gl AS (
SELECT g.account_id,
       DATE_TRUNC(g.first_date, MONTH) AS MONTH,
       COUNT(DISTINCT g.listing_id) AS listings,
       ROUND(AVG(a.monthly_average_booked),1) AS average_monthly_booked,
       ROUND(CASE WHEN AVG(a.monthly_average_booked) = 0 OR AVG(a.monthly_average_booked) IS NULL THEN 30
       ELSE AVG(a.monthly_average_booked) * 2.5 END * COUNT(DISTINCT g.listing_id), 1) AS revenue
FROM gl_pre g
LEFT JOIN gl_monthly_avg a
  ON a.account_id = g.account_id
  AND a.month >= DATE_TRUNC(g.first_date, MONTH) - INTERVAL 12 MONTH
  AND a.month < DATE_TRUNC(g.first_date, MONTH)
GROUP BY ALL
),

pre_accounts_gp AS (
SELECT account_id,
        onboarding_status,
        onboarding_completion_date,
        country_code,
        active_listings,
        last_month_paid_listings,
        CASE 
          WHEN country_code IN ('US','CA') THEN 0.0325
          WHEN country_code IN ('AU','NZ') THEN 0.007
          ELSE 0.025
        END AS revshare
FROM `guesty-data.guesty_analytics.dim_accounts`
WHERE partition_date = CURRENT_DATE
),

-- Rolling average of up to 12 months before, for each month account exists in the payments table
gp_monthly_avg AS (
SELECT DATE_TRUNC(money_payments_paydate, MONTH) AS month,
       account_id,
       SUM(money_payments_amount_usd) / COUNT(DISTINCT listing_id) AS avg_volume,
FROM `payments_processing.payments`
WHERE DATE_TRUNC(money_payments_paydate, MONTH) >= '2023-01-01'
  AND money_payments_status IN ('SUCCEEDED')
  AND payment_method_new IN ('Fiserv','BPC','Stripe','GuestyPay','STRIPE','CheckOut','HYP','Merchant Warrior','GuestyPay Stripe')
GROUP BY ALL
),

gp_avg_pre12 AS (
SELECT 
    a.account_id,
    a.month,
    a.avg_volume,
    AVG(b.avg_volume) as rolling_12_month_avg,
    COUNT(b.avg_volume) as months_included
FROM gp_monthly_avg a
LEFT JOIN gp_monthly_avg b
    ON a.account_id = b.account_id
    AND b.month BETWEEN DATETIME_SUB(a.month, INTERVAL 11 MONTH) AND a.month
GROUP BY 
    a.account_id,
    a.month,
    a.avg_volume
ORDER BY 1,2
),

gp_listing_dates AS (
  SELECT 
    o.opp_id,
    al.account_id,
    o.CloseDate,
    al.partition_date,
    al.guestypay_listings
  FROM `guesty-data.payments_processing.assigned_listings` al
  INNER JOIN opps o
    ON o.account_id = al.account_id 
    AND o.addon = 'GuestyPay'
    AND al.partition_date >= o.CloseDate
  WHERE al.guestypay_listings > 0
),
gp_first_listing AS (
  SELECT
    opp_id,
    MIN(partition_date) AS first_listing_date 
  FROM gp_listing_dates
  GROUP BY opp_id
),
gp_target_milestones AS (
  -- 1. Generate the exact target dates (0 to 5 months) for every opportunity
  SELECT 
    opp_id,
    first_listing_date,
    months_from_close,
    DATE_ADD(first_listing_date, INTERVAL months_from_close MONTH) AS target_date
  FROM gp_first_listing,
  UNNEST([0, 1, 2, 3, 4, 5]) AS months_from_close
),

gp_listings AS (
  -- 2. Join the targets to the actual available dates and pick the closest one
  SELECT
    t.opp_id,
    ld.account_id,
    ld.CloseDate,
    t.first_listing_date,
    ld.partition_date AS date,
    ld.guestypay_listings,
    t.months_from_close
  FROM gp_target_milestones t
  JOIN gp_listing_dates ld 
    ON t.opp_id = ld.opp_id
  -- 3. The magic: rank the dates by how close they are to the target date and take the #1 closest
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY t.opp_id, t.months_from_close 
    ORDER BY ABS(DATE_DIFF(ld.partition_date, t.target_date, DAY)) ASC
  ) = 1
),
gp_avgs AS (
  SELECT DISTINCT 
    l.opp_id,
    l.account_id,
    l.CloseDate,
    l.first_listing_date,  
    l.date,
    l.months_from_close,
    LEAST(l.guestypay_listings, ac.active_listings) AS guestypay_listings,
    CASE
      WHEN (DATE(ac.onboarding_completion_date) > CURRENT_DATE - INTERVAL 3 MONTH)
        THEN GREATEST(a.rolling_12_month_avg,500)
      ELSE a.rolling_12_month_avg
    END AS avg_volume,
    ac.revshare
  FROM gp_listings l
  LEFT JOIN gp_avg_pre12 a 
    ON a.account_id = l.account_id
  LEFT JOIN pre_accounts_gp ac 
    ON ac.account_id = l.account_id
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY l.opp_id, l.date 
    ORDER BY ABS(DATE_DIFF(l.date, a.month, DAY))
  ) = 1
),
gp_kpi AS (
  SELECT 
    *,
    IFNULL(
      guestypay_listings - LAG(guestypay_listings) OVER (
        PARTITION BY opp_id 
        ORDER BY months_from_close
      ), 
      guestypay_listings
    ) AS new_listings,
    CASE
      WHEN IFNULL(
        guestypay_listings - LAG(guestypay_listings) OVER (
          PARTITION BY opp_id  
          ORDER BY months_from_close
        ), 
        guestypay_listings
      ) > 0
      THEN IFNULL(
        guestypay_listings - LAG(guestypay_listings) OVER (
          PARTITION BY opp_id 
          ORDER BY months_from_close
        ), 
        guestypay_listings
      )
      ELSE 0
    END AS listings,
    CASE
      WHEN IFNULL(
        guestypay_listings - LAG(guestypay_listings) OVER (
          PARTITION BY opp_id  
          ORDER BY months_from_close
        ), 
        guestypay_listings
      ) > 0
      THEN IFNULL(
        guestypay_listings - LAG(guestypay_listings) OVER (
          PARTITION BY opp_id  
          ORDER BY months_from_close
        ), 
        guestypay_listings
      ) * avg_volume * revshare
      ELSE 0
    END AS KPI
  FROM gp_avgs g
),

gcapital AS (
SELECT
  DISTINCT
  account_id,  
  'Guesty Capital' AS addon,
  CAST(accepted_amount AS FLOAT64) AS accepted_amount, 
  ROUND(((ROUND(CAST(accepted_amount AS FLOAT64), 0)*0.03)/12),2) AS revenue
from `strategic_partnerships.capital_offers` a
WHERE status = 'offer_accepted'
AND accepted_amount IS NOT NULL
), 

gp_protect AS (
SELECT 
  account_id, 
  DATE_TRUNC(check_in, month) AS month, 
  'GuestyPay Protect' AS addon,
  SUM(fee_host_payout_usd*0.33*0.002) revenue
FROM `guesty_analytics.fact_reservations`
WHERE check_in >= '2025-01-01'
AND status = 'confirmed'
GROUP BY ALL
),

gpo_usage AS (
SELECT 
  DISTINCT
  accountid AS account_id,
  listingId, 
  DATE(enabledAt) AS enabledAt, 
FROM `guesty-data.silver.dp_listing_setup` 
WHERE DATE(_PARTITIONTIME) = CURRENT_DATE 
AND status = 'ENABLED'
),

gpo_uniq AS (
SELECT
  account_id, 
  DATE_TRUNC(enabledAt, month) AS month, 
  COUNT(DISTINCT listingId) AS listings
FROM gpo_usage
GROUP BY ALL
),

gpo_zuora AS (
SELECT 
  DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), month) AS month,
  partition_date,
  account_id,
  plan_name,
  ROUND(AVG(plan_value), 2) AS plan_value
FROM `zuora_analytics.product_catalog` a
WHERE (partition_date = CURRENT_DATE OR EXTRACT(DAY from partition_date) = 1)
AND plan_name IN ('PriceOptimizer Commission Based (On Check-in)', 'PriceOptimizer Fixed Per Listing', 'PriceOptimizer Fixed Per Month')
AND plan_value > 0
GROUP BY ALL
),

website_zuora AS (
  SELECT 
    DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), MONTH) AS month,
    partition_date,
    account_id,
    plan_name,
    plan_value, 
    active_listings,
  FROM `zuora_analytics.product_catalog` a
  WHERE (partition_date = CURRENT_DATE OR EXTRACT(DAY FROM partition_date) = 1)
    AND plan_name IN ('Website RP', 'Advance Website Plus', 'Advanced Website')
    AND plan_value > 0
  GROUP BY ALL
),

website_per_opp AS (
  SELECT 
    o.opp_id,
    o.account_id,
    o.CloseDate,
    DATE_TRUNC(o.CloseDate, MONTH) AS close_month,
    wz.month,
    wz.plan_name,
    wz.plan_value,
    wz.active_listings
  FROM opps o
  INNER JOIN website_zuora wz
    ON wz.account_id = o.account_id AND o.addon IN ('Advanced Website Plus','Advanced Booking Website')
    AND wz.month >= DATE_TRUNC(o.CloseDate, MONTH)  
),
website_first_month AS (
  SELECT 
    opp_id,
    account_id,
    CloseDate,
    MIN(month) AS first_month,
    MIN_BY(plan_name, month) AS plan_name,
    MIN_BY(plan_value, month) AS plan_value,
    MIN_BY(active_listings, month) AS active_listings
  FROM website_per_opp
  GROUP BY opp_id, account_id, CloseDate
),

gcs_zuora AS (
SELECT 
  DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), month) AS month,
  partition_date,
  account_id,
  plan_name,
  plan_value, 
  quantity,
  active_listings,
  
FROM `zuora_analytics.product_catalog` a
WHERE (partition_date = CURRENT_DATE-1 OR EXTRACT(DAY from partition_date) = 1)
AND plan_name IN (
      'GCS (24/7) RP per reservation',
      'GCS (24/7) RP',
      'Off Hours GCS RP',
      'GCS (24/7) Fixed Price',
      'GCS Responding to Reviews RP'
      )
AND plan_value > 0
AND (quantity > 0 OR plan_name = 'GCS (24/7) RP per reservation')
GROUP BY ALL
),

gcs_first_month AS (
SELECT 
  a.account_id, 
  MIN(month) AS month, 
  MIN_BY(plan_name, month) plan_name, 
  MIN_BY(plan_value, month) plan_value, 
  MIN_BY(plan_value, active_listings) active_listings, 
  MIN_BY(plan_value, quantity) quantity, 

FROM gcs_zuora a
JOIN opps b ON a.account_id = b.account_id AND a.month >= b.close_month
WHERE b.addon IN ('GCS Upgrade','Off-Hours GCS')
GROUP BY ALL
),

aa_zuora AS (
  SELECT 
    DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), MONTH) AS month,
    partition_date,
    account_id,
    plan_name,
    plan_value, 
    quantity,
    active_listings,
  FROM `zuora_analytics.product_catalog` a
  WHERE (partition_date = CURRENT_DATE OR EXTRACT(DAY FROM partition_date) = 1)
    AND plan_name IN (
      'Advanced Analytics Level 2 RP',
      'Advanced Analytics Level 1 RP',
      'Advanced Analytics Level 2 flat fee',
      'Advanced Analytics Level 1 flat fee',
      'Advanced Analytics Additional Seats'
    )
    AND plan_value > 0
  GROUP BY ALL
),

aa_per_opp AS (
  SELECT 
    o.opp_id,
    o.account_id,
    o.CloseDate,
    DATE_TRUNC(o.CloseDate, MONTH) AS close_month,
    az.month,
    az.plan_name,
    az.plan_value,
    az.quantity,
    az.active_listings
  FROM opps o
  INNER JOIN aa_zuora az
    ON az.account_id = o.account_id
    AND o.addon = 'AA Upsell'
    AND az.month >= DATE_TRUNC(o.CloseDate, MONTH) 
),

aa_first_month AS (
  SELECT 
    opp_id,  
    account_id,
    CloseDate,
    MIN(month) AS month,
    MIN_BY(plan_name, month) AS plan_name,
    MIN_BY(plan_value, month) AS plan_value,
    MIN_BY(active_listings, month) AS active_listings,
    MIN_BY(quantity, month) AS quantity
  FROM aa_per_opp
  GROUP BY opp_id, account_id, CloseDate 
),

accounting_zuora AS (
  SELECT 
    DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), MONTH) AS month,
    partition_date,
    account_id,
    plan_name,
    plan_value, 
    quantity,
    active_listings,
  FROM `zuora_analytics.product_catalog` a
  WHERE (partition_date = CURRENT_DATE OR EXTRACT(DAY FROM partition_date) = 1)
    AND plan_name IN (
      'Accounting Module RP',
      'Accounting Module (fixed) RP'
    )
    AND plan_value > 0
  GROUP BY ALL
),
accounting_per_opp AS (
  SELECT 
    o.opp_id,
    o.account_id,
    o.CloseDate,
    DATE_TRUNC(o.CloseDate, MONTH) AS close_month,
    az.month,
    az.plan_name,
    az.plan_value,
    az.quantity,
    az.active_listings
  FROM opps o
  INNER JOIN accounting_zuora az
    ON az.account_id = o.account_id
    AND o.addon = 'Accounting Upsell'
    AND az.month >= DATE_TRUNC(o.CloseDate, MONTH) 
),
accounting_first_month AS (
  SELECT 
    opp_id,
    account_id,
    CloseDate,
    MIN(month) AS month,
    MIN_BY(plan_name, month) AS plan_name,
    MIN_BY(plan_value, month) AS plan_value,
    MIN_BY(active_listings, month) AS active_listings,
    MIN_BY(quantity, month) AS quantity
  FROM accounting_per_opp
  GROUP BY opp_id, account_id, CloseDate
),

ru_zuora AS (
  SELECT 
    DATE_TRUNC(DATE_SUB(partition_date, INTERVAL 1 day), MONTH) AS month,
    partition_date,
    account_id,
    plan_name,
    plan_value, 
    quantity,
    active_listings,
  FROM `zuora_analytics.product_catalog` a
  WHERE (partition_date = CURRENT_DATE OR EXTRACT(DAY FROM partition_date) = 1)
    AND plan_name IN (
      'Third Party Fee - Rentals United', 
      'Third Party Fee - Rentals United Fixed Price',
      'Third Party Fee - Rentals United RP'
    )
    AND plan_value > 0
  GROUP BY ALL
),
ru_per_opp AS (
  SELECT 
    o.opp_id,
    o.account_id,
    o.CloseDate,
    DATE_TRUNC(o.CloseDate, MONTH) AS close_month,
    rz.month,
    rz.plan_name,
    rz.plan_value,
    rz.quantity,
    rz.active_listings
  FROM opps o
  INNER JOIN ru_zuora rz
    ON rz.account_id = o.account_id
    AND o.addon = 'Rentals United'  
    AND rz.month >= DATE_TRUNC(o.CloseDate, MONTH) 
),
ru_zuora_first_month AS (
  SELECT 
    opp_id, 
    account_id,
    CloseDate,
    MIN(month) AS month,
    MIN_BY(plan_name, month) AS plan_name,
    MIN_BY(plan_value, month) AS plan_value,
    MIN_BY(active_listings, month) AS active_listings,
    MIN_BY(quantity, month) AS quantity
  FROM ru_per_opp
  GROUP BY opp_id, account_id, CloseDate
),

-- FORMATING

opp_addons AS (

SELECT 
  a.*, 
  b.month,
  gdh_listings AS listings,
  price,
  gdh_revenue AS revenue,
  'Based on monthly new opted-in listings * Price' AS note, 
  
FROM opps a
LEFT JOIN gdh b ON a.account_id = b.account_id AND a.close_month <= b.month
WHERE a.addon IN ('Guesty Distribution Hub','GDH')
AND DATE_DIFF(b.month, close_month, month) BETWEEN 0 AND 5

UNION ALL

SELECT 
  a.*, 
  COALESCE(c.month, a.close_month) AS month, 
  locks_listings AS listings,
  pricing AS plan_value,
  locks_revenue AS revenue,
  'Based on monthly new opted-in locks * Price' AS note, 
  
FROM opps a
LEFT JOIN locks c ON a.account_id = c.account_id 
WHERE a.addon = 'Guesty Locks'
AND (DATE_DIFF(c.month, close_month, month) BETWEEN 0 AND 5 OR c.month IS NULL)

UNION ALL

SELECT 
  a.*, 
  COALESCE(d.month, a.close_month) AS month, 
  dp_listings AS listings,
  50 as plan_value,
  dp_listings*50*1.2 as revenue, 
  'Based on monthly new opted-in listings * 50$ * 1.2' AS note, 

FROM opps a
LEFT JOIN dp d ON a.account_id = d.account_id -- AND a.close_month <= d.month
WHERE a.addon IN ('Damage Protection','Screen & Protect') 
AND (DATE_DIFF(d.month, close_month, month) BETWEEN 0 AND 5 OR d.month IS NULL)

UNION ALL

SELECT 
  a.*, 
  COALESCE(d.month, a.close_month) AS month, 
  sp_listings AS listings,
  50 as plan_value,
  sp_listings*50*1.2 as revenue, 
  'Based on monthly new opted-in listings * 50$ * 1.2' AS note, 

FROM opps a
LEFT JOIN sp d ON a.account_id = d.account_id -- AND a.close_month <= d.month
WHERE a.addon IN ('Damage Protection','Screen & Protect')
AND (DATE_DIFF(d.month, close_month, month) BETWEEN 0 AND 5 OR d.month IS NULL)

UNION ALL

SELECT 
  a.*, 
  d.month,
  dp_listings AS listings,
  10 as plan_value,
  dp_listings*10*1.2 as revenue, 
  'Not finalized, check if listings already opted-in' AS note, 

FROM opps a
LEFT JOIN dp d ON a.account_id = d.account_id AND a.close_month <= d.month
WHERE a.addon IN ('Upgrade Damage Protection')
AND DATE_DIFF(d.month, close_month, month) BETWEEN 0 AND 5

UNION ALL

SELECT 
  a.*, 
  s.month,
  sp_listings AS listings,
  10 as plan_value,
  sp_listings*10*1.2 as revenue, 
  'Not finalized, check if listings already opted-in' AS note, 

FROM opps a
LEFT JOIN sp s ON a.account_id = s.account_id AND a.close_month <= s.month
WHERE a.addon IN ('Upgrade Screen & Protect')
AND DATE_DIFF(s.month, close_month, month) BETWEEN 0 AND 5

UNION ALL

SELECT 
  a.*, 
  close_month AS month,
  null as listings,
  null as plan_value,
  fee_host_payout_usd_direct*0.2*0.07 as revenue, 
  'Direct GBV * 20% * 7%' AS note, 

FROM opps a
LEFT JOIN fr ON a.account_id = fr.account_id AND a.close_month = fr.month
WHERE a.addon IN ('Travel Protection')

UNION ALL

SELECT 
  a.*, 
  month, 
  listings,
  10 plan_value,
  10*COALESCE(listings, 0) revenue, 
  'Not finalized, assumption of 10$ per listings' AS note, 

FROM opps a
LEFT JOIN gv ON a.account_id = gv.account_id AND a.close_month <= gv.month
WHERE a.addon IN ('GuestVerify','GuestyVerify')
AND DATE_DIFF(gv.month, close_month, month) BETWEEN 0 AND 5

UNION ALL

SELECT 
  a.*, 
  COALESCE(month, close_month) AS month, 
  listings,
  2.5 plan_value,
  revenue, 
  '$2.5 * Average monthly booked nights per listing * added listings' AS note,  

FROM opps a
LEFT JOIN gl ON a.account_id = gl.account_id AND a.close_month <= gl.month
WHERE a.addon IN ('Guesty Liability','Liability')
AND (DATE_DIFF(gl.month, close_month, month) BETWEEN 0 AND 5 OR gl.month IS NULL)

UNION ALL

SELECT 
  a.*, 
  DATE_TRUNC(k.date,month) AS month,
  k.listings AS listings,
  null AS plan_value,
  k.kpi AS revenue,
  CONCAT('New GP Assigned Listings (',k.months_from_close ,' Months After First Assigned Listing) * 12 Months Average Processed Reservations Volume * ', k.revshare*100,'% (Rev Share by Geo)') AS note,
  -- fee_host_payout_usd*0.00325*0.33 AS revenue, 
  -- 'One-time MRR estimation: GBV * 33% (Direct Reservations) * 0.325%' AS note, 
  
FROM opps a
LEFT JOIN gp_kpi k ON k.account_id = a.account_id AND k.opp_id = a.opp_id
-- LEFT JOIN gp e ON a.account_id = e.account_id AND a.addon = e.addon 
LEFT JOIN fr ON a.account_id = fr.account_id AND a.close_month = fr.month
WHERE a.addon = 'GuestyPay'
AND k.kpi > 0

UNION ALL

SELECT 
  a.*, 
  a.close_month as month,
  null as listings,
  null plan_value,
  revenue, 
  'One-time MRR estimation: GBV * 33% * 0.2%' AS note, 

  
FROM opps a
LEFT JOIN gp_protect f ON a.account_id = f.account_id AND a.addon = f.addon AND a.close_month = f.month
WHERE a.addon = 'GuestyPay Protect'

UNION ALL

SELECT 
  a.*, 
  a.close_month as month,
  null as listings,
  accepted_amount as plan_value, 
  revenue, 
  'One-time MRR estimation: Accepted Amount/12 * 3%' AS note,

FROM opps a
LEFT JOIN gcapital g ON a.account_id = g.account_id AND a.addon = g.addon 
WHERE a.addon = 'Guesty Capital'

UNION ALL

SELECT 
  a.*, 
  b.month, 
  b.listings, 
  plan_value, 
  CASE
   WHEN plan_name = 'PriceOptimizer Commission Based (On Check-in)' THEN listings*avg_fee_host_payout_usd*plan_value*3/100
   WHEN plan_name = 'PriceOptimizer Fixed Per Listing' THEN b.listings*plan_value*3
   WHEN plan_name = 'PriceOptimizer Fixed Per Month' THEN plan_value*3
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on monthly new opted-in listings and Zuora Subscription (', plan_name, ', Plan value: ', plan_value, ' * 3)') END AS note, 

FROM opps a
LEFT JOIN gpo_uniq b ON a.account_id = b.account_id AND a.close_month <= b.month
LEFT JOIN gpo_zuora c ON b.account_id = c.account_id AND b.month = c.month - INTERVAL 1 MONTH
LEFT JOIN fr ON b.account_id = fr.account_id AND b.month = fr.month
WHERE a.addon = 'GPO Upsell'
AND DATE_DIFF(b.month, close_month, month) BETWEEN 0 AND 5

UNION ALL

SELECT 
  a.*, 
  first_month AS month,
  active_listings as listings,
  plan_value,
  CASE
   WHEN plan_name IN ('Website RP', 'Advanced Website') THEN plan_value + active_listings*2
   WHEN plan_name = 'Advance Website Plus' THEN plan_value
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on active listings and Zuora Subscription (', plan_name, ', Plan value: ', plan_value, '$ + ', active_listings, '*2$)') END AS note, 

FROM opps a
JOIN website_first_month b ON a.account_id = b.account_id AND a.opp_id = b.opp_id AND a.close_month <= b.first_month
WHERE a.addon IN ('Advanced Booking Website', 'Advanced Website Plus')

UNION ALL

SELECT 
  a.*, 
  b.month,
  active_listings as listings,
  plan_value,
  CASE
   WHEN plan_name IN ('GCS (24/7) RP per reservation') THEN plan_value*fee_host_payout_usd/100
   WHEN plan_name IN ('GCS (24/7) RP', 'Off Hours GCS RP', 'GCS Responding to Reviews RP')  THEN plan_value*quantity
   WHEN plan_name IN ('GCS (24/7) Fixed Price') THEN plan_value
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on Zuora Subscription (', plan_name, ', Plan value: ', plan_value, ')') END AS note, 

FROM opps a
JOIN gcs_first_month b ON a.account_id = b.account_id AND a.close_month <= b.month
LEFT JOIN fr ON b.account_id = fr.account_id AND b.month = fr.month
WHERE a.addon IN ('GCS Upgrade','Off-Hours GCS')

UNION ALL

SELECT 
  a.*, 
  month,
  quantity as listings,
  plan_value,
  CASE
   WHEN plan_name IN ('Advanced Analytics Level 2 RP','Advanced Analytics Level 1 RP') THEN plan_value*b.active_listings
   WHEN plan_name IN ('Advanced Analytics Level 2 flat fee','Advanced Analytics Level 1 flat fee','Advanced Analytics Additional Seats') THEN plan_value
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on Zuora Subscription (', plan_name, ', Plan value: ', plan_value, ')') END AS note, 

FROM opps a
JOIN aa_first_month b ON a.account_id = b.account_id AND a.opp_id = b.opp_id AND a.close_month <= b.month
WHERE a.addon IN ('AA Upsell')

UNION ALL

SELECT 
  a.*, 
  month,
  quantity as listings,
  plan_value,
  CASE
   WHEN plan_name = 'Accounting Module RP' THEN plan_value*b.active_listings
   WHEN plan_name = 'Accounting Module (fixed) RP' THEN plan_value
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on Zuora Subscription (', plan_name, ', Plan value: ', plan_value, ')') END AS note, 

FROM opps a
JOIN accounting_first_month b ON a.account_id = b.account_id AND a.opp_id = b.opp_id AND a.close_month <= b.month
WHERE a.addon IN ('Accounting Upsell')

UNION ALL

SELECT 
  a.*, 
  month,
  quantity as listings,
  plan_value,
  CASE
   WHEN plan_name IN ('Third Party Fee - Rentals United', 'Third Party Fee - Rentals United RP') THEN plan_value*b.active_listings
   WHEN plan_name = 'Third Party Fee - Rentals United Fixed Price' THEN plan_value
  END AS revenue, 
  CASE WHEN plan_value IS NULL THEN 'Missing Zuora Subscription' ELSE CONCAT('Based on Zuora Subscription (', plan_name, ', Plan value: ', plan_value, ')')  END AS note, 

FROM opps a
JOIN accounting_first_month b ON a.account_id = b.account_id AND a.opp_id = b.opp_id AND a.close_month <= b.month
WHERE a.addon IN ('Rentals United')
),

csm_type AS (
SELECT * FROM `csm.csm_org`
)

SELECT DISTINCT
  dm.*,
  manager,
  a.* EXCEPT (account_id, revenue),
  fee_host_payout_usd AS avg_monthly_gbv,
  COALESCE(a.revenue, 0) AS revenue,

FROM opp_addons a
JOIN dm ON a.account_id = dm.account_id
LEFT JOIN fr ON a.account_id = fr.account_id AND a.month = fr.month
LEFT JOIN csm_type ON dm.csm = csm_type.csm 
QUALIFY CloseDate = MAX(CloseDate) OVER (PARTITION BY account_id,addon,month)
```

## Documented columns (0 of 15)
_No columns documented yet in the BI dictionary for this table._
