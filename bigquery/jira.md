# Jira — BigQuery Reference

## Tables
| Table | Full path | Description |
|-------|-----------|-------------|
| jira_hierarchy | `guesty-data.jira.jira_hierarchy` | Main table: full issue hierarchy (subtask → story → phase → initiative → epic) |
| jira_issues_base | `guesty-data.jira.jira_issues_base` | Raw Jira issue data |
| jira_epic | `guesty-data.jira.jira_epic` | Epic-level data |
| jira_hierarchy_monthly_snapshot | `guesty-data.jira.jira_hierarchy_monthly_snapshot` | Historical monthly snapshots |
| team_capacity | `guesty-data.jira.team_capacity` | Team capacity planning |
| team_capacity_2025 | `guesty-data.jira.team_capacity_2025` | 2025 capacity data |
| team_capacity_2026 | `guesty-data.jira.team_capacity_2026` | 2026 capacity data |
| rnd_product_team_mapping | `guesty-data.jira.rnd_product_team_mapping` | R&D/Product team mapping |
| roadmap_planning | `guesty-data.jira.roadmap_planning` | Roadmap planning data |
| zd_jira_tickets_trust | `guesty-data.jira.zd_jira_tickets_trust` | Zendesk–Jira trust tickets |
| tickets_connected_to_pfrs | `guesty-data.jira.tickets_connected_to_pfrs` | Tickets linked to PFRs |

---

## jira_hierarchy

Main table. Each row represents a subtask (or story-level entry) with its full hierarchy context. The `account_ids` column is REPEATED — one row can be linked to multiple accounts.

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `subtask` | STRING | Issue key (e.g. PROJ-1234) |
| `subtask_summary` | STRING | Subtask title |
| `subtask_status` | STRING | Status |
| `story` | STRING | Parent story key |
| `story_summary` | STRING | Story title |
| `story_status` | STRING | Story status |
| `story_est` | FLOAT | Story effort estimate |
| `story_inprogress_date` | DATE | When story moved to In Progress |
| `story_closed_date` | DATE | When story was closed |
| `phase` | STRING | Phase key |
| `phase_status` | STRING | Phase status |
| `phase_EE` | FLOAT | Phase engineering effort |
| `phase_FE_EE` | FLOAT | Frontend effort |
| `phase_BE_EE` | FLOAT | Backend effort |
| `initiative` | STRING | Initiative key |
| `initiative_status` | STRING | Initiative status |
| `initiative_EE` | FLOAT | Initiative total effort |
| `epic` | STRING | Epic key |
| `epic_status` | STRING | Epic status |
| `bug` | STRING | Bug issue key |
| `ga_date` | DATE | General availability date |
| `team` | STRING | Engineering team |
| `group` | STRING | Product group |
| `rnd_group` | STRING | R&D group |
| `PM` | STRING | Product Manager |
| `RND_TL` | STRING | R&D Tech Lead |
| `days_in_status` | STRING | Days in current status |
| `rollout_risk_level` | STRING | Rollout risk |
| `rollout_plan` | STRING | Rollout plan |
| **`account_ids`** | **REPEATED STRING** | **Guesty account IDs linked to this issue** |
| `account_names` | REPEATED STRING | Account names (parallel to account_ids) |
| `pfrs_linked` | REPEATED STRING | Linked PFR issue keys |
| `outcome` | REPEATED STRING | Business outcomes |
| `program` | REPEATED STRING | Program tags |

### ⚠️ REPEATED columns require UNNEST

`account_ids`, `account_names`, `pfrs_linked`, `outcome`, `program` are all REPEATED — you must use `UNNEST()` or `CROSS JOIN UNNEST()` to filter or join on them.

---

## Join patterns

### Join jira_hierarchy to accounts (by account_id)

```sql
-- Pattern: CROSS JOIN UNNEST
SELECT
  j.subtask,
  j.story,
  j.story_status,
  j.initiative,
  aid AS account_id
FROM `guesty-data.jira.jira_hierarchy` j
CROSS JOIN UNNEST(j.account_ids) AS aid
WHERE aid = '<guesty_account_id>';

-- Pattern: WHERE IN with UNNEST (for multiple accounts)
SELECT j.*, aid
FROM `guesty-data.jira.jira_hierarchy` j,
     UNNEST(j.account_ids) AS aid
WHERE aid IN ('account_id_1', 'account_id_2');
```

### Join jira_hierarchy to dim_accounts

```sql
SELECT a.account_name, j.story, j.story_status, j.initiative
FROM `guesty-data.guesty_analytics.dim_accounts` a
JOIN `guesty-data.jira.jira_hierarchy` j
  ON a.account_id IN UNNEST(j.account_ids)
WHERE a.account_active = TRUE
LIMIT 100;
```

### Join jira_hierarchy to tickets_clean (by Jira issue key)

```sql
-- tickets_clean.jira_ids is a comma-separated string of Jira keys
SELECT t.ticket_id, t.subject, j.story, j.initiative
FROM `guesty-data.zendesk_analytics.tickets_clean` t
JOIN `guesty-data.jira.jira_hierarchy` j
  ON t.jira_ids LIKE CONCAT('%', j.subtask, '%')
  OR t.jira_ids LIKE CONCAT('%', j.story, '%')
  OR t.jira_ids LIKE CONCAT('%', j.bug, '%')
WHERE t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
LIMIT 100;
```

### HiBob integration (by person)
```sql
-- HiBob work email → Jira PM or RND_TL
WHERE j.PM = '<work_email>'
   OR j.RND_TL = '<work_email>'
```

---

## Common query patterns

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

-- Issues by team and status
SELECT
  team,
  story_status,
  COUNT(DISTINCT story) AS story_count,
  SUM(story_est)        AS total_effort
FROM `guesty-data.jira.jira_hierarchy`
GROUP BY team, story_status
ORDER BY team, story_count DESC;

-- Roadmap: initiatives with GA dates
SELECT DISTINCT
  initiative,
  initiative_status,
  ga_date,
  team,
  group
FROM `guesty-data.jira.jira_hierarchy`
WHERE ga_date IS NOT NULL
  AND ga_date >= CURRENT_DATE()
ORDER BY ga_date;
```

## Filters & limits
- `ARRAY_LENGTH(account_ids) > 0` — only issues with account links
- `story_status NOT IN ('Done', 'Closed')` — active work only
- Pagination: use `LIMIT` + `OFFSET`; table can be large
