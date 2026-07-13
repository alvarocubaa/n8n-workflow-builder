# BI mart — `guesty-data.ops_kpi.new_cs_kpis_2026`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> Source last refreshed 2026-04-19 (BI-owned) — verify it hasn't drifted before relying on critical logic.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2024-10-01', '2026-02-01'. These will age out — surface them to the user for confirmation instead of copying blindly.

## What this table is
This script aggregates various KPI metrics for Customer Success Managers (CSMs) and Business Process Managers (BPMs). It first identifies all relevant reps and their roles from multiple KPI sources and Salesforce user data. It then calculates churn, silent accounts, EBRs, NDR, and MRR vs. Expected MRR. It also computes accelerator metrics like listings for damage protection, GPO upsells, and counts of GuestyPay and Ultimate plan logos. Finally, it joins these metrics and applies complex conditional logic based on rep type to calculate individual KPI scores and a final 'rep_achievement' score.

**Grain:** One row per rep per month.

**Upstream sources:** ops_kpi.mrr_growth, ops_kpi.pms_mrr, ops_kpi.churn, ops_kpi.silent_accounts, ops_kpi.ebrs, ops_kpi.addons_mrr, salesforce.sf_users, csm.gs_sf_user_role_mapping, zuora_silver.subscription, zuora_silver.account, guesty_analytics.hq_overview, guesty_analytics.dim_accounts, performance.ndr, csm.csm_churn_report, salesforce.sf_account, salesforce.sf_opportunity, guesty_analytics.accounts_summary

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `ops_kpi.new_cs_kpis_2026` AS

WITH

pop_pre AS (
SELECT DISTINCT 
       p.month, 
       p.rep, 
       p.type, 
       u.UserRoleId AS rep_role, 
       CASE WHEN p.rep = 'Guesty Support' THEN 'Juan Villegas' ELSE u2.Name END AS manager, 
       u2.UserRoleId AS manager_role
      --  manager, csm_role_type
FROM (
SELECT DISTINCT 
       month, csm AS rep, 'CSM' AS type,
      --  manager, csm_role_type
FROM `ops_kpi.mrr_growth`

UNION ALL

SELECT month, csm AS rep, 'CSM' AS type,
FROM `ops_kpi.pms_mrr`
WHERE LOWER(plan_name) LIKE '%ultimate%'
  AND LOWER(pre_plan_name) NOT LIKE '%ultimate%'
  AND mrr_change > 0

UNION ALL

SELECT DISTINCT 
       month, csm AS rep, 'CSM' AS type,
      --  manager, csm_role_type
FROM `ops_kpi.churn`

UNION ALL

SELECT DISTINCT 
       month, csm AS rep, 'CSM' AS type,
      --  manager, csm_role_type
FROM `ops_kpi.silent_accounts`

UNION ALL

SELECT DISTINCT 
       month, csm AS rep, 'CSM' AS type,
      --  manager, csm_role_type
FROM `ops_kpi.ebrs`

UNION ALL

SELECT DISTINCT
       month, csm AS rep, 'CSM' AS type,
      --  STRING(NULL) AS manager, 'BPM' AS csm_role_type
FROM `ops_kpi.addons_mrr`

UNION ALL

SELECT DISTINCT
       month, Opportunity_Owner AS rep, 'BPM' AS type,
      --  STRING(NULL) AS manager, 'BPM' AS csm_role_type
FROM `ops_kpi.addons_mrr`
WHERE opportunity_Owner != 'Guesty Support'

UNION ALL

SELECT month, Opportunity_Owner AS rep, 'BPM' AS type,
FROM `ops_kpi.pms_mrr`
WHERE LOWER(plan_name) LIKE '%ultimate%'
  AND LOWER(pre_plan_name) NOT LIKE '%ultimate%'
  AND mrr_change > 0

) p
LEFT JOIN `salesforce.sf_users` u
  ON u.Name = p.rep
  AND u.partition_date = CURRENT_DATE
LEFT JOIN `salesforce.sf_users` u2
  ON u2.ID = u.ManagerId
  AND u2.partition_date = CURRENT_DATE
WHERE u.isActive = TRUE
QUALIFY u.lastlogindate = MAX(u.lastlogindate) OVER (PARTITION BY u.Name)
),

