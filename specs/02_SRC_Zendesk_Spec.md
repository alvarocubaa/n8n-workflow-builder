# Zendesk — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Zendesk API (sandbox) | `zendeskOAuth2Api` | Zendesk node |
| Zendesk API (production) | `zendeskApi` | Zendesk node |
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | Zendesk path: Zendesk OAuth2 API (sandbox) or Zendesk API (prod). BigQuery path: Google Service Account API. |
| **Node Type** | **Zendesk node** (with Zendesk credential) or **BigQuery node** (with Google Service Account). |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: **ticket_id** (tickets_clean). **account_id** and **sf_account_id** link to other systems (see section 2.1).
- **API field names**: Use field names from section 2.1 schema (e.g. ticket_id, subject, description, ticket_status, priority, created_at, updated_at, requester_email, assignee_email). For Zendesk API operations use API names per Zendesk docs; custom fields are numeric IDs in the API.
- **Data types**: String, Integer, Date (ISO 8601), Enum. Match schema types in section 2.1.

---

## 2.1. BigQuery Tables (Source of Truth)

**BigQuery full table names (use exactly — do not invent project/dataset names):**

| Logical table | Full BigQuery path | Rows | Purpose |
|---------------|--------------------|------|---------|
| tickets_clean | `guesty-data.zendesk_analytics.tickets_clean` | ~2M+ | Main ticket data with sentiment, CSAT, account linkage |
| incoming_outgoing | `guesty-data.zendesk_analytics.incoming_outgoing` | — | Event-level messages/activity per ticket |
| productivity_hourly | `guesty-data.zendesk_analytics.productivity_hourly` | — | Agent productivity metrics by hour |
| qa_data | `guesty-data.zendesk_analytics.qa_data` | ~607K | QA audit scores per ticket (empathy, professionalism, grammar) |
| feedback_dash | `guesty-data.zendesk_analytics.feedback_dash` | ~10.5K | NSAT feedback, coaching logs, root cause analysis |
| incoming_predictions | `guesty-data.zendesk_analytics.incoming_predictions` | ~3.7K | Time-series forecasts of incoming ticket volume by domain |
| domain_friction_spikes | `guesty-data.zendesk_analytics.domain_friction_spikes` | ~3K | Detected friction spikes with AI explanations |

**Tables summary**

| Table | Primary / key identifiers | Notes |
|-------|---------------------------|--------|
| tickets_clean | ticket_id (PK), **account_id**, **sf_account_id**, **jira_ids**, ticket_status, created_at, assignee_email, sentiment, satisfaction_rating | Main table; account_id and sf_account_id link to other sources; jira_ids links to Jira issues. |
| incoming_outgoing | ticket_id, event_id, ticket_url | Join to tickets_clean on ticket_id. |
| productivity_hourly | agent_email, agent_name, month, active_hour | Join to tickets_clean on assignee_email = agent_email (no ticket key). |
| qa_data | ticket_id, responsible_agent_email, created_at | QA audits with 4 scored dimensions. Join to tickets_clean on ticket_id (note: INT64 here vs STRING in tickets_clean — cast as needed). |
| feedback_dash | feedback_id (PK), ticket_id, Related_Ticket | NSAT/coaching feedback. Join to tickets_clean on ticket_id. |
| incoming_predictions | partition_date, domain, time_series_type | Forecasting data — no ticket-level join. Filter by domain to match tickets_clean.domain. |
| domain_friction_spikes | spike_date, domain, brand | Anomaly detection — no ticket-level join. Filter by domain/brand to match tickets_clean. |

