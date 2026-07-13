# BI mart — `guesty-data.marketing.leads_summary`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> Source last refreshed 2026-04-19 (BI-owned) — verify it hasn't drifted before relying on critical logic.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2025-01-01'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
CREATE OR REPLACE TABLE `guesty-data.marketing.leads_summary` AS 

WITH

leads AS (
SELECT DISTINCT DATE(TIMESTAMP_MILLIS(submittedAt)) as form_submitted_date,
       email, 
       sls_verdict,
       CASE WHEN sls_verdict IN ('gfp-call','gpro-high','gpro-ent','gpro-low','gfp-call-video') THEN 'gfp'
            WHEN sls_verdict IN ('gfh-redirect','glite-call','glite-redirect') THEN 'glite'
            WHEN sls_verdict IS NULL OR sls_verdict IN ('groupdemo','*redacted*','gfp-spam','glite-spam','spam') THEN 'spam'
            END AS sls_verdict_type,
       CAST(number_of_listings_2021 AS FLOAT64) AS sls_listings,
       CAST(first_sls AS FLOAT64) AS first_sls,
       average_nightly_rate_segment AS sls_anr,
       UPPER(country) AS country,
       UPPER(utm_campaign) AS utm_campaign,
       UPPER(utm_source) AS utm_source,
       UPPER(utm_content) AS utm_content,
       UPPER(utm_medium) AS utm_medium,
       entry_page_url,
       initial_referring_domain,
FROM `guesty-data.marketing.form_submissions`
WHERE email IS NOT NULL
-- QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY TIMESTAMP_MILLIS(submittedAt) DESC) = 1
),

contacts AS (
SELECT DISTINCT Id AS contact_id,
       Email,
       AccountId AS sf_account_id,
       UPPER(UTM_Source__c)  AS contact_utm_source,
       UPPER(UTM_Campaign__c) AS contact_utm_campaign,
       UPPER(UTM_Content__c)  AS contact_utm_content,
       UPPER(UTM_Medium__c) AS contact_utm_medium,
       Lead_Score_Num__c AS contact_score,
       UPPER(MailingCountry) AS contact_country,
       Occupancy_Rate__c AS occupancy_rate,
FROM `salesforce.sf_contact`
WHERE partition_date = CURRENT_DATE
-- QUALIFY ROW_NUMBER() OVER (PARTITION BY email ORDER BY LastActivityDate DESC) = 1
),

intro_call_date AS (
SELECT WhoId AS contact_id,
       MAX(DATE(CreatedDate)) AS intro_call_date,
FROM `salesforce.sf_event`
WHERE partition_date = CURRENT_DATE
  AND Subject LIKE 'Guesty: Intro Call%'
GROUP BY ALL
),

demo_date AS (
SELECT DISTINCT WhoId AS contact_id,
       DATE(CreatedDate) AS demo_schdeuled_date,
FROM `salesforce.sf_event`
WHERE partition_date = CURRENT_DATE
  AND Subject LIKE 'Guesty Demo%'
),

pre_opps AS (
SELECT DISTINCT Id AS opportunity_id,
       AccountId as sf_account_id,
       ContactId AS contact_id,
       DATE(CreatedDate) AS opp_created_date,
       DATE(CloseDate) AS opp_closed_date,
       IsClosed AS is_closed,
       IsWon AS is_won,
       Number_of_Listings__c AS opp_listings,
       Expected_MRR__c as expected_mrr,
       Average_Nightly_Rate__c AS opp_anr,
       Opportunity_Source_F__c AS opp_source,
       StageName AS opp_stage,
FROM `salesforce.sf_opportunity`
WHERE partition_date = CURRENT_DATE
  AND Record_Type_Formula__c = 'Original'
  AND Opportunity_Source_F__c = 'Inbound'
),

opps AS (
SELECT o.*,
       contact_utm_source,
       contact_utm_campaign,
       contact_utm_content,
       contact_utm_medium,
FROM pre_opps o
LEFT JOIN contacts c ON o.contact_id = c.contact_id
),

union_data AS (
SELECT DISTINCT l.*,
       c.contact_id,
       c.contact_country,
       c.contact_score,
       c.occupancy_rate,
       i.intro_call_date,
       d.demo_schdeuled_date,
FROM leads l
LEFT JOIN contacts c ON l.email = c.email
LEFT JOIN intro_call_date i ON c.contact_id = i.contact_id AND i.intro_call_date >= l.form_submitted_date
LEFT JOIN demo_date d ON c.contact_id = d.contact_id AND d.demo_schdeuled_date >= l.form_submitted_date
),

pre_final_leads AS (
SELECT DISTINCT u.* EXCEPT (contact_id),
       o.* EXCEPT (contact_id),
       COALESCE(u.contact_id,o.contact_id) AS contact_id,
FROM union_data u FULL JOIN opps o USING(contact_id)
),