pop AS (
SELECT p.month,
       rep,
       type,
       CASE WHEN rep = 'Juan Villegas' THEN 'NAM SMB CSM'
            WHEN rep = 'Gaby Khedair' THEN 'SMB EMEA CSM'
            WHEN rep = 'Andrew Evans' THEN 'EMEA CSM'
            WHEN rep = 'Guesty Support' AND type = 'CSM' THEN 'GS CSM'
            ELSE m.UserRoleName 
       END AS rep_role,
       CASE WHEN rep = 'Juan Villegas' THEN 'Juan Villegas'
            WHEN rep = 'Gaby Khedair' THEN 'Gaby Khedair'
            WHEN rep = 'Andrew Evans' THEN 'Andrew Evans'
            ELSE manager 
       END AS manager, 
       CASE WHEN rep = 'Juan Villegas' THEN m.UserRoleName
            WHEN rep = 'Gaby Khedair' THEN m.UserRoleName
            WHEN rep = 'Andrew Evans' THEN m.UserRoleName
            ELSE m2.UserRoleName 
       END AS manager_role,
       CASE WHEN rep = 'Juan Villegas' THEN manager
            WHEN manager = 'Andrew Evans' THEN 'Andrew Evans'
            WHEN manager = 'Taylor Jamero' THEN 'Taylor Jamero'
            ELSE u2.Name 
       END AS managers_manager
FROM pop_pre p
LEFT JOIN `guesty-data.csm.gs_sf_user_role_mapping` m
  ON m.UserRoleId = p.rep_role
LEFT JOIN `guesty-data.csm.gs_sf_user_role_mapping` m2
  ON m2.UserRoleId = p.manager_role
LEFT JOIN `salesforce.sf_users` u
  ON u.Name = p.manager
  AND u.partition_date = CURRENT_DATE
LEFT JOIN `salesforce.sf_users` u2
  ON u2.ID = u.ManagerId
  AND u2.partition_date = CURRENT_DATE
QUALIFY u.lastlogindate = MAX(u.lastlogindate) OVER (PARTITION BY u.Name)
),

ndr AS (
WITH

-- ACCOUNTS DATA

paying_accounts AS (
SELECT DISTINCT s.account_accountnumber AS account_id,
       CASE WHEN s.account_accountnumber = 'a93bb56e-4ddf-4398-942b-6a87d977f0b1' THEN 'a93bb56e-4ddf-4398-942b-6a87d977f0b1' ELSE a.account_accountnumber END invoice_owner_id,
FROM `zuora_silver.subscription` s
LEFT JOIN `zuora_silver.account` a
  ON s.subscription_invoiceownerid = a.account_id
WHERE s.subscription_status = 'Active'
),

paying_entity AS (
SELECT account_id,
       CASE WHEN account_id = invoice_owner_id THEN 'Self' ELSE 'Parent' END AS paying_account
FROM paying_accounts
),

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
  a.onboarding_completion_date,
  a.account_first_paid_mrr,
  COALESCE(pe.paying_account = 'Parent',FALSE) AS parent_paying,
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
LEFT JOIN paying_entity pe
  ON pe.account_id = a.account_id
WHERE partition_date = CURRENT_DATE
-- AND package <> 'lite'
),

ndr_final AS (
SELECT month,
       n.account_id,
       dm.parent_paying,
       dm.csm,
       COALESCE(current_monthly_reccuring_revenue , 0) AS rev_post,
       previous_monthly_reccuring_revenue AS rev_pre,
       COALESCE(current_monthly_reccuring_revenue, 0) / previous_monthly_reccuring_revenue * 100 AS ndr
FROM `performance.ndr` n
LEFT JOIN dm
  ON dm.account_id = n.account_id
WHERE previous_monthly_reccuring_revenue > 0
  AND DATE(DATE_TRUNC(dm.onboarding_completion_date, MONTH)) < month - INTERVAL 12 MONTH
  AND DATE(DATE_TRUNC(dm.account_first_paid_mrr, MONTH)) < month - INTERVAL 12 MONTH
  AND parent_paying = FALSE
ORDER BY 1,2
),

final AS (
SELECT DISTINCT 
       n.*, 
       a.csm AS ndr_csm
FROM ndr_final n
LEFT JOIN `guesty_analytics.dim_accounts` a
  ON a.account_id = n.account_id
  AND a.partition_date = LAST_DAY(n.month - INTERVAL 3 MONTH, MONTH)
ORDER BY 1,3
)

SELECT month, ndr_csm AS csm, SUM(rev_pre) AS rev_pre, SUM(rev_post) AS rev_post
FROM final
GROUP BY month, ndr_csm
),

accelerators_addons AS (
SELECT month, 
       csm, 
       addon,
       SUM(listings) AS listings,
       COUNT(DISTINCT account_id) AS accounts,
FROM `ops_kpi.addons_mrr`
WHERE addon IN ('Damage Protection','Upgrade Damage Protection','GPO Upsell')
GROUP BY ALL
),