**Cross-table linkage**: In **tickets_clean**, **account_id** and **sf_account_id** are shared with other tables (e.g. Modjo, dim_accounts). Use these fields to join Zendesk data to other sources. Use **jira_ids** to join to Jira when support tickets are linked to Jira issues.

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| tickets_clean | Salesforce / dim_accounts | tickets_clean.**account_id** = dim_accounts.account_id OR tickets_clean.**sf_account_id** = dim_accounts.sf_account_id |
| tickets_clean | Modjo modjo_transcripts_structured | tickets_clean.**sf_account_id** = modjo_transcripts_structured.**account_crm_id** |
| tickets_clean | Zuora invoices / invoice_items | tickets_clean.**account_id** = invoices.**mongo_account_id** ⚠️ (NOT `invoices.account_id` — that is Zuora's internal ID) |
| tickets_clean | Zuora product_catalog | tickets_clean.**account_id** = product_catalog.account_id. Filter `WHERE LOWER(product_catalog.plan_name) LIKE '%payment gateway%'` for payment gateway fee charges. See Zuora spec section 2.1.3. |
| tickets_clean | **Jira jira_hierarchy** | **By account:** tickets_clean.**account_id** IN UNNEST(jira_hierarchy.account_ids). **By issue:** parse tickets_clean.**jira_ids** (e.g. comma-separated) and match to jira_hierarchy.subtask OR story OR bug. See Jira spec section 2.2. |
| incoming_outgoing | tickets_clean (same source) | incoming_outgoing.**ticket_id** = tickets_clean.ticket_id (and ticket_url optionally) |
| productivity_hourly | tickets_clean (same source) | productivity_hourly.**agent_email** = tickets_clean.assignee_email (agent-level, no ticket key) |
| qa_data | tickets_clean (same source) | qa_data.**ticket_id** = CAST(tickets_clean.ticket_id AS INT64) |
| feedback_dash | tickets_clean (same source) | feedback_dash.**ticket_id** = tickets_clean.ticket_id |

### Sentiment & Quality Fields Across Tables

The Zendesk dataset provides sentiment and quality signals across multiple tables:

| Table | Field | Type | Description |
|-------|-------|------|-------------|
| tickets_clean | `sentiment` | STRING | Primary classification (Positive/Negative/Neutral) |
| tickets_clean | `negative_sentiment` | INTEGER | Risk score (higher = more negative) |
| tickets_clean | `satisfaction_rating` | STRING | CSAT score (direct customer feedback) |
| tickets_clean | `urgency` | STRING | Prioritization signal |
| tickets_clean | `csat_score` | STRING | Detailed CSAT score |
| tickets_clean | `csat_reason` | STRING | CSAT reason category |
| tickets_clean | `csat_comment` | STRING | Free-text CSAT comment |
| qa_data | `overall_score` | FLOAT | Composite QA score across all dimensions |
| qa_data | `valued_users_time_score` | FLOAT | How well agent valued user's time |
| qa_data | `communicated_professionally_score` | FLOAT | Professionalism score |
| qa_data | `empathy_score` | FLOAT | Empathy score |
| qa_data | `grammar_and_spelling_score` | FLOAT | Grammar & spelling score |
| qa_data | `sentiment` | STRING | Ticket sentiment at time of QA audit |
| feedback_dash | `Feedback_Sentiment` | STRING | Sentiment of internal feedback |
| feedback_dash | `Level_1_Rootcause` | STRING | Root cause category |
| feedback_dash | `Level_2_Rootcause` | STRING | Root cause subcategory |
| domain_friction_spikes | `ai_explanation` | STRING | AI-generated explanation of friction spike |
| domain_friction_spikes | `pct_chnge` | FLOAT | Percentage change triggering spike alert |

### 2.1.1. tickets_clean (main Zendesk table)

**BigQuery table:** `guesty-data.zendesk_analytics.tickets_clean`

**Table**: `tickets_clean` — primary table for Zendesk ticket data. **account_id** and **sf_account_id** are the keys to join with other tables (e.g. dim_accounts, Modjo).

**Key columns** (most commonly used — full schema below):

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` | STRING | Primary key |
| `account_id` | STRING | Guesty account ID — join key |
| `sf_account_id` | STRING | Salesforce Account ID — join key |
| `account_name` | STRING | Account display name |
| `created_at` | TIMESTAMP | Ticket creation time |
| `updated_at` | TIMESTAMP | Last update time |
| `ticket_status` | STRING | open / pending / solved / closed |
| `subject` | STRING | Ticket subject |
| `description` | STRING | Ticket body |
| `assignee_email` | STRING | Assigned agent email |
| `assignee_name` | STRING | Assigned agent name |
| `sentiment` | STRING | Positive / Negative / Neutral |
| `negative_sentiment` | INTEGER | Risk score (higher = more negative) |
| `satisfaction_rating` | STRING | CSAT score |
| `urgency` | STRING | Prioritization |
| `jira_ids` | STRING | Comma-separated Jira keys linked to this ticket |
| `csm` | STRING | Customer Success Manager |
| `domain` | STRING | Product domain |
| `domain_group` | STRING | Domain group |
| `brand` | STRING | Brand (Guesty / Guesty for Hosts) |
| `channel` | STRING | Contact channel |
| `priority` | STRING | Ticket priority |
| `package` | STRING | Account package/plan |
| `account_segment` | STRING | Account segment |
| `first_response_hours` | FLOAT | Hours to first response |
| `max_resolution_hours` | FLOAT | Max resolution time (hours) |
| `friction_related` | BOOLEAN | Whether ticket is friction-related |
| `escalated_to` | STRING | Escalation target |
| `csat_score` | STRING | Detailed CSAT score |
| `csat_reason` | STRING | CSAT reason |
| `csat_comment` | STRING | CSAT free-text comment |

<details>
<summary>Expand: tickets_clean full schema (206 columns)</summary>

| Column | Type |
|--------|------|
| account_id | STRING |
| ticket_id | STRING |
| ticket_url | STRING |
| created_at | TIMESTAMP |
| is_weekend | BOOLEAN |
| days_since_open | INTEGER |
| days_since_last_status_change | INTEGER |
| hrs_since_last_status_change | INTEGER |
| ultimate | STRING |
| reopen_reason | STRING |
| bulk_task | STRING |
| strategic_account | STRING |
| organization_account_email | STRING |
| account_name | STRING |
| account_first_paid | DATE |
| csm | STRING |
| solutions_expert | STRING |
| months_in_guesty | INTEGER |
| sf_account_id | STRING |
| onboarding_status | STRING |
| avg_mrr | FLOAT |
| is_churn | BOOLEAN |
| at_guesty | STRING |
| account_active | BOOLEAN |
| updated_at | TIMESTAMP |
| form_name | STRING |
| group_name | STRING |
| type | STRING |
| creation_reason | STRING |
| article_jira_url | STRING |
| ticket_summary | STRING |
| gst_pay_pfr | STRING |
| gst_pay_tech_issue | STRING |
| gst_pay_category | STRING |
| gst_pay_subcategory | STRING |
| opened_on_behalf | BOOLEAN |
| channel | STRING |
| priority | STRING |
| ticket_status | STRING |
| old_max_resolution_hours | FLOAT |
| times_solved | INTEGER |
| first_solved_agent | STRING |
| first_solved_email | STRING |
| current_status | STRING |
| reopened_after_solved | INTEGER |
| last_status_change | TIMESTAMP |
| first_resolution_time | TIMESTAMP |
| last_resolution_time | TIMESTAMP |
| old_last_resolution_time | TIMESTAMP |
| first_response_agent_name | STRING |
| first_response_agent_email | STRING |
| first_response_body | STRING |
| fr_nfar | INTEGER |
| frt_outlier | BOOLEAN |
| rst_outlier | BOOLEAN |
| sla_breach | STRING |
| reopen_ty_last | BOOLEAN |
| agents_commented | INTEGER |
| agent_comments | INTEGER |
| agent_comments_before_link | INTEGER |
| user_comments | INTEGER |
| jira_ids | STRING |
| jira_status | STRING |
| known_issue | STRING |
| leveling | STRING |
| billing_urgency | STRING |
| billing_source | STRING |
| billing_submitter | STRING |
| billing_pending_for | STRING |
| billing_issue_type | STRING |
| billing_pending_reason | STRING |
| billing_solved_reason | STRING |
| subject | STRING |
| description | STRING |
| issue_type | STRING |
| clean_multi_level | STRING |
| previous_domain | STRING |
| knowledge | STRING |
| api_task_domain | STRING |
| reported_topic | STRING |
| ob_email | STRING |
| zowie_ticket | BOOLEAN |
| lms_training | BOOLEAN |
| uber_enterprise | BOOLEAN |
| status_pending_t3 | BOOLEAN |
| escalated_3rd_party | BOOLEAN |
| esc_jira_links | BOOLEAN |
| first_j_priority | STRING |
| escalated_t3 | BOOLEAN |
| escalated_to_smb | BOOLEAN |
| escalated_to_csm | BOOLEAN |
| escalated_to_ob | BOOLEAN |
| escalated_credit_approval | BOOLEAN |
| escalated_to_finance | BOOLEAN |
| escalated_to_collection | BOOLEAN |
| escalated_billing_ops | BOOLEAN |
| escalated_contract_request | BOOLEAN |
| auto_end_session | BOOLEAN |
| apply_credit_refund | BOOLEAN |
| merged | BOOLEAN |
| proactive_outreach | BOOLEAN |
| incident_id | STRING |
| all_tags | STRING |
| deleted | BOOLEAN |
| non_friction_ticket | BOOLEAN |
| auto_solved | BOOLEAN |
| escalated_to_is | BOOLEAN |
| downgraded_to_dss | BOOLEAN |
| escalated_to_lds | BOOLEAN |
| ticket_transferred | BOOLEAN |
| gus_ticket | BOOLEAN |
| gus_expired | BOOLEAN |
| gus_routed | BOOLEAN |
| gus_email_ticket | BOOLEAN |
| gus_email_routed | BOOLEAN |
| business_hours | BOOLEAN |
| lds_endorsement | BOOLEAN |
| lds_ticket_classification | BOOLEAN |
| lds_live_assistance | BOOLEAN |
| reopened_thankyou | BOOLEAN |
| submitter_name | STRING |
| submitter_email | STRING |
| submitter_role | STRING |
| requester_name | STRING |
| requester_email | STRING |
| requester_role | STRING |
| assignee_name | STRING |
| assignee_nickname | STRING |
| assignee_email | STRING |
| assignee_role | STRING |
| team_member_role | STRING |
| assignee_tl | STRING |
| assignee_shift | STRING |
| assignee_status | STRING |
| recipient | STRING |
| satisfaction_rating | STRING |
| positive | INTEGER |
| negative | INTEGER |
| csat_created | TIMESTAMP |
| csat_name | STRING |
| csat_email | STRING |
| csat_user_tl | STRING |
| csat_user_shift | STRING |
| csat_user_status | STRING |
| csat_score | STRING |
| csat_reason | STRING |
| csat_comment | STRING |
| corrected_csat_assignee | STRING |
| csat_cx_related | STRING |
| csat_review | STRING |
| csat_review_comment | STRING |
| account_created_at | DATE |
| in_trial_gfh | BOOLEAN |
| escalat_type | STRING |
| sentiment | STRING |
| urgency | STRING |
| int_esc_point | STRING |
| account_days_to_ticket | INTEGER |
| account_months_to_ticket | INTEGER |
| package | STRING |
| account_segment | STRING |
| negative_sentiment | INTEGER |
| urgent_urgency | INTEGER |
| in_trial_glite | STRING |
| escalated_rnd | STRING |
| brand | STRING |
| main_category | STRING |
| sub_category | STRING |
| internal_api_task | BOOLEAN |
| escalated_to | STRING |
| domain | STRING |
| gus_automation | STRING |
| product_manager | STRING |
| Domain_Group_id | STRING |
| lds | STRING |
| titles_inv | STRING |
| csm_inv_public | BOOLEAN |
| csm_inv_internal | BOOLEAN |
| csm_inv | BOOLEAN |
| Paid | STRING |
| fr_es_detail | STRING |
| last_churned | DATE |
| churn_segment | STRING |
| churned | BOOLEAN |
| premium_support | BOOLEAN |
| ob_completion | TIMESTAMP |
| onboarding_satus | STRING |
| onboarding_stage | STRING |
| domain_group | STRING |
| support_type | STRING |
| is_france_or_spain | BOOLEAN |
| friction_related | BOOLEAN |
| during_rabbit_MQ_blocker | BOOLEAN |
| table_last_updated | DATETIME |
| ob_completed | DATE |
| ob_status | STRING |
| churn_status | STRING |
| first_response_hours | FLOAT |
| pending_user_hours | FLOAT |
| max_resolution_hours | FLOAT |
| full_resolution_hours | FLOAT |
| first_response_time | TIMESTAMP |
| msg_fr_mnts | FLOAT |

</details>

### 2.1.2. incoming_outgoing

**BigQuery table:** `guesty-data.zendesk_analytics.incoming_outgoing`

**Table**: `incoming_outgoing` — event-level data (messages/activity). **Join to tickets_clean on ticket_id** (and **ticket_url** if needed for consistency).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` | STRING | Join to tickets_clean |
| `event_id` | STRING | Unique event ID |
| `e_created_at` | TIMESTAMP | Event timestamp |
| `direction` | STRING | Incoming / outgoing |
| `channel` | STRING | Contact channel |
| `event_user_email` | STRING | Who created the event |
| `guesty_employee` | BOOLEAN | Is sender a Guesty employee |
| `domain` | STRING | Product domain |
| `new_ticket` | STRING | New ticket indicator |
| `incoming` | STRING | Incoming event flag |
| `outgoing` | STRING | Outgoing event flag |
| `touch_points` | INTEGER | Number of touch points |

<details>
<summary>Expand: incoming_outgoing full schema (38 columns)</summary>

| Column | Type |
|--------|------|
| ticket_id | STRING |
| event_id | STRING |
| e_created_at | TIMESTAMP |
| is_weekend | BOOLEAN |
| event_user_name | STRING |
| event_user_email | STRING |
| guesty_employee | BOOLEAN |
| status | STRING |
| direction | STRING |
| channel | STRING |
| domain | STRING |
| friction_related | BOOLEAN |
| brand | STRING |
| gus_automation | STRING |
| deleted | BOOLEAN |
| internal_api_task | BOOLEAN |
| non_friction_ticket | BOOLEAN |
| ticket_created_at | TIMESTAMP |
| ticket_url | STRING |
| touch_points | INTEGER |
| subject | STRING |
| account_segment | STRING |
| package | STRING |
| domain_group | STRING |
| proactive_outreach | BOOLEAN |
| incident_id | STRING |
| main_category | STRING |
| sub_category | STRING |
| escalated_ticket | STRING |
| shift | STRING |
| TL | STRING |
| role | STRING |
| location | STRING |
| agent_nickname | STRING |
| agent_start_date | DATE |
| agent_name | STRING |
| new_ticket | STRING |
| reopened | STRING |
| incoming | STRING |
| outgoing | STRING |
| ticket_age | INTEGER |

</details>

### 2.1.3. productivity_hourly

**BigQuery table:** `guesty-data.zendesk_analytics.productivity_hourly`

**Table**: `productivity_hourly` — agent-level hourly productivity metrics. **Join to tickets_clean on assignee_email = agent_email** (no direct ticket key).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `agent_email` | STRING | Join to tickets_clean.assignee_email |
| `agent_name` | STRING | Agent display name |
| `month` | DATE | Month of data |
| `active_hour` | TIMESTAMP | Specific active hour |
| `agent_brand` | STRING | Brand |
| `role` | STRING | Agent role |
| `tickets` | INTEGER | Tickets handled |
| `outgoing` | INTEGER | Outgoing messages |
| `outgoing_solved` | INTEGER | Outgoing that solved tickets |
| `positive` | INTEGER | Positive CSAT count |
| `negative` | INTEGER | Negative CSAT count |
| `avail_hrs` | FLOAT | Available hours |
| `break_hrs` | FLOAT | Break hours |

<details>
<summary>Expand: productivity_hourly full schema (27 columns)</summary>

| Column | Type |
|--------|------|
| month | DATE |
| agent_email | STRING |
| active_hour | TIMESTAMP |
| agent_brand | STRING |
| role | STRING |
| position_hrs | FLOAT |
| otta_hrs | FLOAT |
| avail_hrs | FLOAT |
| break_hrs | FLOAT |
| queue_hrs | FLOAT |
| overtime_hrs | FLOAT |
| outgoing | INTEGER |
| outgoing_solved | INTEGER |
| outgoing_reopened | INTEGER |
| outgoing_escalated | INTEGER |
| tickets | INTEGER |
| positive | INTEGER |
| negative | INTEGER |
| agent_name | STRING |
| agent_status | STRING |
| agent_start_date | DATE |
| TL | STRING |
| updated_tl | STRING |
| shift | STRING |
| level | STRING |
| timeframe | STRING |
| enrollments | INTEGER |
| enrollment_status | STRING |

</details>

### 2.1.4. qa_data (QA audit scores)

**BigQuery table:** `guesty-data.zendesk_analytics.qa_data`

**Table**: `qa_data` — QA audit scores per ticket with 4 scored dimensions (valued_users_time, communicated_professionally, empathy, grammar_and_spelling). Each row is one QA audit of a ticket. **Join to tickets_clean on ticket_id** (cast: `qa_data.ticket_id` is INT64, `tickets_clean.ticket_id` is STRING).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` | INT64 | Join to tickets_clean (cast to STRING or vice versa) |
| `responsible_agent_email` | STRING | Agent who handled the ticket |
| `responsible_agent_name` | STRING | Agent display name |
| `created_at` | TIMESTAMP | Ticket creation time |
| `audit_time` | TIMESTAMP | When the QA audit was performed |
| `overall_score` | FLOAT | Composite QA score |
| `total_score` | FLOAT | Total raw score |
| `valued_users_time_score` | FLOAT | Score: valued user's time |
| `valued_users_time_reason` | STRING | Reason for score |
| `communicated_professionally_score` | FLOAT | Score: professional communication |
| `communicated_professionally_reason` | STRING | Reason for score |
| `empathy_score` | FLOAT | Score: empathy |
| `empathy_reason` | STRING | Reason for score |
| `grammar_and_spelling_score` | FLOAT | Score: grammar & spelling |
| `grammar_and_spelling_reason` | STRING | Reason for score |
| `sentiment` | STRING | Ticket sentiment at time of audit |
| `domain` | STRING | Product domain |
| `domain_group` | STRING | Domain group |
| `brand` | STRING | Brand |
| `channel` | STRING | Contact channel |
| `assignee_email` | STRING | Assigned agent email |
| `assignee_tl` | STRING | Team lead |
| `audited` | INT64 | Whether audit was completed |

<details>
<summary>Expand: qa_data full schema (39 columns)</summary>

| Column | Type |
|--------|------|
| responsible_agent_email | STRING |
| ticket_id | INT64 |
| created_at | TIMESTAMP |
| ticket_url | STRING |
| last_resolution_time | TIMESTAMP |
| channel | STRING |
| friction_related | BOOLEAN |
| gus_automation | STRING |
| brand | STRING |
| package | STRING |
| domain_group | STRING |
| domain | STRING |
| assignee_email | STRING |
| assignee_tl | STRING |
| sentiment | STRING |
| user_comments | INT64 |
| audit_time | TIMESTAMP |
| valued_users_time_score | FLOAT |
| valued_users_time_reason | STRING |
| communicated_professionally_score | FLOAT |
| communicated_professionally_reason | STRING |
| empathy_score | FLOAT |
| empathy_reason | STRING |
| grammar_and_spelling_score | FLOAT |
| grammar_and_spelling_reason | STRING |
| audited | INT64 |
| work_title | STRING |
| work_manager | STRING |
| internal_status | STRING |
| work_tenureDurationYears | FLOAT |
| tenure_yr | INT64 |
| responsible_agent_name | STRING |
| responsible_agent_tl | STRING |
| responsible_agent_status | STRING |
| responsible_agent_level | STRING |
| ds_role | STRING |
| responsible_agent | STRING |
| total_score | FLOAT |
| rn | INT64 |
| overall_score | FLOAT |

</details>

### 2.1.5. feedback_dash (NSAT & coaching feedback)

**BigQuery table:** `guesty-data.zendesk_analytics.feedback_dash`

**Table**: `feedback_dash` — internal feedback, NSAT, coaching logs, and root cause analysis. Contains data from CX feedback forms with Jira linkage. Many fields are ARRAY types (from Airtable source).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `feedback_id` | STRING | Primary key |
| `ticket_id` | STRING | Join to tickets_clean |
| `feedback_created_at` | TIMESTAMP | Feedback creation time |
| `Feedback_Sentiment` | STRING | Sentiment of the feedback |
| `Feedback_Type` | STRING | Type of feedback |
| `Category` | STRING | Feedback category |
| `Zendesk_Category` | STRING | Zendesk-specific category |
| `Level_1_Rootcause` | STRING | Root cause (level 1) |
| `Level_2_Rootcause` | STRING | Root cause (level 2) |
| `Content` | STRING | Feedback content/body |
| `Notes` | STRING | Additional notes |
| `Status` | STRING | Feedback status |
| `Submitter_Email` | STRING | Who submitted the feedback |
| `submitter_role` | STRING | Submitter's role |
| `assignee_name` | STRING | Assigned agent |
| `assignee_tl` | STRING | Team lead |
| `ticket_domain` | STRING | Product domain of related ticket |
| `Jira_Issue_Key` | STRING | Related Jira issue |
| `Jira_Status` | STRING | Status of related Jira issue |
| `CX_Related` | BOOLEAN | Whether CX-related |
| `Source` | STRING | Feedback source |
| `Source_Type` | STRING | Source type |
| `Account_Segment` | STRING | Account segment |
| `Package` | STRING | Account package |

<details>
<summary>Expand: feedback_dash full schema (73 columns)</summary>

| Column | Type |
|--------|------|
| TL_Email_for_LDS_Review | STRING |
| LDS_Review_Request | STRING |
| Action_Items | ARRAY\<STRING\> |
| User_Notification_on_For_Alignment | STRING |
| Feedback_Coaching_Log | ARRAY\<STRING\> |
| Action_Item__Initiatives | STRING |
| Tenure_Start_Date_from_Team_Member | ARRAY\<DATE\> |
| Jira_Status | STRING |
| LDS_from_Domain | ARRAY\<STRING\> |
| Related_Issue | STRING |
| Account_Segment | STRING |
| Package | STRING |
| rec_id | STRING |
| Start_Date_from_Team_Member | ARRAY\<DATE\> |
| Team_Member_Modified_vs_Created_diff | INT64 |
| Team_Member_Modified | TIMESTAMP |
| Domain_Name | ARRAY\<STRING\> |
| Within_Due_Date | STRING |
| Progression | STRING |
| First_Name_from_Team_Member | ARRAY\<STRING\> |
| Coaching_Log_CREATE | STRING |
| CX_Related | BOOLEAN |
| For_Alignment | BOOLEAN |
| Submitter_Email | STRING |
| Level_2_Rootcause | STRING |
| Due_date | DATE |
| Level_1_Rootcause | STRING |
| Team_Member | ARRAY\<STRING\> |
| Coaching_Log_Creation | STRING |
| Calculation | INT64 |
| Status_Last_Modified | TIMESTAMP |
| Source_Type | STRING |
| Jira_Issue_Key | STRING |
| Status | STRING |
| Created | TIMESTAMP |
| Days_Till_Done | STRING |
| Action_Item_Creation | STRING |
| Feedback_Sentiment | STRING |
| Domain_Name_from_Domain | ARRAY\<STRING\> |
| NSAT_Related_Feedback_Creation | STRING |
| Manager__TL_from_Team_Member | ARRAY\<STRING\> |
| Action_Item__Initiatives_Text | STRING |
| Manager__TL_Email | ARRAY\<STRING\> |
| Related_Ticket | STRING |
| Email_from_Team_Member | ARRAY\<STRING\> |
| Exclude | BOOLEAN |
| Record_ID | STRING |
| Zendesk_Category | STRING |
| User_Notification_on_Status_Done | STRING |
| Category | STRING |
| LDS_Review | STRING |
| Domain | ARRAY\<STRING\> |
| Feedback_Type | STRING |
| Due_date_Computed | DATE |
| Record_Shared_View_Link | STRING |
| Notes | STRING |
| Coaching_Log_LINK | STRING |
| Shared_View | STRING |
| CF_Form_Submission | ARRAY\<STRING\> |
| Content | STRING |
| TL_First_Name | STRING |
| Screenshot_from_CF_Form_Submission | ARRAY\<STRING\> |
| CF_Record_ID | ARRAY\<STRING\> |
| Source | STRING |
| feedback_created_at | TIMESTAMP |
| feedback_id | STRING |
| ticket_id | STRING |
| submitter_role | STRING |
| assignee_role | STRING |
| assignee_name | STRING |
| assignee_tl | STRING |
| ticket_domain | STRING |
| ticket_created_at | TIMESTAMP |

</details>

### 2.1.6. incoming_predictions (ticket volume forecasts)

**BigQuery table:** `guesty-data.zendesk_analytics.incoming_predictions`

**Table**: `incoming_predictions` — time-series forecasts of incoming ticket volume per product domain. Use for capacity planning and trend analysis.

| Column | Type | Notes |
|--------|------|-------|
| `partition_date` | DATE | When the prediction was generated |
| `time_series_date` | DATE | The date being predicted |
| `domain` | STRING | Product domain (matches tickets_clean.domain) |
| `incoming` | FLOAT | Predicted incoming ticket count |
| `time_series_type` | STRING | e.g. forecast vs actual |
| `type` | STRING | Prediction type |
| `upper_bound` | FLOAT | Upper confidence bound |
| `lower_bound` | FLOAT | Lower confidence bound |

### 2.1.7. domain_friction_spikes (anomaly detection)

**BigQuery table:** `guesty-data.zendesk_analytics.domain_friction_spikes`

**Table**: `domain_friction_spikes` — detected friction ticket spikes per domain/brand with AI-generated explanations. Use for operational alerting and root cause investigation.

| Column | Type | Notes |
|--------|------|-------|
| `spike_date` | DATE | Date of the spike |
| `alert` | BOOLEAN | Whether an alert was triggered |
| `brand` | STRING | Brand (matches tickets_clean.brand) |
| `domain` | STRING | Product domain (matches tickets_clean.domain) |
| `last_avg_tcks` | INT64 | Previous average ticket count (baseline) |
| `spike_tickets` | INT64 | Number of tickets in the spike |
| `pct_chnge` | FLOAT | Percentage change from baseline |
| `ai_explanation` | STRING | AI-generated explanation of why the spike occurred |

**Summary — joining internal tables to tickets_clean:**

| Table | Join key(s) to tickets_clean |
|-------|------------------------------|
| **incoming_outgoing** | **ticket_id** (and **ticket_url** optionally) |
| **productivity_hourly** | **agent_email** = tickets_clean.**assignee_email**; **agent_name** = tickets_clean.**assignee_name** (agent-level, no ticket key) |
| **qa_data** | **ticket_id** (INT64 → cast to match tickets_clean STRING) |
| **feedback_dash** | **ticket_id** (STRING) |
| **incoming_predictions** | **domain** = tickets_clean.**domain** (aggregate-level, no ticket key) |
| **domain_friction_spikes** | **domain** = tickets_clean.**domain**, **brand** = tickets_clean.**brand** (aggregate-level, no ticket key) |

---

## 3. Query Constraints & Filters

- **Date ranges**: Only fetch tickets **created or updated in the last 30 days** (or configurable window) to prevent timeouts and junk data. Use `created_at` or `updated_at` in query/filter.
- **Status filters**: e.g. "Only pull **Closed** tickets" or "Exclude deleted"; filter by **ticket_status** (values per Zendesk; use field from section 2.1 schema).
- **Limits**: Use API pagination; **max 10–50 tickets per account per run** (or agreed limit) to avoid rate limits and timeouts.
- **Organization scope**: When relevant, filter by `organization_id` or `external_id` to scope to one account.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://{subdomain}.zendesk.com/api/v2/` |
| **List tickets** | `GET /tickets.json` — use query params for filtering (e.g. `query=created_at>...`). |
| **Single ticket** | `GET /tickets/{id}.json` |
| **Search** | `GET /search.json?query=type:ticket ...` |
| **Response** | JSON with `tickets` array; nested `users`, `organizations` in includes. |

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Zendesk
Node Type: Zendesk node OR BigQuery node.
Credential Type: Zendesk OAuth2 API (sandbox), Zendesk API (prod), or Google Service Account API (BQ).
Credentials: Provided per-department in conversation context.
BQ tables (use these exact full names):
  - guesty-data.zendesk_analytics.tickets_clean (main — sentiment, CSAT, account linkage)
  - guesty-data.zendesk_analytics.incoming_outgoing (event-level messages)
  - guesty-data.zendesk_analytics.productivity_hourly (agent metrics)
  - guesty-data.zendesk_analytics.qa_data (QA audit scores — 4 dimensions)
  - guesty-data.zendesk_analytics.feedback_dash (NSAT, coaching, root cause)
  - guesty-data.zendesk_analytics.incoming_predictions (ticket volume forecasts)
  - guesty-data.zendesk_analytics.domain_friction_spikes (friction anomaly detection)
Linkage: tickets_clean.account_id = dim_accounts.account_id, Zuora invoices.mongo_account_id. tickets_clean.sf_account_id = dim_accounts.sf_account_id, Modjo account_crm_id. Jira: account_id IN UNNEST(jira_hierarchy.account_ids) or jira_ids. Internal: qa_data/feedback_dash on ticket_id; productivity_hourly on assignee_email = agent_email; incoming_predictions/domain_friction_spikes on domain.
Sentiment fields: tickets_clean (sentiment, negative_sentiment, satisfaction_rating, csat_*), qa_data (overall_score, 4 dimension scores), feedback_dash (Feedback_Sentiment, Level_1/2_Rootcause), domain_friction_spikes (ai_explanation).
Query: Only fetch tickets created in the last 30 days; apply status filter; limit per run.
```

---

## 5. n8n Zendesk node reference

*Use this when building workflows with the native Zendesk node.*

Use the Zendesk node to automate work in Zendesk and integrate Zendesk with other applications. n8n has built-in support for a wide range of Zendesk features, including creating and deleting tickets, users, and organizations.

On this page you'll find a list of operations the Zendesk node supports and links to more resources.

> **Credentials**
> Refer to [Zendesk credentials](https://docs.n8n.io/integrations/builtin/credentials/zendesk/) for guidance on setting up authentication. Specific credential names and IDs are provided per-department in the conversation context.

See n8n docs for AI tools, templates, and operation-not-supported behavior.

### Operations

- **Ticket**
  - Create a ticket
  - Delete a ticket
  - Get a ticket
  - Get all tickets
  - Recover a suspended ticket
  - Update a ticket
- **Ticket Field**
  - Get a ticket field
  - Get all system and custom ticket fields
- **User**
  - Create a user
  - Delete a user
  - Get a user
  - Get all users
  - Get a user's organizations
  - Get data related to the user
  - Search users
  - Update a user
- **Organization**
  - Create an organization
  - Delete an organization
  - Count organizations
  - Get an organization
  - Get all organizations
  - Get data related to the organization
  - Update an organization

> **Warning — Tag replacement behavior**
> When using the Zendesk node's **Update Ticket** operation and specifying the `Tag Names or IDs` field, the **entire list of tags on the ticket will be replaced**. Any tags not included in the update will be removed from the ticket (Zendesk API default).
>
> **To avoid accidental tag removal:**
> - First retrieve the ticket's tags and merge them with your new tags before updating.
> - Alternatively, use the HTTP Request node with Zendesk's `additional_tags` property to add tags without removing existing ones.
> - Or call the ticket's `/tags` endpoint to add tags without replacing existing ones ([Zendesk tags endpoint](https://developer.zendesk.com/api-reference/ticketing/ticket-management/tags/)).
>
> See: [Adding tags to tickets without overwriting existing tags](https://developer.zendesk.com/documentation/ticketing/managing-tickets/adding-tags-to-tickets-without-overwriting-existing-tags/).

---

## 6. BigQuery: Common Query Patterns & Best Practices

### Key columns quick reference — tickets_clean

| Column | Type | Notes |
|--------|------|-------|
| `ticket_id` | STRING | Primary key |
| `account_id` | STRING | Guesty account ID — join key |
| `sf_account_id` | STRING | Salesforce Account ID — join key |
| `created_at` | TIMESTAMP | Use for date filtering |
| `ticket_status` | STRING | open / pending / solved / closed |
| `subject` | STRING | Ticket subject |
| `assignee_email` | STRING | Assigned agent |
| `sentiment` | STRING | Positive / Negative / Neutral |
| `negative_sentiment` | INTEGER | Risk score (higher = more negative) |
| `satisfaction_rating` | STRING | CSAT score |
| `jira_ids` | STRING | Comma-separated Jira keys linked to this ticket |
| `csm` | STRING | Customer Success Manager |
| `domain` | STRING | Product domain |
| `friction_related` | BOOLEAN | Whether ticket is friction-related |

### Common SQL patterns

```sql
-- Ticket volume + sentiment last 30 days
SELECT
  COUNT(*)                                AS total_tickets,
  COUNT(DISTINCT account_id)              AS unique_accounts,
  COUNTIF(sentiment = 'Negative')         AS negative_count,
  AVG(negative_sentiment)                 AS avg_neg_score
FROM `guesty-data.zendesk_analytics.tickets_clean`
WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY);

