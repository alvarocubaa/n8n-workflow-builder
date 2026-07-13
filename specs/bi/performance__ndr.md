# BI mart — `guesty-data.performance.ndr`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> Source last refreshed 2026-04-19 (BI-owned) — verify it hasn't drifted before relying on critical logic.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2022-01-01', '2023-01-01', '2025-01-01'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `guesty-data.performance.ndr` AS 

with 
hq AS (
SELECT 
  account_id, 
  CASE WHEN org_id = 'bd450ccb-134b-4c6e-b9c5-74ffdc6f9785' THEN '61a17702-a24e-4078-9609-3c9a3e1cf794' ELSE org_id END AS org_id, -- Avari as Casago
  package, 
FROM `guesty_analytics.hq_account_revenue_allocation`
WHERE package = 'enterprise'
),
additional_fees AS (
SELECT month,
       COALESCE(hq.org_id, a.account_id) AS account_id, 
       SUM(COALESCE(etf_revenue,0)) as etf_revenue,
       SUM(COALESCE(app_fee_revenue,0)) as gateway_fee_revenue,
       SUM(COALESCE(stripe_revenue,0)) as stripe_revshare_revenue,
       SUM(COALESCE(gpay_us_revenue_net,0) + COALESCE(gpay_aus_revenue,0) + COALESCE(gpay_uk_revenue_net,0) + COALESCE(gpay_canada_revenue,0)) as gpay_revenue_net,
       SUM(COALESCE(gpay_us_revenue_gross,0) + COALESCE(gpay_aus_revenue,0) + COALESCE(gpay_uk_revenue,0) + COALESCE(gpay_canada_revenue,0)) as gpay_revenue_gross,
       SUM(COALESCE(ota_revenue,0) + COALESCE(marketplace_revenue,0)) as partnerships_revenue,
       --add Liability + Capital per account revenue--
FROM `guesty-data.revenue_model_2025.addons_revenue` a
LEFT JOIN hq ON a.account_id = hq.account_id
WHERE month >= '2022-01-01'
GROUP BY ALL
),

ndr_adjustments AS (
SELECT month,
       account_id,
       mu_pms_amount,
       mu_addons_amount,
       negative_pms_amount,
       negative_addons_amount,
       mu_listings,
       excluded_listings,
       excluded_pms_amount,
       excluded_addons_amount
FROM `guesty-data.performance.ndr_adjustments`
),