accelerators_gpay AS (
SELECT month, csm, COUNT(DISTINCT account_id) AS accounts
FROM (
SELECT month, 
       csm, 
       account_id,
FROM `ops_kpi.addons_mrr`
WHERE addon IN ('GuestyPay')
GROUP BY ALL
QUALIFY month = MIN(month) OVER (PARTITION BY account_id)
) a
GROUP BY 1, 2
),

accelerators_addons_bpms AS (
SELECT month, 
       Opportunity_Owner, 
       addon,
       SUM(listings) AS listings,
       COUNT(DISTINCT account_id) AS accounts,
FROM `ops_kpi.addons_mrr`
WHERE addon IN ('Damage Protection','Upgrade Damage Protection','GPO Upsell')
  AND Opportunity_Owner != csm
GROUP BY ALL
),

accelerators_gpay_bpms AS (
SELECT month, Opportunity_Owner, COUNT(DISTINCT account_id) AS accounts
FROM (
SELECT month, 
       Opportunity_Owner, 
       account_id,
FROM `ops_kpi.addons_mrr`
WHERE addon IN ('GuestyPay')
  AND Opportunity_Owner != csm
GROUP BY ALL
QUALIFY month = MIN(month) OVER (PARTITION BY account_id)
) a
GROUP BY 1, 2
),

accelerators_ultimate AS (
SELECT month, 
       csm, 
       COUNT(DISTINCT account_id) AS accounts,
FROM `ops_kpi.pms_mrr`
WHERE LOWER(plan_name) LIKE '%ultimate%'
  AND LOWER(pre_plan_name) NOT LIKE '%ultimate%'
  AND mrr_change > 0
GROUP BY ALL
ORDER BY 2,1
),

accelerators_ultimate_bpms AS (
SELECT month, 
       Opportunity_Owner, 
       COUNT(DISTINCT account_id) AS accounts,
FROM `ops_kpi.pms_mrr`
WHERE plan = 'Guesty Ultimate'
  AND Opportunity_Owner != csm
GROUP BY ALL
ORDER BY 2,1
),

mrr_emrr_churn AS (
SELECT DISTINCT
       DATE(DATE_TRUNC(DATE(o.CloseDate) + INTERVAL 3 MONTH,MONTH)) AS month,
       c.account_id,
       c.account_name,
       c.csm,
       c.Expected_MRR__c AS expected_mrr,
       0 AS MRR,

FROM `csm.csm_churn_report` c
LEFT JOIN `salesforce.sf_account` a
  ON a.Guesty_Admin_ID__c = c.account_id
  AND a.partition_date = CURRENT_DATE
LEFT JOIN `salesforce.sf_opportunity` o
  ON o.AccountId = a.Id
  AND o.partition_date = CURRENT_DATE
WHERE onboarding_status NOT IN ('Not Started')
  AND churn_reason_modified NOT IN ('Out of Business','Financial Difficulties','Switched to Long-Term Rentals (LTR)')
  AND onboarder IS NOT NULL
  AND o.expected_mrr__c IS NOT NULL
  AND Record_Type_Formula__c LIKE '%Original%'
  AND o.CloseDate IS NOT NULL
  AND DATE(from_date) BETWEEN '2024-10-01' AND DATE_TRUNC(CURRENT_DATE, QUARTER) - INTERVAL 1 DAY
),

mrr_emrr AS (
SELECT DISTINCT
       DATE_TRUNC(s.partition_date, MONTH) AS month,
       a.Guesty_Admin_ID__c AS account_id,
       s.account_name,
       s.csm,
       Expected_MRR__c AS expected_mrr,
       (s.booked_revenue - s.early_termination_fee_revenue - s.onboarding_total_revenue + s.stirpe_fee_revenue) AS MRR,
      --  booked_revenue / Expected_MRR__c * 100 AS MRR_ratio,
FROM `salesforce.sf_opportunity` o
LEFT JOIN `salesforce.sf_account` a
  ON a.id = o.AccountId
LEFT JOIN `guesty_analytics.accounts_summary` s
  ON s.account_id = a.Guesty_Admin_ID__c
  AND s.partition_date = LAST_DAY(DATE_ADD(DATE(o.CloseDate), INTERVAL 3 MONTH), MONTH)
WHERE o.partition_date = CURRENT_DATE
  AND a.partition_date = CURRENT_DATE
  -- AND DATE(Onboarding_Completion_Date__c) >= '2024-10-01'
  AND Record_Type_Formula__c LIKE '%Original%'
  AND o.CloseDate IS NOT NULL
  AND s.booked_revenue IS NOT NULL
  AND Expected_MRR__c IS NOT NULL
  AND (churn_date IS NULL OR DATE_TRUNC(churn_date, QUARTER) > s.partition_date)
),

