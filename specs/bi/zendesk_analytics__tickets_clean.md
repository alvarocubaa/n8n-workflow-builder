# BI mart — `guesty-data.zendesk_analytics.tickets_clean`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ Source last refreshed 2026-04-19 (~12 weeks ago) — verify logic hasn't drifted before relying on it.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2023-05-18', '2025-06-19', '2026-02-15'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `guesty-data.zendesk_analytics.tickets_clean` AS

WITH organizations as
( 
select
 cast(id as string) as organization_id,  
 trim(json_extract(organization_fields, '$.current_owner_email'), '"') organization_fields_account_email,
 trim(json_extract(organization_fields, '$.account_segment'), '"') organization_fields_account_segment,
 trim(json_extract(organization_fields, '$.guesty_package'), '"') organization_fields_account_package,
 trim(json_extract(organization_fields, '$.guesty_ultimate'), '"') organization_fields_account_ultimate,
 trim(json_extract(organization_fields, '$.strategic_account'), '"') organization_fields_strategic_account,
 trim(json_extract(organization_fields, '$.onboarder_email'), '"') organization_fields_onboarder_email,
 trim(json_extract(organization_fields, '$.guesty_admin_id'), '"') organization_fields_guesty_admin_id,
 trim(json_extract(organization_fields, '$.sf_account_type'), '"') sf_account_type,
 trim(json_extract(organization_fields, '$.parent_hq_name'), '"') parent_hq_name
from `guesty-data.zendesk.organizations` 
where id != 10768155382301 -- Excluding GuestyPay application automated alerts
), 

statuses AS 
(
SELECT 
  s.id AS custom_status_id,
  s.agent_label, 
  s.end_user_label,
  t.id AS ticket_field_id,
  t.raw_title AS field_title,
  t.raw_description,
FROM `guesty-data.zendesk.ticket_fields` t, UNNEST(custom_statuses) s
),

dim_users AS
(
SELECT
  email,
  MAX(account_id) account_id
FROM `guesty_analytics.dim_users` 
WHERE partition_date = CURRENT_DATE()
GROUP BY ALL
),

agents AS
(
  select
    Full_Name AS name, 
    string_agg(Nickname, ', ') AS nickname, 
    max(Email) AS email,
    max(Role) AS role_from_airtable,
    min(Start_Date) AS agent_start_date,
    Full_Name_from_Manager__TL_Manual[SAFE_OFFSET(0)] AS agent_tl,
    string_agg(Shift, ', ') AS agent_shift,
    string_agg(Status, ', ') AS agent_status
  from `guesty-data.airtable.cx_team_members`
  group by all
),

bob as
(
  SELECT 
    email,
    work_title,
    work_manager,
    internal_status
  FROM `guesty-data.make.bob_employees`
  group by all
),

zd_users AS
(
SELECT 
  u.id,
  u.name,
  u.email,
  u.role,
  COALESCE(a.role_from_airtable, b.work_title) role_from_airtable,
  a.nickname,
  b.work_title,
  MAX(COALESCE(a.agent_status, b.internal_status)) AS agent_status,
  MAX(COALESCE(a.agent_tl, b.work_manager)) AS agent_tl,
  MAX(a.agent_shift) AS agent_shift,
FROM `guesty-data.zendesk.users` u
  LEFT JOIN agents a USING(email)
  LEFT JOIN bob b USING(email)
GROUP BY ALL
),

csat AS
(
SELECT 
  ticket_id,
  assignee_id, 
  -- DATETIME(TIMESTAMP(created_at), "Asia/Jerusalem") AS created_at,
  created_at,
  score,
  reason,
  comment,
    -- RANK() OVER(PARTITION BY ticket_id ORDER BY comment) rn,
  RANK() OVER(PARTITION BY ticket_id ORDER BY created_at DESC) rn,
FROM `guesty-data.zendesk.satisfaction_ratings` 
WHERE score NOT IN ('offered')
QUALIFY rn = 1
),

domains_0 AS
(
SELECT 
  name AS domain_1,
  Product_Manager AS product_manager,
  Domain_Group[SAFE_OFFSET(0)] AS Domain_Group_id,
  LDS[SAFE_OFFSET(0)] AS lds
FROM `guesty-data.airtable.domains`
),

domains AS
(
SELECT
  d.*,
  g.Domain_Group_Name AS domain_group
FROM domains_0 d
LEFT JOIN `guesty-data.airtable.domain_groups` g
  ON d.Domain_Group_id = g.rec_id 
),

ticket_events_0 AS
( 
  SELECT 
    te.ticket_id,
    t.brand,
    t.channel,
    te.created_at AS e_created_at,
    child_events.event_type AS child_event_event_type,
    child_events.status,
    CASE WHEN child_events.status = 'deleted' THEN 'Deleted' ELSE s.agent_label END AS custom_status,
    RANK() OVER(PARTITION BY CASE WHEN child_events.event_type = 'Comment' AND public THEN te.ticket_id END ORDER BY te.created_at ASC) rn_cmnts,
    RANK() OVER(PARTITION BY CASE WHEN body is not null THEN te.ticket_id else null END ORDER BY te.created_at DESC) rn_body,
    MAX(requester_id) OVER(PARTITION BY te.ticket_id) requester_id,
    author_id,
    u.name AS event_agent_name,
    u.email AS event_agent_email,
    u.work_title,
    u.role,
    assignee_id,
    public,
    body
  FROM `guesty-data.zendesk.ticket_events` te, UNNEST(child_events) child_events
    LEFT JOIN statuses s ON s.custom_status_id = child_events.custom_status_id
    LEFT JOIN zd_users u ON u.id = child_events.author_id
    LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t on cast(te.ticket_id AS STRING) = t.ticket_id
),

csm_invlv as
(
  select
    cast(ticket_id as string) ticket_id,
    string_agg(distinct work_title, ' | ') titles_inv,
    max(case when work_title like '%Customer Success%' and public is true then true end) as csm_inv_public,
    max(case when work_title like '%Customer Success%' and public is not true then true end) as csm_inv_internal,
    max(case when work_title like '%Customer Success%' then true end) as csm_inv
  from ticket_events_0
  group by 1
),

reopen_ty_events AS
(
SELECT
  ticket_id,
  true as reopen_ty_last,
FROM ticket_events_0
WHERE rn_body = 1
  AND body = 'Comment added by Triage Webhook: Thank you reopen. NFAR'
GROUP BY 1
),

status_events_0 AS
(
SELECT
  ticket_id,
  e_created_at,
  MAX(custom_status) custom_status,
  MAX(event_agent_name) event_agent_name,
  MAX(event_agent_email) event_agent_email,
FROM ticket_events_0
GROUP BY 1,2
),

status_events_1 AS
(
SELECT
  ticket_id,
  e_created_at,
  event_agent_name,
  event_agent_email,
  custom_status,
  LAG(custom_status) OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) previous_custom_status,
  LAG(e_created_at) OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) previous_e_created_at,
  LEAD(e_created_at) OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) next_e_created_at,
  RANK() OVER(PARTITION BY ticket_id ORDER BY e_created_at DESC) rn_status,
FROM status_events_0
WHERE custom_status IS NOT NULL
),

status_events_2 AS
(
SELECT
  ticket_id,
  e_created_at,
  next_e_created_at,
  rn_status,
  event_agent_name,
  event_agent_email,
  CASE 
    WHEN previous_custom_status = 'New' AND custom_status = 'Open' THEN 'Open from New' 
    WHEN previous_custom_status = 'Solved' AND custom_status = 'Open' THEN 'Open from Solved' 
    WHEN previous_custom_status = 'Pending Tier 3/R&D' AND custom_status = 'Open' THEN 'Open from Tier 3/R&D' 
    WHEN previous_custom_status = 'Pending 3rd party' AND custom_status = 'Open' THEN 'Open from 3rd party' 
    WHEN previous_custom_status = "Pending Internal escalation's reply" AND custom_status = 'Open' THEN 'Open from Internal escalation' 
    WHEN previous_custom_status = "Pending Customer's Reply" AND custom_status = 'Open' THEN "Open from Customer's Reply" 
    WHEN previous_custom_status = "Pending Customer's Reply" AND custom_status = 'Solved' THEN "Solved from Customer's Reply" 
    WHEN (previous_custom_status IS NULL OR previous_custom_status = 'Open') AND custom_status = 'Open' THEN 'Open from Open or from Null' 
  ELSE custom_status END AS current_status,
  CASE WHEN previous_custom_status = 'Solved' THEN 1 ELSE 0 END AS reopened_after_solved,
  ROW_NUMBER() OVER(PARTITION BY ticket_id, CASE WHEN custom_status = 'Solved' THEN 1 ELSE NULL END ORDER BY e_created_at ASC) rn_solved,
  ROW_NUMBER() OVER(PARTITION BY ticket_id, CASE WHEN custom_status = 'Solved' THEN 1 ELSE NULL END ORDER BY e_created_at DESC) rn_up_solved,
  TIMESTAMP_DIFF(e_created_at, COALESCE(previous_e_created_at, e_created_at), MINUTE) e_time_diff
FROM status_events_1
),

audits AS 
(
  SELECT 
    ticket_id,
    created_at AS audit_at,
    e.value,
  FROM `guesty-data.zendesk.ticket_audits`, UNNEST(events) e
  WHERE field_name = '24705802516253' --- custom reopen_reason field ID
  GROUP BY ALL
),

status_events_3 AS
(
  SELECT 
    se.*,
    a.audit_at, 
    TRIM(INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(a.value, 'reopen_reason_',''), '_+', ' '))) reopen_reason,
  FROM status_events_2 se
  LEFT JOIN audits a ON a.ticket_id = se.ticket_id AND audit_at BETWEEN e_created_at AND IFNULL(next_e_created_at, CURRENT_TIMESTAMP())
),

status_events_4 AS
(
  SELECT 
    *, LEAD(reopen_reason) OVER(PARTITION BY ticket_id ORDER BY e_created_at, audit_at) nxt_reopen_rsn,
  FROM status_events_3 
),

status_events_5 AS
(
  SELECT 
  * EXCEPT(audit_at), STRING_AGG(CONCAT(IFNULL(reopen_reason, ''), IFNULL(nxt_reopen_rsn, ''))) AS combined_reason,
  FROM status_events_4
  GROUP BY ALL
),

status_events AS
(
SELECT
  ticket_id,
  MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN event_agent_name ELSE NULL END) AS first_solved_agent,
  MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN event_agent_email ELSE NULL END) AS first_solved_email,
  MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN e_created_at ELSE NULL END) AS first_resolution_time,
  MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_up_solved = 1 THEN e_created_at ELSE NULL END) AS last_resolution_time,
  MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_up_solved = 1 THEN event_agent_email ELSE NULL END) AS last_solved_email,
  MAX(CASE WHEN rn_status = 1 THEN e_created_at ELSE null END) AS last_status_change,
  MAX(CASE WHEN rn_status = 1 THEN current_status ELSE null END) AS current_status,
  MAX(CASE WHEN current_status = 'Pending Tier 3/R&D' THEN true END) status_pending_t3,
  MAX(CASE WHEN current_status = 'Pending 3rd party' THEN true END) escalated_3rd_party,
  SUM(CASE WHEN NOT REGEXP_CONTAINS(combined_reason, r'New Issue|Thank You') THEN reopened_after_solved END) reopened_after_solved,
  SUM(CASE WHEN current_status IN("Open from Customer's Reply") THEN e_time_diff END) pending_user_time,
  SUM(CASE WHEN current_status NOT IN('Open from Solved',"Solved from Customer's Reply") THEN e_time_diff END) resolution_minutes_exc_cust,
FROM status_events_5
GROUP BY 1 
),

metric_events AS
(
SELECT 
  e.ticket_id,
  -- DATETIME(TIMESTAMP(e.time), "Asia/Jerusalem") AS e_created_at,
  e.time AS e_created_at,
  e.metric,
  e.type,
  ROW_NUMBER() OVER(PARTITION BY e.ticket_id, metric, e.type ORDER BY e.time ASC) rn_resolution_time,
  CASE WHEN metric = 'resolution_time' AND e.type = 'fulfill' THEN LAG(e.time) OVER(PARTITION BY e.ticket_id, e.metric ORDER BY e.time ASC) ELSE NULL END AS resolution_time,
FROM `guesty-data.zendesk.ticket_metric_events` e
WHERE time > TIMESTAMP("2023-03-26") 
),

resolution_times AS
(
SELECT 
  ticket_id,
  COUNT(resolution_time) times_solved,
  -- MIN(resolution_time) first_resolution_time,
  MAX(resolution_time) old_last_resolution_time,
  MAX(TIMESTAMP_DIFF(e_created_at, resolution_time, MINUTE)) AS old_max_resolution_minutes,
FROM metric_events 
GROUP BY 1
),

first_response_0 AS
(
SELECT
  *,
  LAG(e_created_at) OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) previous_custom_status,
  RANK() OVER(PARTITION BY CASE WHEN role = 'agent' AND requester_id != author_id THEN ticket_id END ORDER BY e_created_at ASC) rn_agent_comment,
FROM ticket_events_0
WHERE child_event_event_type = 'Comment' AND public
GROUP BY ALL
),

first_comment_agent_0 AS
(
SELECT
  *,
  ROW_NUMBER() OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) rn_comment,
FROM ticket_events_0
WHERE child_event_event_type = 'Comment'
GROUP BY ALL
),

first_comment_agent AS
(
  SELECT DISTINCT
    ticket_id,
    MAX(true) first_comment_agent,
  FROM first_comment_agent_0
  WHERE role = 'agent' AND rn_comment = 1
  GROUP BY 1
),

first_response_1 AS
(
SELECT
  ticket_id,
  previous_custom_status as ticket_created_time,
  e_created_at AS tickts_fr_time,
  DATE(previous_custom_status) AS ticket_created_date,
  DATE(e_created_at) AS first_response_date,
  event_agent_name AS first_response_agent_name,
  event_agent_email AS first_response_agent_email,
  body AS first_response_body,
FROM first_response_0
WHERE rn_agent_comment = 1 AND IFNULL(previous_custom_status,'1999-01-01') <> e_created_at
  AND ticket_id <> 1369073
GROUP BY ALL
),

yip_hours_0 AS 
(
  SELECT
    t.*,
    day,
    CASE 
      WHEN EXTRACT(DAYOFWEEK FROM day) BETWEEN 2 AND 6 THEN TIMESTAMP(DATETIME(day, "08:00:00")) -- Mon-Fri start
      WHEN EXTRACT(DAYOFWEEK FROM day) = 7 THEN TIMESTAMP(DATETIME(day, "12:00:00"))             -- Sat start
      WHEN EXTRACT(DAYOFWEEK FROM day) = 1 THEN TIMESTAMP(DATETIME(day, "23:59:59"))             -- Sunday start
    END AS work_start,
    CASE 
      WHEN EXTRACT(DAYOFWEEK FROM day) BETWEEN 2 AND 6 THEN TIMESTAMP(DATETIME(day, "18:00:00")) -- Mon-Fri end
      WHEN EXTRACT(DAYOFWEEK FROM day) = 7 THEN TIMESTAMP(DATETIME(day, "14:00:00"))             -- Sat end
      WHEN EXTRACT(DAYOFWEEK FROM day) = 1 THEN TIMESTAMP(DATETIME(day, "23:59:59"))             -- Sun end
    END AS work_end
  FROM first_response_1 t, UNNEST(GENERATE_DATE_ARRAY(ticket_created_date, first_response_date)) AS day
), 

yip_hours AS 
(
  SELECT 
    *,
    CASE WHEN work_start < tickts_fr_time AND work_end > ticket_created_time THEN 
    TIMESTAMP_DIFF(LEAST(work_end, tickts_fr_time), GREATEST(work_start, ticket_created_time), MINUTE) END AS overlap_minutes
  FROM yip_hours_0
), 

first_response AS
(
SELECT 
  ticket_id,
  ticket_created_time,
  tickts_fr_time,
  first_response_agent_name,
  first_response_agent_email,
  first_response_body,
  SUM(overlap_minutes) AS yip_fr_mnts
FROM yip_hours
GROUP BY ALL
),

msg_replies AS (
  SELECT * 
  FROM `guesty-data.zendesk_analytics.msg_replies`
  WHERE instance_id = 1 -- AND sla_target < 60
),

fr_nfar_0 AS
(
SELECT
  ticket_id,
  body,
  RANK() OVER(PARTITION BY CASE WHEN requester_id != author_id THEN ticket_id END ORDER BY e_created_at ASC) rn_agent_comment,
FROM ticket_events_0
WHERE child_event_event_type = 'Comment' AND public IS FALSE
),

fr_nfar AS
(
SELECT
  ticket_id,
  SUM(CASE WHEN body LIKE 'NFAR%' THEN 1 ELSE 0 END) AS fr_nfar
FROM fr_nfar_0
WHERE rn_agent_comment = 1
GROUP BY 1
),

jira_links AS
(
  SELECT 
    jl.ticket_id, 
    MIN(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN created_at END) as first_linked_at,
    MIN_BY(priority_name, CASE WHEN ils.issue_type_name LIKE '%upport%' THEN created_at END) first_j_priority,
    STRING_AGG(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN ils.key END,', ') jira_ids,
    STRING_AGG(ils.issue_type_name,', ') jira_types,
    MAX(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN true END) esc_jira_links,
  FROM `guesty-data.zendesk.jira_links` jl -- JOINING SINCE issue_key FROM jl DOES NOT UPDATE!
      LEFT JOIN `jira_raw_data.issues_last_snapshot` ils USING (issue_id)
  GROUP BY ALL
),

jiras_n_comments AS
( 
SELECT  
  ticket_id,
  jl.first_linked_at,
  jl.first_j_priority,
  jl.jira_ids,
  jl.esc_jira_links,
  -- COUNT(DISTINCT CASE WHEN child_event_event_type IN ('Comment', 'VoiceApiComment') AND public IS TRUE AND 
  COUNT(DISTINCT CASE WHEN child_event_event_type IN ('Comment') AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id != author_id, event_agent_email LIKE '%@guesty.com') THEN author_id ELSE null END) AS agents_commented,
  -- role <> 'end-user'
    COUNT(DISTINCT CASE WHEN (child_event_event_type IN ('Comment') AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id != author_id, event_agent_email LIKE '%@guesty.com')) OR (brand = 'GFP' AND channel LIKE 'Messaging%' AND body like 'Conversation with%' AND date(e_created_at)<='2025-06-19') THEN e_created_at END) AS agent_comments,
  COUNT(DISTINCT CASE WHEN e_created_at <= first_linked_at AND child_event_event_type IN ('Comment') AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id != author_id, event_agent_email LIKE '%@guesty.com') THEN e_created_at END) AS agent_comments_before_link,
  COUNT(DISTINCT CASE WHEN child_event_event_type = 'Comment' AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id = author_id, event_agent_email NOT LIKE '%@guesty.com') THEN e_created_at END) AS user_comments,
