# Admin Data — BigQuery Reference

## Table
`guesty-data.datalake_glue.accounts`

Raw Guesty account data. Primary source of account identity — all other tables join back here.

## Primary key
`_id` (STRING) — Guesty account identifier (MongoDB ObjectId). Equivalent to `account_id` in all other sources.

## Key columns

| Column | Type | Description |
|--------|------|-------------|
| `_id` | STRING | Guesty account ID — universal join key |
| `name` | STRING | Account/company name |
| `active` | BOOLEAN | Is the account currently active |
| `origin` | STRING | Acquisition channel |
| `createdat` | TIMESTAMP | Account created date |
| `canceledat` | TIMESTAMP | Account cancelled date (NULL if active) |
| `updatetimestamp` | TIMESTAMP | Last update |
| `currency` | STRING | Account currency |
| `timezone` | STRING | Account timezone |
| `internaldata_accountmanager` | STRING | CSM name |
| `internaldata_salesperson` | STRING | Sales rep |
| `internaldata_onboardingstatus` | STRING | Onboarding status |
| `software_plan_type` | STRING | Main plan type |
| `software_plan_value` | FLOAT | Main plan value |
| `billing_billingcycle` | STRING | monthly / annual |
| `billing_nextbillingdate` | TIMESTAMP | Next billing date |
| `billing_balance_amount` | FLOAT | Current balance |
| `payment_processing_plan_type` | STRING | Payment processing plan |
| `payment_processing_plan_value` | FLOAT | Payment processing fee |
| `payment_platform_fee_plan_value` | STRING | Platform fee |
| `companyinformation_name` | STRING | Legal company name |
| `companyinformation_contactemail` | STRING | Contact email |
| `companyinformation_country` | STRING | Country |
| `companyinformation_city` | STRING | City |
| `companyinformation_vatnum` | STRING | VAT number |
| `recognizedRevenueMode` | STRING | Revenue recognition mode |
| `sisenseaccess` | BOOLEAN | Has Sisense BI access |
| `billingv2enabled` | BOOLEAN | Is on billing v2 |

### REPEATED fields (require UNNEST)
| Column | Description |
|--------|-------------|
| `plan` (RECORD) | Plan name, plantype, value |
| `taxes` (RECORD) | Tax definitions (_id, name, type, units, amount) |
| `billing_paymentmethods` (RECORD) | stripe_card_brand |
| `customfields` (RECORD) | Custom field definitions (key, displayname, type) |
| `financials_channelcommission_manual` (RECORD) | Commission rules |

## Joins to other sources

| Target table | Join condition |
|-------------|----------------|
| `guesty_analytics.dim_accounts` | `accounts._id = dim_accounts.account_id` |
| `zendesk_analytics.tickets_clean` | `accounts._id = tickets_clean.account_id` |
| `zuora_analytics.invoices` | `accounts._id = invoices.mongo_account_id` ⚠️ |
| `zuora_analytics.product_catalog` | `accounts._id = product_catalog.account_id` |
| `jira.jira_hierarchy` | `accounts._id` IN `UNNEST(jira_hierarchy.account_ids)` |
| `csm.modjo_transcripts_structured` | Via dim_accounts bridge: `_id = dim_accounts.account_id` → `dim_accounts.sf_account_id = modjo.account_crm_id` |

## Common query patterns

```sql
-- Active accounts count
SELECT COUNT(*) FROM `guesty-data.datalake_glue.accounts` WHERE active = TRUE;
-- Result: ~47,224 active accounts

-- Accounts created in last 30 days
SELECT _id, name, createdat, internaldata_accountmanager
FROM `guesty-data.datalake_glue.accounts`
WHERE createdat >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND active = TRUE
ORDER BY createdat DESC;

-- Accounts with their plan info
SELECT _id, name, software_plan_type, software_plan_value, billing_billingcycle
FROM `guesty-data.datalake_glue.accounts`
WHERE active = TRUE AND software_plan_value > 0;

-- UNNEST the plan REPEATED field
SELECT a._id, a.name, p.name AS plan_name, p.plantype, p.value
FROM `guesty-data.datalake_glue.accounts` a
CROSS JOIN UNNEST(a.plan) AS p
WHERE a.active = TRUE;

-- Payment gateway fees for an account (cross-source join)
SELECT a.name, pc.plan_name, pc.plan_value, pc.quantity
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE;
```

## Filters & limits
- Always filter `WHERE active = TRUE` for current customers
- Exclude cancelled: `WHERE canceledat IS NULL`
- Date bounds: use `createdat`, `canceledat`, or `updatetimestamp`
- Use `LIMIT` for exploration; full table has ~100K+ rows (including historical)
