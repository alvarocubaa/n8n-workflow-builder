# Zuora — BigQuery Reference

## Tables
| Table | Full path | Description |
|-------|-----------|-------------|
| invoices | `guesty-data.zuora_analytics.invoices` | Invoice headers |
| invoice_items | `guesty-data.zuora_analytics.invoice_items` | Invoice line items |
| product_catalog | `guesty-data.zuora_analytics.product_catalog` | Subscription product/charge catalog |

> **Other tables in zuora_analytics (informational):** `detailed_financials`, `zero_invoices`, `listings_billing_control`, `month_over_month_compare`, `accounts_without_sub`, `active_listings_match`

---

## ⚠️ Critical: Two account ID columns in invoices/invoice_items

`invoices` and `invoice_items` have TWO account identifier columns:

| Column | Value format | Use |
|--------|-------------|-----|
| `mongo_account_id` | MongoDB ObjectId (`5af9f2469ebb42009e34cdd6`) | **USE THIS** to join to Guesty accounts |
| `account_id` | Zuora account ID (`8a368c8987b1f33c0187b274b0fa1885`) | Zuora's internal ID — NOT the Guesty account ID |

`product_catalog.account_id` IS the Guesty account ID (same format as `accounts._id`) — no confusion there.

---

## invoices

Invoice header records.

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `invoice_id` | STRING | Zuora invoice ID |
| `mongo_account_id` | STRING | **Guesty account ID** (join to `accounts._id`) |
| `account_id` | STRING | Zuora internal account ID (do NOT use for Guesty join) |
| `invoice_invoicenumber` | STRING | Human-readable invoice number (e.g. INV00000075) |
| `invoice_amount` | FLOAT | Total invoice amount |
| `original_currency_invoice_amount` | FLOAT | Amount in original currency |
| `invoice_date` | STRING | Invoice date |
| `invoice_created_at` | TIMESTAMP | Creation timestamp |
| `should_be_paid_at` | TIMESTAMP | Due date |
| `updated_date` | TIMESTAMP | Last update |
| `company_code` | STRING | Legal entity (e.g. GUESTY_INC) |
| `stripe_id` | STRING | Stripe payment ID (if paid via Stripe) |
| `amount_without_tax` | FLOAT | Amount before tax |
| `tax_amount` | FLOAT | Tax amount |

### Joins
```sql
invoices.mongo_account_id = accounts._id           -- ⚠️ must use mongo_account_id
invoices.mongo_account_id = dim_accounts.account_id
invoices.mongo_account_id = tickets_clean.account_id
```

---

## invoice_items

Line items within each invoice.

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `invoice_id` | STRING | Parent invoice ID |
| `mongo_account_id` | STRING | **Guesty account ID** |
| `item_name` | STRING | Charge description |
| `charge_amount` | FLOAT | Line item amount |
| `service_start_date` | STRING | Billing period start |
| `service_end_date` | STRING | Billing period end |
| `charge_date` | STRING | Charge date |
| `unit_price` | FLOAT | Unit price |
| `quantity` | FLOAT | Quantity |

### Joins
```sql
invoice_items.invoice_id       = invoices.invoice_id
invoice_items.mongo_account_id = accounts._id       -- ⚠️ mongo_account_id
```

---

## product_catalog

Subscription product/charge definitions per account. `account_id` here IS the Guesty account ID.

### Key columns

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | STRING | **Guesty account ID** (= `accounts._id`) ✓ |
| `sf_account_id` | STRING | Salesforce Account ID |
| `plan_name` | STRING | Product/plan name (e.g. "Payment Gateway Fee %") |
| `plan_value` | FLOAT | Plan rate/value |
| `quantity` | FLOAT | Quantity |
| `charge_model` | STRING | Pricing model (e.g. "Custom Charge Model Pricing") |
| `chargetype` | STRING | Charge type (Recurring/OneTime) |
| `uom` | STRING | Unit of measure |
| `effective_start_date` | DATE | When charge starts |
| `effective_end_date` | DATE | When charge ends |
| `subscription_id` | STRING | Zuora subscription ID |
| `subscription_status` | STRING | Active/Cancelled |
| `product_name` | STRING | Product family name |
| `rate_plan_name` | STRING | Rate plan name |

### Payment Gateway fees
```sql
WHERE LOWER(plan_name) LIKE '%payment gateway%'
-- plan_name value: "Payment Gateway Fee %"
-- charge_model: "Custom Charge Model Pricing"
```

### Joins
```sql
product_catalog.account_id    = accounts._id           -- ✓ direct
product_catalog.account_id    = dim_accounts.account_id
product_catalog.sf_account_id = dim_accounts.sf_account_id
```

---

## Common query patterns

```sql
-- Top accounts by total billed (use mongo_account_id)
SELECT
  a.name            AS account_name,
  COUNT(i.invoice_id) AS invoice_count,
  SUM(i.invoice_amount) AS total_billed
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.invoices` i
  ON a._id = i.mongo_account_id
WHERE a.active = TRUE
GROUP BY a.name
ORDER BY total_billed DESC
LIMIT 10;
-- Verified results include: Host & Stay (£884K), My Property Host (£783K), HUSWELL® (£778K)

-- Payment gateway fees per account
SELECT
  a.name            AS account_name,
  pc.plan_name,
  pc.plan_value,
  pc.quantity,
  pc.charge_model,
  pc.effective_end_date
FROM `guesty-data.datalake_glue.accounts` a
JOIN `guesty-data.zuora_analytics.product_catalog` pc
  ON a._id = pc.account_id
WHERE LOWER(pc.plan_name) LIKE '%payment gateway%'
  AND a.active = TRUE;

-- Invoice line items for specific account
SELECT
  ii.item_name,
  ii.charge_amount,
  ii.service_start_date,
  ii.service_end_date,
  ii.quantity
FROM `guesty-data.zuora_analytics.invoice_items` ii
WHERE ii.mongo_account_id = '<account_id_here>'
ORDER BY ii.charge_date DESC
LIMIT 50;

-- Active subscriptions by product
SELECT
  plan_name,
  COUNT(DISTINCT account_id) AS account_count,
  AVG(plan_value) AS avg_rate
FROM `guesty-data.zuora_analytics.product_catalog`
WHERE subscription_status = 'Active'
GROUP BY plan_name
ORDER BY account_count DESC;
```