FROM ticket_events_0
  LEFT JOIN jira_links jl USING(ticket_id)
GROUP BY ALL
),

main_categories AS 
(
SELECT  
  t.id,
  COUNT(DISTINCT c.id) main_categories,
  STRING_AGG(IF(c.value LIKE 'gf_%', SUBSTRING(c.value, 5), IF(c.value LIKE 'all_br%',SUBSTRING(c.value, 12),c.value)), ' | ' ORDER BY c.value ASC) main_category,
FROM `guesty-data.zendesk.tickets` t , UNNEST (custom_fields) c
WHERE c.value IS NOT NULL
  AND TRIM(c.value) NOT IN ('','X')
  AND c.id IN
    (
     SELECT custom_field_id 
     FROM `guesty-data.zendesk_analytics.gs_zd_categories` 
     WHERE Field_Hirarchy = 'Main Categories'
    )
GROUP BY 1
),

sub_categories AS
(
SELECT  
  t.id,   
  COUNT(DISTINCT c.id) sub_categories,
  STRING_AGG(IF(c.value LIKE 'gf_%', SUBSTRING(c.value, 5),SUBSTRING(c.value, 12)), ' | ' ORDER BY c.value ASC) sub_category,
FROM `guesty-data.zendesk.tickets` t , UNNEST (custom_fields) c
WHERE c.value IS NOT NULL
  AND TRIM(c.value) NOT IN ('','X')
  AND c.id IN
    (
     SELECT custom_field_id 
     FROM `guesty-data.zendesk_analytics.gs_zd_categories` 
     WHERE Field_Hirarchy = 'Sub Categories'
    )
GROUP BY 1
),

tags AS
(
SELECT 
  id,
  MAX(CASE WHEN t = 'pending_auto_solved_after_168_hours' THEN true END) AS auto_solved,
  MAX(CASE WHEN t = 'closed_by_merge' THEN true END) AS merged,
  MAX(CASE WHEN t = 'non_friction_ticket' THEN true END) AS non_friction_ticket,
  MAX(CASE WHEN t = 'lms-training' THEN true END) AS lms_training,
  MAX(CASE WHEN t = 'ticket_created_via_zowie' THEN true END) AS zowie_ticket,
  MAX(CASE WHEN t LIKE 'incident/%' THEN t END) AS incident_id,
  MAX(CASE WHEN t LIKE 'uber-client' THEN true END) AS uber_enterprise,
  MAX(CASE WHEN t LIKE 'proactive_communication' THEN true END) AS proactive_communication,
  MAX(CASE WHEN t LIKE 'solved_reopened_thankyou' THEN true END) AS reopened_ty_tag,
  MAX(CASE WHEN t LIKE 'frt_outlier' THEN true END) AS frt_outlier,
  MAX(CASE WHEN t = 'rst_outlier' THEN true END) AS rst_outlier,
  MAX(CASE WHEN t = 'cx_endorsement' THEN true END) AS ticket_transferred,
  MAX(CASE WHEN t = 'gus' THEN true END) AS gus_ticket,
  MAX(CASE WHEN t = 'conversation_expired' THEN true END) AS gus_expired,
  MAX(CASE WHEN t = 'gus_routed' THEN true END) AS gus_routed,
  MAX(CASE WHEN t = 'gus_routed_after_conversation_abandoned' THEN true END) AS gus_routed_after_abandon,
  MAX(CASE WHEN t = 'escalated_information_systems' THEN true END) AS escalated_to_is,
  MAX(CASE WHEN t LIKE 'escalate_smb' OR t LIKE 'escalated_smb' THEN true END) AS escalated_to_smb,
  MAX(CASE WHEN t IN ('escalated_csm', 'internal_escalation_csm', 'csm_reopen_and_escalate') THEN true END) AS escalated_to_csm,
  MAX(CASE WHEN t LIKE 'escalated_onboarder' THEN true END) AS escalated_to_ob,
  MAX(CASE WHEN t IN('escalated_davidperl','escalated_billing/credit_approval') THEN true END) AS escalated_credit_approval,
  MAX(CASE WHEN t = 'escalated_to_lds' THEN true END) AS escalated_to_lds,
  MAX(CASE WHEN t = 'downgrade_to_dss' THEN true END) AS downgrade_to_dss,
  MAX(CASE WHEN t IN('finance_escalated','glite_finance_escalated') THEN true END) AS escalated_to_finance,
  MAX(CASE WHEN t IN('billing_ops_escalated','internal_escalation_billing_ops') THEN true END) AS escalated_billing_ops,
  MAX(CASE WHEN t IN('collection_team_escalated','internal_escalation_collection') THEN true END) AS escalated_to_collection,
  MAX(CASE WHEN t = 'company-information-update' THEN true END) AS escalated_contract_request,
  MAX(CASE WHEN t = 'auto_end_session_when_ticket_created' THEN true END) AS auto_end_session_when_ticket_created,
  MAX(CASE WHEN t = 'apply_credit_refund_view' THEN true END) AS apply_credit_refund_view,
  MAX(CASE WHEN t = 'gus_replied_email' THEN true END) AS gus_replied_email, 
  MAX(CASE WHEN t = 'undeflect_gus_emailbot' THEN true END) AS undeflect_gus_emailbot, 
  MAX(CASE WHEN t = 'gus_emailbot_pro_routed' THEN true END) AS gus_emailbot_routed,
  MAX(CASE WHEN t = 'gus_emailbot_attachment' THEN true END) AS gus_emailbot_attachment,
  MAX(CASE WHEN t = 'small_domain_weekend' THEN true END) AS small_domain_weekend , 
  MAX(CASE WHEN t = 'lds_endorsement' THEN true END) AS lds_endorsement,
  MAX(CASE WHEN t = 'lds_ticket_classification' THEN true END) AS lds_ticket_classification,
  MAX(CASE WHEN t = 'lds_live_assistance' THEN true END) AS lds_live_assistance,
  MAX(CASE WHEN t = 'gus_hc' THEN true END) AS gus_hc,
  STRING_AGG(t, ', ' ORDER BY t) all_tags
FROM `guesty-data.zendesk.tickets`, UNNEST(tags) t
GROUP BY id
),

gfp_accounts AS 
(
SELECT account_id,  
       account_name,
       account_created_at,
       account_first_paid,
       package,
       solutions_expert,
       csm,
       months_in_guesty,
       sf_account_id,
       account_segmentation,
       onboarding_status,
       avg_mrr,
       case when churn_date is null then false else true end as is_churn,
       if (date_diff(coalesce(churn_date, current_date), date(onboarding_completion_date), month) <= 12, 'Less than 1 year', 'More than 1 year') at_guesty,
       account_active,
       partition_date AS account_partition_date
FROM `guesty-data.guesty_analytics.dim_accounts`  
WHERE partition_date = CURRENT_DATE() - 1  
),

gfh_accounts AS 
(
select 
      account_email,
      max(account_id) account_id,
      max(guesty_account_id) guesty_account_id,
      account_created_date,
      is_trial, 
      CASE 
        WHEN churn_date is null and first_churn_date is not null then 'churned in past'
        WHEN churn_date is not null then 'is churn'
      ELSE 'never churned' END AS churn_status,
      is_churn
from `guesty-data.porter.dim_accounts` 
where partition_date = CURRENT_DATE() - 1  
and verified
group by all
),

io AS (
SELECT 
  ticket_id,
  COUNT(DISTINCT incoming) incoming,
  COUNT(DISTINCT CASE WHEN guesty_employee AND event_user_email != 'omri.algazi@guesty.com' THEN outgoing END) outgoing,
FROM `guesty-data.zendesk_analytics.incoming_outgoing` 
GROUP BY ALL
),