final_leads AS (
SELECT *,
       CONCAT(email,"_",demo_schdeuled_date) AS email_demo_string,
       CONCAT(email,"_",intro_call_date) AS email_call_string,
FROM pre_final_leads
),

spend_calc AS (
SELECT date AS campaign_date,
      UPPER(country) AS country,
      UPPER(channel) AS utm_source,
      UPPER(campaign_name) AS utm_campaign,
      spend AS spend,
FROM `guesty-data.marketing.spend`
WHERE spend > 0
AND date >= '2025-01-01'
),

final AS (
SELECT form_submitted_date,
       email,
       sls_verdict AS sls_verdict,
       sls_verdict_type AS sls_verdict_type,
       sls_listings,
       sls_anr,
       first_sls,
       COALESCE(country,contact_country) AS country,
       COALESCE(utm_source,contact_utm_source) AS utm_source,
       COALESCE(utm_campaign,contact_utm_campaign) AS utm_campaign,
       COALESCE(utm_content,contact_utm_content) AS utm_content,
       COALESCE(utm_medium,contact_utm_medium) AS utm_medium,
       sf_account_id,
       intro_call_date,
       demo_schdeuled_date,
       opportunity_id,
       opp_created_date,
       opp_closed_date,
       opp_anr,
       contact_score,
       is_closed,
       is_won,
       opp_listings,
       expected_mrr,
       contact_id,
       email_demo_string,
       email_call_string,
       CAST(NULL AS DATE) AS campaign_date,
       CAST(NULL AS FLOAT64) AS spend,
       opp_source,
       opp_stage,
       occupancy_rate,
       entry_page_url,
       initial_referring_domain,

FROM final_leads

UNION DISTINCT 

SELECT NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       country,
       utm_source,
       utm_campaign,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
       campaign_date,
       spend,
       NULL,
       NULL,
       NULL,
       NULL,
       NULL,
FROM spend_calc
),

countries_mapping AS (
SELECT DISTINCT UPPER(country) AS country,
       UPPER(region) AS region,
       UPPER(area) AS area,
FROM `guesty-data.assistive_data.countries_mapping`
)

SELECT DISTINCT f.*,
       c.region,
       c.area,
       CASE WHEN opportunity_id IS NOT NULL THEN ROW_NUMBER() OVER (PARTITION BY opportunity_id ORDER BY opportunity_id) END AS opp_rank,
       CASE WHEN email IS NOT NULL THEN ROW_NUMBER() OVER (PARTITION BY email ORDER BY form_submitted_date DESC) END AS email_rank,
       CASE WHEN email IS NOT NULL THEN ROW_NUMBER() OVER (PARTITION BY email,DATE_TRUNC(form_submitted_date,MONTH) ORDER BY form_submitted_date DESC) END AS email_monthly_rank,
       CASE WHEN utm_source IS NULL AND utm_medium IS NULL AND initial_referring_domain LIKE ANY ('%facebook.com','%instagram.com','x.com','%linkedin.com','%tiktok.com','%youtube.com','%reddit.com') THEN 'Organic Social'
            WHEN (utm_source IS NULL OR utm_source LIKE '%chatgpt.com') AND initial_referring_domain LIKE ANY ('%chatgpt.com','%gemini.com','%claude.com','%perplexity%','%copilot%','%grok%') THEN 'Organic LLM'
            ELSE utm_source END AS new_utm_source,
FROM final f
LEFT JOIN countries_mapping c USING(country)
```

## Documented columns (6 of 37)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `utm_medium` | The marketing medium that brought the lead to Guesty. | Captures the UTM medium from form submissions, falling back to contact data if unavailable. Defaults to 'Unknown' if both are missing. | `COALESCE(utm_medium,contact_utm_medium, 'Unknown') AS utm_medium` |
| `country` | The country associated with the lead or campaign. | This column is derived from the 'country' field in 'guesty-data.marketing.form_submissions', 'MailingCountry' in 'salesforce.sf_contact', or 'country' in 'guesty-data.marketing.spend'. It is then joined with 'guesty-data.assistive_data.countries_mapping' to get region and area. | `COALESCE(country,contact_country, 'Unknown') AS country` |
| `sf_account_id` | ID of the associated Salesforce Account. | Directly sourced from the `AccountId` field in the `salesforce.sf_contact` table. | `AccountId AS sf_account_id` |
| `opp_created_date` | Date when the opportunity was created in Salesforce. | Directly extracted from the 'CreatedDate' column of the 'sf_opportunity' table, filtered for 'Original' record types and 'Inbound' opportunity sources. | `DATE(CreatedDate) AS opp_created_date` |
| `opp_listings` | Number of listings associated with the opportunity. | Directly extracted from the 'Number_of_Listings__c' field in the Salesforce Opportunity object. | `Number_of_Listings__c AS opp_listings` |
| `opp_anr` | Average nightly rate of the associated opportunity. | Directly sourced from the 'Average_Nightly_Rate__c' field in the Salesforce Opportunity object. | `Average_Nightly_Rate__c AS opp_anr` |
