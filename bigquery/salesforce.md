# Salesforce / Guesty Analytics — BigQuery Reference

## Tables
| Table | Full path | Description |
|-------|-----------|-------------|
| dim_accounts | `guesty-data.guesty_analytics.dim_accounts` | Enriched account master (Salesforce + Guesty data) |
| dim_listings | `guesty-data.guesty_analytics.dim_listings` | Property/listing master |
| fact_reservations | `guesty-data.guesty_analytics.fact_reservations` | Reservation transactions |

---

## dim_accounts

Primary analytics account table. Joins Guesty account data with Salesforce CRM enrichment.

### Primary keys
- `account_id` (STRING) — Guesty account ID (= `accounts._id`)
- `sf_account_id` (STRING, NULLABLE) — Salesforce 18-char Account ID

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | STRING | Guesty account ID |
| `account_name` | STRING | Account name |
| `sf_account_id` | STRING | Salesforce Account Id (18-char) |
| `account_active` | BOOLEAN | Active status |
| `csm` | STRING | Customer Success Manager |
| `onboarding_status` | STRING | Onboarding phase |
| `account_created_at` | DATE | Account creation date |
| `next_renewal_date` | DATE | Next contract renewal |
| `avg_mrr` | FLOAT | Average monthly recurring revenue |
| `lifetime_rev_from_account` | FLOAT | Total lifetime revenue |

### Joins to other sources

| Target | Join condition |
|--------|----------------|
| `datalake_glue.accounts` | `dim_accounts.account_id = accounts._id` |
| `zendesk_analytics.tickets_clean` | `dim_accounts.account_id = tickets_clean.account_id` OR `dim_accounts.sf_account_id = tickets_clean.sf_account_id` |
| `csm.modjo_transcripts_structured` | `dim_accounts.sf_account_id = modjo.account_crm_id` |
| `zuora_analytics.invoices` | `dim_accounts.account_id = invoices.mongo_account_id` ⚠️ |
| `zuora_analytics.product_catalog` | `dim_accounts.account_id = product_catalog.account_id` |
| `jira.jira_hierarchy` | `dim_accounts.account_id` IN `UNNEST(jira_hierarchy.account_ids)` |
| `dim_listings` | `dim_accounts.account_id = dim_listings.account_id` |
| `fact_reservations` | `dim_accounts.account_id = fact_reservations.account_id` |

---

## dim_listings

Property/listing data linked to accounts.

### Primary keys
- `listing_id` (STRING) — Listing identifier
- `account_id` (STRING) — Parent account

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `listing_id` | STRING | Listing identifier |
| `account_id` | STRING | Parent account |
| `listing_name` | STRING | Property name |
| `listing_active` | BOOLEAN | Active status |
| `listing_created_at` | DATE | Creation date |
| `address_city` | STRING | City |
| `address_state` | STRING | State |
| `address_country` | STRING | Country |
| `accommodates` | FLOAT | Guest capacity |
| `bedrooms` | FLOAT | Bedroom count |
| `bathrooms` | FLOAT | Bathroom count |

### Joins
```sql
dim_listings.account_id  = dim_accounts.account_id
dim_listings.listing_id  = fact_reservations.listing_id
```

---

## fact_reservations

Reservation-level transaction data.

### Primary key
`reservation_id` (STRING, NULLABLE)

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `reservation_id` | STRING | Reservation identifier |
| `account_id` | STRING | Account |
| `listing_id` | STRING | Listing |
| `guest_id` | STRING | Guest identifier |
| `guest_name` | STRING | Guest name |
| `guest_email` | STRING | Guest email |
| `status` | STRING | Reservation status |
| `created_at` | TIMESTAMP | Created timestamp |
| `check_in` | DATE | Check-in date |
| `check_out` | DATE | Check-out date |
| `nights_count` | FLOAT | Number of nights |
| `fee_host_payout_usd` | FLOAT | Host payout in USD |

### Joins
```sql
fact_reservations.account_id = dim_accounts.account_id
fact_reservations.listing_id = dim_listings.listing_id
```

---

## Common query patterns

```sql
-- Top accounts by ticket count + call count (3-source)
SELECT
  a.account_id,
  a.account_name,
  a.sf_account_id,
  COUNT(DISTINCT t.ticket_id) AS ticket_count,
  COUNT(DISTINCT m.callId)    AS call_count
FROM `guesty-data.guesty_analytics.dim_accounts` a
LEFT JOIN `guesty-data.zendesk_analytics.tickets_clean` t
  ON a.account_id = t.account_id
LEFT JOIN `guesty-data.csm.modjo_transcripts_structured` m
  ON a.sf_account_id = m.account_crm_id
WHERE a.account_active = TRUE
GROUP BY a.account_id, a.account_name, a.sf_account_id
ORDER BY ticket_count DESC
LIMIT 20;

-- Reservations with listing details
SELECT
  r.reservation_id,
  r.status,
  r.check_in,
  r.check_out,
  r.nights_count,
  r.fee_host_payout_usd,
  l.listing_name,
  l.address_city,
  l.address_country
FROM `guesty-data.guesty_analytics.fact_reservations` r
JOIN `guesty-data.guesty_analytics.dim_listings` l
  ON r.listing_id = l.listing_id
WHERE r.check_in >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
LIMIT 100;
```