credits AS (
SELECT month,
       account_id,
       credit_amount as credits_used,
       credit_given_amount as credits_given,
FROM `guesty-data.guesty_analytics.credits_refunds`
),
this_year_raw AS (
SELECT DATE_TRUNC(partition_date,month) as month, 
       COALESCE(hq.org_id, a.account_id) AS account_id, 
       CASE WHEN hq.account_id IS NOT NULL THEN 'Enterprise' ELSE a.account_segmentation END AS account_segmentation,
       a.is_churn,
       a.paid_account,
       
       COALESCE(hq.package, a.package) AS package,
      --  case when  COALESCE(software_fixed_monthly_revenue,0) > COALESCE(software_reservation_commission_revenue,0) then 'fixed'
      --       when   COALESCE(software_fixed_monthly_revenue,0) < COALESCE(software_reservation_commission_revenue,0) then 'commission'
      --       else 'other' end as grp,
      MIN(a.min_first_paid_month) AS min_first_paid_month, 
      SUM(COALESCE(onboarding_total_revenue,0)) AS onboarding_revenue,

      SUM(paid_listings_total_new - COALESCE(excluded_listings,0)) AS paid_listings_total,

      SUM(software_revenue_total) AS software_revenue_total,

      SUM(software_reservation_commission_revenue) AS software_reservation_commission_revenue,

      SUM(software_revenue_total - software_reservation_commission_revenue) AS software_fixed_monthly_revenue,

      SUM(paid_listings_fixed_monthly_sw) AS paid_listings_fixed_monthly_sw,

      SUM(paid_listings_reservation_commission_sw) AS paid_listings_reservation_commission_sw,

      SUM(
        COALESCE(minimum_monthly_fee_revenue,0) 
      + COALESCE(other_revenue,0) 
      + COALESCE(listing_activation_fee_revenue,0)) AS other_revenue,

      SUM(
        software_revenue_total 
      + COALESCE(minimum_monthly_fee_revenue,0) 
      + COALESCE(other_revenue,0) 
      + COALESCE(listing_activation_fee_revenue,0)) AS pms_revenue,

      SUM(COALESCE(minimum_monthly_fee_revenue,0)) AS mmf_revenue,

      SUM(COALESCE(accounting_revenue,0)) AS accounting_revenue,

      SUM(COALESCE(advanced_analytics_revenue,0)) AS aa_revenue,

      SUM(COALESCE(guesty_connect_revenue,0)) AS guesty_connect_revenue,

      SUM(COALESCE(autocomply_revenue,0)) AS autocomply_revenue,

      SUM(
        COALESCE(gcs_revenue_total,0)
      + COALESCE(minimum_monthly_fee_gcs_revenue,0)
      + COALESCE(gcs_upsell_revenue,0)) AS gcs_revenue,

      SUM(
        COALESCE(insurance_revenue,0)
      + COALESCE(guesty_damage_protection_revenue,0)) AS insurance_revenue,

      SUM(COALESCE(smart_locks_revenue,0)) AS smartlock_revenue,

      SUM(COALESCE(price_optimizer_revenue,0)) AS gpo_revenue,

      SUM(
        COALESCE(gdh_revenue,0)
      + COALESCE(rentals_united_revenue,0)) AS gdh_revenue,

      SUM(
        COALESCE(website_revenue,0)
      + COALESCE(website_plus_revenue,0)) AS website_revenue,

      SUM(COALESCE(replayai_revenue,0)) AS replyai_revenue,

      SUM(COALESCE(g.gateway_fee_revenue,0)) AS gateway_fee_revenue,

      SUM(COALESCE(g.stripe_revshare_revenue,0)) AS stripe_revshare_revenue,

      SUM(COALESCE(g.gpay_revenue_net,0)) AS gpay_revenue_net,

      SUM(COALESCE(g.gpay_revenue_gross,0)) AS gpay_revenue_gross,

      SUM(COALESCE(g.partnerships_revenue,0)) AS partnerships_revenue,

      SUM(
        COALESCE(accounting_revenue,0)
      + COALESCE(advanced_analytics_revenue,0)
      + COALESCE(gcs_revenue_total,0)
      + COALESCE(minimum_monthly_fee_gcs_revenue,0)
      + COALESCE(gcs_upsell_revenue,0)
      + COALESCE(insurance_revenue,0)
      + COALESCE(guesty_damage_protection_revenue,0)
      + COALESCE(smart_locks_revenue,0)
      + COALESCE(price_optimizer_revenue,0)
      + COALESCE(gdh_revenue,0)
      + COALESCE(rentals_united_revenue,0)
      + COALESCE(website_revenue,0)
      + COALESCE(website_plus_revenue,0)
      + COALESCE(replayai_revenue,0)
      + COALESCE(travel_insurance_revenue,0)
      + COALESCE(guesty_connect_revenue,0)
      + COALESCE(autocomply_revenue,0)) AS addons_revenue,

      SUM(
        COALESCE(g.gateway_fee_revenue,0)
      + COALESCE(g.stripe_revshare_revenue,0)
      + COALESCE(guestypay_protect_revenue,0)
      + COALESCE(g.gpay_revenue_net,0)) AS payments_revenue_net,

      SUM(
        COALESCE(g.gateway_fee_revenue,0)
      + COALESCE(g.stripe_revshare_revenue,0)
      + COALESCE(guestypay_protect_revenue,0)
      + COALESCE(g.gpay_revenue_gross,0)) AS payments_revenue_gross,

      SUM(COALESCE(credits_used,0)) AS credits_used,

      SUM(COALESCE(credits_given,0)) AS credits_given,

      SUM(COALESCE(excluded_pms_amount,0)) AS excluded_pms_amount,

      SUM(COALESCE(excluded_addons_amount,0)) AS excluded_addons_amount,

      SUM(COALESCE(travel_insurance_revenue,0)) AS travel_insurance_revenue

FROM `guesty-data.guesty_analytics.accounts_summary` a
LEFT JOIN additional_fees g ON a.account_id = g.account_id AND DATE_TRUNC(a.partition_date,month) = g.month
LEFT JOIN credits c ON a.account_id = c.account_id AND DATE_TRUNC(a.partition_date,month) = c.month
LEFT JOIN ndr_adjustments n ON a.account_id = n.account_id AND DATE_TRUNC(a.partition_date,month) = n.month and n.month >= '2025-01-01'
LEFT JOIN hq ON a.account_id = hq.account_id
WHERE partition_date BETWEEN '2023-01-01' AND CURRENT_DATE()
AND (is_eom IS TRUE OR partition_date = CURRENT_DATE())
AND account_first_paid IS NOT NULL
GROUP BY ALL
),

