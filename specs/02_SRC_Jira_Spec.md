# Jira — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Jira API | `jiraSoftwareCloudApi` | JIRA node |
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | Jira path: Jira SW Cloud API. BigQuery path: Google Service Account API. |
| **Node Type** | **JIRA node** or **BigQuery node**. |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: Identifiers in schema: **subtask**, **story**, **phase**, **initiative**, **epic** (and *_url, *_summary, *_status). **account_ids** (REPEATED) and issue keys (subtask, story, bug) enable cross-source joins (see section 2.2).
- **Field names**: Use field names from section 2.1 schema (e.g. story_summary, subtask_status, phase_status, initiative_status, epic_status, assignee_email, PM, RND_TL).
- **Data types**: String, Float, Integer, Date, Boolean per section 2.1 schema. REPEATED fields: outcome, program, pfrs_linked, account_ids, account_names.

---

## 2.1. BigQuery Table: jira_hierarchy

**BigQuery full table name (use exactly — do not invent project/dataset names):** `guesty-data.jira.jira_hierarchy`

**Tables summary**

| Table | Full BigQuery path | Primary / key identifiers |
|-------|--------------------|---------------------------|
| jira_hierarchy | `guesty-data.jira.jira_hierarchy` | subtask, story, phase, initiative, epic (and *_url, *_summary, *_status). REPEATED: outcome, program, pfrs_linked, **account_ids**, account_names. |

**Table**: `jira_hierarchy` — hierarchical view of Jira issues (subtask → story → phase → initiative → epic), with status, effort, rollout, and team fields.

**Schema (raw):** see code block below. Key identifiers: subtask, story, phase, initiative, epic (and *_url, *_summary, *_status). REPEATED fields: outcome, program, pfrs_linked, account_ids, account_names.

<details>
<summary>Expand: jira_hierarchy full schema (JSON)</summary>

```json
[
  {"name": "subtask", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "subtask_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "subtask_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "subtask_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "story_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "story_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_risk", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_updates_to_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "phase_FE_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "phase_BE_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "phase_teams_dependency", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_readiness_level", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_readiness_level", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_risk", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_updates_to_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "initiative_FE_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "initiative_BE_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "initiative_teams_dependency", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "epic_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "epic_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug_url", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "issue_type", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "objective", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "new_objective", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "key_result", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "story", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "story_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "initiative_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "epic", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "epic_summary", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "package", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "sub_objective", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "outcome", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []},
  {"name": "program", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []},
  {"name": "commitment_type", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "commitment_exact_date", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "commitment_q", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "enterprise_client_name", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "team", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rnd_group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "roadmap_team", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "roadmap_group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rnd_roadmap_group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "roadmap_PM", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug_team", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "bug_group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rollout_risk_level", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rollout_sheet_link", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rollout_plan", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "phase_or_initiative_rolloutplan", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "product_education", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "marketing_collateral", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "link_to_iaus_doc", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "story_inprogress_date", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "story_closed_date", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "min_created_date", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "trust_kr", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "full_trust_join", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "ga_estimation", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "all_labels", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "all_labels_clean", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "fp_labels_clean", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "all_non_story_labels", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "enterprise_clients", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "Priority", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "num_enterprises_per_initiative", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "PM", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "RND_TL", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rollout_team", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "rollout_group", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "pilot_to_ga_days", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "rollout_dates", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "release_months", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "days_in_status", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "ga_date", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "trust_kr_number", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "before_release_num_tickets", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "after_release_num_tickets", "mode": "NULLABLE", "type": "INTEGER", "description": "", "fields": []},
  {"name": "phase_total_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "phase_closed_total_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "initiative_total_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "initiative_closed_total_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "story_est", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "closed_story_est", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "story_time_spent", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "pfrs_linked", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []},
  {"name": "account_ids", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []},
  {"name": "account_names", "mode": "REPEATED", "type": "STRING", "description": "", "fields": []},
  {"name": "account_names_string", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "Outcomes", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "Programs", "mode": "NULLABLE", "type": "STRING", "description": "", "fields": []},
  {"name": "final_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "final_closed_EE", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "progress", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "story_closed_date_or_today", "mode": "NULLABLE", "type": "DATE", "description": "", "fields": []},
  {"name": "actual_net_effort", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []},
  {"name": "execution_ee", "mode": "NULLABLE", "type": "FLOAT", "description": "", "fields": []}
]
```