mrr_emrr_unified_pre AS (
SELECT *,
       'Completed' AS status
FROM mrr_emrr

UNION ALL

SELECT *,
       'Churned' AS status
FROM mrr_emrr_churn
),

mrr_emrr_unified AS (
SELECT month,csm,SUM(expected_mrr) AS expected_mrr,SUM(MRR) AS MRR
FROM mrr_emrr_unified_pre
GROUP BY ALL
),

ultimate_mrr AS (
SELECT month, csm, SUM(mrr_change) AS revenue
FROM `ops_kpi.pms_mrr`
WHERE LOWER(plan_name) LIKE '%ultimate%'
  AND LOWER(pre_plan_name) NOT LIKE '%ultimate%'
  AND mrr_change > 0
GROUP BY 1,2
),

ultimate_mrr2 AS (
SELECT month, Opportunity_Owner, SUM(mrr_change) AS revenue
FROM `ops_kpi.pms_mrr`
WHERE LOWER(plan_name) LIKE '%ultimate%'
  AND LOWER(pre_plan_name) NOT LIKE '%ultimate%'
  AND mrr_change > 0
  AND Opportunity_Owner != csm
GROUP BY 1,2
),

pms AS (
SELECT month, opportunity_owner, SUM(mrr_change) AS revenue
FROM `ops_kpi.pms_mrr`
WHERE Opportunity_Owner != csm
GROUP BY ALL
),

addons AS (
SELECT month, opportunity_owner, SUM(revenue) AS revenue
FROM `guesty-data.ops_kpi.addons_mrr`
WHERE opportunity_owner != csm
GROUP BY 1, 2
),

