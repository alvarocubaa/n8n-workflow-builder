# CSM (Customer Success) — BigQuery Reference

## Dataset
`guesty-data.csm`

The CSM dataset contains 100+ tables. This doc covers the **8 primary tables** used by the AI workflow builder, plus key undocumented tables discovered during verification.

---

## Primary Tables

| Table | Full path | Rows | Description |
|-------|-----------|------|-------------|
| modjo_transcripts_structured_master | `guesty-data.csm.modjo_transcripts_structured_master` | 45,612 | Call transcripts with AI-extracted risk signals (Aug 2025 – present) |
| health_score | `guesty-data.csm.health_score` | 2.3M | Account health scoring (5 dimensions), daily snapshots. Latest: 2026-03-30 |
| portfolio | `guesty-data.csm.portfolio` | 134K | CSM portfolio — account assignments, risk levels, MRR |
| csm_churn_report | `guesty-data.csm.csm_churn_report` | 2,960 | Churn analysis with reasons, ETF, revenue impact |
| delighted_data | `guesty-data.csm.delighted_data` | 5,248 | NPS survey data (Delighted). **Stale: last entry Oct 2024** |
| listing_performance | `guesty-data.csm.listing_performance` | 532M | Listing-level metrics + guest review sentiment. **Very large — always use tight filters** |
| mrr_calculator | `guesty-data.csm.mrr_calculator` | 51K | MRR analytics: plan value, reservation metrics, Stripe revenue |
| segmentation_report | `guesty-data.csm.segmentation_report` | 114K | Account segmentation history with health score trends |

### Other notable tables

| Table | Rows | Description |
|-------|------|-------------|
| modjo_transcript | 60K | Raw Modjo transcripts (less structured, no AI signals) |
| cs_product_adoption | 6M | Detailed product feature adoption per account |
| account_6m_master_summary | 318K | 6-month account summary (calls, emails, interactions) |
| customer_engagement | 1.1M | Customer engagement events |
| account_snapshot_mrr | 2.2M | Historical MRR snapshots per account |
| reservations_clean | 55M | Clean reservation data |

---

## Critical: Modjo table naming

> **`modjo_transcripts_structured`** has only **17 test rows** (all same callId).
> Use **`modjo_transcripts_structured_master`** (45,612 rows) for all production queries.

The master table has additional columns not in the test table:

| Column | In test table? | In master table? |
|--------|---------------|-----------------|
| `sentiment` | No | Yes |
| `sentiment_examples` | No | Yes |
| `risk_commercial_explanation` | No | Yes |
| `risk_technical_explanation` | No | Yes |
| `risk_churn` | Documented in spec but not in schema | **Not present** |
| `opportunity_growth` | Documented in spec but not in schema | **Not present** |
| `open_action_items` | Documented in spec but not in schema | **Not present** |
| `resolved_issues` | Documented in spec but not in schema | **Not present** |

### modjo_transcripts_structured_master schema (verified)

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | INT64 | Modjo internal — do NOT use for cross-source joins |
| `account_crm_id` | STRING | **= sf_account_id from dim_accounts** — use for all joins |
| `callId` | INT64 | Primary key |
| `startDate` | DATE | Call date |
| `call_timestamp` | TIMESTAMP | Call start timestamp |
| `duration` | FLOAT64 | Duration in seconds — filter `> 120` to exclude short calls |
| `transcript` | STRING | Full call transcript |
| `sentiment` | STRING | Overall call sentiment |
| `sentiment_examples` | STRING | Examples supporting sentiment classification |
| `summary_interaction` | STRING | AI-generated call summary |
| `risk_commercial` | STRING | Commercial risk signal |
| `risk_commercial_explanation` | STRING | Explanation of commercial risk |
| `risk_technical` | STRING | Technical risk signal |
| `risk_technical_explanation` | STRING | Explanation of technical risk |

---

## Portfolio risk level values (verified)

The `csm_overall_risk_level` column uses these exact values:

| Value | Count (active accounts) |
|-------|------------------------|
| `NULL` | 15,036 |
| `'Healthy'` | 3,711 |
| `'Low Risk'` | 565 |
| `'Medium Risk'` | 539 |
| `'High Risk'` | 447 |

> **NOT** `'High'`, `'Critical'`, or `'Medium'` — always use the full `'High Risk'` etc. values.

---

## Joins to other sources

| From (CSM) | To | Join condition |
|------------|-----|----------------|
| modjo_transcripts_structured_master | dim_accounts | `modjo.account_crm_id = dim_accounts.sf_account_id` |
| modjo_transcripts_structured_master | tickets_clean | `modjo.account_crm_id = tickets_clean.sf_account_id` |
| health_score / portfolio / segmentation_report | dim_accounts | `account_id = dim_accounts.account_id` |
| health_score / portfolio | tickets_clean | `account_id = tickets_clean.account_id` |
| health_score / portfolio | invoices | `account_id = invoices.mongo_account_id` |
| delighted_data | sf_account | `sfdc_account_id = sf_account.Id` |
| listing_performance | dim_accounts | `account_id = dim_accounts.account_id` |
| listing_performance | dim_listings | `listing_id = dim_listings.listing_id` |

---

