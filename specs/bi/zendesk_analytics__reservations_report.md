# BI mart — `guesty-data.zendesk_analytics.reservations_report`

> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).
> ⚠️ last_updated unknown — treat freshness as unverified.
> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart's own columns.

_No table-level build query available; column-level docs only._

## Documented columns (31 of 34)

| Column | Description | Business logic | SQL snippet |
|---|---|---|---|
| `Source` | The source of the reservation, e.g., Airbnb, Booking.com, or direct. | Determined by the 'source' field from the Guesty reservations data. If null, it defaults to 'Direct'. | `COALESCE(reservations.source, 'Direct')` |
| `Checkin` | The date and time the guest checked in. | Directly extracted from the 'checkin' column of the 'reservations' table. | `reservations.checkin` |
| `Creation_Date` | The date and time when the reservation was created. | Directly extracted from the 'created_at' column in the 'reservations' table, representing the timestamp of reservation creation. | `reservations.created_at` |
| `Guest_ID` | Unique identifier for the guest making the reservation. | Directly retrieved from the 'guest_id' column in the source 'reservations' table. | `reservations.guest_id` |
| `Currency` | The currency code associated with the reservation's financial transactions. | Directly extracted from the 'currency' field within the 'reservations' table, representing the currency of the reservation. | `currency` |
| `Checkout` | The date and time the guest is scheduled to check out. | This column is directly extracted from the 'checkout_date' field within the 'reservations' table, representing the scheduled departure time for the guest. | `reservations.checkout_date` |
| `Confirmation_Code` | Unique identifier for a reservation. | Directly retrieves the confirmation code from the 'reservations' table, which serves as a unique identifier for each reservation. | `reservations.confirmation_code` |
| `Status` | Current status of the reservation. | Directly retrieved from the 'status' column in the 'reservations' table. This indicates whether a reservation is confirmed, cancelled, pending, etc. | `t1.status` |
| `Guest_Name` | The full name of the guest making the reservation. | Concatenation of the guest's first name and last name, separated by a space. | `CONCAT(guest_first_name, ' ', guest_last_name)` |
| `Fee_details` | JSON object containing detailed fee information for the reservation. | Directly extracted from the 'fees' field within the raw reservation data, representing a structured JSON object. | `fees` |
| `Accounts_payable` | Amount owed to vendors for goods/services received. | This field is currently unused and always returns 0.00. It is a placeholder for future functionality related to accounts payable tracking within the reservation system. | `0.00` |
| `Platform` | The booking channel or platform used by the guest. | Directly retrieved from the 'platform' column within the 'reservations_report' table, representing where the reservation originated. | `platform` |
| `Total_fees` | The total amount of fees charged for a reservation. | Calculated by summing the 'other_fees' and 'channel_fees' from the reservation data. | `other_fees + channel_fees AS Total_fees` |
| `Channel_Creation_Date` | Date when the channel for the reservation was created. | Directly retrieved from the 'channel_creation_date' column of the 'reservations_report' table. | `t1.channel_creation_date` |
| `Listing_ID` | Unique identifier for a listing. | Directly selected from the 'listing_id' column of the 'reservations_report' table. | `listing_id` |
| `Total_Paid` | Total amount paid by the guest for the reservation. | Calculated as the sum of all payments made towards the reservation. This includes initial deposits, interim payments, and final balances. | `SUM(payments.amount) AS Total_Paid` |
| `PMC_commission` | Commission earned by the Property Management Company (PMC). | Calculated as a percentage of the reservation's total revenue, based on the PMC's commission rate. | `PMC_commission` |
| `Adjusted_accommodation_fare` | Adjusted accommodation fare after deductions. | Calculated by subtracting adjustments (e.g., discounts, refunds) from the total accommodation fare. This represents the final revenue from the accommodation component. | `Adjusted_accommodation_fare` |
| `Host_Payout` | The amount paid to the host for the reservation. | Calculated by summing the 'host_payout' from the 'reservations_report' table, which represents the host's earnings for the booking. | `Host_Payout` |
| `Balance_Due` | Remaining amount owed by the guest. | Calculated by subtracting the total paid amount from the total reservation amount. | `reservations_report.balance_due` |
| `Markup_details` | Details about markup applied to the reservation. | This column contains a JSON string representing the markup details, including the type and amount, extracted from the 'markup_details' field of the raw reservation data. | `JSON_EXTRACT_SCALAR(markup_details, '$')` |
| `Account_Name` | The name of the account associated with the reservation. | Directly retrieved from the 'account_name' column within the 'reservations_report' table. | `account_name` |
| `Owner_IDs` | IDs of the owners associated with the reservation. | Extracts the 'ownerId' from the 'owners' JSON array within the 'reservation' field. | `JSON_EXTRACT_SCALAR(reservation, '$.owners[0].ownerId')` |
| `Total_taxes` | Total taxes applied to the reservation. | Calculated by summing the 'tax' column from the 'reservations_report' table. | `tax` |
| `Listing_Nickname` | Nickname of the listing associated with the reservation. | Directly retrieved from the 'listing_nickname' column of the 'reservations_report' table. | `listing_nickname` |
| `Owner_revenue` | Revenue generated for the owner from the reservation. | Calculated by subtracting the Guesty commission from the total reservation amount. | `SAFE_CAST(JSON_EXTRACT_SCALAR(data, '$.owner_revenue') AS BIGNUMERIC)` |
| `Channel_commission` | Commission paid to the channel for the reservation. | This is a direct passthrough of the 'channel_commission' column from the 'reservations_report' table. | `channel_commission` |
| `Advanced_deposit_balance` | The remaining balance of an advanced deposit for a reservation. | Calculated by subtracting the sum of all payments made towards advanced deposits from the total advanced deposit amount. | `COALESCE(advanced_deposit_amount, 0) - COALESCE(advanced_deposit_payments, 0)` |
| `Import_Date` | The date this reservation record was imported into the system. | This column is directly populated from the 'Import Date' column in the raw Zendesk Analytics reservations report. | ``Import Date`` |
| `Tax_details` | JSON string containing tax details for the reservation. | Directly extracts the 'tax_details' field from the 'reservations_report' table, which stores tax information as a JSON object. | `tax_details` |
| `Account_ID` | Unique identifier for the account associated with the reservation. | Directly selected from the 'account_id' column of the source table. | `account_id` |