raw AS (
SELECT DISTINCT p.* EXCEPT(type),
     --   p.rep_role,
       c.churn_mrr,
       c.churn_mrr_ratio,
       c.churn_logo,
       c.churn_logo_ratio,
       s.silent_accounts,
       s.silent_perc,
       e.ebr_meetings,
       e.ebrs_6_months,
       e.all_portfolio,
       e.ebrs_6_months / e.all_portfolio AS ebrs_perc,
       
       MAX(n.rev_post) AS rev_post,
       MAX(n.rev_pre) AS rev_pre,
       MAX(mrr.expected_mrr) AS expected_mrr,
       MAX(mrr.mrr) AS mrr,

       CASE 
          WHEN rep = 'Nelson Sing' THEN MAX(m.total_mrr_growth)+MAX(a2.revenue)
          WHEN p.rep_role LIKE '%CSM%' THEN MAX(m.total_mrr_growth)
          WHEN p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%' THEN MAX(a.revenue)
       END AS upsells_mrr_growth,

       MAX(n.rev_post) / MAX(n.rev_pre) * 100 AS ndr,

       MAX(mrr.mrr) / MAX(mrr.expected_mrr) * 100 AS mrr_emrr,

       CASE
          WHEN rep = 'Nelson Sing' THEN MAX(CASE WHEN aa.addon LIKE '%Damage Protection%' THEN aa.listings END)+MAX(CASE WHEN aa3.addon LIKE '%Damage Protection%' THEN aa3.listings END)
          WHEN p.rep_role LIKE '%CSM%' THEN MAX(CASE WHEN aa.addon LIKE '%Damage Protection%' THEN aa.listings END)
          WHEN p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%' THEN MAX(CASE WHEN aa2.addon LIKE '%Damage Protection%' THEN aa2.listings END)
       END AS shield_listings,

       CASE
          WHEN rep = 'Nelson Sing' THEN MAX(DISTINCT gp.accounts)+MAX(DISTINCT gp3.accounts)
          WHEN p.rep_role LIKE '%CSM%' THEN MAX(DISTINCT gp.accounts)
          WHEN p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%' THEN MAX(DISTINCT gp2.accounts)
       END AS gpay_logos,

       CASE
          WHEN rep = 'Nelson Sing' THEN MAX(CASE WHEN aa.addon = 'GPO Upsell' THEN aa.listings END)+MAX(CASE WHEN aa3.addon = 'GPO Upsell' THEN aa3.listings END)
          WHEN p.rep_role LIKE '%CSM%' THEN MAX(CASE WHEN aa.addon = 'GPO Upsell' THEN aa.listings END)
          WHEN p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%' THEN MAX(CASE WHEN aa2.addon = 'GPO Upsell' THEN aa2.listings END)
       END AS gpo_listings,

       CASE
          WHEN rep = 'Nelson Sing' THEN MAX(au.accounts)+MAX(au3.accounts)
          WHEN p.rep_role LIKE '%CSM%' THEN MAX(au.accounts)
          WHEN p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%' THEN MAX(au2.accounts)
       END AS ultimate_logos,

FROM pop p
-- JOIN `csm.gs_cs_role_mapping_kpis` ma
--   ON ma.rep = p.rep
LEFT JOIN `ops_kpi.mrr_growth` m
  ON m.month = p.month
  AND m.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN addons a
  ON a.month = p.month
  AND a.Opportunity_Owner = p.rep
  AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
LEFT JOIN addons a2
  ON a2.month = p.month
  AND a2.Opportunity_Owner = p.rep
  AND p.rep = 'Nelson Sing'
LEFT JOIN `ops_kpi.churn` c
  ON c.month = p.month
  AND c.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN `ops_kpi.silent_accounts` s
  ON s.month = p.month
  AND s.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN `ops_kpi.ebrs` e
  ON e.month = p.month
  AND e.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN ndr n
  ON n.month = p.month
  AND n.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN accelerators_addons aa
  ON aa.month = p.month
  AND aa.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN accelerators_gpay gp
  ON gp.month = p.month
  AND gp.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN accelerators_addons_bpms aa2
  ON aa2.month = p.month
  AND aa2.opportunity_owner = p.rep
  AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
LEFT JOIN accelerators_gpay_bpms gp2
  ON gp2.month = p.month
  AND gp2.Opportunity_Owner = p.rep
  AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
LEFT JOIN accelerators_addons_bpms aa3
  ON aa3.month = p.month
  AND aa3.opportunity_owner = p.rep
  AND p.rep = 'Nelson Sing'
LEFT JOIN accelerators_gpay_bpms gp3
  ON gp3.month = p.month
  AND gp3.Opportunity_Owner = p.rep
  AND p.rep = 'Nelson Sing'
LEFT JOIN accelerators_ultimate au
  ON au.month = p.month
  AND au.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN accelerators_ultimate_bpms au2
  ON au2.month = p.month
  AND au2.opportunity_owner = p.rep
  AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
LEFT JOIN accelerators_ultimate_bpms au3
  ON au3.month = p.month
  AND au3.opportunity_owner = p.rep
  AND p.rep = 'Nelson Sing'
LEFT JOIN mrr_emrr_unified mrr
  ON mrr.month = p.month
  AND mrr.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN ultimate_mrr u
  ON u.month = p.month
  AND u.csm = p.rep
  AND p.rep_role LIKE '%CSM%'
LEFT JOIN ultimate_mrr2 u2
  ON u2.month = p.month
  AND u2.opportunity_owner = p.rep
  AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
LEFT JOIN ultimate_mrr2 u3
  ON u3.month = p.month
  AND u3.opportunity_owner = p.rep
  AND p.rep = 'Nelson Sing'
-- LEFT JOIN pms
--   ON pms.month = p.month
--   AND pms.opportunity_owner = p.rep
--   AND (p.rep_role LIKE '%BPM%' OR p.rep_role LIKE '%Account Specialist%')
-- LEFT JOIN pms pms2
--   ON pms2.month = p.month
--   AND pms2.opportunity_owner = p.rep
--   AND p.rep = 'Nelson Sing'
GROUP BY ALL
ORDER BY 2, 1
),

raw_type AS (
SELECT *,
       CASE rep_role
            WHEN 'GS CSM' THEN 'GS CSM'
            WHEN 'APAC SMB CSM' THEN 'SMB CSM EMEA'
            WHEN 'APAC CSM' THEN 'MM CSM'
            WHEN 'MM CSM NAM A' THEN 'MM CSM'
            WHEN 'EMEA CSM' THEN 'ENT CSM'
            WHEN 'EMEA CSM M' THEN 'MM CSM'
            WHEN 'EMEA CSM M - TL' THEN 'MM TL'
            WHEN 'MM CSM NAM L' THEN 'MM CSM'
            WHEN 'MM CSM NAM L- TL' THEN 'MM TL'
            WHEN 'MM CSM NAM A - TL' THEN 'MM TL'
            WHEN 'MM CSM NAM TM' THEN 'MM CSM'
            WHEN 'MM NAM CSM T' THEN 'MM CSM'
            WHEN 'NAM SMB CSM' THEN 'SMB CSM NAM'
            WHEN 'SMB EMEA CSM' THEN 'SMB CSM EMEA'
            WHEN 'MM Account Specialist EMEA' THEN 'MM BPM'
            WHEN 'Account Specialist' THEN 'SMB BPM'
            WHEN 'MM Account Specialist NAM M' THEN 'MM BPM'
            WHEN 'MM Account Specialist EMEA' THEN 'MM BPM'
            WHEN 'EMEA CSM ENT' THEN 'ENT CSM'
            WHEN 'ENT NAM CSM T' THEN 'ENT CSM'
            WHEN 'ENT NAM CSM TM' THEN 'ENT CSM'
       END AS type
FROM raw
),