tickets_0 AS
(
SELECT
  CAST(t.id AS STRING) ticket_id,
  CONCAT('https://guesty3396.zendesk.com/agent/tickets/',t.id) AS ticket_url,
  CASE WHEN mr.activation_time IS NOT NULL AND COALESCE(via_source_rel,via_channel) IN('native_messaging','sunshine_conversations_api','chat') THEN GREATEST(activation_time, t.created_at) ELSE t.created_at END AS created_at,
  CASE
    WHEN t.brand_id = 7218885869213 THEN 'GFP'
    WHEN t.brand_id = 23059389562141 THEN 'GLite'
    WHEN t.brand_id = 7720007249693 THEN 'GFH'
    WHEN t.brand_id = 8677829236765 THEN 'Guesty Pay'
    WHEN t.brand_id = 10434613543709 THEN 'Yield Planet'
    WHEN t.brand_id = 12471530485533 THEN 'GDH Partners'
    WHEN t.brand_id = 26958084726173 THEN 'Billing Ops'
  END AS brand,
  (SELECT MAX(IF(id = 8361347822749, value, NULL)) FROM UNNEST(custom_fields)) AS account_id,
  o.organization_fields_guesty_admin_id,
  t.updated_at,
  g.name AS group_name,
  forms.name AS form_name,
  t.type,
  (SELECT MAX(IF(id = 14933063138205, value, NULL)) FROM UNNEST(custom_fields)) AS guesty_package,
  (SELECT MAX(IF(id = 24705802516253, value, NULL)) FROM UNNEST(custom_fields)) AS reopen_reason,
  (SELECT MAX(IF(id = 8361344342429, value, NULL)) FROM UNNEST(custom_fields)) AS ob_email,
  (SELECT MAX(IF(id = 17206535281309, value, NULL)) FROM UNNEST(custom_fields)) AS multi_level_category,
  (SELECT MAX(IF(id = 17931231267741, value, NULL)) FROM UNNEST(custom_fields)) AS gfh_multi_level_category,
  (SELECT MAX(IF(id = 17836172895005, value, NULL)) FROM UNNEST(custom_fields)) AS glite_multi_level_category,
  (SELECT MAX(IF(id = 32853083380381, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_multi_level_category,
  (SELECT MAX(IF(id = 27220026352669, value, NULL)) FROM UNNEST(custom_fields)) AS billing_category,
  (SELECT MAX(IF(id = 19328683098269, value, NULL)) FROM UNNEST(custom_fields)) AS api_task_domain,
  (SELECT MAX(IF(id = 15288057449501, value, NULL)) FROM UNNEST(custom_fields)) AS ultimate,
  (SELECT MAX(IF(id = 16675903464989, value, NULL)) FROM UNNEST(custom_fields)) AS sentiment,
  (SELECT MAX(IF(id = 18585605397789, value, NULL)) FROM UNNEST(custom_fields)) AS int_esc_point,
  (SELECT MAX(IF(id = 16675844068253, value, NULL)) FROM UNNEST(custom_fields)) AS urgency,
  (SELECT MAX(IF(id = 10764797959837, value, NULL)) FROM UNNEST(custom_fields)) AS bulk_task,
  (SELECT MAX(IF(id = 8665992190493, value, NULL)) FROM UNNEST(custom_fields)) AS issue_type,
  (SELECT MAX(IF(id = 7218869370269, value, NULL)) FROM UNNEST(custom_fields)) AS group_a,
  (SELECT MAX(IF(id = 13647004908573, value, NULL)) FROM UNNEST(custom_fields)) AS incorrect_csat_assignee,
  (SELECT MAX(IF(id = 13647038030237, value, NULL)) FROM UNNEST(custom_fields)) AS old_corrected_csat_assignee,
  (SELECT MAX(IF(id = 30056008055453, value, NULL)) FROM UNNEST(custom_fields)) AS corrected_csat_assignee,
  (SELECT MAX(IF(id = 8361550342301, value, NULL)) FROM UNNEST(custom_fields)) AS knowledge,
  (SELECT MAX(IF(id = 26354684927133, value, NULL)) FROM UNNEST(custom_fields)) AS known_issue,
  (SELECT MAX(IF(id = 21425214512413, value, NULL)) FROM UNNEST(custom_fields)) AS leveling,
  (SELECT MAX(IF(id = 31146020474141, value, NULL)) FROM UNNEST(custom_fields)) AS segmentation_skill,
  (SELECT MAX(IF(id = 27219843136285, value, NULL)) FROM UNNEST(custom_fields)) AS billing_urgency,
  (SELECT MAX(IF(id = 27219921964957, value, NULL)) FROM UNNEST(custom_fields)) AS billing_source,
  (SELECT MAX(IF(id = 27219952245533, value, NULL)) FROM UNNEST(custom_fields)) AS billing_submitter,
  (SELECT MAX(IF(id = 27220017767837, value, NULL)) FROM UNNEST(custom_fields)) AS billing_pending_for,
  (SELECT MAX(IF(id = 27220026352669, value, NULL)) FROM UNNEST(custom_fields)) AS billing_issue_type,
  (SELECT MAX(IF(id = 28647862213533, value, NULL)) FROM UNNEST(custom_fields)) AS billing_pending_reason, 
  (SELECT MAX(IF(id = 27220114993437, value, NULL)) FROM UNNEST(custom_fields)) AS billing_solved_reason, 
  (SELECT MAX(IF(id = 11950038923293, value, NULL)) FROM UNNEST(custom_fields)) AS creation_reason,
  (SELECT MAX(IF(id = 11950027654813, value, NULL)) FROM UNNEST(custom_fields)) AS article_jira_url,
  (SELECT MAX(IF(id = 31341124285981, value, NULL)) FROM UNNEST(custom_fields)) AS ticket_summary,
  (SELECT MAX(IF(id = 27008534175261, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_pfr, 
  (SELECT MAX(IF(id = 31843942891933, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_source, 
  (SELECT MAX(IF(id = 25589379756445, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_tech_issue,
  (SELECT MAX(IF(id = 31844078658589, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_category,
  (SELECT MAX(IF(id = 32853083380381, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_subcategory, -- old 31844553282589
  (SELECT MAX(IF(id = 29166200583069, value, NULL)) FROM UNNEST(custom_fields)) AS is_child_parent_id, 
  (SELECT MAX(IF(id = 7218866523805, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_assignee, 
  (SELECT MAX(IF((id = 14413233962653 AND t.brand_id = 10434613543709) OR (id = 8322947932189 AND t.brand_id = 7720007249693) OR (id = 8249972141085 AND t.brand_id = 7218885869213), value, NULL)) FROM UNNEST(custom_fields)) AS reported_topic,
  (SELECT MAX(IF((id = 8323045798301 AND t.brand_id = 7720007249693) OR (id = 8250071810589 AND t.brand_id = 7218885869213), value, NULL)) FROM UNNEST(custom_fields)) AS reported_feature,
  (SELECT MAX(IF((id = 8328284353693 AND t.brand_id = 7720007249693) OR (id = 8250018544797 AND t.brand_id = 7218885869213), value, NULL)) FROM UNNEST(custom_fields)) AS reported_channel,
  (SELECT MAX(IF((id = 14338817678621 AND t.brand_id = 10434613543709) OR (id = 7776209070621 AND t.brand_id = 7720007249693) OR (id = 7776207191197 AND t.brand_id IN(7218885869213, 23059389562141)), value, NULL)) FROM UNNEST(custom_fields)) AS domain,
  (SELECT MAX(IF((id = 9558544319133 AND t.brand_id = 7720007249693) OR (id = 8899556344477 AND t.brand_id = 7218885869213), value, NULL)) FROM UNNEST(custom_fields)) AS previous_domain,
  COALESCE(via_source_rel,via_channel) AS channel,
  mc.main_category,
  sc.sub_category,
  t.priority,
  s.agent_label AS ticket_status,
  (SELECT MAX(IF(id = 7964941172509, value, NULL)) FROM UNNEST(custom_fields)) AS jira_status,
  t.subject,
  t.description,
  (SELECT MAX(IF(id = 7218879407005, value, NULL)) FROM UNNEST(custom_fields)) AS subject_a,
  (SELECT MAX(IF(id = 7218909054109, value, NULL)) FROM UNNEST(custom_fields)) AS description_a,
  (SELECT MAX(IF(id = 8665190894237, value, NULL)) FROM UNNEST(custom_fields)) AS general_issue,
  subm.name AS submitter_name,
  subm.email AS submitter_email,
  subm.role AS submitter_role,
  r.name AS requester_name,
  r.email AS requester_email,
  r.role AS requester_role,
  a.name AS assignee_name,
  a.nickname AS assignee_nickname,
  a.email AS assignee_email,
  a.role AS assignee_role,
  a.role_from_airtable AS team_member_role,
  a.agent_tl AS assignee_tl,
  a.agent_shift AS assignee_shift,
  a.agent_status AS assignee_status,
  t.recipient,
  o.organization_fields_onboarder_email,
  (SELECT MAX(IF(id = 8361340778653, value, NULL)) FROM UNNEST(custom_fields)) AS account_segment,
  o.organization_fields_account_segment,
  o.organization_fields_account_package,
  o.organization_fields_account_email,
  (SELECT MAX(IF(id = 8361318384541, value, NULL)) FROM UNNEST(custom_fields)) AS strategic_account,
  o.organization_fields_strategic_account,
  t.satisfaction_rating,
  csat.created_at AS csat_created,
  CAST(csat.assignee_id AS string) AS csat_assignee_id,
  csat.score AS csat_score,
  csat.reason AS csat_reason,
  csat.comment AS csat_comment,
  (SELECT MAX(IF(id = 9585719140381, value, NULL)) FROM UNNEST(custom_fields)) AS csat_review,
  (SELECT MAX(IF(id = 9585797883421, value, NULL)) FROM UNNEST(custom_fields)) AS csat_review_comment,
  rt.old_max_resolution_minutes,
  rt.old_last_resolution_time,
  rt.times_solved,
  se.first_resolution_time,
  se.last_resolution_time,
  se.current_status,
  se.first_solved_agent,
  se.first_solved_email,
  se.last_solved_email,
  IFNULL(se.reopened_after_solved,0) reopened_after_solved,
  se.last_status_change,
  se.resolution_minutes_exc_cust,
  se.pending_user_time,
  COALESCE(se.status_pending_t3, false) AS status_pending_t3,
  COALESCE(se.escalated_3rd_party, false) AS escalated_3rd_party,
  fr.tickts_fr_time,
  fr.yip_fr_mnts,
  fr.first_response_agent_name,
  fr.first_response_agent_email,
  fr.first_response_body,
  fr_nfar.fr_nfar,
  mr.msg_reply_time,
  mr.msg_reply_sec,
  mr.sla_target,
  mr.msg_sla_breach, 
  c.agents_commented,
  c.agent_comments,
  c.user_comments,
  CASE WHEN c.esc_jira_links THEN c.agent_comments_before_link END AS agent_comments_before_link,
  c.jira_ids,
  COALESCE(c.esc_jira_links, false) AS esc_jira_links, 
  COALESCE(fca.first_comment_agent, false) AS first_comment_agent,
  first_j_priority,
  IF(current_status = 'Deleted', true, false) deleted,
  COALESCE(tags.ticket_transferred, false) AS ticket_transferred,
  COALESCE(tags.gus_ticket, false) AS gus_ticket,
  COALESCE(tags.gus_expired, false) AS gus_expired,
  COALESCE(tags.gus_routed, tags.gus_routed_after_abandon, false) AS gus_routed,
  COALESCE(tags.gus_replied_email, false) AS gus_email_ticket, 
  COALESCE(tags.undeflect_gus_emailbot, tags.gus_emailbot_routed, false) AS gus_email_routed, 
  COALESCE(tags.gus_emailbot_attachment, false) AS gus_emailbot_attachment, 
  COALESCE(tags.zowie_ticket, false) AS zowie_ticket, 
  COALESCE(tags.lms_training, false) AS lms_training, 
  COALESCE(tags.uber_enterprise, false) AS uber_enterprise,
  COALESCE(tags.merged, false) AS merged,
  COALESCE(reopen_ty_last, false) AS reopen_ty_last,
  COALESCE(tags.proactive_communication, false) AS proactive_outreach,
  COALESCE(tags.reopened_ty_tag, false) AS reopened_ty_tag,
  COALESCE(tags.frt_outlier, false) AS frt_outlier,
  COALESCE(tags.escalated_to_is, false) AS escalated_to_is,
  COALESCE(tags.downgrade_to_dss, false) AS downgraded_to_dss,
  COALESCE(tags.escalated_to_lds, tags.downgrade_to_dss, false) AS escalated_to_lds,
  COALESCE(tags.escalated_to_ob, false) AS escalated_to_ob,
  COALESCE(tags.escalated_to_csm, false) AS escalated_to_csm,
  COALESCE(tags.escalated_to_smb, false) AS escalated_to_smb,
  COALESCE(tags.escalated_credit_approval, false) AS escalated_credit_approval,
  COALESCE(tags.escalated_to_finance, false) AS escalated_to_finance,
  COALESCE(tags.escalated_to_collection, false) AS escalated_to_collection,
  COALESCE(tags.escalated_billing_ops, false) AS escalated_billing_ops,
  COALESCE(tags.escalated_contract_request, false) AS escalated_contract_request,
  COALESCE(tags.auto_end_session_when_ticket_created, false) AS auto_end_session,
  COALESCE(tags.apply_credit_refund_view, false) AS apply_credit_refund, 
  COALESCE(tags.small_domain_weekend, false) AS small_domain_weekend, 
  COALESCE(tags.lds_endorsement, false) AS lds_endorsement, 
  COALESCE(tags.lds_ticket_classification, false) AS lds_ticket_classification, 
  COALESCE(tags.lds_live_assistance, false) AS lds_live_assistance, 
  COALESCE(tags.gus_hc, false) AS gus_hc, 
  COALESCE(tags.rst_outlier, false) AS rst_outlier,
  tags.all_tags,
  tags.incident_id,
  COALESCE(CASE WHEN (subm.email = 'integrationsupport@expediagroup.com' AND REGEXP_CONTAINS(subject, 'OLB Integration Audit Report|Vrbo Unit Availability Integration|Vrbo Listing Integration|Vrbo Lodging|Vrbo Booking Update'))
                      OR (subm.email = 'support@icoastalnet.com' AND subject LIKE('%ICND Ticket: 141915%'))
                      OR (subm.email = 'help@tripadvisorsupport.com' AND REGEXP_CONTAINS(subject, 'How would you rate the support you received?|Guesty Property Type Sync'))
                      OR (subm.email = 'tavrsupport@tripadvisor.com' AND subject LIKE('%TripAdvisor Rentals%'))
                      OR (subm.email = 'customersupport@holidaylettings.co.uk' AND subject LIKE('%TripAdvisor Rentals%'))
                      OR (subm.email = 'noreply.connectivity@booking.com' AND subject LIKE('%Help us to improve by taking this survey%'))
                      OR (subm.email = 'apitechsupport@airbnb.com')
                      OR (t.id in (1695823,1695778,1675526,1650116,1655428,1656592,1657381,1661028,1666593)) -- GUS NON FRICTION
            THEN TRUE ELSE tags.non_friction_ticket END, false) AS non_friction_ticket,
  COALESCE(tags.auto_solved, false) AS auto_solved
FROM `guesty-data.zendesk.tickets` t
  LEFT JOIN `guesty-data.zendesk.groups` g ON t.group_id = g.id
  LEFT JOIN `guesty-data.zendesk.ticket_forms` forms ON t.ticket_form_id = forms.id
  LEFT JOIN organizations o USING(organization_id)
  LEFT JOIN zd_users subm ON t.submitter_id = subm.id
  LEFT JOIN zd_users r ON t.requester_id = r.id
  LEFT JOIN zd_users a ON CAST(t.assignee_id AS int64) = a.id
  LEFT JOIN csat ON csat.ticket_id = t.id
  LEFT JOIN statuses s ON t.custom_status_id = s.custom_status_id
  LEFT JOIN status_events se ON t.id = se.ticket_id
  LEFT JOIN first_response fr ON t.id = fr.ticket_id
  LEFT JOIN msg_replies mr ON CAST(t.id AS STRING) = mr.ticket_id
  LEFT JOIN fr_nfar ON t.id = fr_nfar.ticket_id
  LEFT JOIN jiras_n_comments c ON t.id = c.ticket_id 
  LEFT JOIN resolution_times rt ON t.id = rt.ticket_id 
  LEFT JOIN tags ON t.id = tags.id 
  LEFT JOIN reopen_ty_events ty ON t.id = ty.ticket_id
  LEFT JOIN main_categories mc ON t.id = mc.id
  LEFT JOIN sub_categories sc ON t.id = sc.id 
  LEFT JOIN first_comment_agent fca ON t.id = fca.ticket_id
),

gs_api_new_categories AS (
SELECT  
  Old_value,
  Correct_New_Values
FROM `guesty-data.zendesk_analytics.gs_api_new_categories` 
),

tickets_1 AS
(
SELECT
  * EXCEPT(csat_assignee_id, account_segment, account_id, agent_comments, user_comments, agent_comments_before_link, submitter_email, submitter_role, multi_level_category),
  CASE WHEN brand = 'Yield Planet' THEN yip_fr_mnts ELSE TIMESTAMP_DIFF(tickts_fr_time, created_at, MINUTE) END AS tickets_fr_mnts,
  IF(channel = 'web_widget' AND submitter_email = 'zendesk@guesty.com', requester_email, submitter_email) submitter_email,
  IF(channel = 'web_widget' AND submitter_email = 'zendesk@guesty.com', requester_role, submitter_role) submitter_role,
  COALESCE(Correct_New_Values, multi_level_category) multi_level_category,
  CASE 
    WHEN channel IN('native_messaging','sunshine_conversations_api') THEN io.outgoing
    WHEN channel = 'inbound' THEN agent_comments + 1 
  ELSE agent_comments END AS agent_comments,	
  CASE 
    WHEN channel IN('native_messaging','sunshine_conversations_api') THEN io.incoming
    WHEN channel IN ('inbound', 'chat') THEN user_comments + 1 
  ELSE user_comments END AS user_comments,
  CASE 
    WHEN channel IN('native_messaging','sunshine_conversations_api') THEN null
    WHEN agent_comments_before_link IS NOT NULL AND channel IN ('inbound') THEN agent_comments_before_link + 1 
  ELSE agent_comments_before_link END AS agent_comments_before_link,
  COALESCE(IF(TRIM(account_id)='' OR account_id = 'null', null, account_id), organization_fields_guesty_admin_id) AS account_id,
  IF(TRIM(account_segment)='' OR account_id = 'null', null, account_segment) AS account_segment,
  COALESCE(IF(TRIM(old_corrected_csat_assignee) = '', NULL, old_corrected_csat_assignee), csat_assignee_id) AS csat_assignee_id,
  CASE WHEN esc_jira_links OR status_pending_t3 THEN true ELSE false END AS escalated_t3
FROM tickets_0
  LEFT JOIN io USING (ticket_id)
  LEFT JOIN gs_api_new_categories ON Old_value = multi_level_category
),

tickets_2 AS
(
SELECT 
  ticket_id,
  ticket_url,
  created_at,
  CASE 
    WHEN EXTRACT(DAYOFWEEK FROM DATE(created_at)) IN(1,7) THEN true
  ELSE false END AS is_weekend,
  DATE_DIFF(CURRENT_DATE, DATE(t.created_at), DAY) AS days_since_open,
  DATE_DIFF(CURRENT_DATE, DATE(t.last_status_change), DAY) AS days_since_last_status_change,
  TIMESTAMP_DIFF(TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR), t.last_status_change, HOUR) AS hrs_since_last_status_change,
  brand,
  CASE 
    WHEN guesty_package LIKE '%glite' THEN 'Lite' 
    WHEN guesty_package LIKE '%pro' THEN 'Pro' 
    WHEN guesty_package LIKE '%nterprise' THEN 'Enterprise' 
  END AS guesty_package,
  ultimate,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(sentiment, '_+', ' '), r'^\w+\s*', '')) AS sentiment,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(urgency, '_+', ' '), r'^\w+\s*', '')) AS urgency,
  TRIM(INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(reopen_reason, 'reopen_reason_',''), '_+', ' '))) reopen_reason,
  bulk_task,
  COALESCE(IF(TRIM(t.account_id)='', null, t.account_id), u.account_id, gfh.guesty_account_id) AS account_id,
  COALESCE(IF(TRIM(t.account_segment)='', null, t.account_segment), gfp.account_segmentation, organization_fields_account_segment) AS account_segment,
  organization_fields_strategic_account AS strategic_account,	
  organization_fields_account_email as organization_account_email,
  CASE 
    WHEN LOWER(organization_fields_account_package) LIKE '%lite' THEN 'Lite' 
    WHEN LOWER(organization_fields_account_package) LIKE '%pro' THEN 'Pro' 
    WHEN LOWER(organization_fields_account_package) LIKE '%nterprise' THEN 'Enterprise' 
  END AS organization_fields_account_package,
  gfp.account_name,
  gfp.account_first_paid,
  gfp.package,
  gfp.csm, 
  gfp.solutions_expert,
  gfp.months_in_guesty,
  gfp.sf_account_id,
  gfp.onboarding_status,
  gfp.avg_mrr,
  COALESCE(gfp.is_churn, gfh.is_churn) is_churn,
  at_guesty,
  gfh.churn_status,
  gfp.account_active,
  updated_at,
  form_name,
  group_name,
  type,
  IF(creation_reason IS NULL OR creation_reason = '', 'Not Provided', INITCAP(REGEXP_REPLACE(creation_reason, 'ticket_creation_reason_', ""))) creation_reason,
  article_jira_url,
  ticket_summary,
  gst_pay_pfr,
  INITCAP(REPLACE(REGEXP_REPLACE(gst_pay_source, r'^guestypay__source_', ''), '_', ' ')) AS gst_pay_source,
  gst_pay_tech_issue,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(gst_pay_category, r'^guestypay__category_', ''),r'_', ' ')) gst_pay_category,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(gst_pay_subcategory, r'^pay_', ''),r'_', ' ')) gst_pay_subcategory,
  is_child_parent_id,
  gst_pay_assignee,
  IF(submitter_email <> t.requester_email, TRUE, FALSE) opened_on_behalf,
  CASE 
	  WHEN channel = 'native_messaging' and gus_hc then 'Messaging: HC'
	  WHEN channel = 'native_messaging' then 'Messaging: Widget'
	  WHEN channel = 'web' then 'Ticket: HC'
	  WHEN channel = 'web_widget' then 'Ticket: Widget'
    WHEN channel = 'sunshine_conversations_api' then 'Messaging: Zowie'
    WHEN channel = 'sunshine_conversations_facebook_messenger' then 'Facebook'
  ELSE INITCAP(channel) END AS channel,
  priority,
  ticket_status,
  CASE WHEN current_status LIKE 'Solved%' AND agent_comments > 0 THEN old_max_resolution_minutes/60 END old_max_resolution_hours,
  times_solved,
  first_solved_agent,
  first_solved_email,
  last_solved_email,
  CASE WHEN current_status LIKE 'Solved%' THEN pending_user_time/60 END pending_user_hours,
  CASE WHEN current_status LIKE 'Solved%' AND NOT rst_outlier THEN resolution_minutes_exc_cust/60 END max_resolution_hours,
  CASE WHEN current_status LIKE 'Solved%' AND NOT rst_outlier THEN TIMESTAMP_DIFF(last_resolution_time, created_at, MINUTE)/60 END full_resolution_hours,
  current_status,
  reopened_after_solved,
  last_status_change,
  first_resolution_time,
  last_resolution_time,
  old_last_resolution_time,
  first_response_agent_name,
  first_response_agent_email,
  first_response_body,
  fr_nfar,
  frt_outlier,
  rst_outlier,
  CASE WHEN requester_email NOT LIKE '%@guesty.com' AND NOT frt_outlier THEN tickets_fr_mnts/60 END AS first_response_hours,
  CASE WHEN channel IN('chat','native_messaging','sunshine_conversations_api') AND NOT auto_end_session THEN COALESCE(msg_reply_time,tickts_fr_time) ELSE COALESCE(tickts_fr_time,msg_reply_time) END AS first_response_time,
  CASE WHEN channel IN('chat','native_messaging','sunshine_conversations_api') AND NOT auto_end_session AND NOT frt_outlier THEN msg_reply_sec/60 END AS msg_fr_mnts,
  CASE  
    WHEN current_status = 'New' THEN NULL
    WHEN channel IN('chat','native_messaging','sunshine_conversations_api') AND NOT auto_end_session THEN msg_sla_breach 
    WHEN tickets_fr_mnts IS NOT NULL THEN IF(tickets_fr_mnts > sla_target, 'Breach', 'Non-breach') 
  ELSE NULL END AS sla_breach,
  reopen_ty_last,
  agents_commented,
  agent_comments,
  agent_comments_before_link,
  user_comments,
  IF(TRIM(jira_ids) = '', null, jira_ids) jira_ids,
  jira_status,
  known_issue,
  INITCAP(COALESCE(REGEXP_REPLACE(segmentation_skill, 'visible_segmentation_',''), REGEXP_REPLACE(leveling, 'level_',''))) leveling,
  billing_urgency,
  billing_source,
  billing_submitter,
  billing_pending_for,
  billing_issue_type,
  billing_pending_reason,
  billing_solved_reason, 
  subject,
  description,
  IF(issue_type LIKE '%_issue_type_%', SUBSTRING(issue_type, 23),issue_type) issue_type,
  CASE 
    WHEN issue_type LIKE '%general_issue%' THEN 'General Issue'
    WHEN brand IN('GFP','GFH','GLite') THEN REGEXP_REPLACE(IF(domain LIKE '%_domain_%', SUBSTRING(domain, 12),SUBSTRING(domain, 5)), '_+', ' ') 
    WHEN brand = 'Guesty Pay' AND domain IS NULL THEN 'Guesty Pay'
    WHEN brand = 'Yield Planet' THEN REGEXP_REPLACE(SUBSTRING(domain, 19), '_+', ' ')
    -- AND domain IS NULL THEN 'Yield Planet'
  ELSE domain END AS domain,
  TRIM(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(main_category, '_+', ' ')), r'^[|]', '')) main_category,
  TRIM(REGEXP_REPLACE(TRIM(REGEXP_REPLACE(sub_category, '_+', ' ')), r'^[|]', '')) sub_category,
  SPLIT(COALESCE(multi_level_category, glite_multi_level_category, gfh_multi_level_category, billing_category, gst_pay_multi_level_category), '______')[SAFE_OFFSET(1)] AS clean_multi_level,
  IF(previous_domain LIKE '%_domain_%', SUBSTRING(previous_domain, 12),previous_domain) previous_domain,
  IF(knowledge LIKE 'knowledge_%', SUBSTRING(knowledge, 18),knowledge) knowledge,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(int_esc_point, r'^internal_escalation\_+', ''), '_+', ' ')) AS int_esc_point,
  INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(api_task_domain, r'^api_related_domain\_+', ''), '_+', ' ')) AS api_task_domain,
  CASE 
    WHEN reported_channel IS NOT NULL AND reported_channel <> '' THEN REGEXP_REPLACE(reported_channel, r'^.*channel_', '')
    WHEN reported_feature IS NOT NULL AND reported_feature <> '' THEN REGEXP_REPLACE(reported_feature, r'^.*feature_', '')
    WHEN reported_topic IS NOT NULL AND reported_topic <> '' THEN REGEXP_REPLACE(reported_topic, r'^.*customer_topic_', '')
  ELSE 'Not Reported' END AS reported_topic,
  COALESCE(ob_email, organization_fields_onboarder_email) AS ob_email,	
  zowie_ticket,
  gus_emailbot_attachment gus_emailbot_attachment,
  lms_training,
  uber_enterprise,
  status_pending_t3,
  escalated_3rd_party,
  esc_jira_links,
  first_j_priority,
  escalated_t3,
  escalated_to_smb,
  escalated_to_csm,
  escalated_to_ob,
  escalated_credit_approval, 
  escalated_to_finance,
  escalated_to_collection,
  escalated_billing_ops,
  escalated_contract_request, 
  auto_end_session,
  apply_credit_refund,
  merged,
  proactive_outreach,
  first_comment_agent,
  incident_id,
  all_tags,
  deleted,
  non_friction_ticket,
  auto_solved,
  escalated_to_is,
  downgraded_to_dss,
  escalated_to_lds,                 
  ticket_transferred,
  gus_ticket,
  gus_expired,
  gus_routed,
  gus_email_ticket,
  gus_email_routed,
  IF(small_domain_weekend, false, true) AS business_hours,
  lds_endorsement,
  lds_ticket_classification,
  lds_live_assistance,
  IFNULL(reopen_ty_last, FALSE) OR IFNULL(reopened_ty_tag, FALSE) AS reopened_thankyou,
  submitter_name,
  submitter_email,
  submitter_role,
  requester_name,
  requester_email,
  requester_role,
  assignee_name,
  assignee_nickname,
  assignee_email,
  assignee_role,
  team_member_role,
  assignee_tl,
  assignee_shift,
  assignee_status,
  recipient,
  satisfaction_rating,
  CAST(CASE WHEN csat_score = 'good' THEN ticket_id ELSE null END as int64) AS positive,
  CAST(CASE WHEN csat_score = 'bad' THEN ticket_id ELSE null END as int64) AS negative,
  csat_created,
  COALESCE(csat_user.name, old_csat_user.name) AS csat_name,
  COALESCE(csat_user.email, old_csat_user.email) AS csat_email,
  COALESCE(csat_user.agent_tl, old_csat_user.agent_tl) AS csat_user_tl,
  COALESCE(csat_user.agent_shift, old_csat_user.agent_shift) AS csat_user_shift,
  COALESCE(csat_user.agent_status, old_csat_user.agent_status) AS csat_user_status,
  csat_score,
  csat_reason,
  csat_comment,
  incorrect_csat_assignee AS corrected_csat_assignee,
  INITCAP(REPLACE(SAFE.REGEXP_EXTRACT(csat_review, r'csat_category___(.*?)______'),'_',' ')) AS csat_cx_related,
  INITCAP(REPLACE(CASE
        WHEN csat_review LIKE 'post_csat_review_%' THEN REGEXP_EXTRACT(csat_review, r'post_csat_review_(.+)$')
        ELSE SAFE.REGEXP_EXTRACT(csat_review, r'______([a-zA-Z0-9_/]+)$')
  END,'_',' ')) AS csat_review,
  csat_review_comment,
  GREATEST(IFNULL(gfh.account_created_date,'1999-01-01'), IFNULL(gfp.account_created_at,'1999-01-01')) account_created_at,
  CASE WHEN gfp.account_created_at IS NULL THEN IF(DATE_DIFF(DATE(t.created_at), gfh.account_created_date, day) BETWEEN 0 AND 14, true, false) END AS in_trial_gfh,
FROM tickets_1 t
  LEFT JOIN dim_users u ON t.requester_email = u.email 
  LEFT JOIN gfh_accounts gfh ON t.requester_email = gfh.account_email 
  LEFT JOIN gfp_accounts gfp ON t.account_id = gfp.account_id
  LEFT JOIN zd_users old_csat_user ON t.csat_assignee_id = CAST(old_csat_user.id AS string)
  LEFT JOIN zd_users csat_user ON LOWER(t.corrected_csat_assignee) = LOWER(csat_user.email)
WHERE LOWER(subject) NOT IN('scrubbed','test')
  AND LOWER(description) NOT IN('test')
  AND ticket_id != '10009'
  AND ticket_id NOT IN(
                        SELECT ticket_id FROM `guesty-data.zendesk_analytics.tickets_clean` 
                        WHERE submitter_email = 'support@icoastalnet.com' AND DATE(created_at) < '2023-05-18' AND ticket_id <> '1165662'
                      )                   
),

tickets_3 AS
(
SELECT 
  * EXCEPT(main_category, sub_category, domain, account_segment, guesty_package, organization_fields_account_package, package, urgency, sentiment, int_esc_point),
  CASE 
    WHEN brand = 'GFH' THEN 'GFH'
    WHEN brand = 'Yield Planet' THEN 'Yield Planet'
    ELSE IF(account_segment IS NULL OR account_segment IN('','NA'), 'Not Segmented', account_segment) 
  END AS account_segment,
  CASE 
    WHEN LOWER(jira_ids) LIKE '%pfr%'AND TRIM(REGEXP_REPLACE(jira_ids, r'\b\w*PFR-\d+\b,?', '')) = '' THEN 'Only PFR'
    WHEN LOWER(jira_ids) NOT LIKE '%pfr%' THEN 'Non-PFR'
    WHEN jira_ids <> '' THEN 'Both'
  END AS escalat_type,
  INITCAP(COALESCE(guesty_package, organization_fields_account_package, IF(TRIM(package)='', null, package), 'Pro')) AS package,
  IF(TRIM(sentiment) = '', null, sentiment) sentiment,
  IF(TRIM(urgency) = '', null, urgency) urgency,
  CASE  
    WHEN int_esc_point IS NULL OR TRIM(int_esc_point)='' THEN 'Not Escalated'
    WHEN int_esc_point = 'Api Task' THEN 'Api Support'
    WHEN int_esc_point IN ('Credit/Refund Approval', 'Credit/Refund Approval Gfh/Glite') THEN 'Credit/Refund Approval (CX internal)'
    WHEN int_esc_point IN ('New Agreement For Small Accounts Pro ', 'Retention Small Accounts', 'Upsell For Small Accounts', 'Upsell') THEN 'Csm'
    WHEN int_esc_point IN ('Gpro Credit/Refund Appliers', 'Glite Credit/Refund - Appliers Only') THEN 'Credit/Refund Appliers'
    WHEN int_esc_point LIKE 'Finance%' THEN 'Finance'
    WHEN int_esc_point = 'Retention For Gfh/Glite' THEN 'Retention For Glite/Gfh'
    WHEN int_esc_point = 'Information Systems - Billing Bugs, Billing Tasks' THEN 'Information Systems - Zuora team'
    WHEN int_esc_point = 'Marketing (Gfh/Glite)' THEN 'Marketing'
    WHEN int_esc_point = 'Upsell For Gfh/Glite' THEN 'Sales'
    WHEN int_esc_point = 'Dev Slack (Api Support Only)' THEN 'Dev Slack (used by API Support only)'
  ELSE int_esc_point END AS int_esc_point,
  IF(account_created_at = '1999-01-01', null, DATE_DIFF(DATE(created_at), account_created_at, DAY)) account_days_to_ticket,
  IF(account_created_at = '1999-01-01', null, DATE_DIFF(DATE(created_at), account_created_at, MONTH)) account_months_to_ticket,
  CASE 
    WHEN TRIM(INITCAP(domain)) = 'Guesty Smart Locks' THEN 'Guesty Locks Manager'
    WHEN TRIM(INITCAP(domain)) = 'Damage Protection' THEN 'Guesty Shield'
    WHEN TRIM(INITCAP(domain)) = 'Listings' THEN 'Properties'
    WHEN TRIM(INITCAP(domain)) = 'Bookingpal' THEN 'BookingPal Marriott Homes and Villas'
  ELSE domain END AS domain,
  SPLIT(clean_multi_level, '_____')[SAFE_OFFSET(0)] AS multi_level_main_category,
  SPLIT(clean_multi_level, '_____')[SAFE_OFFSET(1)] AS multi_level_subcategory,
  REGEXP_REPLACE(LOWER(main_category), LOWER(domain), "") main_category,
  CASE WHEN main_category LIKE '%uestybookingwebsite%' THEN sub_category ELSE REGEXP_REPLACE(LOWER(sub_category), LOWER(main_category), "") END sub_category,
FROM tickets_2
),

glite_trial AS
(
SELECT distinct
  account_id,
  partition_date,
  COALESCE(trial_ended_at, account_created_at + 17) trial_ended_at
FROM `guesty-data.product_glite.account_metrics` 
WHERE partition_date = CURRENT_DATE()
),

tickets_4 AS
(
SELECT
  t.* EXCEPT(main_category, sub_category, multi_level_main_category, multi_level_subcategory, account_segment, package),
  CASE 
    WHEN brand = 'GFH' THEN 'GFH' 
    WHEN brand = 'Yield Planet' THEN 'YiP' 
  ELSE package END package,
  CASE 
    WHEN account_segment IN('Mid-Market1','Mid-Market 1','Mid-Market2','Mid-Market 2') THEN 'Mid-Market'
  ELSE account_segment END AS account_segment,
  CASE WHEN brand = 'Yield Planet' OR issue_type != 'general_issue' THEN TRIM(REGEXP_REPLACE(main_category, r'^[|]', '')) END main_category,
  CASE WHEN brand = 'Yield Planet' OR issue_type != 'general_issue' THEN TRIM(REGEXP_REPLACE(sub_category, r'^[|]', '')) END sub_category,
  TRIM(REGEXP_REPLACE(multi_level_main_category, '_+', ' ')) multi_level_main_category,
  TRIM(REGEXP_REPLACE(multi_level_subcategory, '_+', ' ')) multi_level_subcategory,
  CAST(CASE WHEN sentiment IN('Negative','Extremely Negative') THEN ticket_id ELSE null END as int64) AS negative_sentiment,
  CAST(CASE WHEN urgency = 'Urgent' THEN ticket_id ELSE null END as int64) AS urgent_urgency,
  CASE
    WHEN package <> 'Lite' THEN 'Non-Lite'
    WHEN account_first_paid <= DATE(created_at) THEN 'Paid'
    WHEN DATE_DIFF(trial_ended_at, account_created_at, DAY) <= 17 AND trial_ended_at >= DATE(created_at) THEN 'In Trial'
    WHEN DATE_DIFF(trial_ended_at, account_created_at, DAY) > 17 AND trial_ended_at >= DATE(created_at) THEN 'Trial Extended'
    WHEN trial_ended_at <= DATE(created_at) THEN 'Trial Expired'
  END AS in_trial_glite,
  trim(regexp_replace(regexp_replace(jira_ids, r'\b(PFR-\d+|T3-\d+|KO-\d+)\b',''),',','')) escalated_rnd,
FROM tickets_3 t
LEFT JOIN glite_trial gl ON t.account_id = gl.account_id 
),

tickets_5 AS
(
SELECT
  t.* EXCEPT(brand, main_category, sub_category, multi_level_main_category, multi_level_subcategory),
  CASE WHEN package = 'Lite'AND brand NOT IN('Guesty Pay','Billing Ops') THEN 'GLite' ELSE brand END brand,
  INITCAP(COALESCE(IF(TRIM(main_category) = '', 'Not Classified', TRIM(main_category)),multi_level_main_category, 'Not Classified')) main_category,
  INITCAP(COALESCE(IF(TRIM(sub_category) = '', 'Not Classified', TRIM(sub_category)), multi_level_subcategory, 'Not Classified')) sub_category,
  IF((submitter_role IN('agent','admin') AND LOWER(t.domain) LIKE '%api task'), true, false) internal_api_task,
  CASE  
    when escalated_3rd_party then '3rd Party' 
    when int_esc_point in('Finance','Finance Gfh/Glite','Information Systems','Credit/Refund Approval Gfh/Glite') then 'Finance/IS'
    when escalated_rnd != '' and escalated_rnd is not null then 'R&D'
    when escalated_t3 then 'Tier 3'
    when escalated_to_lds or int_esc_point = 'Lds' then 'LDS'
    when escalated_to_csm or int_esc_point = 'Csm' then 'CSM'
    when int_esc_point <> 'Not Escalated' then 'Other Internal'
    when int_esc_point is null or int_esc_point = 'Not Escalated' then 'CX-T1'
  ELSE 'check' end as escalated_to,
FROM tickets_4 t
),

tickets_6 AS
(
SELECT
  * EXCEPT(domain),
  CONCAT(IF(brand = 'Yield Planet', 'YiP',brand),': ', COALESCE(IF(TRIM(domain) = '', null, TRIM(INITCAP(domain))), package)) domain, 
  CASE 
    WHEN gus_email_ticket AND DATE(created_at) <= '2026-02-15' THEN
      CASE WHEN agent_comments = 1 THEN 'Gus Only' ELSE 'Hybrid' END -- Email
    WHEN NOT (gus_ticket AND channel LIKE 'Messaging%') AND gus_email_routed THEN 'Hybrid' -- Email
    WHEN gus_email_ticket THEN 'Gus Only' -- Email
    WHEN gus_expired OR (gus_ticket AND NOT gus_routed) THEN 'Gus Only' -- Chat
    WHEN gus_ticket THEN 'Hybrid'	-- Chat
  ELSE 'Human Only' END gus_automation
FROM tickets_5
),

support_type as
(
SELECT 
  account_id,
  premium_support,
  CASE 
    WHEN support_type = "Inbound Phone Support"  THEN "Widget, Chat & Phone"
    -- WHEN support_type = "Callback" THEN "Widget & Chat & Callback"
    WHEN support_type LIKE "%Chat%" THEN "Widget & Chat"
    WHEN support_type = "Widget" THEN support_type
  ELSE null END AS support_type,
FROM `guesty-data.zendesk_analytics.premium_support` 
),

is_france_or_spain_sf as
(
select  
  a.Guesty_Admin_ID__c as account_id,
  string_agg(trim(c.Language_for_OB__c), ', ') as sf_contact_language,
from `guesty-data.salesforce.sf_contact` c
  left join `guesty-data.salesforce.sf_account` a on c.AccountId = a.Id and c.partition_date = a.partition_date
where c.partition_date = current_date
group by 1
),

is_france_or_spain_ac as 
(
SELECT  
  -- company_country,
  account_country,
  account_active,
  account_first_paid,
  account_id -- company_name, 
FROM `guesty-data.guesty_analytics.dim_accounts` 
WHERE partition_date = current_date-1
),

france_or_spain as 
(
select distinct
  ac.account_id,
  if(ac.account_first_paid is null, 'Non-Paid','Paid') Paid,
  true as is_france_or_spain,
  concat(account_country, ': ', coalesce(sf_contact_language, 'null')) fr_es_detail,
from is_france_or_spain_ac ac
  full outer join is_france_or_spain_sf sf using(account_id)
where ac.account_active
  and (lower(ac.account_country) in('france','spain') or lower(sf.sf_contact_language) in('french','spanish'))
),

gfp_churn as
(
SELECT  
  account_id,
  MAX(from_date) last_churned,
  CASE 
    WHEN MAX(from_date) IS NOT NULL AND MAX(to_date) < CURRENT_DATE() THEN 'churned in past'
    WHEN MAX(to_date) >= CURRENT_DATE() THEN 'is churn'
  ELSE 'nada' END AS churn_status
FROM `guesty-data.guesty_churn.churn_summary` 
group by 1
),

churn as
(
select
  account_segmentation as churn_segment,
  case when churn_date is null then false else true end as churned,
  account_id,
from `guesty-data.guesty_analytics.dim_accounts`
where partition_date = current_date()
 and account_first_paid is not null
 and onboarding_completion_date is not null
 and package = 'pro'
),

sf_ob as
(
select
  partition_date as ob_partition_date,
  Guesty_Admin_ID__c,
  MAX(Onboarding_Completion_Date__c) as ob_completion,
  MIN(Onboarding_Status__c) as onboarding_satus,
  MAX(Onboarding_Stage__c) as onboarding_stage
from `salesforce.sf_account` sf
group by all
)

SELECT
  * EXCEPT(domain_group, domain_1, is_france_or_spain, churn_status, support_type, Guesty_Admin_ID__c, ob_partition_date, first_response_hours, pending_user_hours, max_resolution_hours, full_resolution_hours, first_response_time, msg_fr_mnts),
  COALESCE(CASE 
            WHEN t.domain LIKE 'Guesty Pay%' THEN 'Guesty Pay'
            WHEN LOWER(t.domain) LIKE '%gcs%' THEN 'GCS'
           ELSE d.domain_group END, package
          ) AS domain_group,
  IF(package = 'Pro', COALESCE(support_type, 'N/A'), 'Not Pro') support_type,
  COALESCE(is_france_or_spain, false) is_france_or_spain,
  IF(non_friction_ticket
    OR internal_api_task
    OR lms_training 
    OR merged
    OR deleted
    OR proactive_outreach
    OR t.domain LIKE '%Gcs' 
    OR (reopened_after_solved = 0 AND fr_nfar = 1)
    OR (brand = 'Yield Planet' AND agent_comments = 0 AND ticket_status = 'Solved')
  , false, true) friction_related,
  IF(created_at between '2025-07-09 12:00:00 UTC' and '2025-07-09 21:00:00 UTC', true, false) during_rabbit_MQ_blocker,
  -- CASE WHEN IFNULL(gus_ticket, false) AND IFNULL(user_comments,1) = 0 THEN true ELSE false END gus_non_friction, NOT TO BE USED BEFORE GETTING MESSAGING COMMENTS
  DATETIME(CURRENT_TIMESTAMP(), "Asia/Jerusalem") AS table_last_updated,
  DATE(sf_ob.ob_completion) ob_completed,
  CASE WHEN sf_ob.ob_completion is null AND onboarding_satus IN ('On-boarding','Back to sales','On-boarding paused','Escalated to CSM') THEN 'During OB' ELSE 'Post OB' END ob_status,
  COALESCE(gfpc.churn_status, t.churn_status, 'never churned') churn_status,
  CASE WHEN ((gus_automation = 'Human Only' AND auto_end_session) OR channel NOT IN('chat','Messaging: Widget','Messaging: Zowie')) THEN first_response_hours END AS first_response_hours,
  CASE WHEN agent_comments > 0 OR gus_automation != 'Human Only' then pending_user_hours END pending_user_hours,
  CASE WHEN brand = 'Billing Ops' OR agent_comments > 0 OR gus_automation != 'Human Only' then max_resolution_hours END max_resolution_hours,
  CASE WHEN agent_comments > 0 OR gus_automation != 'Human Only' then full_resolution_hours END full_resolution_hours,
  CASE WHEN gus_automation = 'Human Only' THEN first_response_time ELSE TIMESTAMP_ADD(created_at, INTERVAL 24 SECOND) END first_response_time,
  CASE WHEN ticket_id = '1729948' THEN 0.5 WHEN gus_automation = 'Human Only' THEN msg_fr_mnts ELSE 0.4 END msg_fr_mnts,
FROM tickets_6 t
  LEFT JOIN domains d ON trim(lower(t.domain)) = trim(lower(d.domain_1))
  LEFT JOIN csm_invlv csm USING(ticket_id)
  LEFT JOIN france_or_spain USING(account_id)
  LEFT JOIN gfp_churn gfpc USING(account_id)
  LEFT JOIN churn USING(account_id)
  LEFT JOIN support_type s USING(account_id)
  LEFT JOIN sf_ob ON t.account_id = sf_ob.Guesty_Admin_ID__c AND DATE(t.created_at) = sf_ob.ob_partition_date
```

## Documented columns (225 of 225)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `table_last_updated` | Timestamp of when the table was last updated. | The table_last_updated column is populated with the current timestamp in the 'Asia/Jerusalem' timezone at the time the table is generated. | `DATETIME(CURRENT_TIMESTAMP(), "Asia/Jerusalem") AS table_last_updated` |
| `first_response_agent_email` | Email of the agent who provided the first public response to the ticket. | Extracts the email of the agent from the first public comment on the ticket, considering only comments made by agents and excluding self-comments by the requester. | `event_agent_email AS first_response_agent_email` |
| `creation_reason` | Reason for ticket creation. | Extracts and formats the ticket creation reason from custom fields, defaulting to 'Not Provided' if null or empty. | `IF(creation_reason IS NULL OR creation_reason = '', 'Not Provided', INITCAP(REGEXP_REPLACE(creation_reason, 'ticket_creation_reason_', "")))` |
| `issue_type` | Categorization of the issue type for the ticket. | Extracts the issue type from a custom field, cleaning it by removing a specific prefix if present. | `IF(issue_type LIKE '%_issue_type_%', SUBSTRING(issue_type, 23),issue_type) issue_type` |
| `brand` | The brand associated with the ticket. | Categorizes tickets into brands (e.g., GFP, GLite, GFH) based on the brand ID from the Zendesk tickets table. It maps specific brand IDs to their corresponding brand names. | `CASE WHEN t.brand_id = 7218885869213 THEN 'GFP' WHEN t.brand_id = 23059389562141 THEN 'GLite' WHEN t.brand_id = 7720007249693 THEN 'GFH' WHEN t.brand_id = 8677829236765 THEN 'Guesty Pay' WHEN t.brand_id = 10434613543709 THEN 'Yield Planet' WHEN t.brand_id = 12471530485533 THEN 'GDH Partners' WHEN t.brand_id = 26958084726173 THEN 'Billing Ops' WHEN t.brand_id = 33662788956701 THEN 'Rentals United' END` |
| `escalated_contract_request` | Indicates if the ticket is an escalated contract request. | This column is true if the ticket has the tag 'company-information-update', otherwise false. It identifies tickets related to contract modification requests. | `MAX(CASE WHEN t = 'company-information-update' THEN true END) AS escalated_contract_request` |
| `assignee_shift` | Shift of the assignee. | Derived from the 'agent_shift' column in the 'agents' CTE, which is populated from the 'Shift' column in the 'guesty-data.airtable.cx_team_members' table. | `a.agent_shift AS assignee_shift` |
| `lds` | The LDS (Large Domain Support) associated with the ticket's domain. | This column is derived from the 'LDS' field in the 'domains' table, which is joined based on the ticket's domain. It represents the specific LDS assigned to that domain. | `LDS[SAFE_OFFSET(0)] AS lds` |
| `product_manager` | The product manager associated with the ticket's domain. | The product manager is derived from the 'domains' table by matching the ticket's domain. If no match, it defaults to the package. | `d.Product_Manager AS product_manager` |
| `account_first_paid` | Date when the account made its first payment. | This column is directly retrieved from the `dim_accounts` table for GFP accounts. It represents the date of the first payment made by the account. | `gfp.account_first_paid` |
| `solutions_expert` | The Solutions Expert assigned to the account related to the ticket. | Directly extracted from the `gfp_accounts` CTE, which retrieves account information from `guesty-data.guesty_analytics.dim_accounts`. | `gfp.solutions_expert` |
| `months_in_guesty` | Number of months a Guesty account has been active. | Calculated as the difference in months between the ticket creation date and the account's first paid date from the `dim_accounts` table. | `gfp.months_in_guesty` |
| `churned` | Indicates if the account associated with the ticket has churned. | Derived from the `dim_accounts` table, it's true if the `churn_date` is not null for accounts that are 'pro' package, paid, and have completed onboarding. | `case when churn_date is null then false else true end as churned` |
| `avg_mrr` | Average Monthly Recurring Revenue for the account. | Directly sourced from the `dim_accounts` table, representing the average monthly recurring revenue associated with the account. | `gfp.avg_mrr` |
| `sf_account_id` | Salesforce Account ID associated with the Guesty account. | Derived from the `sf_account_id` field in `guesty-data.guesty_analytics.dim_accounts` for GFP accounts. This column is only populated for GFP accounts. | `gfp.sf_account_id` |
| `churn_segment` | Categorizes accounts based on their churn status and segmentation. | Determines the churn status of an account based on whether it has churned and its segmentation from the `dim_accounts` table. | `account_segmentation as churn_segment` |
| `at_guesty` | Indicates the account's tenure with Guesty, categorized into 'Less than 1 year' or 'More than 1 year'. | Calculated based on the difference in months between the churn date (or current date if not churned) and the onboarding completion date for Guesty accounts. | `if (date_diff(coalesce(churn_date, current_date), date(onboarding_completion_date), month) <= 12, 'Less than 1 year', 'More than 1 year') at_guesty` |
| `account_created_at` | Date when the account was created in Guesty. | Combines the account creation dates from Guesty Analytics and Porter's dim_accounts tables, prioritizing the later date. | `GREATEST(IFNULL(gfh.account_created_date,'1999-01-01'), IFNULL(gfp.account_created_at,'1999-01-01')) account_created_at` |
| `account_active` | Indicates if the account associated with the ticket is active. | Directly sourced from the `dim_accounts` table in `guesty_analytics` for GFP accounts. For GFH accounts, it's derived from the `is_churn` field in `porter.dim_accounts`. | `gfp.account_active` |
| `is_churn` | Indicates if the associated account is currently churned. | Derived from the `is_churn` column in `guesty_analytics.dim_accounts` for GFP accounts or `porter.dim_accounts` for GFH accounts, or from `guesty_churn.churn_summary` for GFP accounts. If an account is not found in either, it is considered not churned. | `COALESCE(gfp.is_churn, gfh.is_churn)` |
| `is_france_or_spain` | Indicates if the account is in France or Spain based on country or contact language. | Determined by checking if the account's country is France or Spain, or if any associated Salesforce contact's language is French or Spanish. | `COALESCE(is_france_or_spain, false) is_france_or_spain` |
| `Paid` | Indicates if the account associated with the ticket is paid or non-paid. | Determined by whether the account has a first paid date. If not, it's 'Non-Paid', otherwise 'Paid'. | `if(ac.account_first_paid is null, 'Non-Paid','Paid') Paid` |
| `last_churned` | Indicates the last date an account associated with the ticket was churned. | This column is derived from the `from_date` in the `guesty_churn.churn_summary` table, representing the last recorded churn date for the account linked to the ticket. | `MAX(from_date) last_churned` |
| `onboarding_stage` | The onboarding stage of the account associated with the ticket. | Determined by the 'Onboarding_Stage__c' field from the Salesforce 'sf_account' table, joined on account_id and creation date. | `MAX(Onboarding_Stage__c) as onboarding_stage` |
| `fr_es_detail` | Details about whether the account is in France or Spain. | Combines account country and Salesforce contact language to determine if an account is associated with France or Spain, and if it's a paid account. | `concat(account_country, ': ', coalesce(sf_contact_language, 'null')) fr_es_detail` |
| `jira_ids` | Jira IDs linked to the ticket, typically for escalated issues. | Aggregates Jira issue keys from the `jira_links` table, specifically for 'Support' issue types, into a comma-separated string. | `STRING_AGG(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN ils.key END,', ') jira_ids` |
| `esc_jira_links` | Indicates if the ticket has any escalated Jira links related to support issues. | This boolean flag is true if any linked Jira issue has an 'issue_type_name' containing 'upport'. It's derived from the 'jira_links' CTE. | `MAX(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN true END) esc_jira_links` |
| `first_j_priority` | Priority of the first linked Jira ticket related to support issues. | Extracts the priority name from the first Jira ticket linked to the Zendesk ticket, specifically for support-related issues. | `MIN_BY(priority_name, CASE WHEN ils.issue_type_name LIKE '%upport%' THEN created_at END) first_j_priority` |
| `first_linked_at` | Timestamp when the ticket was first linked to a Jira issue. | The 'first_linked_at' column captures the earliest timestamp when a Zendesk ticket was linked to a Jira issue, specifically filtering for Jira issues whose type name contains 'upport'. | `MIN(CASE WHEN ils.issue_type_name LIKE '%upport%' THEN created_at END)` |
| `strategic_account` | Indicates if the account associated with the ticket is a strategic account. | Directly retrieves the 'strategic_account' field from the Zendesk organization fields. If not available, it is null. | `o.organization_fields_strategic_account AS strategic_account` |
| `organization_account_email` | Email associated with the organization's account. | Derived from the 'organization_fields_account_email' column in the 'organizations' CTE, which extracts the 'current_owner_email' from the 'organization_fields' JSON. | `o.organization_fields_account_email` |
| `csat_comment` | Comment provided by the customer in their satisfaction rating. | Directly extracts the comment from the Zendesk satisfaction ratings, selecting the most recent one if multiple exist for a ticket. | `csat.comment AS csat_comment` |
| `csat_reason` | Reason provided by the customer for their CSAT score. | Directly extracted from the Zendesk satisfaction ratings table. If a CSAT score is provided, the associated reason is captured. | `csat.reason AS csat_reason` |
| `csat_created` | Timestamp when the customer satisfaction (CSAT) survey was created for the ticket. | The timestamp from the 'created_at' column in the `zendesk.satisfaction_ratings` table, filtered to the most recent CSAT entry for each ticket. | `csat.created_at AS csat_created` |
| `csat_score` | The CSAT score given by the customer for the ticket. | The CSAT score is directly extracted from the satisfaction_ratings table, specifically the 'score' field. If multiple CSAT scores exist for a ticket, the most recent one is selected. | `csat.score AS csat_score` |
| `csat_user_tl` | Team lead of the agent who received the CSAT rating. | Extracts the team lead of the agent associated with the CSAT rating from the `zd_users` table, based on the `csat_assignee_id` or `corrected_csat_assignee`. | `COALESCE(csat_user.agent_tl, old_csat_user.agent_tl)` |
| `last_resolution_time` | Timestamp of the last time the ticket was resolved. | This column captures the timestamp when the ticket's status last changed to 'Solved'. It is derived from the 'status_events_5' CTE, specifically from the 'e_created_at' column when the 'current_status' is 'Solved' and it represents the last such occurrence. | `MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_up_solved = 1 THEN e_created_at ELSE NULL END) AS last_resolution_time` |
| `user_comments` | Number of comments made by the end-user on a ticket. | Counts the number of public comments where the author is the requester (end-user) or their email does not belong to Guesty/Rentals United domains. | `COUNT(DISTINCT CASE WHEN child_event_event_type = 'Comment' AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id = author_id, event_agent_email NOT LIKE '%@guesty.com' AND event_agent_email NOT LIKE '%@rentalsunited.com') THEN e_created_at END)` |
| `csm_inv_public` | Indicates if a Customer Success Manager (CSM) was publicly involved in the ticket. | Derived from ticket events, checking if any public comment was made by an agent with 'Customer Success' in their work title. | `max(case when work_title like '%Customer Success%' and public is true then true end)` |
| `last_status_change` | Timestamp of the most recent status change for the ticket. | This column captures the 'e_created_at' from the latest status event for each ticket, indicating when its status was last updated. | `MAX(CASE WHEN rn_status = 1 THEN e_created_at ELSE null END)` |
| `titles_inv` | Titles of involved agents in a ticket. | Aggregates distinct work titles of agents involved in ticket events. | `string_agg(distinct work_title, ' \| ') titles_inv` |
| `first_response_body` | The body of the first public response from an agent to the ticket. | The 'body' column from the 'first_response_0' CTE, filtered for the first public agent comment where the creation timestamp is not equal to the previous custom status timestamp. | `body AS first_response_body` |
| `csm_inv` | Indicates if a Customer Success Manager (CSM) was involved in the ticket. | This column is a boolean flag derived from the 'csm_inv' column in the 'csm_invlv' CTE, which checks if any agent with 'Customer Success' in their work title was involved in the ticket. | `csm.csm_inv` |
| `first_comment_agent` | Indicates if the first comment on a ticket was made by an agent. | Determined by checking if the author of the first comment on a ticket (ordered by creation time) has an 'agent' role. | `COALESCE(fca.first_comment_agent, false) AS first_comment_agent` |
| `reopen_ty_last` | Indicates if the ticket was reopened with a 'Thank You' comment. | TRUE if the last comment on the ticket was 'Comment added by Triage Webhook: Thank you reopen. NFAR', otherwise FALSE. | `COALESCE(reopen_ty_last, false) AS reopen_ty_last` |
| `fr_nfar` | Indicates if the first internal comment on a ticket contained 'NFAR'. | Counts occurrences of 'NFAR' in the body of the first internal comment (public is FALSE) made by an agent on a ticket. A value of 1 indicates 'NFAR' was present. | `SUM(CASE WHEN body LIKE 'NFAR%' THEN 1 ELSE 0 END)` |
| `agent_comments` | Number of agent comments on the ticket. | Counts distinct timestamps of public comments made by agents (Guesty/Rentals United employees) on the ticket. For messaging channels, it counts outgoing messages. | `CASE      WHEN channel IN('native_messaging','sunshine_conversations_api') THEN io.outgoing     WHEN channel = 'inbound' THEN agent_comments + 1    ELSE agent_comments END` |
| `first_response_agent_name` | Name of the agent who provided the first public response to the ticket. | This column captures the name of the agent who made the first public comment on a ticket. It is derived from ticket events, specifically looking for the first public comment made by an agent. | `fr.first_response_agent_name` |
| `pending_t3_hours` | Time in hours a ticket was pending Tier 3/R&D. | Calculated by summing the time differences (in minutes) between status changes where the previous status was 'Pending Tier 3/R&D' and the current status was 'Open', then converting to hours. | `pending_t3_time/60 pending_t3_hours` |
| `agent_comments_before_link` | Number of agent comments made before a Jira link was added to the ticket. | Counts the distinct timestamps of public comments made by agents (Guesty or Rentals United employees) on a ticket, specifically comments that occurred before the first Jira link was added to that ticket. This count is only applicable if the ticket has an escalated Jira link. | `CASE WHEN c.esc_jira_links THEN c.agent_comments_before_link END AS agent_comments_before_link` |
| `agents_commented` | Number of unique agents who commented on the ticket. | Counts distinct author IDs for public comments made by agents (identified by email or role) in ticket events. | `COUNT(DISTINCT CASE WHEN child_event_event_type IN ('Comment') AND public IS TRUE AND IF(event_agent_email IS NULL, requester_id != author_id, LOWER(event_agent_email) LIKE '%@guesty.com' OR event_agent_email LIKE '%@rentalsunited.com') THEN author_id ELSE null END)` |
| `current_status` | Current status of the ticket. | Derived from the most recent status change event in the ticket history, considering transitions between various custom statuses. | `MAX(CASE WHEN rn_status = 1 THEN current_status ELSE null END) AS current_status` |
| `first_solved_agent` | Name of the agent who first solved the ticket. | The first_solved_agent is derived from the 'status_events' CTE, specifically by identifying the agent associated with the first 'Solved' status change for a given ticket. This involves tracking status changes and their corresponding agents over time. | `MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN event_agent_name ELSE NULL END) AS first_solved_agent` |
| `first_solved_email` | Email of the agent who first solved the ticket. | Extracted from ticket events where the status changed to 'Solved' for the first time, identifying the agent associated with that event. | `MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN event_agent_email ELSE NULL END)` |
| `csm_inv_internal` | Indicates if a Customer Success Manager (CSM) was involved internally. | Derived from ticket events, checking if any internal comment was made by an agent with 'Customer Success' in their work title. | `max(case when work_title like '%Customer Success%' and public is not true then true end)` |
| `last_solved_email` | Email of the agent who last solved the ticket. | This column captures the email address of the agent who marked the ticket as 'Solved' for the last time. It is derived from ticket event data. | `MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_up_solved = 1 THEN event_agent_email ELSE NULL END) AS last_solved_email` |
| `csm` | Indicates if a Customer Success Manager (CSM) was involved in the ticket. | Determined by checking if any agent involved in the ticket events has a 'Customer Success' work title. | `csm_invlv as (   select     cast(ticket_id as string) ticket_id,     string_agg(distinct work_title, ' \| ') titles_inv,     max(case when work_title like '%Customer Success%' and public is true then true end) as csm_inv_public,     max(case when work_title like '%Customer Success%' and public is not true then true end) as csm_inv_internal,     max(case when work_title like '%Customer Success%' then true end) as csm_inv   from ticket_events_0   group by 1 )` |
| `first_response_time` | Timestamp of the first agent response to the ticket. | Determined by the first public comment from an agent. For chat/messaging, it's the message reply time; otherwise, it's the ticket's first response time. | `CASE WHEN ((gus_automation = 'Human Only' AND auto_end_session) OR channel NOT IN('chat','Messaging: Widget','Messaging: Zowie')) THEN first_response_hours END AS first_response_hours,   CASE WHEN agent_comments > 0 OR gus_automation != 'Human Only' THEN pending_user_hours END pending_user_hours,   CASE      WHEN brand = 'Rentals United' AND REGEXP_CONTAINS(t.subject, r'\\[RU-\\d+\\]') THEN full_resolution_hours     WHEN brand = 'Billing Ops' OR agent_comments > 0 OR gus_automation != 'Human Only' THEN max_resolution_hours    END max_resolution_hours,   CASE WHEN brand = 'Billing Ops' OR agent_comments > 0 OR gus_automation != 'Human Only' THEN full_resolution_hours END full_resolution_hours,   CASE WHEN gus_automation = 'Human Only' THEN first_response_time ELSE TIMESTAMP_ADD(created_at, INTERVAL 24 SECOND) END first_response_time,   CASE WHEN ticket_id = '1729948' THEN 0.5 WHEN gus_automation = 'Human Only' THEN msg_fr_mnts ELSE 0.4 END msg_fr_mnts` |
| `times_solved` | Number of times a ticket has been solved. | Counts the occurrences of 'resolution_time' metric events of type 'fulfill' for each ticket. | `COUNT(resolution_time) times_solved` |
| `old_last_resolution_time` | Timestamp of the last resolution for a ticket, from Zendesk metric events. | The 'old_last_resolution_time' column is derived from the 'resolution_time' metric in Zendesk ticket metric events. It captures the maximum (latest) 'resolution_time' for each ticket where the metric is 'resolution_time' and the type is 'fulfill'. | `MAX(resolution_time) old_last_resolution_time` |
| `channel` | Channel through which the ticket was created or last updated. | Determined by `via_source_rel` or `via_channel` from the Zendesk tickets table, with specific mappings for messaging channels and web channels based on other ticket attributes. | `CASE     WHEN gus_messaging_to_offline then 'Ticket: Messaging Offline Hours' 	  WHEN channel = 'native_messaging' and gus_hc then 'Messaging: HC' 	  WHEN channel = 'native_messaging' then 'Messaging: Widget' 	  WHEN channel = 'web' then 'Ticket: HC' 	  WHEN channel = 'web_widget' then 'Ticket: Widget'     WHEN channel = 'sunshine_conversations_api' then 'Messaging: Zowie'     WHEN channel = 'sunshine_conversations_facebook_messenger' then 'Facebook'   ELSE INITCAP(channel) END` |
| `ru_category` | Category for Rentals United tickets. | Extracts the category from 'ru_general_issue' or 'ru_domain_related' custom fields, removing the first 3 characters. | `SUBSTRING(COALESCE(ru_general_issue, ru_domain_related), 4) ru_category` |
| `billing_pending_for` | Indicates who the billing ticket is pending for. | Extracts the value of the 'billing_pending_for' custom field from Zendesk ticket data. | `(SELECT MAX(IF(id = 27220017767837, value, NULL)) FROM UNNEST(custom_fields))` |
| `ticket_url` | URL to access the Zendesk ticket. | Concatenates the base Zendesk URL with the ticket ID to form a direct link to the ticket. | `CONCAT('https://guesty3396.zendesk.com/agent/tickets/',t.id) AS ticket_url` |
| `csat_cx_related` | Categorization of CSAT review based on predefined categories. | Extracts the CSAT category from the 'csat_review' custom field, cleaning and formatting it for readability. If the field contains 'post_csat_review_', it extracts the text after it; otherwise, it extracts the last part of the string after '______'. | `INITCAP(REPLACE(SAFE.REGEXP_EXTRACT(csat_review, r'csat_category___(.*?)______'),'_',' '))` |
| `description` | Detailed problem description provided by the ticket requester. | Directly sourced from the Zendesk tickets table, representing the initial description of the issue or request. | `t.description` |
| `ru_bb_category` | Category for Rentals United (RU) tickets related to Bitbucket. | Extracts the value from the custom field with ID 34197243814173 in Zendesk tickets, specifically for Rentals United Bitbucket categories. | `(SELECT MAX(IF(id = 34197243814173, value, NULL)) FROM UNNEST(custom_fields)) AS ru_bb_category` |
| `article_jira_url` | URL to the Jira ticket associated with the Zendesk ticket. | Extracts the value of the custom field with ID 11950027654813 from the Zendesk ticket, which represents the article Jira URL. | `(SELECT MAX(IF(id = 11950027654813, value, NULL)) FROM UNNEST(custom_fields)) AS article_jira_url` |
| `subject` | The subject line of the Zendesk ticket. | Directly extracted from the Zendesk tickets table, representing the subject provided by the ticket creator. | `t.subject` |
| `type` | Categorization of the ticket type (e.g., question, incident, problem, task). | Directly extracted from the Zendesk tickets table's 'type' column. | `t.type` |
| `days_since_last_status_change` | Number of days since the ticket's status last changed. | Calculated by finding the difference in days between the current date and the last recorded status change timestamp for the ticket. | `DATE_DIFF(CURRENT_DATE, DATE(t.last_status_change), DAY) AS days_since_last_status_change` |
| `lms_training` | Indicates if the ticket is related to LMS training. | Derived from the 'lms-training' tag in the Zendesk ticket tags. If this tag exists, the column is true; otherwise, it is false. | `MAX(CASE WHEN t = 'lms-training' THEN true END) AS lms_training` |
| `billing_issue_type` | The type of billing issue reported in the ticket. | Extracts the value from the custom field 'billing_issue_type' (ID: 27220026352669) in the Zendesk tickets data. | `(SELECT MAX(IF(id = 27220026352669, value, NULL)) FROM UNNEST(custom_fields)) AS billing_issue_type` |
| `billing_submitter` | The entity or method that submitted the billing-related ticket. | Directly extracts the value from the custom field with ID 27219952245533 in the Zendesk tickets table. This field represents the billing submitter. | `(SELECT MAX(IF(id = 27219952245533, value, NULL)) FROM UNNEST(custom_fields))` |
| `ticket_id` | Unique identifier for each ticket in Zendesk. | Directly extracted from the 'id' column of the zendesk.tickets table, then cast to a string. | `CAST(t.id AS STRING)` |
| `escalated_to_lds` | Indicates if the ticket was escalated to LDS. | This is a boolean flag derived from the 'escalated_to_lds' tag in Zendesk. It is true if the tag 'escalated_to_lds' is present on the ticket. | `MAX(CASE WHEN t = 'escalated_to_lds' THEN true END) AS escalated_to_lds` |
| `billing_source` | Source of the billing ticket. | Extracted from the 'billing_source' custom field in Zendesk tickets. | `(SELECT MAX(IF(id = 27219921964957, value, NULL)) FROM UNNEST(custom_fields)) AS billing_source` |
| `updated_at` | Timestamp of the last update made to the ticket. | Directly extracted from the Zendesk tickets table, representing the last modification time. | `t.updated_at` |
| `gus_emailbot_attachment` | Indicates if the ticket has an attachment from the Guesty Emailbot. | This is a boolean flag derived from the 'gus_emailbot_attachment' tag associated with the ticket. It is true if the tag exists, false otherwise. | `MAX(CASE WHEN t = 'gus_emailbot_attachment' THEN true END) AS gus_emailbot_attachment` |
| `rst_outlier` | Indicates if the ticket's resolution time is an outlier. | This boolean flag is true if the 'rst_outlier' tag is present on the ticket, indicating an unusually long resolution time. | `MAX(CASE WHEN t = 'rst_outlier' THEN true END) AS rst_outlier` |
| `downgraded_to_dss` | Indicates if the ticket was downgraded to DSS. | This boolean flag is true if the 'downgrade_to_dss' tag is present on the ticket, otherwise false. | `COALESCE(tags.downgrade_to_dss, false)` |
| `is_child_parent_id` | Indicates if a ticket is a child or parent ticket. | This column is extracted directly from the 'is_child_parent_id' custom field in Zendesk tickets. It captures whether the ticket is linked as a child or parent. | `(SELECT MAX(IF(id = 29166200583069, value, NULL)) FROM UNNEST(custom_fields)) AS is_child_parent_id` |
| `uber_enterprise` | Indicates if the ticket is associated with an Uber Enterprise account. | This boolean flag is true if the ticket's tags include 'uber-client'. | `MAX(CASE WHEN t LIKE 'uber-client' THEN true END) AS uber_enterprise` |
| `proactive_outreach` | Indicates if the ticket is a proactive outreach. | Derived from the 'proactive_communication' tag in Zendesk tickets. If the tag exists, the value is true; otherwise, it's false. | `COALESCE(tags.proactive_communication, false) AS proactive_outreach` |
| `gus_automation` | Indicates the level of GUS automation for the ticket. | Categorizes tickets into 'Gus Only', 'Hybrid', or 'Human Only' based on the presence of GUS-related tags and the channel of communication. 'Gus Only' implies full automation, 'Hybrid' means partial involvement, and 'Human Only' means no GUS interaction. | `CASE      WHEN gus_email_ticket AND DATE(created_at) <= '2026-02-15' THEN       CASE WHEN agent_comments = 1 THEN 'Gus Only' ELSE 'Hybrid' END -- Email     WHEN NOT (gus_ticket AND channel LIKE 'Messaging%') AND gus_email_routed THEN 'Hybrid' -- Email     WHEN gus_email_ticket THEN 'Gus Only' -- Email     WHEN gus_expired OR (gus_ticket AND NOT gus_routed) THEN 'Gus Only' -- Chat     WHEN gus_ticket THEN 'Hybrid'	-- Chat   ELSE 'Human Only' END` |
| `ru_bitbucket_link` | Link to the Bitbucket repository for Rentals United tickets. | Directly extracted from the 'ru_bitbucket_link' custom field (ID 34197195640605) in the Zendesk tickets table. | `(SELECT MAX(IF(id = 34197195640605, value, NULL)) FROM UNNEST(custom_fields))` |
| `ru_pms` | PMS associated with the Rentals United ticket. | Extracts the value of the custom field with ID 34197210270877 from the Zendesk ticket data. | `(SELECT MAX(IF(id = 34197210270877, value, NULL)) FROM UNNEST(custom_fields)) AS ru_pms` |
| `ru_migrated` | Indicates if the ticket is related to a Rentals United migration. | This boolean flag is true if the brand is 'Rentals United' and the subject contains the pattern '[RU-digits]'. | `IF(brand = 'Rentals United' AND REGEXP_CONTAINS(t.subject, r'\[RU-\d+\]'), TRUE, FALSE)` |
| `zd_ai_mode` | Indicates the AI mode used for the ticket (e.g., AI agent, human agent). | Directly extracted from the 'support_type' field in the zendesk.tickets table. | `t.support_type zd_ai_mode` |
| `lds_live_assistance` | Indicates if the ticket received live assistance from an LDS agent. | This column is a boolean flag derived from the presence of the 'lds_live_assistance' tag on the ticket. It is true if the tag exists, and false otherwise. | `MAX(CASE WHEN t = 'lds_live_assistance' THEN true END) AS lds_live_assistance` |
| `gus_deflected` | ID of tickets fully automated by Guesty's AI (GUS). | This column is populated with the ticket ID if the 'gus_automation' field is 'Gus Only'. Otherwise, it is NULL. | `CASE    WHEN REGEXP_CONTAINS(gus_automation, 'Gus Only') THEN ticket_id    ELSE NULL  END AS gus_deflected` |
| `business_hours` | Indicates if the ticket was created during business hours. | Determined by the 'small_domain_weekend' tag. If 'small_domain_weekend' is false, then business_hours is true, otherwise false. | `IF(small_domain_weekend, false, true) AS business_hours` |
| `merged` | Indicates if a ticket was merged into another ticket. | Derived from the 'closed_by_merge' tag in the Zendesk tickets. If this tag is present, the ticket is considered merged. | `MAX(CASE WHEN t = 'closed_by_merge' THEN true END) AS merged` |
| `satisfaction_rating` | Guesty's customer satisfaction rating for the ticket. | Directly extracted from the Zendesk tickets table. It represents the satisfaction score given by the customer. | `t.satisfaction_rating` |
| `reopen_reason` | Reason for reopening the ticket. | Extracts the reopen reason from the custom field '24705802516253' in the Zendesk tickets table, cleans and formats the string. | `(SELECT MAX(IF(id = 24705802516253, value, NULL)) FROM UNNEST(custom_fields)) AS reopen_reason` |
| `clean_multi_level` | Cleaned multi-level category for the ticket. | Extracts and cleans the second part of a multi-level category string from various custom fields, or uses the RU category if available. | `SPLIT(COALESCE(multi_level_category, glite_multi_level_category, gfh_multi_level_category, billing_category, gst_pay_multi_level_category), '______')[SAFE_OFFSET(1)]` |
| `zowie_ticket` | Indicates if the ticket was created via Zowie. | This boolean flag is true if the 'ticket_created_via_zowie' tag is present on the ticket, otherwise false. | `MAX(CASE WHEN t = 'ticket_created_via_zowie' THEN true END) AS zowie_ticket` |
| `gst_pay_subcategory` | Subcategory for Guesty Pay related tickets. | Extracts and formats the value from the 'gst_pay_subcategory' custom field (ID 32853083380381) in Zendesk tickets. It removes prefixes and replaces underscores with spaces. | `INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(gst_pay_subcategory, r'^pay_', ''),r'_', ' '))` |
| `escalated_billing_ops` | Indicates if the ticket was escalated to Billing Operations. | This is a boolean flag derived from the 'tags' field in the Zendesk tickets table. It is true if the ticket has 'billing_ops_escalated' or 'internal_escalation_billing_ops' tags. | `MAX(CASE WHEN t IN('billing_ops_escalated','internal_escalation_billing_ops') THEN true END) AS escalated_billing_ops` |
| `previous_domain` | Previous product domain associated with the ticket. | Extracts the 'previous_domain' custom field value from Zendesk tickets, handling different brand IDs and potential prefixes. | `IF(9558544319133 AND t.brand_id = 7720007249693) OR (id = 8899556344477 AND t.brand_id = 7218885869213), value, NULL)) FROM UNNEST(custom_fields)) AS previous_domain` |
| `requester_email` | Email address of the user who submitted the ticket. | Directly extracted from the Zendesk tickets table, representing the email of the person who opened the ticket. | `r.email AS requester_email` |
| `non_friction_ticket` | Indicates if a ticket is considered 'non-friction'. | A ticket is non-friction if it matches specific submitter/subject patterns, is a GUS non-friction ticket, or is tagged as 'non_friction_ticket'. Otherwise, it's considered friction-related. | `COALESCE(CASE WHEN (subm.email = 'integrationsupport@expediagroup.com' AND REGEXP_CONTAINS(subject, 'OLB Integration Audit Report\|Vrbo Unit Availability Integration\|Vrbo Listing Integration\|Vrbo Lodging\|Vrbo Booking Update')) OR (subm.email = 'support@icoastalnet.com' AND subject LIKE('%ICND Ticket: 141915%')) OR (subm.email = 'help@tripadvisorsupport.com' AND REGEXP_CONTAINS(subject, 'How would you rate the support you received?\|Guesty Property Type Sync')) OR (subm.email = 'tavrsupport@tripadvisor.com' AND subject LIKE('%TripAdvisor Rentals%')) OR (subm.email = 'customersupport@holidaylettings.co.uk' AND subject LIKE('%TripAdvisor Rentals%')) OR (subm.email = 'noreply.connectivity@booking.com' AND subject LIKE('%Help us to improve by taking this survey%')) OR (subm.email = 'apitechsupport@airbnb.com') OR (t.id in (1695823,1695778,1675526,1650116,1655428,1656592,1657381,1661028,1666593)) THEN TRUE ELSE tags.non_friction_ticket END, false)` |
| `escalated_t3` | Indicates if the ticket has been escalated to Tier 3 support. | The column is true if the group_name is 'RU: Tier 3 Support', ru_bitbucket_link is not null, esc_jira_links is true, or status_pending_t3 is true. Otherwise, it is false. | `CASE WHEN group_name = 'RU: Tier 3 Support' OR ru_bitbucket_link IS NOT NULL OR esc_jira_links OR status_pending_t3 THEN true ELSE false END AS escalated_t3` |
| `priority` | The priority level of the ticket (e.g., Low, Normal, High, Urgent). | Directly extracted from the 'priority' column of the zendesk.tickets table. | `t.priority` |
| `partner_name` | The name of the partner associated with the ticket. | Extracted from the custom fields of the Zendesk ticket, specifically from the field with ID 8216552337309. | `(SELECT MAX(IF(id = 8216552337309, value, NULL)) FROM UNNEST(custom_fields)) AS partner_name` |
| `gst_pay_tech_issue` | Identifies the technical issue type for Guesty Pay tickets. | The value is extracted from the 'gst_pay_tech_issue' custom field (ID 25589379756445) within the Zendesk tickets table. | `(SELECT MAX(IF(id = 25589379756445, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_tech_issue` |
| `billing_solved_reason` | Reason for a billing ticket being marked as solved. | Extracts the 'billing_solved_reason' custom field value from Zendesk tickets. This field indicates why a billing-related ticket was resolved. | `(SELECT MAX(IF(id = 27220114993437, value, NULL)) FROM UNNEST(custom_fields)) AS billing_solved_reason` |
| `auto_solved` | Indicates if the ticket was automatically solved. | Derived from the 'pending_auto_solved_after_168_hours' tag in the Zendesk tickets. If this tag is present, the ticket is considered auto-solved. | `MAX(CASE WHEN t = 'pending_auto_solved_after_168_hours' THEN true END) AS auto_solved` |
| `gus_expired` | Indicates if the Guesty bot conversation expired. | This is a boolean flag derived from the 'conversation_expired' tag in the Zendesk tickets. It is true if the tag exists for the ticket, otherwise false. | `MAX(CASE WHEN t = 'conversation_expired' THEN true END) AS gus_expired` |
| `bulk_task` | Indicates if the ticket is a bulk task. | Extracts the value of the custom field with ID 10764797959837 from the Zendesk tickets table. This field is specifically designated for 'bulk_task'. | `(SELECT MAX(IF(id = 10764797959837, value, NULL)) FROM UNNEST(custom_fields)) AS bulk_task` |
| `jira_status` | The current status of a Jira ticket linked to the Zendesk ticket. | Extracts the value of the custom field with ID 7964941172509 from the Zendesk ticket data. | `(SELECT MAX(IF(id = 7964941172509, value, NULL)) FROM UNNEST(custom_fields)) AS jira_status` |
| `negative` | Indicates tickets rated as 'bad' in customer satisfaction. | A ticket is marked as negative if its CSAT score is 'bad'. | `CAST(CASE WHEN csat_score = 'bad' THEN ticket_id ELSE null END as int64)` |
| `days_since_open` | Number of days since the ticket was opened. | Calculated as the difference in days between the current date and the ticket's creation date. | `DATE_DIFF(CURRENT_DATE, DATE(t.created_at), DAY)` |
| `ticket_summary` | Summary of the ticket's content. | This column is extracted from the 'ticket_summary' custom field (ID 31341124285981) within the Zendesk tickets. It captures the value provided in this custom field. | `(SELECT MAX(IF(id = 31341124285981, value, NULL)) FROM UNNEST(custom_fields)) AS ticket_summary` |
| `during_rabbit_MQ_blocker` | Indicates if the ticket was created during the Rabbit MQ blocker period. | A boolean flag set to TRUE if the ticket's creation timestamp falls within the specific Rabbit MQ blocker period (July 9, 2025, 12:00:00 UTC to 21:00:00 UTC). Otherwise, it is FALSE. | `IF(created_at between '2025-07-09 12:00:00 UTC' and '2025-07-09 21:00:00 UTC', true, false) during_rabbit_MQ_blocker` |
| `incident_id` | ID of an incident ticket, if the current ticket is part of one. | Extracted from the 'incident/%' tag in the Zendesk tickets. If multiple incident tags exist, the last one is taken. | `MAX(CASE WHEN t LIKE 'incident/%' THEN t END) AS incident_id` |
| `ticket_transferred` | Indicates if the ticket was transferred to another agent or department. | Derived from the presence of the 'cx_endorsement' tag in the Zendesk ticket tags. | `MAX(CASE WHEN t = 'cx_endorsement' THEN true END) AS ticket_transferred` |
| `corrected_csat_assignee` | The email of the agent whose CSAT score was corrected. | This column is extracted from the custom field 'corrected_csat_assignee' in the Zendesk tickets table. It represents the email of the agent to whom a CSAT rating was re-assigned. | `(SELECT MAX(IF(id = 30056008055353, value, NULL)) FROM UNNEST(custom_fields)) AS corrected_csat_assignee` |
| `recipient` | Email address of the ticket's recipient. | Directly extracted from the Zendesk tickets table. It represents the email to which the ticket was sent. | `t.recipient` |
| `escalated_credit_approval` | Indicates if the ticket was escalated for credit approval. | This boolean column is true if the ticket's tags include 'escalated_davidperl' or 'escalated_billing/credit_approval'. | `MAX(CASE WHEN t IN('escalated_davidperl','escalated_billing/credit_approval') THEN true END) AS escalated_credit_approval` |
| `reported_topic` | Topic reported by the customer for the ticket. | The reported_topic is extracted from custom fields based on the brand. It prioritizes reported_channel, then reported_feature, then reported_topic custom fields. If none are found, it defaults to 'Not Reported'. | `CASE WHEN reported_channel IS NOT NULL AND reported_channel <> '' THEN REGEXP_REPLACE(reported_channel, r'^.*channel_', '') WHEN reported_feature IS NOT NULL AND reported_feature <> '' THEN REGEXP_REPLACE(reported_feature, r'^.*feature_', '') WHEN reported_topic IS NOT NULL AND reported_topic <> '' THEN REGEXP_REPLACE(reported_topic, r'^.*customer_topic_', '') ELSE 'Not Reported' END` |
| `known_issue` | Indicates if the ticket is related to a known issue. | Extracts the 'known_issue' custom field value from Zendesk tickets. This field is identified by custom field ID 26354684927133. | `(SELECT MAX(IF(id = 26354684927133, value, NULL)) FROM UNNEST(custom_fields)) AS known_issue` |
| `csat_review` | Categorization of CSAT review based on predefined categories. | Extracts the CSAT review category from the 'csat_review' custom field. If it starts with 'post_csat_review_', it extracts the part after that prefix. Otherwise, it extracts the segment after '______' from the end of the string. | `INITCAP(REPLACE(CASE         WHEN csat_review LIKE 'post_csat_review_%' THEN REGEXP_EXTRACT(csat_review, r'post_csat_review_(.+)$')         ELSE SAFE.REGEXP_EXTRACT(csat_review, r'______([a-zA-Z0-9_/]+)$')   END,'_',' '))` |
| `gus_transfer_tps` | GUS transfer TPS for the ticket. | Extracts the value from the 'gus_transfer_tps' custom field (ID 35914531009949) in Zendesk tickets. | `(SELECT MAX(IF(id = 35914531009949, value, NULL)) FROM UNNEST(custom_fields)) AS gus_transfer_tps` |
| `knowledge` | Indicates the knowledge base article or category associated with the ticket. | Extracts the knowledge base category from the 'knowledge' custom field, removing 'knowledge_' prefix if present. | `IF(knowledge LIKE 'knowledge_%', SUBSTRING(knowledge, 18),knowledge)` |
| `escalated_to_ob` | Indicates if the ticket was escalated to an onboarder. | This boolean column is true if the 'escalated_onboarder' tag is present on the ticket, otherwise false. It's derived from the 'tags' CTE. | `MAX(CASE WHEN t LIKE 'escalated_onboarder' THEN true END) AS escalated_to_ob` |
| `internal_api_task` | Indicates if the ticket is an internal API task. | The column is true if the submitter is an agent/admin and the domain is related to API tasks; otherwise, it is false. | `IF((submitter_role IN('agent','admin') AND LOWER(t.domain) LIKE '%api task'), true, false)` |
| `urgent_urgency` | Indicates if the ticket has an 'Urgent' urgency level. | Derived from the 'urgency' custom field in Zendesk tickets. If the value is 'Urgent', it is flagged as 1, otherwise null. | `CAST(CASE WHEN urgency = 'Urgent' THEN ticket_id ELSE null END as int64)` |
| `ultimate` | Indicates if the account associated with the ticket is an 'Ultimate' package holder. | Directly extracts the 'ultimate' custom field value (ID 15288057449501) from the Zendesk ticket's custom fields. | `(SELECT MAX(IF(id = 15288057449501, value, NULL)) FROM UNNEST(custom_fields)) AS ultimate` |
| `opened_on_behalf` | Indicates if the ticket was opened by someone other than the requester. | Determined by comparing the submitter's email with the requester's email. If they differ, the ticket was opened on behalf of the requester. | `IF(submitter_email <> t.requester_email, TRUE, FALSE) opened_on_behalf` |
| `escalated_to_smb` | Indicates if the ticket was escalated to the SMB team. | This boolean flag is set to TRUE if the ticket's tags include 'escalate_smb' or 'escalated_smb'. Otherwise, it is FALSE. | `MAX(CASE WHEN t LIKE 'escalate_smb' OR t LIKE 'escalated_smb' THEN true END) AS escalated_to_smb` |
| `requester_name` | The name of the user who submitted the ticket. | Directly extracted from the Zendesk tickets table, representing the name of the ticket requester. | `r.name AS requester_name` |
| `int_esc_point` | Internal escalation point for the ticket. | Extracts the internal escalation point from the custom fields of the Zendesk ticket and cleans the string. | `INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(int_esc_point, r'^internal_escalation\_+', ''), '_+', ' ')) AS int_esc_point` |
| `gus_ticket` | Indicates if a ticket was fully automated by the Guesty AI assistant (Gus). | Derived from the `gus_automation` field. If `gus_automation` is 'Gus Only', the ticket_id is returned, otherwise NULL. | `CASE WHEN REGEXP_CONTAINS(gus_automation, 'Gus Only') THEN ticket_id ELSE NULL END AS gus_deflected` |
| `all_tags` | All tags associated with the Zendesk ticket. | Aggregates all tags present on a ticket into a single comma-separated string. | `STRING_AGG(t, ', ' ORDER BY t) all_tags` |
| `is_weekend` | Indicates if the ticket was created on a weekend. | Derived from the 'created_at' timestamp. If the day of the week is Saturday (7) or Sunday (1), it's a weekend. | `CASE WHEN EXTRACT(DAYOFWEEK FROM DATE(created_at)) IN(1,7) THEN true ELSE false END AS is_weekend` |
| `billing_pending_reason` | Reason for the billing ticket being in a pending state. | Directly extracted from the custom field 'billing_pending_reason' (ID 28647862213533) in the Zendesk tickets. | `(SELECT MAX(IF(id = 28647862213533, value, NULL)) FROM UNNEST(custom_fields))` |
| `gst_pay_category` | Category of Guesty Pay issues, derived from custom fields. | Extracts and formats the 'gst_pay_category' custom field from Zendesk tickets, converting it to a more readable format by removing prefixes and replacing underscores with spaces. | `INITCAP(REGEXP_REPLACE(REGEXP_REPLACE(gst_pay_category, r'^guestypay__category_', ''),r'_', ' ')) gst_pay_category` |
| `urgency` | The urgency level of the ticket. | Extracted from the custom field 'urgency' (ID 16675844068253) in the Zendesk tickets table. The value is then cleaned by replacing underscores with spaces and capitalizing the first letter of each word. | `(SELECT MAX(IF(id = 16675844068253, value, NULL)) FROM UNNEST(custom_fields)) AS urgency` |
| `gus_v2` | Indicates if the ticket was handled by Guesty's automated system (GUS) v2. | This column is a boolean flag derived from the 'gus2s' tag in Zendesk. It is true if the ticket has the 'gus2s' tag, indicating involvement of GUS v2. | `MAX(CASE WHEN t = 'gus2s' THEN true END) AS gus_v2` |
| `ru_user_name` | User name associated with Rentals United tickets. | Extracts the value of the custom field 'ru_user_name' (ID 34197204288029) from the Zendesk ticket custom fields. | `(SELECT MAX(IF(id = 34197204288029, value, NULL)) FROM UNNEST(custom_fields))` |
| `gus_email_ticket` | Indicates if a ticket was replied to by GUS via email. | Derived from the 'gus_replied_email' tag. If this tag is present, the column is true; otherwise, it is false. | `MAX(CASE WHEN t = 'gus_replied_email' THEN true END) AS gus_replied_email` |
| `hrs_since_last_status_change` | Hours since the last status change for a ticket. | Calculates the difference in hours between the current timestamp (adjusted for Jerusalem time) and the last recorded status change timestamp of the ticket. | `TIMESTAMP_DIFF(TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR), t.last_status_change, HOUR) AS hrs_since_last_status_change` |
| `lds_ticket_classification` | Indicates if the ticket was classified by LDS. | This boolean flag is true if the 'lds_ticket_classification' tag is present on the ticket. | `MAX(CASE WHEN t = 'lds_ticket_classification' THEN true END) AS lds_ticket_classification` |
| `negative_sentiment` | Indicates if the ticket's sentiment is negative. | Derived from the 'sentiment' field. If 'sentiment' is 'Negative' or 'Extremely Negative', the ticket_id is returned, otherwise null. | `CAST(CASE WHEN sentiment IN('Negative','Extremely Negative') THEN ticket_id ELSE null END as int64)` |
| `sub_category` | The sub-category of the ticket, derived from Zendesk custom fields. | Extracts the sub-category from Zendesk custom fields, cleans it by removing prefixes and replacing underscores with spaces, and defaults to 'Not Classified' if null or empty. | `INITCAP(COALESCE(IF(TRIM(sub_category) = '', 'Not Classified', TRIM(sub_category)), multi_level_subcategory, 'Not Classified')) sub_category` |
| `escalated_to_csm` | Indicates if the ticket was escalated to CSM. | Derived from ticket tags. True if any of 'escalated_csm', 'internal_escalation_csm', or 'csm_reopen_and_escalate' tags are present. | `MAX(CASE WHEN t IN ('escalated_csm', 'internal_escalation_csm', 'csm_reopen_and_escalate') THEN true END) AS escalated_to_csm` |
| `api_task_domain` | Domain related to API tasks within a ticket. | Extracts the value of the custom field 'api_task_domain' (ID 19328683098269) from Zendesk tickets and cleans it by removing prefixes and replacing underscores with spaces. | `(SELECT MAX(IF(id = 19328683098269, value, NULL)) FROM UNNEST(custom_fields)) AS api_task_domain` |
| `frt_outlier` | Indicates if the ticket's first response time was an outlier. | This boolean flag is true if the 'frt_outlier' tag is present on the ticket, indicating an unusually long first response time. | `MAX(CASE WHEN t LIKE 'frt_outlier' THEN true END) AS frt_outlier` |
| `sentiment` | Sentiment of the ticket, indicating positive, negative, or neutral tone. | Extracts and formats the sentiment from the 'sentiment' custom field in Zendesk tickets, converting it to an initial-capped, human-readable string. | `(SELECT MAX(IF(id = 16675903464989, value, NULL)) FROM UNNEST(custom_fields)) AS sentiment` |
| `gst_pay_assignee` | Assignee for Guesty Pay tickets. | Extracts the value of the custom field with ID 7218866523805 from the Zendesk ticket data. | `(SELECT MAX(IF(id = 7218866523805, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_assignee` |
| `gus_email_routed` | Indicates if a ticket was routed by the Guesty AI email bot. | Derived from ticket tags, specifically 'undeflect_gus_emailbot' or 'gus_emailbot_pro_routed'. It signifies if the AI email bot routed the email. | `COALESCE(tags.undeflect_gus_emailbot, tags.gus_emailbot_routed, false) AS gus_email_routed` |
| `escalated_to_is` | Indicates if the ticket was escalated to Information Systems. | This is a boolean flag derived from the presence of the 'escalated_information_systems' tag on the ticket. | `MAX(CASE WHEN t = 'escalated_information_systems' THEN true END) AS escalated_to_is` |
| `gus_transfer_reason` | Reason for transferring a ticket to a human agent from Guesty's automated system. | Extracts and formats the 'gus_transfer_reason' custom field from Zendesk tickets. If the field is null or empty, it defaults to 'Unknown / Direct'. The value is cleaned by removing prefixes and replacing underscores with spaces. | `CASE WHEN gus_transfer_reason IS NULL OR TRIM(gus_transfer_reason) = '' THEN 'Unknown / Direct' ELSE INITCAP(REPLACE(REGEXP_REPLACE(gus_transfer_reason, r'^transfer_to_human_reason__', ''), '_', ' ')) END` |
| `auto_end_session` | Indicates if a session automatically ended when the ticket was created. | This boolean flag is true if the 'auto_end_session_when_ticket_created' tag is present on the ticket, otherwise false. | `COALESCE(tags.auto_end_session_when_ticket_created, false) AS auto_end_session` |
| `main_category` | The primary category assigned to a ticket. | The main_category is extracted from custom fields in the zendesk.tickets table. It undergoes cleaning, including removing prefixes and replacing underscores with spaces, and is then capitalized. If no specific main_category is found, it defaults to 'Not Classified'. | `INITCAP(COALESCE(IF(TRIM(main_category) = '', 'Not Classified', TRIM(main_category)),multi_level_main_category, 'Not Classified')) main_category` |
| `escalated_to_finance` | Indicates if the ticket was escalated to the finance team. | Derived from the 'tags' field in the Zendesk tickets. It is true if the ticket has 'finance_escalated' or 'glite_finance_escalated' tags. | `MAX(CASE WHEN t IN('finance_escalated','glite_finance_escalated') THEN true END) AS escalated_to_finance` |
| `gst_pay_pfr` | Primary failure reason for GuestyPay tickets. | Extracted from the 'custom_fields' JSON object where the 'id' is 27008534175261. | `(SELECT MAX(IF(id = 27008534175261, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_pfr` |
| `domain` | The primary product domain or area the ticket relates to. | The domain is extracted from custom fields based on the brand. For Guesty Pay, it defaults to 'Guesty Pay'. For Yield Planet, it's extracted from a specific custom field, and for Rentals United, it's derived from a custom field or defaults to 'RU'. Otherwise, it's based on the package type. | `CONCAT(CASE     WHEN brand = 'Yield Planet' THEN 'YiP'     WHEN brand = 'Rentals United' THEN 'RU'     ELSE brand END     ,': ', COALESCE(IF(TRIM(domain) = '', null, TRIM(INITCAP(domain))), package))` |
| `deleted` | Indicates if the ticket has been marked as deleted. | Derived from the 'current_status' field. If 'current_status' is 'Deleted', then 'deleted' is true, otherwise false. | `IF(current_status = 'Deleted', true, false) deleted` |
| `billing_urgency` | Urgency level assigned to billing-related tickets. | Directly extracted from the 'billing_urgency' custom field (ID 27219843136285) in Zendesk tickets. | `(SELECT MAX(IF(id = 27219843136285, value, NULL)) FROM UNNEST(custom_fields)) AS billing_urgency` |
| `lds_endorsement` | Indicates if the ticket has an 'lds_endorsement' tag. | This boolean flag is true if the ticket's tags include 'lds_endorsement', indicating an endorsement from the LDS team. It is false otherwise. | `MAX(CASE WHEN t = 'lds_endorsement' THEN true END) AS lds_endorsement` |
| `escalated_to_collection` | Indicates if the ticket was escalated to the collections team. | This boolean flag is set to TRUE if the ticket's tags include 'collection_team_escalated' or 'internal_escalation_collection', otherwise FALSE. | `MAX(CASE WHEN t IN('collection_team_escalated','internal_escalation_collection') THEN true END) AS escalated_to_collection` |
| `gus_routed` | Indicates if the ticket was routed by Guesty's automated system (GUS). | Derived from the 'gus_routed' or 'gus_routed_after_conversation_abandoned' tags in Zendesk. If either tag is present, the ticket is considered GUS routed. | `COALESCE(tags.gus_routed, tags.gus_routed_after_abandon, false) AS gus_routed` |
| `gst_pay_source` | Source of the Guesty Pay ticket. | Extracts and formats the value from the 'gst_pay_source' custom field (ID 31843942891933) in Zendesk tickets. The value is converted to title case and underscores are replaced with spaces. | `(SELECT MAX(IF(id = 31843942891933, value, NULL)) FROM UNNEST(custom_fields)) AS gst_pay_source` |
| `apply_credit_refund` | Indicates if the ticket is related to applying a credit refund. | Derived from the 'apply_credit_refund_view' tag in Zendesk tickets. If this tag is present, the column is true. | `COALESCE(tags.apply_credit_refund_view, false) AS apply_credit_refund` |
| `csat_review_comment` | Comment provided by the customer in the CSAT survey. | Direct extraction of the 'csat_review_comment' custom field from Zendesk tickets. | `(SELECT MAX(IF(id = 9585797883421, value, NULL)) FROM UNNEST(custom_fields)) AS csat_review_comment` |
| `leveling` | Categorization of the ticket's complexity level. | The 'leveling' column is derived from the custom field with ID 21425214512413 in the Zendesk tickets. It extracts and capitalizes the value, removing 'level_' prefix. | `(SELECT MAX(IF(id = 21425214512413, value, NULL)) FROM UNNEST(custom_fields)) AS leveling` |
| `account_name` | Name of the Guesty account associated with the ticket. | Derived from the `gfp_accounts` table based on the `account_id` from the ticket. If not found, it will be NULL. | `gfp.account_name` |
| `account_months_to_ticket` | Months between account creation and ticket creation. | Calculates the difference in months between the account creation date and the ticket creation date. Returns NULL if account creation date is '1999-01-01'. | `IF(account_created_at = '1999-01-01', null, DATE_DIFF(DATE(created_at), account_created_at, MONTH))` |
| `in_trial_gfh` | Indicates if a GFH account was in its trial period when the ticket was created. | Calculated for GFH accounts where the account's creation date plus 14 days (trial period) is greater than or equal to the ticket creation date. | `CASE WHEN gfp.account_created_at IS NULL THEN IF(DATE_DIFF(DATE(t.created_at), gfh.account_created_date, day) BETWEEN 0 AND 14, true, false) END AS in_trial_gfh` |
| `in_trial_glite` | Indicates the trial status of GLite accounts at ticket creation. | Determines if a GLite account is in trial, extended trial, or trial expired based on account creation date, first payment date, and trial end date. Only applies to 'Lite' package accounts. | `CASE     WHEN package <> 'Lite' THEN 'Non-Lite'     WHEN account_first_paid <= DATE(created_at) THEN 'Paid'     WHEN DATE_DIFF(trial_ended_at, account_created_at, DAY) <= 17 AND trial_ended_at >= DATE(created_at) THEN 'In Trial'     WHEN DATE_DIFF(trial_ended_at, account_created_at, DAY) > 17 AND trial_ended_at >= DATE(created_at) THEN 'Trial Extended'     WHEN trial_ended_at <= DATE(created_at) THEN 'Trial Expired'   END` |
| `onboarding_status` | Onboarding status of the account at the time of ticket creation. | Determined by the 'Onboarding_Completion_Date__c' and 'Onboarding_Status__c' fields from Salesforce's sf_account table, based on the ticket's creation date. | `CASE WHEN sf_ob.ob_completion IS NULL OR sf_ob.onboarding_status IN ('On-boarding','Back to sales','On-boarding paused','Escalated to CSM') THEN 'During OB' ELSE 'Post OB' END` |
| `ob_status` | Onboarding status of the account at the time of ticket creation. | Determines if an account is 'During OB' or 'Post OB' based on the onboarding completion date and status from Salesforce, relative to the ticket creation date. | `CASE WHEN sf_ob.ob_completion IS NULL OR sf_ob.onboarding_status IN ('On-boarding','Back to sales','On-boarding paused','Escalated to CSM') THEN 'During OB' ELSE 'Post OB' END` |
| `group_name` | The name of the Zendesk group assigned to the ticket. | Directly extracted from the Zendesk tickets table, representing the group associated with the ticket. | `g.name AS group_name` |
| `account_lifecycle_stage` | Lifecycle stage of the account associated with the ticket. | Categorizes accounts into stages like 'During OB (Non-paid)', 'Hypercare 90d', 'Mature Account', etc., based on onboarding status, payment, and creation date relative to onboarding completion. | `CASE    WHEN t.account_first_paid IS NULL OR LAST_DAY(DATE(t.created_at)) < t.account_first_paid THEN     CASE        WHEN (sf_ob.ob_completion IS NULL OR sf_ob.onboarding_status IN ('On-boarding','Back to sales','On-boarding paused','Escalated to CSM'))       THEN '1. During OB (Non-paid)'       ELSE '5. Stale / Legacy Non-paid'     END   WHEN sf_ob.ob_completion IS NOT NULL THEN     CASE        WHEN DATE(t.created_at) BETWEEN DATE(sf_ob.ob_completion) AND DATE_ADD(DATE(sf_ob.ob_completion), INTERVAL 90 DAY)          THEN '3. Hypercare 90d'       ELSE '4. Mature Account'     END   WHEN sf_ob.onboarding_status IN ('On-boarding','Back to sales','On-boarding paused','Escalated to CSM')     THEN '2. During OB (Paid)'   WHEN account_name IS NULL THEN CONCAT('Unidentified Account: ', brand, ' - ', package)   ELSE '4. Mature Account' END` |
| `escalated_to` | Indicates the internal team or tier to which a ticket was escalated. | Categorizes tickets based on various escalation flags (3rd party, internal escalation point, R&D, Tier 3, LDS, CSM, other internal teams) to determine the highest level of escalation. Defaults to 'CX-T1' if no specific escalation is identified. | `CASE      when escalated_3rd_party then '3rd Party'      when int_esc_point in('Finance','Finance Gfh/Glite','Information Systems','Credit/Refund Approval Gfh/Glite') then 'Finance/IS'     when escalated_rnd != '' and escalated_rnd is not null then 'R&D'     when escalated_t3 then 'Tier 3'     when escalated_to_lds or int_esc_point = 'LDS' then 'LDS'     when escalated_to_csm or int_esc_point = 'CSM' then 'CSM'     when int_esc_point <> 'Not Escalated' then 'Other Internal'     when int_esc_point is null or int_esc_point = 'Not Escalated' then 'CX-T1'   ELSE 'check' end as escalated_to` |
| `escalated_rnd` | Indicates if the ticket was escalated to R&D. | Combines 'ru_bitbucket_link' and cleaned 'jira_ids' to identify R&D escalations. If either is present, it signifies an R&D escalation. | `COALESCE(ru_bitbucket_link, trim(regexp_replace(regexp_replace(jira_ids, r'\b(PFR-\d+\|T3-\d+\|KO-\d+)\b',''),',','')))` |
| `ob_email` | Email of the onboarder assigned to the account. | This column retrieves the onboarder's email from the custom field 'ob_email' in the Zendesk ticket data. If not found there, it falls back to the 'organization_fields_onboarder_email' from the organizations table. | `COALESCE(ob_email, organization_fields_onboarder_email)` |
| `gus_indication` | Indicates if a ticket was handled by Guesty's automated system (GUS). | Determined by the 'chatbot_ft' field from the organizations table, which signifies if a chatbot feature was enabled for the organization associated with the ticket. | `chatbot_ft AS gus_indication` |
| `account_segment` | Segment of the account associated with the ticket. | The account segment is primarily derived from the 'account_segment' custom field in Zendesk tickets. If this is null or empty, it falls back to the 'account_segmentation' from the 'gfp_accounts' table or 'organization_fields_account_segment' from the 'organizations' table. For GFH and Yield Planet brands, the segment is explicitly set to 'GFH' or 'Yield Planet' respectively. Mid-Market segments are consolidated. | `CASE      WHEN brand = 'GFH' THEN 'GFH'     WHEN brand = 'Yield Planet' THEN 'Yield Planet'     ELSE IF(account_segment IS NULL OR account_segment IN('','NA'), 'Not Segmented', account_segment)    END AS account_segment` |
| `escalat_type` | Type of escalation based on Jira IDs. | Categorizes tickets based on the presence and type of Jira IDs linked to them, specifically distinguishing between PFR (Product Feature Request) and non-PFR Jiras. | `CASE WHEN LOWER(jira_ids) LIKE '%pfr%'AND TRIM(REGEXP_REPLACE(jira_ids, r'\b\w*PFR-\d+\b,?', '')) = '' THEN 'Only PFR' WHEN LOWER(jira_ids) NOT LIKE '%pfr%' THEN 'Non-PFR' WHEN jira_ids <> '' THEN 'Both' END` |
| `account_id` | Unique identifier for the Guesty account associated with the ticket. | The account_id is primarily extracted from the Zendesk ticket's custom fields. If unavailable, it falls back to the organization's guesty_admin_id or the account_id from dim_users or porter.dim_accounts. | `COALESCE(IF(TRIM(t.account_id)='' OR account_id = 'null', null, t.account_id), u.account_id, gfh.guesty_account_id)` |
| `positive` | Indicates if a ticket received a 'good' CSAT score. | The column is cast to an INT64 and populated with the ticket_id if the CSAT score is 'good', otherwise it's NULL. | `CAST(CASE WHEN csat_score = 'good' THEN ticket_id ELSE null END as int64) AS positive` |
| `csat_name` | Name of the agent who received the CSAT rating. | The CSAT name is derived from the 'zd_users' table, matching either the 'corrected_csat_assignee' or 'csat_assignee_id' from the ticket data. | `COALESCE(csat_user.name, old_csat_user.name)` |
| `csat_email` | Email of the agent who received the CSAT rating. | This column identifies the email of the agent associated with the CSAT rating, either from the corrected assignee or the original assignee. | `COALESCE(csat_user.email, old_csat_user.email) AS csat_email` |
| `pending_user_hours` | Total hours a ticket spent in a pending status awaiting user reply. | Calculated by summing the time differences (in minutes) between status changes where the previous status was 'Pending Customer's Reply' and the current status became 'Open', then converting to hours. Only for solved tickets. | `CASE WHEN current_status LIKE 'Solved%' THEN pending_user_time/60 END pending_user_hours` |
| `reopened_after_solved` | Indicates if a ticket was reopened after being marked as solved. | Calculated by summing 'reopened_after_solved' flags from status events, where a flag is 1 if the previous status was 'Solved'. | `SUM(CASE WHEN NOT REGEXP_CONTAINS(combined_reason, r'New Issue\|Thank You') THEN reopened_after_solved END)` |
| `status_pending_t3` | Indicates if the ticket's status is pending Tier 3/R&D or RU: BB Internal. | This boolean flag is true if the ticket's current status is 'Pending Tier 3/R&D' or 'RU: BB Internal' based on the status events. | `COALESCE(se.status_pending_t3, false) AS status_pending_t3` |
| `escalated_3rd_party` | Indicates if the ticket has been escalated to a third party. | Derived from the 'escalated_3rd_party' field in status_events, which checks if the custom status was 'Pending 3rd party'. | `COALESCE(se.escalated_3rd_party, false) AS escalated_3rd_party` |
| `friction_related` | Indicates if a ticket is related to friction, excluding non-friction categories. | A ticket is friction-related if it doesn't fall into specific non-friction categories such as internal tasks, training, merged tickets, proactive outreach, or AI-handled tickets. It also excludes certain solved tickets with no agent comments or specific 'NFAR' reopen reasons. | `IF(non_friction_ticket     OR internal_api_task     OR lms_training      OR merged     OR deleted     OR proactive_outreach     OR t.domain LIKE '%Gcs'      OR zd_ai_mode = 'ai_agent'     OR (reopened_after_solved = 0 AND fr_nfar = 1)     OR (brand = 'Yield Planet' AND agent_comments = 0 AND ticket_status = 'Solved')   , false, true)` |
| `first_resolution_time` | Timestamp of when the ticket was first marked as 'Solved'. | This column captures the timestamp when a ticket's status first transitions to 'Solved' based on the custom status events. It identifies the initial resolution time, not necessarily the final one if the ticket is reopened. | `MAX(CASE WHEN current_status LIKE 'Solved%' AND rn_solved = 1 THEN e_created_at ELSE NULL END) AS first_resolution_time` |
| `max_resolution_hours` | Maximum resolution time in hours, excluding customer pending time. | Calculated as the resolution time in minutes, excluding time waiting on the customer, divided by 60. Applies only to solved tickets and excludes outlier resolution times. | `CASE WHEN current_status LIKE 'Solved%' AND NOT rst_outlier THEN resolution_minutes_exc_cust/60 END max_resolution_hours` |
| `ticket_status` | The current status of the ticket. | Derived from the 'agent_label' in the 'statuses' CTE, which maps custom status IDs to human-readable labels. This status is directly sourced from the Zendesk tickets table. | `s.agent_label AS ticket_status` |
| `form_name` | The name of the form used to create the ticket. | Directly extracted from the `ticket_forms` table in Zendesk, joined on `ticket_form_id`. | `forms.name AS form_name` |
| `old_max_resolution_hours` | Maximum resolution time in hours for a ticket, excluding customer pending time. | Calculated by dividing the maximum resolution minutes (excluding customer pending time) by 60. Only applicable if the ticket's current status is 'Solved' and there are agent comments. | `CASE WHEN current_status LIKE 'Solved%' AND agent_comments > 0 THEN old_max_resolution_minutes/60 END old_max_resolution_hours` |
| `assignee_name` | Name of the agent currently assigned to the ticket. | Directly extracted from the Zendesk tickets table, joining with the zd_users table on assignee_id to get the agent's name. | `a.name AS assignee_name` |
| `submitter_name` | Name of the user who submitted the ticket. | Directly extracted from the 'name' field of the 'zd_users' table, aliased as 'subm', based on the 'submitter_id' from the main 'zendesk.tickets' table. | `subm.name AS submitter_name` |
| `assignee_role` | Role of the assignee for the Zendesk ticket. | Directly extracted from the 'role' field of the assignee in the Zendesk users table. | `a.role AS assignee_role` |
| `submitter_role` | Role of the user who submitted the ticket. | Derived from the 'role' field of the submitter in the Zendesk users table. If the submitter is 'zendesk@guesty.com' and the channel is 'web_widget', the requester's role is used instead. | `IF(channel = 'web_widget' AND submitter_email = 'zendesk@guesty.com', requester_role, submitter_role)` |
| `assignee_email` | Email address of the agent assigned to the ticket. | The assignee_email is extracted from the 'a.email' field in the 'zd_users' CTE, which is joined with the main tickets table based on the assignee_id. | `a.email AS assignee_email` |
| `submitter_email` | Email address of the user who submitted the ticket. | Determined by the submitter's email from Zendesk users. If the channel is 'web_widget' and the submitter email is 'zendesk@guesty.com', the requester's email is used instead. | `IF(channel = 'web_widget' AND submitter_email = 'zendesk@guesty.com', requester_email, submitter_email)` |
| `assignee_status` | Current status of the ticket's assignee. | This column captures the current status of the agent assigned to the ticket, derived from the `agent_status` field in the `zd_users` CTE, which aggregates data from `airtable.cx_team_members` and `make.bob_employees`. | `a.agent_status AS assignee_status` |
| `csat_user_status` | Status of the CSAT user (agent). | This column captures the agent's status at the time of the CSAT rating, derived from Zendesk user data, joined with Airtable and Make data for comprehensive agent information. | `COALESCE(csat_user.agent_status, old_csat_user.agent_status) AS csat_user_status` |
| `assignee_nickname` | Nickname of the agent assigned to the ticket. | The assignee's nickname is retrieved from the `zd_users` CTE, which joins Zendesk users with agent information from Airtable and Bob employees. It uses the 'nickname' field from the 'agents' CTE. | `a.nickname AS assignee_nickname` |
| `first_response_hours` | Time in hours from ticket creation to first agent response. | Calculates the time difference in hours between ticket creation and the first agent response, excluding specific conditions like non-friction tickets or certain channels. For Yield Planet, it uses 'yip_fr_mnts'. | `CASE WHEN ((gus_automation = 'Human Only' AND auto_end_session) OR channel NOT IN('chat','Messaging: Widget','Messaging: Zowie')) THEN first_response_hours END` |
| `created_at` | Timestamp when the ticket was created in Zendesk. | The creation timestamp of the ticket, adjusted for specific messaging channels to reflect activation time. | `CASE WHEN mr.activation_time IS NOT NULL AND COALESCE(via_source_rel,via_channel) IN('native_messaging','sunshine_conversations_api','chat') THEN GREATEST(activation_time, t.created_at) ELSE t.created_at END` |
| `sla_breach` | Indicates if the ticket's First Response Time (FRT) breached its SLA target. | Compares the First Response Time (FRT) in minutes to a predefined SLA target. For messaging channels, it uses 'msg_sla_breach' if available, otherwise calculates based on 'tickets_fr_mnts' and 'sla_target'. | `CASE WHEN current_status = 'New' THEN NULL WHEN channel IN('chat','native_messaging','sunshine_conversations_api') AND NOT auto_end_session THEN msg_sla_breach WHEN tickets_fr_mnts IS NOT NULL THEN IF(tickets_fr_mnts > sla_target, 'Breach', 'Non-breach') ELSE NULL END AS sla_breach` |
| `full_resolution_hours` | Total time from ticket creation to final resolution in hours. | Calculated as the difference between the last resolution time and the ticket creation time, converted to hours. This is applicable for 'Billing Ops' brand tickets or tickets with agent comments or GUS automation. Otherwise, it's null. | `CASE WHEN brand = 'Billing Ops' OR agent_comments > 0 OR gus_automation != 'Human Only' THEN full_resolution_hours END full_resolution_hours` |
| `package` | The Guesty package associated with the account. | This column determines the Guesty package (Lite, Pro, Enterprise) based on several fields, prioritizing 'guesty_package', then 'organization_fields_account_package', and finally 'package' from the gfp_accounts table. Defaults to 'Pro' if none are found. | `INITCAP(COALESCE(guesty_package, organization_fields_account_package, IF(TRIM(package)='', null, package), 'Pro'))` |
| `reopened_thankyou` | Indicates if a ticket was reopened with a 'thank you' message. | This flag is true if the ticket has a 'reopened_thankyou' tag or if the last comment on the ticket was 'Thank you reopen. NFAR'. | `IFNULL(reopen_ty_last, FALSE) OR IFNULL(reopened_ty_tag, FALSE)` |
| `requester_role` | Role of the ticket requester. | Directly extracted from the Zendesk users table based on the requester's ID. If the requester is an agent, their role is 'agent', otherwise it's 'end-user'. | `r.role AS requester_role` |
| `assignee_tl` | The team leader of the assignee for the ticket. | Derived from the 'agent_tl' field in the 'zd_users' CTE, which combines data from 'agents' (Airtable) and 'bob' (Make) based on the assignee's email. | `a.agent_tl AS assignee_tl` |
| `team_member_role` | Role of the assignee from Airtable. | Directly retrieves the 'role_from_airtable' field from the 'zd_users' CTE, which combines roles from Airtable and Bob employees. | `a.role_from_airtable AS team_member_role` |
| `msg_fr_mnts` | First response time in minutes for messaging channels. | Calculates the first response time in minutes for tickets from chat, native messaging, or sunshine conversations API channels. If the ticket is fully automated by GUS, a default value is used. | `CASE WHEN ticket_id = '1729948' THEN 0.5 WHEN gus_automation = 'Human Only' THEN msg_fr_mnts ELSE 0.4 END msg_fr_mnts` |
| `premium_support` | Indicates if the account has premium support. | Determined by the 'premium_support' column from the `guesty-data.zendesk_analytics.premium_support` table, joined on account_id. | `premium_support` |
| `support_type` | The type of support provided to the account. | Determined by the 'support_type' field from the `guesty-data.zendesk_analytics.premium_support` table. If the account is not 'Pro', it defaults to 'Not Pro'. | `IF(package = 'Pro', COALESCE(support_type, 'N/A'), 'Not Pro') support_type` |
| `ob_completed` | Date when onboarding for the account was completed. | This column is derived from the 'Onboarding_Completion_Date__c' field in the 'sf_account' table, joined with the 'tickets_6' table on account ID and creation date. | `DATE(sf_ob.ob_completion)` |
| `gus_covered` | Indicates if Gus (Guesty's automated support) was involved in handling the ticket. | Derived from the `gus_automation` column. If `gus_automation` is not 'Human Only', the ticket ID is returned, otherwise null. | `CASE    WHEN gus_automation != 'Human Only' THEN ticket_id    ELSE NULL  END AS gus_covered` |
| `account_days_to_ticket` | Days between account creation and ticket creation. | Calculated as the difference in days between the ticket's creation date and the account's creation date. Returns NULL if account creation date is '1999-01-01'. | `IF(account_created_at = '1999-01-01', null, DATE_DIFF(DATE(created_at), account_created_at, DAY)) account_days_to_ticket` |
| `domain_group` | Categorization of the ticket's domain group, such as Guesty Pay, GCS, or based on the package type. | The domain group is determined by the ticket's brand (Guesty Pay, GCS) or by joining with the 'domains' table based on the domain field. If no match is found, it defaults to the package type. | `COALESCE(CASE              WHEN t.domain LIKE 'Guesty Pay%' THEN 'Guesty Pay'             WHEN LOWER(t.domain) LIKE '%gcs%' THEN 'GCS'            ELSE d.domain_group END, package           ) AS domain_group` |
| `Domain_Group_id` | Identifier for the domain group associated with the ticket. | Determines the domain group based on the ticket's brand and domain. If the brand is 'Guesty Pay' or the domain contains 'Gcs', specific domain groups are assigned. Otherwise, it uses the domain group from the 'domains' table or defaults to the package. | `COALESCE(CASE              WHEN t.domain LIKE 'Guesty Pay%' THEN 'Guesty Pay'             WHEN LOWER(t.domain) LIKE '%gcs%' THEN 'GCS'            ELSE d.domain_group END, package           )` |
| `churn_status` | Indicates the churn status of the account associated with the ticket. | Determined by checking the 'churn_status' from 'gfp_churn' or 'tickets_6' tables, defaulting to 'never churned'. | `COALESCE(gfpc.churn_status, t.churn_status, 'never churned')` |
| `csat_user_shift` | Shift of the CSAT assignee. | Extracts the agent_shift from the `zd_users` table for the CSAT assignee, based on their email or ID. | `COALESCE(csat_user.agent_shift, old_csat_user.agent_shift) AS csat_user_shift` |
| `ob_completion` | Date when onboarding was completed for the account. | Extracts the maximum onboarding completion date from Salesforce account data for the corresponding account ID and creation date. | `DATE(sf_ob.ob_completion)` |