</details>

---

## 2.2. Cross-source joins (from other data sources to Jira)

Other data sources can join to **jira_hierarchy** as follows. Jira provides **account_ids** (REPEATED STRING) for account-level linkage and issue keys (**subtask**, **story**, **bug**) for ticket–issue linkage.

### Join by account

Use when linking Jira initiatives/epics/phases to records in another source by customer account. In BigQuery: `UNNEST(jira_hierarchy.account_ids) AS jira_account_id`, then join the other source's **account_id** (or equivalent) to `jira_account_id`.

| From (other spec) | To (Jira) | Condition | Notes |
|------------------|-----------|-----------|--------|
| **Zendesk** tickets_clean | jira_hierarchy | tickets_clean.**account_id** = *unnested* jira_hierarchy.**account_ids** | One Jira row can match many tickets. |
| **Salesforce** dim_accounts | jira_hierarchy | dim_accounts.**account_id** = *unnested* jira_hierarchy.**account_ids** | Same account_id as Zendesk, Zuora. |
| **Zuora** invoices / invoice_items | jira_hierarchy | invoices.**account_id** = *unnested* jira_hierarchy.**account_ids** | Direct account_id match. |
| **Modjo** modjo_transcripts_structured | jira_hierarchy | Via **dim_accounts**: modjo.**account_crm_id** = dim_accounts.sf_account_id, then dim_accounts.**account_id** = *unnested* jira_hierarchy.account_ids | Modjo has no account_id; use dim_accounts as bridge. |
| **HubSpot** (Companies/Contacts) | jira_hierarchy | If **account_id** or **sf_account_id** (or equivalent) is in HubSpot: that value = *unnested* jira_hierarchy.account_ids | Per HubSpot custom properties; no BQ in spec. |
| **Gus** | jira_hierarchy | If **account_id** is exposed: account_id = *unnested* jira_hierarchy.account_ids | Per intake/project docs; no BQ in spec. |

### Join by linked Jira issue (Zendesk only)

| From (other spec) | To (Jira) | Condition | Notes |
|------------------|-----------|-----------|--------|
| **Zendesk** tickets_clean | jira_hierarchy | Parse tickets_clean.**jira_ids** (comma-separated issue keys) and match to jira_hierarchy.**subtask** OR **story** OR **bug** | Use for ticket-to-issue linkage. See safe join pattern below. |