-- Top accounts by ticket count (with Modjo calls)
SELECT
  t.account_id,
  t.account_name,
  COUNT(DISTINCT t.ticket_id)   AS ticket_count,
  COUNT(DISTINCT m.callId)      AS call_count
FROM `guesty-data.zendesk_analytics.tickets_clean` t
LEFT JOIN `guesty-data.csm.modjo_transcripts_structured` m
  ON t.sf_account_id = m.account_crm_id
WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY t.account_id, t.account_name
ORDER BY ticket_count DESC
LIMIT 10;

-- Tickets linked to a Jira issue (exact match via SPLIT — avoids false positives like PROJ-1 matching PROJ-12)
-- Note: EXISTS in WHERE clause works fine. For JOINing to Jira, use the CTE+UNNEST pattern (see Jira spec)
-- because n8n's BigQuery node does NOT support EXISTS inside JOIN ON predicates.
SELECT t.ticket_id, t.subject, t.ticket_status, t.account_name
FROM `guesty-data.zendesk_analytics.tickets_clean` t
WHERE EXISTS (
  SELECT 1 FROM UNNEST(SPLIT(t.jira_ids, ',')) AS jid
  WHERE TRIM(jid) = 'PROJ-1234'
);

-- Agent productivity last month
SELECT
  p.agent_name,
  SUM(p.tickets)     AS total_tickets,
  SUM(p.avail_hrs)   AS total_avail_hrs