current_year as (
SELECT 
a.month,
a.account_id,
a.is_churn,
a.paid_account,
package,
-- grp,
pms_revenue + addons_revenue + payments_revenue_gross  - excluded_pms_amount - excluded_addons_amount  as monthly_recurring_revenue,
paid_listings_total,
software_revenue_total,
software_reservation_commission_revenue,
software_fixed_monthly_revenue  - excluded_pms_amount as software_fixed_monthly_revenue,
other_revenue,
pms_revenue - excluded_pms_amount as pms_revenue,
mmf_revenue,
paid_listings_fixed_monthly_sw,
paid_listings_reservation_commission_sw,
gcs_revenue,
aa_revenue,
accounting_revenue,
guesty_connect_revenue,
autocomply_revenue,
insurance_revenue,
smartlock_revenue,
gdh_revenue,
gpo_revenue,
website_revenue,
partnerships_revenue,
gpay_revenue_net,
gpay_revenue_gross,
stripe_revshare_revenue,
gateway_fee_revenue,
payments_revenue_net,
payments_revenue_gross,
replyai_revenue,
addons_revenue - excluded_addons_amount as addons_revenue,
- excluded_addons_amount as addons_adjustment,
credits_used,
credits_given,
from this_year_raw as a
WHERE min_first_paid_month <= DATE_SUB(month, INTERVAL 12 MONTH)
),

previous_year_raw AS (
SELECT DATE_TRUNC(partition_date,month) as month, 
       COALESCE(hq.org_id, a.account_id) AS account_id, 
       CASE WHEN hq.account_id IS NOT NULL THEN 'Enterprise' ELSE a.account_segmentation END AS account_segmentation,
       a.is_churn,
       a.paid_account,
       
       COALESCE(hq.package, a.package) AS package,
      --  case when  COALESCE(software_fixed_monthly_revenue,0) > COALESCE(software_reservation_commission_revenue,0) then 'fixed'
      --       when   COALESCE(software_fixed_monthly_revenue,0) < COALESCE(software_reservation_commission_revenue,0) then 'commission'
      --       else 'other' end as grp,
      MIN(a.min_first_paid_month) AS min_first_paid_month, 
       
  SUM(COALESCE(onboarding_total_revenue,0)) AS onboarding_revenue,

SUM(paid_listings_total_new - COALESCE(mu_listings,0) - COALESCE(excluded_listings,0)) AS paid_listings_total,

SUM(software_revenue_total) AS software_revenue_total,

SUM(software_reservation_commission_revenue) AS software_reservation_commission_revenue,

SUM(software_revenue_total - software_reservation_commission_revenue) AS software_fixed_monthly_revenue,

SUM(paid_listings_fixed_monthly_sw) AS paid_listings_fixed_monthly_sw,

SUM(paid_listings_reservation_commission_sw) AS paid_listings_reservation_commission_sw,

SUM(
  COALESCE(minimum_monthly_fee_revenue,0)
+ COALESCE(other_revenue,0)
+ COALESCE(listing_activation_fee_revenue,0)
) AS other_revenue,

SUM(
  software_revenue_total
+ COALESCE(minimum_monthly_fee_revenue,0)
+ COALESCE(other_revenue,0)
+ COALESCE(listing_activation_fee_revenue,0)
) AS pms_revenue,

SUM(COALESCE(minimum_monthly_fee_revenue,0)) AS mmf_revenue,

SUM(COALESCE(accounting_revenue,0)) AS accounting_revenue,

SUM(COALESCE(advanced_analytics_revenue,0)) AS aa_revenue,

SUM(COALESCE(guesty_connect_revenue,0)) AS guesty_connect_revenue,

SUM(COALESCE(autocomply_revenue,0)) AS autocomply_revenue,

SUM(
  COALESCE(gcs_revenue_total,0)
+ COALESCE(minimum_monthly_fee_gcs_revenue,0)
+ COALESCE(gcs_upsell_revenue,0)
) AS gcs_revenue,

SUM(
  COALESCE(insurance_revenue,0)
+ COALESCE(guesty_damage_protection_revenue,0)
) AS insurance_revenue,

SUM(COALESCE(smart_locks_revenue,0)) AS smartlock_revenue,

SUM(COALESCE(price_optimizer_revenue,0)) AS gpo_revenue,

SUM(
  COALESCE(gdh_revenue,0)
+ COALESCE(rentals_united_revenue,0)
) AS gdh_revenue,

SUM(
  COALESCE(website_revenue,0)
+ COALESCE(website_plus_revenue,0)
) AS website_revenue,

SUM(COALESCE(replayai_revenue,0)) AS replyai_revenue,

SUM(COALESCE(g.gateway_fee_revenue,0)) AS gateway_fee_revenue,

SUM(COALESCE(g.stripe_revshare_revenue,0)) AS stripe_revshare_revenue,

SUM(COALESCE(g.gpay_revenue_net,0)) AS gpay_revenue_net,

SUM(COALESCE(g.gpay_revenue_gross,0)) AS gpay_revenue_gross,

SUM(COALESCE(g.partnerships_revenue,0)) AS partnerships_revenue,

SUM(
  COALESCE(accounting_revenue,0)
+ COALESCE(advanced_analytics_revenue,0)
+ COALESCE(gcs_revenue_total,0)
+ COALESCE(minimum_monthly_fee_gcs_revenue,0)
+ COALESCE(gcs_upsell_revenue,0)
+ COALESCE(insurance_revenue,0)
+ COALESCE(guesty_damage_protection_revenue,0)
+ COALESCE(smart_locks_revenue,0)
+ COALESCE(price_optimizer_revenue,0)
+ COALESCE(gdh_revenue,0)
+ COALESCE(rentals_united_revenue,0)
+ COALESCE(website_revenue,0)
+ COALESCE(website_plus_revenue,0)
+ COALESCE(replayai_revenue,0)
+ COALESCE(travel_insurance_revenue,0)
+ COALESCE(guesty_connect_revenue,0)
+ COALESCE(autocomply_revenue,0)
) AS addons_revenue,

SUM(
  COALESCE(g.gateway_fee_revenue,0)
+ COALESCE(g.stripe_revshare_revenue,0)
+ COALESCE(guestypay_protect_revenue,0)
+ COALESCE(g.gpay_revenue_net,0)
) AS payments_revenue_net,

SUM(
  COALESCE(g.gateway_fee_revenue,0)
+ COALESCE(g.stripe_revshare_revenue,0)
+ COALESCE(guestypay_protect_revenue,0)
+ COALESCE(g.gpay_revenue_gross,0)
) AS payments_revenue_gross,

SUM(COALESCE(n.mu_pms_amount,0)) AS mu_pms_amount,
SUM(COALESCE(n.mu_addons_amount,0)) AS mu_addons_amount,
SUM(COALESCE(n.negative_pms_amount,0)) AS negative_pms_amount,
SUM(COALESCE(n.negative_addons_amount,0)) AS negative_addons_amount,

SUM(COALESCE(credits_used,0)) AS credits_used,
SUM(COALESCE(credits_given,0)) AS credits_given,

SUM(COALESCE(excluded_pms_amount,0)) AS excluded_pms_amount,
SUM(COALESCE(excluded_addons_amount,0)) AS excluded_addons_amount,

SUM(COALESCE(travel_insurance_revenue,0)) AS travel_insurance_revenue


FROM `guesty-data.guesty_analytics.accounts_summary` a
LEFT JOIN additional_fees g ON a.account_id = g.account_id AND DATE_TRUNC(a.partition_date,month) = g.month
LEFT JOIN ndr_adjustments n ON a.account_id = n.account_id AND DATE_TRUNC(a.partition_date,month) = n.month
LEFT JOIN credits c ON a.account_id = c.account_id AND DATE_TRUNC(a.partition_date,month) = c.month
LEFT JOIN hq ON a.account_id = hq.account_id
WHERE partition_date BETWEEN '2022-01-01' AND DATE_SUB(LAST_DAY(CURRENT_DATE()-1,MONTH),INTERVAL 1 YEAR)
AND (is_eom IS TRUE)
GROUP BY ALL
),