> **jira_ids join precision caveat:** The `jira_ids` field is a comma-separated string (e.g. `"ENG-123,ENG-456"`). A naive `LIKE CONCAT('%', key, '%')` can produce false positives (`ENG-1` matches `ENG-12`). Use this CTE+UNNEST pattern (EXISTS in JOIN ON is not supported by n8n's BigQuery node):
> ```sql
> -- Step 1: Pre-explode jira_ids into individual rows via CTE
> WITH zendesk_jira_links AS (
>   SELECT t.*, TRIM(jid) AS linked_jira_key
>   FROM `guesty-data.zendesk_analytics.tickets_clean` t,
>   UNNEST(SPLIT(t.jira_ids, ',')) AS jid
>   WHERE t.jira_ids IS NOT NULL AND t.jira_ids != ''
> )
> -- Step 2: Simple equality JOIN
> SELECT ...
> FROM `guesty-data.jira.jira_hierarchy` j
> JOIN zendesk_jira_links t ON t.linked_jira_key = j.story
> WHERE ...
> ```
> **Important:** Do NOT use EXISTS inside a JOIN ON clause — n8n's BigQuery node returns "EXISTS subquery is not supported inside join predicate." Always use the CTE approach above instead.
>
> **In n8n Code nodes (JavaScript)**, use the same principle — split before matching:
> ```js
> // Safe: exact match after splitting
> const keys = (ticket.jira_ids || '').split(',').map(k => k.trim());
> const linked = keys.includes(issueKey);
>
> // Unsafe: substring match (ENG-1 matches ENG-12)
> // const linked = ticket.jira_ids.indexOf(issueKey) !== -1;
> ```

### Other sources (no standard account key to Jira)

| Source | Join to Jira |
|--------|--------------|
| **HiBob** | By **person**: HiBob work email = jira_hierarchy.**PM** or **RND_TL** when those fields store email. No account-level join. |
| **Siit** | No standard account key in this spec; link per intake (e.g. property/account id if available). |

- **Data types**: jira_hierarchy.**account_ids** is REPEATED; always UNNEST before joining. Issue keys (subtask, story, bug) are single STRING (e.g. PROJ-123).

---

## 3. Query Constraints & Filters

- **Date ranges**: Use JQL `created >= -30d` or `updated >= -7d` to limit scope and avoid timeouts.
- **Status filters**: e.g. "Only issues in Done" or "Exclude Cancelled"; use JQL `status = Done` or `status in (Open, In Progress)`.
- **Project / filter**: Scope by project key or filter id (e.g. `project = PROJ`).
- **Limits**: Use maxResults (e.g. 50–100 per request); paginate with startAt. Set max issues per run.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://{domain}.atlassian.net/rest/api/3/` |
| **Search** | `GET /search` — body with JQL, fields, startAt, maxResults. |
| **Issue** | `GET /issue/{issueIdOrKey}`. |
| **Response** | JSON with `issues` array; fields in `fields` object by key. |

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Jira
Node Type: JIRA node OR BigQuery node (per 01_INFRA_Credentials_Guide.md).
Credential: **Jira SW Cloud - AI Team** (Jira SW Cloud API) or **Google Service Account n8n-ai-cx** (BigQuery node, Google Service Account API).
Auth Type: Per credential (Jira SW Cloud API or Google Service Account API).
BQ table (use this exact full name): guesty-data.jira.jira_hierarchy. Schema in section 2.1. Hierarchical view (subtask → story → phase → initiative → epic).
Cross-source joins: Other sources join to Jira by account (account_id = UNNEST(jira_hierarchy.account_ids)) or by linked issue (Zendesk jira_ids ↔ subtask/story/bug). See section 2.2 for Zendesk, Salesforce, Zuora, Modjo, HubSpot, Gus, HiBob, Siit.
Query: Use JQL with date and status filters; set maxResults and paginate; limit per run.
```

---

## 5. n8n Jira Software node reference

*Use this when building workflows with the native Jira Software node.*

Use the Jira Software node to automate work in Jira and integrate Jira with other applications. n8n has built-in support for a wide range of Jira features, including creating, updating, deleting, and getting issues and users.

On this page you'll find a list of operations the Jira Software node supports and links to more resources.

> **Credentials**  
> Refer to [Jira credentials](https://docs.n8n.io/integrations/builtin/credentials/jira/) for guidance on setting up authentication. In this project use section 1 and `01_INFRA_Credentials_Guide.md` (or intake packet) for the credential name.

See n8n docs for AI tools, templates, and operation-not-supported behavior.

### Operations

- **Issue**
  - Get issue changelog
  - Create a new issue
  - Delete an issue
  - Get an issue
  - Get all issues
  - Create an email notification for an issue and add it to the mail queue
  - Return either all transitions or a transition that can be performed by the user on an issue, based on the issue's status
  - Update an issue
- **Issue Attachment**
  - Add attachment to issue
  - Get an attachment
  - Get all attachments
  - Remove an attachment
- **Issue Comment**
  - Add comment to issue
  - Get a comment
  - Get all comments
  - Remove a comment
  - Update a comment
- **User**
  - Create a new user
  - Delete a user
  - Retrieve a user

### Related resources

Refer to the [official JQL documentation](https://www.atlassian.com/software/jira/guides/expand-jira/jql) about Jira Query Language (JQL) to learn more about it.

### Fetch issues for a specific project

The **Get All** operation returns all the issues from Jira. To fetch issues for a particular project, use Jira Query Language (JQL).

Example — all issues of a project named `n8n`:

1. Select **Get All** from the **Operation** dropdown list.
2. Toggle **Return All** to true.
3. Select **Add Option** and select **JQL**.
4. Enter `project=n8n` in the **JQL** field.

This query fetches all issues in the project named `n8n`. Replace `n8n` with your project name to fetch all issues for your project.

---

## BigQuery: Key Columns & Common Query Patterns

### jira_hierarchy — key columns

| Column | Type | Notes |
|--------|------|-------|
| `subtask` | STRING | Issue key (e.g. PROJ-1234) |
| `subtask_summary` | STRING | Subtask title |
| `subtask_status` | STRING | Status |
| `story` | STRING | Parent story key |
| `story_summary` | STRING | Story title |
| `story_status` | STRING | Story status |
| `story_est` | FLOAT | Effort estimate |
| `initiative` | STRING | Initiative key |
| `epic` | STRING | Epic key |
| `team` | STRING | Engineering team |
| `PM` | STRING | Product Manager |
| `RND_TL` | STRING | R&D Tech Lead |
| `ga_date` | DATE | General availability date |
| **`account_ids`** | **REPEATED STRING** | **Guesty account IDs — requires UNNEST** |
| `account_names` | REPEATED STRING | Account names (parallel to account_ids) |

### ⚠️ REPEATED columns require UNNEST
`account_ids`, `account_names`, `pfrs_linked`, `outcome`, `program` are REPEATED — always use `UNNEST()` or `CROSS JOIN UNNEST()`.

### Common SQL patterns

```sql
-- Open stories with linked accounts
SELECT
  j.story,
  j.story_summary,
  j.story_status,
  j.initiative,
  j.team,
  aid AS account_id
FROM `guesty-data.jira.jira_hierarchy` j
CROSS JOIN UNNEST(j.account_ids) AS aid
WHERE j.story_status NOT IN ('Done', 'Closed')
  AND ARRAY_LENGTH(j.account_ids) > 0
LIMIT 50;

-- Join jira_hierarchy to dim_accounts
SELECT a.account_name, j.story, j.story_status, j.initiative
FROM `guesty-data.guesty_analytics.dim_accounts` a
JOIN `guesty-data.jira.jira_hierarchy` j
  ON a.account_id IN UNNEST(j.account_ids)
WHERE a.account_active = TRUE
LIMIT 100;

-- Tickets linked to a Jira issue (via jira_ids string)
SELECT t.ticket_id, t.subject, j.story, j.initiative
FROM `guesty-data.zendesk_analytics.tickets_clean` t
JOIN `guesty-data.jira.jira_hierarchy` j
  ON t.jira_ids LIKE CONCAT('%', j.subtask, '%')
  OR t.jira_ids LIKE CONCAT('%', j.story, '%')
WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
LIMIT 100;

-- Roadmap: initiatives with upcoming GA dates
SELECT DISTINCT
  initiative,
  initiative_status,
  ga_date,
  team
FROM `guesty-data.jira.jira_hierarchy`
WHERE ga_date IS NOT NULL
  AND ga_date >= CURRENT_DATE()
ORDER BY ga_date;
```

### Filters & limits
- `ARRAY_LENGTH(account_ids) > 0` — only issues linked to accounts
- `story_status NOT IN ('Done', 'Closed')` — active work only
- Use `LIMIT` + `OFFSET` for pagination — table can be large
- Boolean columns may be NULL in BigQuery — use `IFNULL(col, FALSE) = FALSE` instead of `col = FALSE`