## Verified SQL patterns

All queries below have been verified against live BigQuery data (Apr 1, 2026).

### Calls per account (last 30 days)
```sql
-- Verified: returns data when calls exist in window. Modjo data: Aug 2025 – Mar 2026.
SELECT
  m.account_crm_id,
  a.account_name,
  COUNT(m.callId)       AS call_count,
  ROUND(AVG(m.duration/60.0), 1) AS avg_duration_min
FROM `guesty-data.csm.modjo_transcripts_structured_master` m
JOIN `guesty-data.guesty_analytics.dim_accounts` a
  ON m.account_crm_id = a.sf_account_id
WHERE m.startDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  AND m.duration > 120
GROUP BY m.account_crm_id, a.account_name
ORDER BY call_count DESC
LIMIT 20;
```

### Health score trends (current vs previous)
```sql
-- Verified: 2.3M rows, latest snapshot 2026-03-30. previous_score often NULL for new accounts.
SELECT
  h.account_id,
  h.account_name,
  h.total_score,
  h.previous_score,
  ROUND(h.total_score - h.previous_score, 2) AS score_change,
  h.ticket_score,
  h.profit_score,
  h.eng_score
FROM `guesty-data.csm.health_score` h
WHERE h.partition_date = (SELECT MAX(partition_date) FROM `guesty-data.csm.health_score`)
  AND IFNULL(h.account_active, FALSE) = TRUE
ORDER BY score_change ASC
LIMIT 20;
```

### Portfolio at-risk accounts
```sql
-- Verified: 447 High Risk active accounts. Use exact values: 'High Risk', 'Medium Risk', 'Low Risk', 'Healthy'.
SELECT
  p.account_name,
  p.csm,
  p.csm_overall_risk_level,
  p.health_score,
  p.actual_mrr,
  p.active_listings,
  p.next_renewal_date
FROM `guesty-data.csm.portfolio` p
WHERE IFNULL(p.account_active, FALSE) = TRUE
  AND p.csm_overall_risk_level IN ('High Risk', 'Medium Risk')
ORDER BY p.actual_mrr DESC;
```

### NPS score distribution
```sql
-- Verified: 5,248 total responses. WARNING: data stale (latest Oct 2024). Remove date filter if needed.
SELECT
  CASE
    WHEN d.score >= 9 THEN 'Promoter'
    WHEN d.score >= 7 THEN 'Passive'
    ELSE 'Detractor'
  END AS nps_category,
  COUNT(*) AS cnt,
  ROUND(AVG(d.score), 1) AS avg_score
FROM `guesty-data.csm.delighted_data` d
-- WHERE d.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)  -- uncomment when data is fresh
GROUP BY nps_category;
-- Verified results: Detractor 2,606 (avg 2.1), Promoter 2,075 (avg 9.8), Passive 567 (avg 7.6)
```

### Churn analysis by reason
```sql
-- Verified: 2,960 rows. Use 180-day window for meaningful results.
SELECT
  c.churn_reason_modified,
  COUNT(*) AS churn_count,
  ROUND(AVG(c.avg_mrr), 0) AS avg_mrr_at_churn,
  ROUND(AVG(c.months_in_guesty), 0) AS avg_tenure
FROM `guesty-data.csm.csm_churn_report` c
WHERE c.from_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY)
GROUP BY c.churn_reason_modified
ORDER BY churn_count DESC;
-- Verified top: Unknown Reason (83), Inactive/Silent User (82), Non-Responsive (54), Pricing (41), Product Fit (37)
```

### Account 360: health + tickets + risk
```sql
-- Verified: joins health_score + portfolio + tickets_clean.
SELECT
  h.account_id,
  h.account_name,
  h.total_score AS health_score,
  p.csm_overall_risk_level,
  COUNT(DISTINCT t.ticket_id) AS recent_tickets
FROM `guesty-data.csm.health_score` h
LEFT JOIN `guesty-data.csm.portfolio` p
  ON h.account_id = p.account_id
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON h.account_id = t.account_id
  AND t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
WHERE h.partition_date = (SELECT MAX(partition_date) FROM `guesty-data.csm.health_score`)
  AND IFNULL(h.account_active, FALSE) = TRUE
GROUP BY h.account_id, h.account_name, h.total_score, p.csm_overall_risk_level
ORDER BY h.total_score ASC
LIMIT 20;
```

---

## Filters & limits

- **Modjo**: Filter `duration > 120` to exclude short/test calls. Use `account_crm_id` (NOT `account_id`) for joins.
- **Health score**: Use latest `partition_date` for current state: `WHERE partition_date = (SELECT MAX(...))`.
- **Portfolio risk levels**: Use exact values: `'High Risk'`, `'Medium Risk'`, `'Low Risk'`, `'Healthy'`.
- **NPS**: 0-6 = Detractor, 7-8 = Passive, 9-10 = Promoter. Data stale since Oct 2024.
- **listing_performance**: 532M rows — always add tight `account_id` or date filters.
- **Boolean columns**: May be NULL — use `IFNULL(col, FALSE) = TRUE` not `col = TRUE`.
- **Max rows**: Use `LIMIT 50-100` for transcript/summary/comment fields.