previous_year as (
select 
a.month,
date_add(a.month, interval 12 month) as month_for_join,
a.account_id,
a.account_segmentation,
a.is_churn,
a.paid_account,
package,
-- grp,
pms_revenue + addons_revenue + payments_revenue_gross - mu_pms_amount - mu_addons_amount - negative_pms_amount - negative_addons_amount -excluded_pms_amount - excluded_addons_amount as monthly_recurring_revenue,
paid_listings_total,
software_revenue_total,
software_reservation_commission_revenue,
software_fixed_monthly_revenue - mu_pms_amount - negative_pms_amount -excluded_pms_amount as software_fixed_monthly_revenue,
other_revenue,
pms_revenue - mu_pms_amount - negative_pms_amount - excluded_pms_amount  as pms_revenue,
mmf_revenue,
paid_listings_fixed_monthly_sw,
paid_listings_reservation_commission_sw,
gcs_revenue,
aa_revenue,
accounting_revenue,
guesty_connect_revenue,
autocomply_revenue,
insurance_revenue,
smartlock_revenue,
gdh_revenue,
gpo_revenue,
website_revenue,
partnerships_revenue,
gpay_revenue_net,
gpay_revenue_gross,
stripe_revshare_revenue,
gateway_fee_revenue,
payments_revenue_net,
payments_revenue_gross,
replyai_revenue,
addons_revenue - mu_addons_amount - negative_addons_amount - excluded_addons_amount as addons_revenue,
- COALESCE(mu_addons_amount,0) - COALESCE(negative_addons_amount,0) - excluded_addons_amount as addons_adjustment,
credits_used,
credits_given,
from previous_year_raw as a
where is_churn is false 
-- and pms_revenue > 0 
),