kpis AS (
SELECT r.*,

       COALESCE(
       CASE type
            WHEN 'SMB CSM NAM' THEN
                 CASE WHEN mrr_emrr > 100 THEN 1
                      ELSE 0
                 END
            WHEN 'SMB CSM EMEA' THEN
                 CASE WHEN mrr_emrr > 100 THEN 1
                      ELSE 0
                 END
            WHEN 'GS CSM' THEN
                 CASE WHEN mrr_emrr > 100 THEN 1
                      ELSE 0
                 END
       END, 0) AS amrr_emrr_kpi,

       COALESCE(
       CASE type
            WHEN 'SMB CSM NAM' THEN
                 CASE WHEN churn_mrr_ratio <= 0.02 AND churn_logo_ratio <= 0.02 THEN 1
                      WHEN churn_mrr_ratio < 0.02 AND churn_logo_ratio > 0.02 AND churn_logo_ratio <= 0.03 THEN 0.5
                      WHEN churn_mrr_ratio > 0.02 OR churn_logo_ratio > 0.03 THEN 0
                 END
            WHEN 'SMB CSM EMEA' THEN
                 CASE WHEN churn_mrr_ratio <= 0.02 AND churn_logo_ratio <= 0.02 THEN 1
                      WHEN churn_mrr_ratio < 0.02 AND churn_logo_ratio > 0.02 AND churn_logo_ratio <= 0.03 THEN 0.5
                      WHEN churn_mrr_ratio > 0.02 OR churn_logo_ratio > 0.03 THEN 0
                 END
            WHEN 'GS CSM' THEN
                 CASE WHEN churn_mrr_ratio <= 0.02 AND churn_logo_ratio <= 0.02 THEN 1
                      WHEN churn_mrr_ratio < 0.02 AND churn_logo_ratio > 0.02 AND churn_logo_ratio <= 0.03 THEN 0.5
                      WHEN churn_mrr_ratio > 0.02 OR churn_logo_ratio > 0.03 THEN 0
                 END
            WHEN 'MM CSM' THEN
                 CASE WHEN churn_mrr_ratio < 0.01 AND churn_logo < 2 THEN 1
                      ELSE 0
                 END
            WHEN 'ENT CSM' THEN
                 CASE WHEN churn_mrr_ratio < 0.005 AND churn_logo < 1 THEN 1
                      ELSE 0
                 END
       END, 0) AS churn_kpi,

       COALESCE(LEAST(GREATEST(
       CASE 
            WHEN rep = 'Nelson Sing' THEN
                  upsells_mrr_growth / 8500
            WHEN type = 'SMB CSM EMEA' THEN
                  upsells_mrr_growth / 2500
            WHEN type = 'SMB CSM NAM' THEN
                  upsells_mrr_growth / 3000
            WHEN type = 'SMB BPM' THEN
                  upsells_mrr_growth / 12500
            WHEN type = 'GS CSM' THEN
                  upsells_mrr_growth / 3000
            WHEN type = 'MM BPM' THEN
                  upsells_mrr_growth / 15000
            WHEN type = 'MM CSM' THEN
                  upsells_mrr_growth / 3500
            WHEN type = 'ENT BPM' THEN
                  upsells_mrr_growth / 20000
            WHEN type = 'ENT CSM' THEN
                  upsells_mrr_growth / 4000
       END, 0) ,2 ), 0) AS upsell_kpi,

       COALESCE(
       CASE type
            WHEN 'SMB CSM NAM' THEN
                 CASE WHEN silent_perc <= 0.1 THEN 1
                      WHEN silent_perc > 0.35 THEN 0
                      ELSE (0.35 - silent_perc) / (0.35 - 0.1)
                 END
            WHEN 'SMB CSM EMEA' THEN
                 CASE WHEN silent_perc <= 0.1 THEN 1
                      WHEN silent_perc > 0.35 THEN 0
                      ELSE (0.35 - silent_perc) / (0.35 - 0.1)
                 END
            WHEN 'MM CSM' THEN
                 CASE WHEN silent_perc < 0.05 THEN 1.2
                      WHEN silent_perc > 0.2 THEN 0
                      ELSE 1.2 * (0.2 - silent_perc) / (0.2 - 0.05)
                 END
            WHEN 'ENT CSM' THEN
                 CASE WHEN silent_perc = 0 THEN 1
                      ELSE 0
                 END
       END, 0) AS engagement_kpi,

       COALESCE(
       CASE 
            WHEN rep = 'Nelson Sing' THEN
                 CASE WHEN ebrs_perc > 0.4 THEN 1
                      ELSE ebrs_perc / 0.4
                 END
            WHEN type = 'MM CSM' THEN
                 CASE WHEN ebrs_perc > 0.8 THEN 1
                      ELSE ebrs_perc / 0.8
                 END
            WHEN type = 'ENT CSM' THEN
                 CASE WHEN ebrs_perc > 0.9 THEN 1
                      ELSE ebrs_perc / 0.9
                 END
       END, 0) AS qbrs_kpi,

       COALESCE(
       CASE WHEN type = 'ENT CSM' THEN
            CASE WHEN ndr < 100 THEN 0
                 WHEN ndr >= 100 AND ndr <= 120 THEN (ndr - 100) / 20
                 ELSE ndr / 120
            END
       END, 0) AS ndr_kpi,

       COALESCE(
       CASE 
            WHEN rep = 'Nelson Sing' THEN
                 CASE WHEN shield_listings > 250 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM NAM' THEN
                 CASE WHEN shield_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM EMEA' THEN
                 CASE WHEN shield_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'SMB BPM' THEN
                 CASE WHEN shield_listings > 350 THEN 1 ELSE 0 END
            WHEN type = 'GS CSM' THEN
                 CASE WHEN shield_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'MM BPM' THEN
                 CASE WHEN shield_listings > 500 THEN 1 ELSE 0 END
            WHEN type = 'MM CSM' THEN
                 CASE WHEN shield_listings > 150 THEN 1 ELSE 0 END
            WHEN type = 'ENT BPM' THEN
                 CASE WHEN shield_listings > 750 THEN 1 ELSE 0 END
            WHEN type = 'ENT CSM' THEN
                 CASE WHEN shield_listings > 200 THEN 1 ELSE 0 END
       END, 0) AS shield_acc,

       COALESCE(
       CASE
            WHEN rep = 'Nelson Sing' THEN
                 CASE WHEN gpay_logos > 7 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM NAM' THEN
                 CASE WHEN gpay_logos > 5 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM EMEA' THEN
                 CASE WHEN gpay_logos > 5 THEN 1 ELSE 0 END
            WHEN type = 'SMB BPM' THEN
                 CASE WHEN gpay_logos > 20 THEN 1 ELSE 0 END
            WHEN type = 'GS CSM' THEN
                 CASE WHEN gpay_logos > 5 THEN 1 ELSE 0 END
            WHEN type = 'MM BPM' THEN
                 CASE WHEN gpay_logos > 12 THEN 1 ELSE 0 END
            WHEN type = 'MM CSM' THEN
                 CASE WHEN gpay_logos > 5 THEN 1 ELSE 0 END
            WHEN type = 'ENT BPM' THEN
                 CASE WHEN shield_listings > 6 THEN 1 ELSE 0 END
            WHEN type = 'ENT CSM' THEN
                 CASE WHEN shield_listings > 2 THEN 1 ELSE 0 END
       END, 0) AS gpay_acc,

       
       COALESCE(
       CASE
            WHEN rep = 'Nelson Sing' THEN
                 CASE WHEN gpo_listings > 350 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM NAM' THEN
                 CASE WHEN gpo_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM EMEA' THEN
                 CASE WHEN gpo_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'SMB BPM' THEN
                 CASE WHEN gpo_listings > 400 THEN 1 ELSE 0 END
            WHEN type = 'GS CSM' THEN
                 CASE WHEN gpo_listings > 75 THEN 1 ELSE 0 END
            WHEN type = 'MM BPM' THEN
                 CASE WHEN gpo_listings > 600 THEN 1 ELSE 0 END
            WHEN type = 'MM CSM' THEN
                 CASE WHEN gpay_logos > 150 THEN 1 ELSE 0 END
            WHEN type = 'ENT BPM' THEN
                 CASE WHEN gpo_listings > 800 THEN 1 ELSE 0 END
            WHEN type = 'ENT CSM' THEN
                 CASE WHEN gpo_listings > 200 THEN 1 ELSE 0 END
       END, 0) AS gpo_acc,

       COALESCE(
       CASE
            WHEN rep = 'Nelson Sing' THEN
                 CASE WHEN ultimate_logos >= 2 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM NAM' THEN
                 CASE WHEN ultimate_logos >= 2 THEN 1 ELSE 0 END
            WHEN type = 'SMB CSM EMEA' THEN
                 CASE WHEN ultimate_logos >= 2 THEN 1 ELSE 0 END
            WHEN type = 'SMB BPM' THEN
                 CASE WHEN ultimate_logos >= 5 THEN 1 ELSE 0 END
            WHEN type = 'GS CSM' THEN
                 CASE WHEN ultimate_logos >= 2 THEN 1 ELSE 0 END
            WHEN type = 'MM BPM' THEN
                 CASE WHEN ultimate_logos >= 3 THEN 1 ELSE 0 END
            WHEN type = 'MM CSM' THEN
                 CASE WHEN ultimate_logos >= 2 THEN 1 ELSE 0 END
            WHEN type = 'ENT BPM' THEN
                 CASE WHEN gpo_listings >= 1 THEN 1 ELSE 0 END
            WHEN type = 'ENT CSM' THEN
                 CASE WHEN ultimate_logos >= 1 THEN 1 ELSE 0 END
       END, 0) AS ultimate_acc,

FROM raw_type r
)