FROM `guesty-data.zendesk_analytics.productivity_hourly` p
WHERE p.month >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)
GROUP BY p.agent_name
ORDER BY total_tickets DESC;

-- QA scores by agent (last 30 days)
SELECT
  q.responsible_agent_name,
  COUNT(*)                    AS audits,
  AVG(q.overall_score)        AS avg_overall,
  AVG(q.empathy_score)        AS avg_empathy,
  AVG(q.communicated_professionally_score) AS avg_professionalism,
  AVG(q.grammar_and_spelling_score)        AS avg_grammar
FROM `guesty-data.zendesk_analytics.qa_data` q
WHERE q.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY q.responsible_agent_name
ORDER BY avg_overall DESC;

-- QA scores joined with ticket details
SELECT
  t.ticket_id,
  t.subject,
  t.account_name,
  t.sentiment,
  q.overall_score,
  q.empathy_score,
  q.communicated_professionally_score
FROM `guesty-data.zendesk_analytics.tickets_clean` t
JOIN `guesty-data.zendesk_analytics.qa_data` q
  ON CAST(t.ticket_id AS INT64) = q.ticket_id
WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND q.overall_score < 3.0
ORDER BY q.overall_score ASC;

-- NSAT feedback with root causes (last 30 days)
SELECT
  f.Feedback_Sentiment,
  f.Level_1_Rootcause,
  f.Level_2_Rootcause,
  COUNT(*) AS cnt