pre_calc AS (
SELECT 
    a.month_for_join,
    a.account_id as previous_account_id,
    a.package as type,
    a.account_segmentation,
    a.account_segmentation as previous_segmentation,
    -- a.grp as previous_grp,
    -- b.grp as current_grp,
    a.package as previous_package,
    b.package as current_package,		
    if(b.monthly_recurring_revenue > 0,b.account_id,null) as current_account_id,
    a.monthly_recurring_revenue as previous_monthly_reccuring_revenue,
    b.monthly_recurring_revenue as current_monthly_reccuring_revenue,
    a.paid_listings_total as previous_paid_listings,
    b.paid_listings_total as current_paid_listings,
    a.pms_revenue as previous_pms_revenue,
    b.pms_revenue as current_pms_revenue,
    a.monthly_recurring_revenue - a.pms_revenue as previous_non_pms_revenue,
    b.monthly_recurring_revenue - b.pms_revenue as current_non_pms_revenue,
    a.software_reservation_commission_revenue as previous_sw_commission_revenue,
    a.software_fixed_monthly_revenue as previous_sw_fixed_revenue,
    b.software_reservation_commission_revenue as current_sw_commission_revenue,
    b.software_fixed_monthly_revenue as current_sw_fixed_revenue,
    a.paid_listings_fixed_monthly_sw as previous_paid_listings_fixed_sw,
    a.paid_listings_reservation_commission_sw as previous_paid_listings_commission_sw,
    b.paid_listings_fixed_monthly_sw as current_paid_listings_fixed_sw,
    b.paid_listings_reservation_commission_sw as current_paid_listings_commission_sw,
    case when b.is_churn is true and b.paid_account is false then 'Churn'
        when coalesce(b.monthly_recurring_revenue,0) > coalesce(a.monthly_recurring_revenue,0) then 'Positive Expansion'
        when coalesce(b.monthly_recurring_revenue,0) < coalesce(a.monthly_recurring_revenue,0) then 'Negative Expansion'
        when coalesce(b.monthly_recurring_revenue,0) = coalesce(a.monthly_recurring_revenue,0) then 'Same'
        else 'Other' end as types_monthly_revenue,
     case when b.is_churn is true and b.paid_account is false then 'Churn'
        when coalesce(b.paid_listings_total,0) > coalesce(a.paid_listings_total,0) then 'Positive Expansion'
        when coalesce(b.paid_listings_total,0) < coalesce(a.paid_listings_total,0) then 'Negative Expansion'
        when coalesce(b.paid_listings_total,0) = coalesce(a.paid_listings_total,0) then 'Same'
        else 'Other' end as types_paid_listings,
    a.gcs_revenue as previous_gcs_revenue,
    a.aa_revenue as previous_aa_revenue,
    a.accounting_revenue as previous_accounting_revenue,
    a.mmf_revenue as previous_mmf_revenue,
    a.other_revenue as previous_other_revenue,
    a.insurance_revenue as previous_insurance_revenue,
    a.gateway_fee_revenue as previous_gateway_revenue, 
    a.smartlock_revenue as previous_smartlock_revenue,
    a.gdh_revenue as previous_gdh_revenue,
    a.gpo_revenue as previous_gpo_revenue,
    a.website_revenue as previous_website_revenue,
    b.gcs_revenue as current_gcs_revenue,
    b.aa_revenue as current_aa_revenue,
    b.accounting_revenue as current_accounting_revenue,
    b.mmf_revenue as current_mmf_revenue,
    b.other_revenue as current_other_revenue,
    b.insurance_revenue as current_insurance_revenue,
    b.gateway_fee_revenue as current_gateway_revenue, 
    b.smartlock_revenue as current_smartlock_revenue,
    b.gdh_revenue as current_gdh_revenue,
    b.gpo_revenue as current_gpo_revenue,
    b.website_revenue as current_website_revenue,
    a.partnerships_revenue as previous_marketplace_revenue,
    b.partnerships_revenue as current_marketplace_revenue,
    a.gpay_revenue_gross as previous_guestypay_revenue,
    b.gpay_revenue_gross as current_guestypay_revenue, 
    a.stripe_revshare_revenue as previous_stripe_revshare_revenue,
    b.stripe_revshare_revenue as current_stripe_revshare_revenue,
    a.payments_revenue_gross as previous_payments_revenue,
    b.payments_revenue_gross as current_payments_revenue,
    a.addons_revenue as previous_addons_revenue,
    b.addons_revenue as current_addons_revenue,
    a.replyai_revenue as previous_replyai_revenue,
    b.replyai_revenue as current_replyai_revenue,
    a.guesty_connect_revenue as previous_guesty_connect_revenue,
    b.guesty_connect_revenue as current_guesty_connect_revenue,
    a.autocomply_revenue as previous_autocomply_revenue,
    b.autocomply_revenue as current_autocomply_revenue,
    COALESCE(a.addons_adjustment,0) as previous_addons_adjustment,
    COALESCE(b.addons_adjustment,0) as current_addons_adjustment,
    a.credits_used as previous_credits_used,
    a.credits_given as previous_credits_given,
    b.credits_used as current_credits_used,
    b.credits_given as current_credits_given,
from previous_year as a 
left join current_year as b 
on a.account_id = b.account_id and a.month_for_join = b.month
),

