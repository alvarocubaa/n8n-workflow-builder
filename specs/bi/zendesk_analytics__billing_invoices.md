# BI mart — `guesty-data.zendesk_analytics.billing_invoices`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ last_updated unknown — treat freshness as unverified.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.

_No table-level build query available; column-level docs only._

## Documented columns (27 of 30)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `invoice_item_id` | Unique identifier for each item on an invoice. | Directly selected from the source table, representing the unique ID assigned to each line item within an invoice. | `invoice_item_id` |
| `money_guestfeebase` | Base guest fee amount in the transaction currency. | Directly retrieved from the 'guest_fee_base' column of the 'invoices' table, representing the initial guest fee before any adjustments. | `t2.guest_fee_base` |
| `account_currency` | Currency of the account for the billing invoice. | Directly selected from the 'currency' column of the 'accounts' table, joined on account ID. | `accounts.currency AS account_currency` |
| `amount_from_product` | Amount from product, excluding discounts and taxes. | The amount from the product is calculated by summing the 'amount' column from the 'invoice_items' table where the 'type' is 'product'. | `SUM(CASE WHEN invoice_items.type = 'product' THEN invoice_items.amount ELSE 0 END)` |
| `reservation_refrence` | Unique identifier for the reservation associated with the invoice. | Directly extracted from the 'reservation_reference' column in the 'billing_invoices' table. | `reservation_refrence` |
| `invoice_date` | Date the invoice was issued. | Directly extracted from the 'invoice_date' column of the source table. | `invoice_date` |
| `product_name` | The name of the product or service being billed. | Directly extracted from the 'product_name' column within the 'billing_invoices' table. | `product_name` |
| `gbv_amount` | Total amount of the invoice in the guest's local currency. | This column is directly extracted from the 'amount' field within the 'billing_invoices' table, representing the total charge for the invoice. | `amount` |
| `reservation_id` | Unique identifier for a reservation. | Directly retrieved from the 'reservation_id' column of the source table. | `reservation_id` |
| `has_pcm` | Indicates if the invoice includes Property Management Commission (PMC). | Checks if the 'item_type' field contains the string 'PMC' or 'Property Management Commission'. | `CASE WHEN item_type LIKE '%PMC%' OR item_type LIKE '%Property Management Commission%' THEN TRUE ELSE FALSE END` |
| `fee_host_payout_original_currency` | Original currency of the fee paid out to the host. | Directly retrieved from the 'fee_host_payout_original_currency' column of the 'billing_invoices' table. | `fee_host_payout_original_currency` |
| `fee_host_service_original_currency` | Original currency of the host service fee before conversion. | Directly extracted from the 'fee_host_service_original_currency' column in the source table. | `fee_host_service_original_currency` |
| `invoice_number` | Unique identifier for a billing invoice. | Directly extracted from the 'invoice_number' column of the source table. | `invoice_number` |
| `account_name` | The name of the account associated with the billing invoice. | Directly retrieved from the 'account_name' column within the 'billing_invoices' table. | `account_name` |
| `invoice_listing_id` | Unique identifier for a listing on an invoice. | Extracted from the 'listing_id' field within the 'metadata' JSON column of the source table. | `JSON_EXTRACT_SCALAR(metadata, '$.listing_id')` |
| `reservation_host_payout_usd` | Total payout to the host for the reservation, in USD. | This column directly reflects the 'reservation_host_payout_usd' field from the source table, representing the host's earnings for a reservation. | `reservation_host_payout_usd` |
| `reservation_checkin` | Date of reservation check-in. | Extracted from the 'reservation_checkin' field within the 'data' JSON column of the 'billing_invoices' table. | `JSON_EXTRACT_SCALAR(data, '$.reservation_checkin')` |
| `csm` | Customer Success Manager associated with the invoice. | Directly retrieved from the 'csm' column in the source table, representing the assigned Customer Success Manager. | `csm` |
| `hq_type` | Type of HQ associated with the invoice. | Directly retrieves the 'hq_type' from the 'billing_invoices' table. This column categorizes the headquarters type for each invoice. | `hq_type` |
| `listing_name` | Name of the listing associated with the invoice. | Directly retrieved from the 'listing_name' column within the 'billing_invoices' table. | `listing_name` |
| `reservation_confirmed_at` | Timestamp when the reservation was confirmed. | Directly extracted from the 'confirmed_at' field within the 'reservation' struct from the source table. | `t.reservation.confirmed_at` |
| `listing_nickname` | Nickname of the listing associated with the invoice. | Directly extracted from the 'listing_nickname' column in the source table. | `listing_nickname` |
| `invoice_status` | The current status of the invoice. | Directly retrieved from the 'status' column of the 'invoices' table. | `t1.status AS invoice_status` |
| `invoice_id` | Unique identifier for each billing invoice. | Directly selected from the 'id' column of the 'invoices' table, representing the primary key for each invoice record. | `t1.id AS invoice_id` |
| `org_id` | Unique identifier for the organization associated with the invoice. | Directly retrieved from the 'organization_id' column in the 'invoices' table, representing the organization that owns the invoice. | `t1.organization_id` |
| `reservation_status` | Current status of the reservation. | Directly retrieved from the 'status' column of the 'reservations' table, indicating the reservation's current state. | `t2.status` |
| `reservation_checkout` | Date and time when the reservation was checked out. | Directly retrieved from the 'checkout' column in the 'reservations' table, representing the official checkout timestamp. | `reservations.checkout` |
