# BI mart — `guesty-data.zendesk_analytics.incoming_outgoing`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ Source last refreshed 2026-05-20 (~7 weeks ago) — verify logic hasn't drifted before relying on it.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.
>
> ⚠️ **Hardcoded date literal(s) detected:** '2024-01-01'. These will age out — surface them to the user for confirmation instead of copying blindly.

## Verified build query
```sql
-- CREATE OR REPLACE TABLE `guesty-data.zendesk_analytics.incoming_outgoing` AS 

WITH statuses AS ( 
  SELECT 
    s.id AS custom_status_id, 
    s.agent_label, 
    s.end_user_label,
    t.id AS ticket_field_id,
    t.raw_title AS field_title,
    t.raw_description,
  FROM `guesty-data.zendesk.ticket_fields` t, UNNEST(custom_statuses) s
),

agents AS (
  SELECT
    Full_Name AS agent_name,  
    Nickname as agent_nickname,
    Email AS agent_email,
    Start_Date AS agent_start_date,
    Full_Name_from_Manager__TL_Manual[SAFE_OFFSET(0)] AS TL,
    Shift AS shift,
    Role as role,
    location,
    Status AS agent_status,
  FROM `guesty-data.airtable.cx_team_members`
),

zd_users AS (
  SELECT
    id,
    name,
    email,
    role
  FROM `guesty-data.zendesk.users` 
),

ticket_events_0 AS (
  SELECT 
    te.ticket_id,
    te.created_at AS e_created_at,
    child_events.event_type AS child_event_event_type,
    child_events.status,
    s.agent_label AS custom_status,
    RANK() OVER(PARTITION BY te.ticket_id ORDER BY te.created_at DESC) rn_event,
    MAX(requester_id) OVER(PARTITION BY te.ticket_id) requester_id,
    author_id,
    u.name AS event_user_name,
    u.email AS event_user_email,
    a.name AS assignee_name,
    a.email AS assignee_email,
    assignee_id,
    public, 
    body
  FROM `guesty-data.zendesk.ticket_events` te, UNNEST(child_events) child_events
    LEFT JOIN statuses s ON s.custom_status_id = child_events.custom_status_id
    LEFT JOIN zd_users u ON u.id = child_events.author_id
    LEFT JOIN zd_users a ON a.id = child_events.assignee_id
  WHERE te.created_at >= '2024-01-01'
),

filled_events_0 AS (
  SELECT 
    *,
    LAST_VALUE(assignee_id IGNORE NULLS) OVER (PARTITION BY ticket_id ORDER BY e_created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS filled_assignee_id,
    LAST_VALUE(assignee_name IGNORE NULLS) OVER (PARTITION BY ticket_id ORDER BY e_created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS filled_assignee_name,
    LAST_VALUE(assignee_email IGNORE NULLS) OVER (PARTITION BY ticket_id ORDER BY e_created_at ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS filled_assignee_email,
  FROM ticket_events_0
  GROUP BY ALL
),

status_events_0 AS (
  SELECT
    ticket_id,
    e_created_at,
    MAX(custom_status) custom_status,
    MAX(event_user_name) event_user_name,
    MAX(event_user_email) event_user_email,
  FROM ticket_events_0
  GROUP BY 1,2
),

status_events_1 AS (
  SELECT
    ticket_id,
    e_created_at,
    COALESCE(o.event_user_name, filled_assignee_name) AS event_user_name,
    COALESCE(o.event_user_email, filled_assignee_email) AS event_user_email,
    COALESCE(o.custom_status, n.custom_status) custom_status,
  FROM status_events_0 o  
    FULL OUTER JOIN filled_events_0 n USING(ticket_id, e_created_at)
  WHERE COALESCE(o.custom_status, n.custom_status) IS NOT NULL
  GROUP BY ALL
),

status_events_11 AS (
  SELECT
    *,
    LAG(custom_status) OVER(PARTITION BY ticket_id ORDER BY e_created_at ASC) previous_custom_status,
    RANK() OVER(PARTITION BY ticket_id ORDER BY e_created_at DESC) rn_status,
  FROM status_events_1
),

status_events_2 AS (
  SELECT
    ticket_id,
    e_created_at,
    rn_status,
    event_user_name,
    event_user_email,
    custom_status,
    CASE 
    -------------------------------- OPENED STATUSES --------------------------------------------
      WHEN previous_custom_status = 'New' AND custom_status = 'Open' THEN 'Open from New' 
      WHEN previous_custom_status = 'Solved' AND custom_status = 'Open' THEN 'Open from Solved' 
      WHEN previous_custom_status = 'Pending Tier 3/R&D' AND custom_status = 'Open' THEN 'Open from Tier 3/R&D' 
      WHEN previous_custom_status = 'Pending 3rd party' AND custom_status = 'Open' THEN 'Open from 3rd party' 
      WHEN previous_custom_status = "Pending Internal escalation's reply" AND custom_status = 'Open' THEN 'Open from Internal escalation' 
      WHEN previous_custom_status = "Pending Customer's Reply" AND custom_status = 'Open' THEN "Open from Customer's Reply" 
      WHEN (previous_custom_status IS NULL OR previous_custom_status = 'Open') AND custom_status = 'Open' THEN 'Open from Open or from Null' 
    -------------------------------- SOLVED STATUSES --------------------------------------------
      WHEN previous_custom_status = 'New' AND custom_status = 'Solved' THEN 'Solved from New' 
      WHEN previous_custom_status = 'Solved' AND custom_status = 'Solved' THEN 'Solved from Solved' 
      WHEN previous_custom_status = 'Pending Tier 3/R&D' AND custom_status = 'Solved' THEN 'Solved from Tier 3/R&D' 
      WHEN previous_custom_status = 'Pending 3rd party' AND custom_status = 'Solved' THEN 'Solved from 3rd party' 
      WHEN previous_custom_status = "Pending Internal escalation's reply" AND custom_status = 'Solved' THEN 'Solved from Internal escalation' 
      WHEN previous_custom_status = "Pending Customer's Reply" AND custom_status = 'Solved' THEN "Solved from Pending Customer's Reply" 
      WHEN previous_custom_status = 'Open' AND custom_status = 'Solved' THEN 'Solved from Open' 
      WHEN previous_custom_status IS NULL AND custom_status = 'Solved' THEN 'Solved from Null' 
    ELSE custom_status END AS current_status,
    CASE WHEN previous_custom_status = 'Solved' THEN 1 ELSE 0 END AS reopened_after_solved,
    ROW_NUMBER() OVER(PARTITION BY ticket_id, CASE WHEN custom_status = 'Solved' THEN 1 ELSE NULL END ORDER BY e_created_at ASC) rn_solved,
  FROM status_events_11
),

status_events_3 AS (
  SELECT
    CAST(ticket_id AS STRING) ticket_id,
    GENERATE_UUID() AS event_id,
    e_created_at,
    CASE WHEN EXTRACT(DAYOFWEEK FROM DATE(e_created_at)) IN(1,7) THEN true ELSE false END AS is_weekend,
    event_user_name,
    event_user_email,
    CASE WHEN LOWER(event_user_email) LIKE '%@guesty%' THEN TRUE ELSE FALSE END AS guesty_employee,
    CASE WHEN current_status LIKE 'Solved%' THEN 'Solved' ELSE current_status END AS status,
    CASE 
      WHEN current_status LIKE 'Pending%' OR current_status LIKE 'Solved%' THEN 'outgoing'
      -- WHEN current_status LIKE 'Open%' OR current_status = 'New' THEN 'incoming'
    ELSE 'incoming' END AS direction
  FROM status_events_2
  WHERE current_status NOT IN('Open from New',"Solved from Pending Customer's Reply",'Open from Open or from Null')
  ORDER BY 1 ASC
),

status_events_4 AS (
  SELECT 
    t3.*,
    t.channel, 
    t.domain, 
    t.friction_related,
    t.brand,
    t.gus_automation,
    t.deleted,
    t.internal_api_task,
    t.non_friction_ticket,
    t.created_at AS ticket_created_at,
    t.ticket_url,
    t.agent_comments as touch_points,
    t.subject,
    t.account_segment,
    t.package,
    t.domain_group,
    t.proactive_outreach,
    t.incident_id,
    t.main_category,
    t.sub_category,
    t.uber_enterprise,
    IF(jira_ids IS NULL OR TRIM(jira_ids) =  '', NULL, t.ticket_id) escalated_ticket,
    a.shift,
    a.TL, 
    a.role,
    a.location,
    a.agent_nickname,
    a.agent_start_date,
    a.agent_name
  FROM status_events_3 t3
    LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t USING(ticket_id)
    LEFT JOIN agents a ON t3.event_user_email = a.agent_email
)

SELECT 
  *,
  CASE WHEN status = 'New' THEN event_id ELSE NULL END new_ticket,
  CASE WHEN status != 'New' THEN event_id ELSE NULL END reopened,
  CASE WHEN direction = 'incoming' THEN event_id ELSE NULL END incoming,
  CASE WHEN direction = 'outgoing' THEN event_id ELSE NULL END outgoing,
  timestamp_diff(current_timestamp, ticket_created_at, hour) ticket_age
FROM status_events_4 t4
```

## Documented columns (6 of 42)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `shift` | The work shift of the agent who created the event. | The shift is retrieved from the 'cx_team_members' table based on the agent's email associated with the event. | `a.Shift AS shift` |
| `TL` | The Team Lead (TL) of the agent who performed the action. | Derived from the 'Full_Name_from_Manager__TL_Manual' field in the `guesty-data.airtable.cx_team_members` table, based on the agent's email. | `a.TL` |
| `domain_group` | Categorization of domains into groups. | Directly sourced from the 'tickets_clean' table, which contains pre-categorized domain groups for each ticket. | `t.domain_group` |
| `package` | The customer's Guesty package type. | Directly retrieved from the `guesty-data.zendesk_analytics.tickets_clean` table. | `t.package` |
| `brand` | The brand associated with the Zendesk ticket. | Directly retrieved from the `tickets_clean` table, representing the brand linked to the ticket. | `t.brand` |
| `ticket_created_at` | Timestamp when the Zendesk ticket was originally created. | Directly sourced from the 'created_at' column in the 'zendesk_analytics.tickets_clean' table. | `t.created_at AS ticket_created_at` |