final AS (
select  month_for_join as month, 
        type,
        -- case when previous_grp = 'fixed' and current_grp = 'commission' then 'Fixed->Commission'
        -- when previous_grp = 'fixed' then 'Fixed->Fixed'
        -- when previous_grp = 'commission' and current_grp = 'fixed' then 'Commission->Fixed'
        -- when previous_grp = 'commission' then 'Commission->Commission'
        -- when previous_grp = 'other' and current_grp = 'fixed' then 'Fixed->Fixed'
        -- when previous_grp = 'other' and current_grp = 'commission' then 'Commission->Commission'
        -- else 'other' end as grp,
        previous_account_id as account_id,
        current_account_id,
        previous_segmentation,
        types_monthly_revenue,
        types_paid_listings,
        sum(previous_monthly_reccuring_revenue) as previous_monthly_reccuring_revenue,
        sum(current_monthly_reccuring_revenue) as current_monthly_reccuring_revenue,
        SAFE_DIVIDE(sum(current_monthly_reccuring_revenue),sum(previous_monthly_reccuring_revenue)) as net_retention_monthly_revenue,

        --------- bridge revenue -----------
        SAFE_DIVIDE(sum(if(types_monthly_revenue = 'Churn',-previous_monthly_reccuring_revenue,0)),sum(previous_monthly_reccuring_revenue)) as churn_monthly_revenue_perc,
        SAFE_DIVIDE(sum(if(types_monthly_revenue = 'Positive Expansion',coalesce(current_monthly_reccuring_revenue,0) - coalesce(previous_monthly_reccuring_revenue,0),0)) , sum(previous_monthly_reccuring_revenue)) as positive_expansion_monthly_revenue_perc,
        SAFE_DIVIDE(sum(if(types_monthly_revenue = 'Negative Expansion',coalesce(current_monthly_reccuring_revenue,0) - coalesce(previous_monthly_reccuring_revenue,0),0)) , sum(previous_monthly_reccuring_revenue)) as negative_expansion_monthly_revenue_perc,

        -------- Paid Listings -------------
        sum(current_paid_listings) as current_paid_listings,
        sum(previous_paid_listings) as previous_paid_listings,
        safe_divide(sum(current_paid_listings) , sum(previous_paid_listings)) as net_retention_paid_listings,
        sum(if(types_paid_listings = 'Churn',-previous_paid_listings,0)) as churn_paid_listings,
        sum(if(types_paid_listings = 'Positive Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) as positive_expansion_paid_listings,
        sum(if(types_paid_listings = 'Negative Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) as negative_expansion_paid_listings,


        -------- bridge paid listings -------
        SAFE_DIVIDE(sum(if(types_paid_listings = 'Churn',-previous_paid_listings,0)),sum(previous_paid_listings)) as churn_paid_listings_rate,
        SAFE_DIVIDE(sum(if(types_paid_listings = 'Positive Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) , sum(previous_paid_listings)) as positive_expansion_paid_listings_rate,
        SAFE_DIVIDE(sum(if(types_paid_listings = 'Negative Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) , sum(previous_paid_listings)) as negative_expansion_paid_listings_rate,
        SAFE_DIVIDE(sum(if(types_paid_listings = 'Positive Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) , sum(previous_paid_listings)) + SAFE_DIVIDE(sum(if(types_paid_listings = 'Negative Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0)) , sum(previous_paid_listings)) as expansion_listings_rate,

        -------- ARPL -------------
        safe_divide(sum(current_monthly_reccuring_revenue) , sum(current_paid_listings)) as current_arpl,
        safe_divide(sum(previous_monthly_reccuring_revenue) , sum(previous_paid_listings)) as previous_arpl,
        safe_divide((safe_divide(sum(current_monthly_reccuring_revenue) , sum(current_paid_listings))) , safe_divide(sum(previous_monthly_reccuring_revenue) , sum(previous_paid_listings))) as net_retention_total_arpl,

        -------- PMS ARPL ---------
        safe_divide(sum(current_pms_revenue) , sum(current_paid_listings)) as current_arpl_pms,
        safe_divide(sum(previous_pms_revenue) , sum(previous_paid_listings)) as previous_arpl_pms,
        safe_divide((safe_divide(sum(current_pms_revenue) , sum(current_paid_listings))) , safe_divide(sum(previous_pms_revenue) , sum(previous_paid_listings))) as net_retention_pms_arpl,
        safe_divide((safe_divide(sum(current_non_pms_revenue) , sum(current_paid_listings))) , safe_divide(sum(previous_non_pms_revenue) , sum(previous_paid_listings))) as net_retention_non_pms_arpl,

        -- safe_divide(sum(current_software_revenue) + sum(current_mmf_revenue) , sum(current_paid_listings)) as current_arpl_pms,
        -- safe_divide(sum(previous_software_revenue) + sum(previous_mmf_revenue) , sum(previous_paid_listings)) as previous_arpl_pms,
        -- SAFE_DIVIDE(safe_divide(sum(current_software_revenue) + sum(current_mmf_revenue),sum(current_paid_listings)),safe_divide(sum(previous_software_revenue) + sum(previous_mmf_revenue) , sum(previous_paid_listings))) as net_retention_pms_arpl,


        -------- Accounts ---------
        COUNT(distinct CASE WHEN previous_pms_revenue > 0 THEN previous_account_id END) as previous_accounts,
        COUNT(distinct current_account_id) as current_accounts,
        SAFE_DIVIDE(COUNT(distinct current_account_id),COUNT(distinct previous_account_id)) as accounts_retention,

        sum(current_pms_revenue) as current_pms_revenue,
        sum(current_non_pms_revenue) as current_non_pms_revenue,
        sum(previous_pms_revenue) as previous_pms_revenue,
        sum(previous_non_pms_revenue) as previous_non_pms_revenue,

        SUM(current_sw_fixed_revenue) as current_sw_fixed_revenue,
        SUM(previous_sw_fixed_revenue) as previous_sw_fixed_revenue,
        SUM(current_sw_commission_revenue) as current_sw_commission_revenue,
        SUM(previous_sw_commission_revenue) as previous_sw_commission_revenue,

        SUM(current_paid_listings_fixed_sw) as current_paid_listings_fixed_sw,
        SUM(previous_paid_listings_fixed_sw) as previous_paid_listings_fixed_sw,
        SUM(current_paid_listings_commission_sw) as current_paid_listings_commission_sw,
        SUM(previous_paid_listings_commission_sw) as previous_paid_listings_commission_sw,

        --SW ARPL--
        SAFE_DIVIDE(SUM(current_sw_fixed_revenue),SUM(current_paid_listings_fixed_sw)) as current_arpl_fixed_sw,
        SAFE_DIVIDE(SUM(previous_sw_fixed_revenue),SUM(previous_paid_listings_fixed_sw)) as previous_arpl_fixed_sw,
        SAFE_DIVIDE(SUM(current_sw_commission_revenue),SUM(current_paid_listings_commission_sw)) as current_arpl_commission_sw,
        SAFE_DIVIDE(SUM(previous_sw_commission_revenue),SUM(previous_paid_listings_commission_sw)) as previous_arpl_commission_sw,

        SAFE_DIVIDE(SAFE_DIVIDE(SUM(current_sw_fixed_revenue),SUM(current_paid_listings_fixed_sw)),SAFE_DIVIDE(SUM(previous_sw_fixed_revenue),SUM(previous_paid_listings_fixed_sw))) as net_retention_sw_fixed_arpl,
        SAFE_DIVIDE(SAFE_DIVIDE(SUM(current_sw_commission_revenue),SUM(current_paid_listings_commission_sw)),SAFE_DIVIDE(SUM(previous_sw_commission_revenue),SUM(previous_paid_listings_commission_sw))) as net_retention_sw_commission_arpl,

        SAFE_DIVIDE(SUM(current_paid_listings_commission_sw),SUM(previous_paid_listings_commission_sw)) as listings_commission_retention,
        SAFE_DIVIDE(SUM(current_paid_listings_fixed_sw),SUM(previous_paid_listings_fixed_sw)) as listings_fixed_retention,

        ---Non-SW revenue---
        SUM(current_addons_revenue) as current_addons_revenue,
        SUM(previous_addons_revenue) as previous_addons_revenue,
        SUM(current_payments_revenue) as current_payments_revenue,
        SUM(previous_payments_revenue) as previous_payments_revenue,
        --Addons---
        SUM(current_gcs_revenue) as current_gcs_revenue,
        SUM(current_aa_revenue) as current_aa_revenue,
        SUM(current_accounting_revenue) as current_accounting_revenue,
        SUM(current_insurance_revenue) as current_dp_revenue,
        SUM(current_smartlock_revenue) as current_smartlock_revenue,
        SUM(current_gdh_revenue) as current_gdh_revenue,
        SUM(current_gpo_revenue) as current_gpo_revenue,
        SUM(current_website_revenue) as current_website_revenue,
        SUM(current_replyai_revenue) as current_replyai_revenue,
        SUM(current_guesty_connect_revenue) as current_guesty_connect_revenue,
        SUM(current_autocomply_revenue) as current_autocomply_revenue,
        SUM(current_addons_adjustment) as current_addons_adjustment,

        SUM(previous_gcs_revenue) as previous_gcs_revenue,
        SUM(previous_aa_revenue) as previous_aa_revenue,
        SUM(previous_accounting_revenue) as previous_accounting_revenue,
        SUM(previous_insurance_revenue) as previous_dp_revenue,
        SUM(previous_smartlock_revenue) as previous_smartlock_revenue,
        SUM(previous_gdh_revenue) as previous_gdh_revenue,
        SUM(previous_gpo_revenue) as previous_gpo_revenue,
        SUM(previous_website_revenue) as previous_website_revenue,
        SUM(previous_replyai_revenue) as previous_replyai_revenue,
        SUM(previous_guesty_connect_revenue) as previous_guesty_connect_revenue,
        SUM(previous_autocomply_revenue) as previous_autocomply_revenue,
        SUM(previous_addons_adjustment) as previous_addons_adjustment,

        ---credits---
        SUM(previous_credits_used) as previous_credits_used,
        SUM(previous_credits_given) as previous_credits_given,
        SUM(current_credits_used) as current_credits_used,
        SUM(current_credits_given) as current_credits_given,
FROM pre_calc
group by all
order by 1,2
)

SELECT a.*
FROM final a
left join `guesty-data.assistive_data.gs_accounts_to_exclude_for_ndr` b
on b.account_id = a.account_id 
WHERE month >= '2022-01-01' 
and (a.month not between COALESCE(b.exclude_start_yymm,'1900-01-01') and COALESCE(b.exclude_end_yymm,'1900-01-01'))
order by 1,2
```

## Documented columns (6 of 85)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `current_dp_revenue` | Revenue generated from Guesty Damage Protection (GDP) and insurance in the current period. | Aggregates revenue from Guesty Damage Protection and other insurance services for the current month. | `SUM(current_insurance_revenue) as current_dp_revenue` |
| `current_pms_revenue` | Current month's PMS revenue for the account. | Sums up the current PMS revenue, which includes software revenue, minimum monthly fees, other revenue, and listing activation fees, after subtracting any excluded PMS amounts. | `sum(current_pms_revenue) as current_pms_revenue` |
| `current_arpl_fixed_sw` | Average Revenue Per Listing (ARPL) for fixed software in the current period. | Calculates the current ARPL for fixed software by dividing the sum of current fixed software revenue by the sum of current paid listings for fixed software. | `SAFE_DIVIDE(SUM(current_sw_fixed_revenue),SUM(current_paid_listings_fixed_sw))` |
| `positive_expansion_paid_listings` | Increase in paid listings for accounts with positive expansion. | Calculates the sum of the difference between current and previous paid listings for accounts categorized as 'Positive Expansion' based on listing changes. | `sum(if(types_paid_listings = 'Positive Expansion',coalesce(current_paid_listings,0) - coalesce(previous_paid_listings,0),0))` |
| `previous_replyai_revenue` | ReplyAI revenue for the previous year. | Aggregates the sum of 'replayai_revenue' from the 'previous_year_raw' CTE, which is derived from 'guesty-data.guesty_analytics.accounts_summary' and 'additional_fees' for the corresponding month in the previous year. | `SUM(COALESCE(replayai_revenue,0)) AS replyai_revenue` |
| `previous_addons_revenue` | Total revenue from all add-on services for the previous year. | Aggregates revenue from various add-on services (e.g., GCS, AA, Accounting, Insurance, Smartlocks, GPO, Website, ReplyAI, Guesty Connect, Autocomply) for the previous year, after applying adjustments for manual uplifts, negative adjustments, and excluded amounts. | `SUM(   COALESCE(accounting_revenue,0) + COALESCE(advanced_analytics_revenue,0) + COALESCE(gcs_revenue_total,0) + COALESCE(minimum_monthly_fee_gcs_revenue,0) + COALESCE(gcs_upsell_revenue,0) + COALESCE(insurance_revenue,0) + COALESCE(guesty_damage_protection_revenue,0) + COALESCE(smart_locks_revenue,0) + COALESCE(price_optimizer_revenue,0) + COALESCE(gdh_revenue,0) + COALESCE(rentals_united_revenue,0) + COALESCE(website_revenue,0) + COALESCE(website_plus_revenue,0) + COALESCE(replayai_revenue,0) + COALESCE(travel_insurance_revenue,0) + COALESCE(guesty_connect_revenue,0) + COALESCE(autocomply_revenue,0) ) - mu_addons_amount - negative_addons_amount - excluded_addons_amount` |