FROM `guesty-data.zendesk_analytics.feedback_dash` f
WHERE f.feedback_created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND f.Feedback_Sentiment IS NOT NULL
GROUP BY f.Feedback_Sentiment, f.Level_1_Rootcause, f.Level_2_Rootcause
ORDER BY cnt DESC;

-- Active friction spikes (alerts only)
SELECT
  s.spike_date,
  s.brand,
  s.domain,
  s.spike_tickets,
  s.last_avg_tcks,
  ROUND(s.pct_chnge * 100, 1) AS pct_change,
  s.ai_explanation
FROM `guesty-data.zendesk_analytics.domain_friction_spikes` s
WHERE s.alert = TRUE
ORDER BY s.spike_date DESC
LIMIT 20;

-- Ticket volume forecast vs actual by domain
SELECT
  p.time_series_date,
  p.domain,
  p.incoming          AS predicted,
  p.upper_bound,
  p.lower_bound,
  p.time_series_type
FROM `guesty-data.zendesk_analytics.incoming_predictions` p
WHERE p.partition_date = (SELECT MAX(partition_date) FROM `guesty-data.zendesk_analytics.incoming_predictions`)
  AND p.time_series_date >= CURRENT_DATE()
ORDER BY p.domain, p.time_series_date;
```

### Filters & limits
- Default date filter: `created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)`
- Status filter: `WHERE ticket_status = 'closed'` or `IN ('open','pending')`
- Max ~50 tickets per account per run in n8n workflows
- Join productivity_hourly to tickets_clean via `assignee_email = agent_email`
- qa_data.ticket_id is INT64; tickets_clean.ticket_id is STRING — cast when joining
- feedback_dash has ARRAY columns (from Airtable) — use `UNNEST()` to flatten when needed
- domain_friction_spikes: filter `alert = TRUE` for confirmed spikes only