-- SELECT *
-- FROM raw
-- WHERE rep = 'Nelson Sing'
--      AND month = '2026-02-01'


SELECT DISTINCT *,

       ROUND(
       COALESCE(
       CASE type
            WHEN 'SMB CSM NAM' THEN
                 LEAST( amrr_emrr_kpi * 0.25 + churn_kpi * 0.2 + upsell_kpi * 0.4 + engagement_kpi * 0.15 + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'SMB CSM EMEA' THEN
                 LEAST( amrr_emrr_kpi * 0.25 + churn_kpi * 0.2 + upsell_kpi * 0.4 + engagement_kpi * 0.15 + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'SMB BPM' THEN
                 LEAST( upsell_kpi + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'GS CSM' THEN
                 LEAST( amrr_emrr_kpi * 0.3 + churn_kpi * 0.2 + upsell_kpi * 0.5 + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'MM BPM' THEN
                 LEAST( upsell_kpi + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , CASE WHEN rep = 'Alison Wendum' THEN 2 ELSE 1.5 END )
            WHEN 'MM CSM' THEN
                 LEAST( churn_kpi * 0.25 + upsell_kpi * 0.5 + engagement_kpi * 0.125 + qbrs_kpi * 0.125 + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'ENT BPM' THEN
                 LEAST( upsell_kpi + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
            WHEN 'ENT CSM' THEN
                 LEAST( ndr_kpi * 0.3 + churn_kpi * 0.25 + upsell_kpi * 0.35 + engagement_kpi * 0.05 + qbrs_kpi * 0.05 + shield_acc * 0.1 + gpay_acc * 0.1 + gpo_acc * 0.1 + ultimate_acc * 0.1 , 1.5 )
       END, 0) * 100 , 1) AS rep_achievement

FROM kpis
WHERE type IS NOT NULL
ORDER BY 2, 1
```

## Documented columns (1 of 39)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `upsell_kpi` | KPI for upsell performance based on MRR growth. | Calculated by dividing upsells_mrr_growth by a target value, capped at 2, and then multiplied by a weighting factor based on the rep's role type. | `COALESCE(LEAST(GREATEST(        CASE              WHEN rep = 'Nelson Sing' THEN                   upsells_mrr_growth / 8500             WHEN type = 'SMB CSM EMEA' THEN                   upsells_mrr_growth / 2500             WHEN type = 'SMB CSM NAM' THEN                   upsells_mrr_growth / 3000             WHEN type = 'SMB BPM' THEN                   upsells_mrr_growth / 12500             WHEN type = 'GS CSM' THEN                   upsells_mrr_growth / 3000             WHEN type = 'MM BPM' THEN                   upsells_mrr_growth / 15000             WHEN type = 'MM CSM' THEN                   upsells_mrr_growth / 3500             WHEN type = 'ENT BPM' THEN                   upsells_mrr_growth / 20000             WHEN type = 'ENT CSM' THEN                   upsells_mrr_growth / 4000        END, 0) ,2 ), 0)` |
