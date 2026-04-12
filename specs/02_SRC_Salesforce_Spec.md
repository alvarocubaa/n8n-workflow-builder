# Salesforce — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field API names. Use it to generate runnable n8n JSON.

**Node policy:** **Prefer the Salesforce node** for direct operations (Get, Get All, Search/SOQL). Use BigQuery only for cross-source joins or warehouse-only aggregations. For direct Salesforce API operations, refer to **section 5 (n8n Salesforce node reference)**. No HTTP Request or other clients.

**This spec is read-only:** use only read operations. Do not create, update, upsert, or delete.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Salesforce API (production) | `salesforceOAuth2Api` | Salesforce node |
| Salesforce API (sandbox) | `salesforceOAuth2Api` | Salesforce node |
| BigQuery warehouse | `googleApi` | BigQuery node |

| Item | Value |
|------|--------|
| **Auth Type** | Salesforce path: OAuth2. BigQuery path: Google Service Account API. |
| **Node Type** | **Prefer Salesforce node** (with Salesforce credential) for direct operations. Use BigQuery node for cross-source joins or warehouse-only aggregations. See **section 5** for Salesforce node reference. |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **API names**: Use **API Names** of objects and fields, not UI labels. For warehouse/BQ use field names from section 4 schema (e.g. account_id, account_name, sf_account_id, onboarding_status, csm).
- **Primary key / linkage**: Salesforce **Id** (18-char) = **dim_accounts.sf_account_id**. For cross-system linkage see section 4 join tables.
- **Custom fields**: Suffix `__c` = custom; `__r` = relation. Use only field names present in the section 4 schema or explicitly documented in intake/project documentation.
- **Data types**: Number, String, Picklist (enum), Date, DateTime, Boolean. Match schema types in section 4. Use for **read** operations only (Get, Get all, Search).
- **Key linking field**: `Guesty_Admin_ID__c` on sf_account = Guesty `account_id` (same as dim_accounts.account_id). This is the primary cross-system join field.

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by `CreatedDate`, `LastModifiedDate`, or custom date fields to bound queries (e.g. last 30 days).
- **Status filters**: e.g. only active Accounts; exclude deleted records; filter by record type or status picklist.
- **Limits**: Use SOQL LIMIT and pagination (e.g. OFFSET or batch); set max records per run to avoid timeouts and governor limits.
- **Scope**: When possible filter by account_id, sf_account_id, or other indexed fields (BQ); or by Account Id, OwnerId per SOQL (Salesforce node).

---

## 4. BigQuery Tables (Source of Truth)

Salesforce data is available in BigQuery across two datasets:
- **`salesforce.*`** — Raw Salesforce object mirrors (sf_account, sf_opportunity, sf_lead, sf_contact, sf_risk_log, sf_task, sf_onboarding, sf_users)
- **`guesty_analytics.*`** — Processed analytics tables (dim_accounts, dim_listings, fact_reservations)

**BigQuery full table names (use exactly — do not invent project/dataset names):**

| Logical table | Full BigQuery path | Cols | Purpose |
|---------------|--------------------|------|---------|
| sf_account | `guesty-data.salesforce.sf_account` | 736 | Raw Salesforce Account mirror — all SF fields |
| sf_opportunity | `guesty-data.salesforce.sf_opportunity` | 185 | Opportunities (sales deals, renewals, upsells, churns) |
| sf_lead | `guesty-data.salesforce.sf_lead` | 120 | Leads (marketing/sales pipeline) |
| sf_contact | `guesty-data.salesforce.sf_contact` | 73 | Contacts linked to accounts |
| sf_event | `guesty-data.salesforce.sf_event` | 93 | Calendar events |
| sf_risk_log | `guesty-data.salesforce.sf_risk_log` | 15 | Risk assessment records |
| sf_task | `guesty-data.salesforce.sf_task` | 14 | Tasks/activities |
| sf_onboarding | `guesty-data.salesforce.sf_onboarding` | 31 | Onboarding projects |
| sf_users | `guesty-data.salesforce.sf_users` | 13 | Salesforce users (owners, CSMs) |
| dim_accounts | `guesty-data.guesty_analytics.dim_accounts` | ~200 | Processed account dimensions (preferred for joins) |
| dim_listings | `guesty-data.guesty_analytics.dim_listings` | — | Listing dimensions |
| fact_reservations | `guesty-data.guesty_analytics.fact_reservations` | — | Reservation facts |

**Cross-dataset linkage:**
- `sf_account.Id` = `dim_accounts.sf_account_id` (18-char Salesforce Account Id)
- `sf_account.Guesty_Admin_ID__c` = `dim_accounts.account_id` (Guesty internal account ID)
- `sf_opportunity.AccountId` = `sf_account.Id`
- `sf_contact.AccountId` = `sf_account.Id`
- `sf_risk_log.Account__c` = `sf_account.Id`
- `sf_onboarding.Guesty_Admin_ID__c` = `dim_accounts.account_id`

**Joining to other data sources:**

| From (this spec) | To (other spec) | Join condition |
|-----------------|-----------------|----------------|
| dim_accounts | Zendesk tickets_clean | dim_accounts.**account_id** = tickets_clean.account_id OR dim_accounts.**sf_account_id** = tickets_clean.sf_account_id |
| dim_accounts | Modjo modjo_transcripts_structured | dim_accounts.**sf_account_id** = modjo_transcripts_structured.**account_crm_id** |
| dim_accounts | Zuora invoices / invoice_items | dim_accounts.**account_id** = invoices.**mongo_account_id** ⚠️ (NOT `invoices.account_id` — that is Zuora's own internal ID) |
| dim_accounts | Zuora product_catalog | dim_accounts.**account_id** = product_catalog.account_id |
| dim_accounts | **Jira jira_hierarchy** | dim_accounts.**account_id** = *unnested* jira_hierarchy.**account_ids** (UNNEST in BigQuery). See Jira spec section 2.2. |
| dim_listings | dim_accounts | dim_listings.**account_id** = dim_accounts.account_id |
| fact_reservations | dim_accounts, dim_listings | fact_reservations.**account_id** = dim_accounts.account_id; fact_reservations.**listing_id** = dim_listings.listing_id |
| sf_account | dim_accounts | sf_account.**Id** = dim_accounts.**sf_account_id** OR sf_account.**Guesty_Admin_ID__c** = dim_accounts.**account_id** |

### 4.1. sf_account (Salesforce Account mirror)

**BigQuery table:** `guesty-data.salesforce.sf_account` (736 columns)

Raw Salesforce Account object. Contains all standard and custom fields. Use `dim_accounts` for most analytics; use `sf_account` when you need SF-specific fields not in dim_accounts.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Salesforce Account Id (18-char) — PK |
| `Name` | STRING | Account name |
| `OwnerId` | STRING | Account owner (Salesforce User Id). **Use only if your workflow has no BQ data source.** If any BQ table with a `csm` column is already in the workflow (`dim_accounts`, `csm.portfolio`, `csm.health_score`, `csm.csm_churn_report`, `csm.mrr_calculator`, `csm.segmentation_report`), use that column directly — do NOT round-trip to Salesforce. See `02_SRC_CSM_Spec.md` "CSM / Account Owner Lookup Rule". |
| `Guesty_Admin_ID__c` | STRING | **Guesty account_id** — primary cross-system join key |
| `Guesty_Test_Account_ID__c` | STRING | Test account ID |
| `Status__c` | STRING | Account status |
| `Sub_Status__c` | STRING | Sub-status |
| `Package__c` | STRING | Package level |
| `Guesty_Package__c` | STRING | Guesty package |
| `Current_Segment__c` | STRING | Account segment |
| `First_Segment__c` | STRING | Initial segment |
| `Account_Owner_Sentiment__c` | STRING | Owner sentiment |
| `Average_MRR__c` | FLOAT | Average MRR |
| `Average_MRR_Last_3_months__c` | FLOAT | 3-month avg MRR |
| `Average_MRR_Last_6_months__c` | FLOAT | 6-month avg MRR |
| `MTD_Revenue__c` | FLOAT | Month-to-date revenue |
| `Last_Month_Revenue__c` | FLOAT | Last month revenue |
| `Revenue_Collected__c` | FLOAT | Total revenue collected |
| `Recent_Health_Score_Num__c` | FLOAT | Health score (numeric) |
| `Number_of_Listings__c` | FLOAT | Total listings |
| `Number_of_Active_Listed_Listings__c` | FLOAT | Active listed listings |
| `Number_of_Active_Listings_GCS__c` | FLOAT | Active GCS listings |
| `Months_in_Service__c` | FLOAT | Tenure in months |
| `Main_Contact_Email__c` | STRING | Main contact email |
| `Main_Contact_Phone__c` | STRING | Main contact phone |
| `Main_Contact_Person__c` | STRING | Main contact name |
| `Onboarding_Status__c` | STRING | Onboarding status |
| `Onboarding_Stage__c` | STRING | Onboarding stage |
| `Onboarding_Completion_Date__c` | TIMESTAMP | OB completion date |
| `Churn_Date__c` | TIMESTAMP | Churn date |
| `Churn_Reasons__c` | STRING | Churn reasons |
| `Guesty_Contract_Status__c` | STRING | Contract status |
| `Last_Call_Date__c` | DATE | Last call date |
| `Last_Payment_Status__c` | STRING | Last payment status |
| `Connectivity_Status__c` | STRING | Connectivity status |
| `Jira_and_Status__c` | STRING | Jira linkage/status |
| `RecordTypeId` | STRING | Record type |
| `Type` | STRING | Account type |
| `Industry` | STRING | Industry |
| `CreatedDate` | TIMESTAMP | Created date |
| `LastModifiedDate` | TIMESTAMP | Last modified |

### 4.2. sf_opportunity (Opportunities)

**BigQuery table:** `guesty-data.salesforce.sf_opportunity` (185 columns)

Sales opportunities including new deals, renewals, upsells, and churn records.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Opportunity Id — PK |
| `AccountId` | STRING | Join to sf_account.Id |
| `Name` | STRING | Opportunity name |
| `OwnerId` | STRING | Owner (Salesforce User Id) |
| `StageName` | STRING | Pipeline stage |
| `Amount` | FLOAT | Deal amount |
| `Expected_MRR__c` | FLOAT | Expected MRR |
| `CloseDate` | TIMESTAMP | Expected close date |
| `IsClosed` | BOOLEAN | Whether closed |
| `IsWon` | BOOLEAN | Whether won |
| `Probability` | FLOAT | Win probability |
| `Type` | STRING | Opportunity type |
| `LeadSource` | STRING | Lead source |
| `Original_Source__c` | STRING | Original source |
| `Number_of_Listings__c` | FLOAT | Listing count |
| `Services_Package__c` | STRING | Services package |
| `Guesty_Package__c` | STRING | Guesty package |
| `Lost_Reason__c` | STRING | Lost reason |
| `Cancellation_Reasons__c` | STRING | Cancellation reasons |
| `Cancellation_Sub_Reason__c` | STRING | Cancellation sub-reason |
| `Churn_Date__c` | STRING | Churn date |
| `Risk_Reason_s__c` | STRING | Risk reasons |
| `Risk_Source__c` | STRING | Risk source |
| `RecordTypeId` | STRING | Record type |
| `CreatedDate` | TIMESTAMP | Created date |
| `LastModifiedDate` | TIMESTAMP | Last modified |

### 4.3. sf_risk_log (Risk records)

**BigQuery table:** `guesty-data.salesforce.sf_risk_log` (15 columns)

Risk assessment records linked to accounts and opportunities.

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Risk log Id — PK |
| `Name` | STRING | Risk log name |
| `Account__c` | STRING | Join to sf_account.Id |
| `Opportunity__c` | STRING | Join to sf_opportunity.Id |
| `OwnerId` | STRING | Owner |
| `Risk_Source__c` | STRING | Risk source |
| `Risk_Type__c` | STRING | Risk type |
| `Risk_Level__c` | STRING | Risk level |
| `Overall_Risk_Level__c` | STRING | Overall risk level |
| `Status__c` | STRING | Status |
| `Health_Hub__c` | STRING | Health hub reference |
| `Date__c` | DATE | Risk date |
| `No_Of_Open_Tasks__c` | FLOAT | Number of open tasks |
| `CreatedDate` | TIMESTAMP | Created date |
| `LastModifiedDate` | TIMESTAMP | Last modified |

### 4.4. sf_lead (Leads)

**BigQuery table:** `guesty-data.salesforce.sf_lead` (120 columns)

Marketing and sales leads. Key fields for pipeline analysis.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Lead Id — PK |
| `Email` | STRING | Lead email |
| `Company` | STRING | Company name |
| `FirstName` / `LastName` | STRING | Lead name |
| `LeadSource` | STRING | Lead source |
| `Lead_Status__c` | STRING | Lead status |
| `Lifecycle_Stage__c` | STRING | Lifecycle stage |
| `Country` | STRING | Country |
| `Country_Tier__c` | STRING | Country tier |
| `Number_of_Listings__c` | FLOAT | Number of listings |
| `Conversion_origin__c` | STRING | Conversion origin |
| `ConvertedAccountId` | STRING | Converted Account Id |
| `ConvertedContactId` | STRING | Converted Contact Id |
| `ConvertedOpportunityId` | STRING | Converted Opportunity Id |
| `ConvertedDate` | TIMESTAMP | Conversion date |
| `Demo_Scheduled_Date__c` | TIMESTAMP | Demo scheduled |
| `Demo_Completed_Date__c` | TIMESTAMP | Demo completed |
| `CreatedDate` | TIMESTAMP | Created date |
| `partition_date` | DATE | Partition date |

### 4.5. sf_contact (Contacts)

**BigQuery table:** `guesty-data.salesforce.sf_contact` (73 columns)

Contacts linked to accounts.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Contact Id — PK |
| `AccountId` | STRING | Join to sf_account.Id |
| `Email` | STRING | Contact email |
| `FirstName` / `LastName` | STRING | Contact name |
| `Guesty_User_ID__c` | STRING | Guesty User ID |
| `Lead_Status__c` | STRING | Status |
| `Lifecycle_Stage__c` | STRING | Lifecycle stage |
| `Demo_Scheduled_Date__c` | DATE | Demo scheduled |
| `Demo_Completed_Date__c` | TIMESTAMP | Demo completed |
| `partition_date` | DATE | Partition date |

### 4.6. sf_task (Tasks/Activities)

**BigQuery table:** `guesty-data.salesforce.sf_task` (14 columns)

Salesforce tasks and activities.

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Task Id — PK |
| `AccountId` | STRING | Join to sf_account.Id |
| `Subject` | STRING | Task subject |
| `Description` | STRING | Task description |
| `Type` | STRING | Task type |
| `TaskSubtype` | STRING | Subtype |
| `ActivityDate` | DATE | Activity date |
| `IsClosed` | BOOLEAN | Whether closed |
| `OwnerId` | STRING | Task owner |
| `WhoId` | STRING | Related contact/lead |
| `CreatedById` | STRING | Creator |
| `CreatedDate` | TIMESTAMP | Created date |
| `LastModifiedDate` | TIMESTAMP | Last modified |

### 4.7. sf_onboarding (Onboarding projects)

**BigQuery table:** `guesty-data.salesforce.sf_onboarding` (31 columns)

Onboarding projects with accounting OB tracking.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | Onboarding record Id — PK |
| `Guesty_Admin_ID__c` | STRING | **Guesty account_id** — join to dim_accounts.account_id |
| `Onboarder__c` | STRING | Onboarder name |
| `Onboarder_Lookup__c` | STRING | Onboarder lookup |
| `Onboarding_Start_Date__c` | DATE | OB start date |
| `Onboarding_Completion_Date__c` | DATE | OB completion date |
| `GoLive_date__c` | DATE | Go-live date |
| `Project_Type__c` | STRING | Project type |
| `Accounting_OB_Stage__c` | STRING | Accounting OB stage |
| `Accounting_Adoption_Status__c` | STRING | Accounting adoption status |
| `Accounting_OB_Paused_Reason__c` | STRING | Paused reason |
| `Accounting_OB_Cancel_Reason__c` | STRING | Cancel reason |
| `CreatedDate` | DATE | Created date |
| `partition_date` | DATE | Partition date |

### 4.8. sf_users (Salesforce Users)

**BigQuery table:** `guesty-data.salesforce.sf_users` (13 columns)

Salesforce users — use to resolve OwnerId fields across other tables.

| Column | Type | Notes |
|--------|------|-------|
| `Id` | STRING | User Id — PK. Join to OwnerId in other tables |
| `Username` | STRING | Username |
| `Name` | STRING | Full name |
| `Title` | STRING | Job title |
| `Department` | STRING | Department |
| `Org_Department__c` | STRING | Org department |
| `UserRoleId` | STRING | Role Id |
| `ManagerId` | STRING | Manager User Id |
| `IsActive` | BOOLEAN | Whether active |
| `License_Type__c` | STRING | License type |
| `LastLoginDate` | TIMESTAMP | Last login |
| `CreatedDate` | TIMESTAMP | Created date |
| `partition_date` | DATE | Partition date |

### 4.9. dim_accounts (processed account dimensions)

**BigQuery table:** `guesty-data.guesty_analytics.dim_accounts`

**Preferred for most analytics and cross-source joins.** Cleaner, flatter structure than sf_account with pre-computed metrics.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | STRING | Guesty account ID — primary join key |
| `sf_account_id` | STRING | Salesforce Account Id (18-char) |
| `account_name` | STRING | Account name |
| `account_active` | BOOLEAN | Is account active |
| `csm` | STRING | Customer Success Manager |
| `account_segmentation` | STRING | Account segment |
| `avg_mrr` | FLOAT | Average MRR |
| `active_listings` | INTEGER | Active listings count |
| `months_in_guesty` | INTEGER | Tenure in months |
| `onboarding_status` | STRING | Onboarding status |
| `account_first_paid` | DATE | First payment date |
| `account_created_at` | DATE | Account creation date |
| `is_churn` | BOOLEAN | Whether churned |
| `churn_date` | DATE | Churn date |
| `package` | STRING | Package |
| `company_country` | STRING | Country |
| `primary_contact_email` | STRING | Contact email |
| `billing_cycle` | STRING | Billing cycle |
| `partition_date` | DATE | Partition date |

See full dim_accounts schema (200+ columns including revenue, listing, connectivity fields) in section below.

<details>
<summary>Expand: dim_accounts full schema (key financial & operational fields)</summary>

| Column | Type |
|--------|------|
| account_id | STRING |
| account_name | STRING |
| account_active | BOOLEAN |
| csm | STRING |
| smb_csm | STRING |
| account_manager | STRING |
| onboarding_status | STRING |
| onboarding_completion_date | TIMESTAMP |
| next_renewal_date | DATE |
| onboarder | STRING |
| sf_account_id | STRING |
| account_categorization | FLOAT |
| account_segmentation | STRING |
| account_created_at | DATE |
| account_first_paid | DATE |
| account_last_paid | DATE |
| months_in_guesty | INTEGER |
| source_platform | STRING |
| active_listings | INTEGER |
| active_listed_listings | INTEGER |
| active_gcs_listings | INTEGER |
| rate_gcs_listings | FLOAT |
| avg_mrr | FLOAT |
| lifetime_paid_listings | INTEGER |
| last_month_paid_listings | INTEGER |
| lifetime_rev_from_account | FLOAT |
| last_month_rev_from_account | FLOAT |
| lifetime_paid_for_software | FLOAT |
| last_month_paid_for_software | FLOAT |
| lifetime_paid_for_gcs | FLOAT |
| last_month_paid_for_gcs | FLOAT |
| lifetime_credits_to_account | FLOAT |
| last_month_credits_to_account | FLOAT |
| lifetime_refunds_to_account | FLOAT |
| account_canceled_at | DATE |
| sales_person | STRING |
| current_credit_amount | FLOAT |
| lifetime_confirmed_reservations | INTEGER |
| future_confirmed_reservations | INTEGER |
| company_country | STRING |
| company_state | STRING |
| company_city | STRING |
| primary_contact_email | STRING |
| primary_contact_first_name | STRING |
| primary_contact_last_name | STRING |
| primary_contact_phone | STRING |
| timezone | STRING |
| billing_cycle | STRING |
| partition_date | DATE |
| is_churn | BOOLEAN |
| churn_date | DATE |
| package | STRING |
| operative_account_segmentation | STRING |
| operative_mrr | INTEGER |
| solutions_expert | STRING |
| software_plan_type | STRING |
| software_plan_value | FLOAT |
| gcs_plan_type | STRING |
| gcs_plan_value | FLOAT |
| mtd_revenue | FLOAT |

</details>

### 4.10. dim_listings (listings)

**BigQuery table:** `guesty-data.guesty_analytics.dim_listings`

Links to accounts via **account_id** (same as dim_accounts.account_id). Not a direct Salesforce object; included for join context.

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `listing_id` | STRING | Listing identifier — PK |
| `account_id` | STRING | Join to dim_accounts.account_id |
| `listing_name` | STRING | Listing name |
| `listing_created_at` | DATE | Creation date |
| `listing_active` | BOOLEAN | Is active |
| `gcs_active` | BOOLEAN | GCS active |
| `address_city` | STRING | City |
| `address_state` | STRING | State |
| `address_country` | STRING | Country |
| `accommodates` | FLOAT | Guest capacity |
| `bedrooms` | FLOAT | Bedrooms |
| `bathrooms` | FLOAT | Bathrooms |

### 4.11. fact_reservations (reservations)

**BigQuery table:** `guesty-data.guesty_analytics.fact_reservations`

Links via **account_id** (dim_accounts), **listing_id** (dim_listings).

**Key columns:**

| Column | Type | Notes |
|--------|------|-------|
| `reservation_id` | STRING | Reservation identifier — PK |
| `account_id` | STRING | Join to dim_accounts.account_id |
| `listing_id` | STRING | Join to dim_listings.listing_id |
| `guest_name` | STRING | Guest name |
| `guest_email` | STRING | Guest email |
| `status` | STRING | Reservation status |
| `created_at` | TIMESTAMP | Creation time |
| `check_in` | DATE | Check-in date |
| `check_out` | DATE | Check-out date |
| `nights_count` | FLOAT | Number of nights |
| `fee_host_payout_usd` | FLOAT | Host payout in USD |
| `point_of_sale` | STRING | Channel/OTA |

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Salesforce
Node policy: Prefer the Salesforce node for direct operations (Get, Get All, Search/SOQL). Use BigQuery only for cross-source joins or warehouse-only aggregations.
Read-only: Use only Get, Get all, or Search (SOQL). No create, update, upsert, or delete.
Node Type: Prefer Salesforce node. BigQuery node for cross-source joins only.
Credential Type: Salesforce OAuth2 API; or Google Service Account API (BQ).
Credentials: Provided per-department in conversation context.
Key linking field: sf_account.Guesty_Admin_ID__c = dim_accounts.account_id (Guesty internal ID).
BQ datasets:
  - salesforce.* (raw SF mirrors): sf_account (736 cols), sf_opportunity, sf_lead, sf_contact, sf_risk_log, sf_task, sf_onboarding, sf_users
  - guesty_analytics.* (processed): dim_accounts, dim_listings, fact_reservations
Linkage: sf_account.Id = dim_accounts.sf_account_id. dim_accounts.account_id = Zendesk tickets_clean.account_id = Zuora invoices.mongo_account_id ⚠️ = Jira UNNEST(jira_hierarchy.account_ids). dim_accounts.sf_account_id = Modjo account_crm_id.
Native node fields: Account (Name, Guesty_Admin_ID__c, Recent_Health_Score_Num__c, Average_MRR__c); Task (Subject, ActivityDate). See section 5.
Query: Apply date and status filters; use SOQL LIMIT; limit per run.
```

---

## 5. n8n Salesforce node reference

*Source: n8n Salesforce node documentation. Use this when building workflows with the native Salesforce node.*

### Operations

- **Account**
  - Add note to an account
  - Create an account
  - Create a new account, or update the current one if it already exists (upsert)
  - Get an account
  - Get all accounts
  - Returns an overview of account's metadata
  - Delete an account
  - Update an account
- **Attachment**
  - Create an attachment
  - Delete an attachment
  - Get an attachment
  - Get all attachments
  - Returns an overview of attachment's metadata
  - Update an attachment
- **Case**
  - Add a comment to a case
  - Create a case
  - Get a case
  - Get all cases
  - Returns an overview of case's metadata
  - Delete a case
  - Update a case
- **Contact**
  - Add lead to a campaign
  - Add note to a contact
  - Create a contact
  - Create a new contact, or update the current one if it already exists (upsert)
  - Delete a contact
  - Get a contact
  - Returns an overview of contact's metadata
  - Get all contacts
  - Update a contact
- **Custom Object**
  - Create a custom object record
  - Create a new record, or update the current one if it already exists (upsert)
  - Get a custom object record
  - Get all custom object records
  - Delete a custom object record
  - Update a custom object record
- **Document**
  - Upload a document
- **Flow**
  - Get all flows
  - Invoke a flow
- **Lead**
  - Add lead to a campaign
  - Add note to a lead
  - Create a lead
  - Create a new lead, or update the current one if it already exists (upsert)
  - Delete a lead
  - Get a lead
  - Get all leads
  - Returns an overview of Lead's metadata
  - Update a lead
- **Opportunity**
  - Add note to an opportunity
  - Create an opportunity
  - Create a new opportunity, or update the current one if it already exists (upsert)
  - Delete an opportunity
  - Get an opportunity
  - Get all opportunities
  - Returns an overview of opportunity's metadata
  - Update an opportunity
- **Search**
  - Execute a SOQL query that returns all the results in a single response
- **Task**
  - Create a task
  - Delete a task
  - Get a task
  - Get all tasks
  - Returns an overview of task's metadata
  - Update a task
- **User**
  - Get a user
  - Get all users

### Native node — Resources and fields (Account, Task)

When using the **Salesforce node** with **Account** or **Task**, use only the following field names (standard and custom) per resource. Use these exact API names in Additional Fields, SOQL, or mapping.

#### Resource: Account

| Field | Type | Notes |
|-------|------|--------|
| Name | Standard | Account name |
| Guesty_Admin_ID__c | Custom | |
| Main_Contact_Email__c | Custom | |
| Account_Owner_Sentiment__c | Custom | |
| Months_in_Service__c | Custom | |
| Number_of_Active_Listed_Listings__c | Custom | |
| Average_MRR__c | Custom | |
| MTD_Revenue__c | Custom | |
| Last_Month_Revenue__c | Custom | |
| Last_Call_Date__c | Custom | |
| Onboarding_Status__c | Custom | |
| Recent_Health_Score__c | Custom | |

**SOQL example (Account):**
`SELECT Id, Name, Guesty_Admin_ID__c, Main_Contact_Email__c, Account_Owner_Sentiment__c, Months_in_Service__c, Number_of_Active_Listed_Listings__c, Average_MRR__c, MTD_Revenue__c, Last_Month_Revenue__c, Last_Call_Date__c, Onboarding_Status__c, Recent_Health_Score__c FROM Account LIMIT 100`

#### Resource: Task

| Field | Type | Notes |
|-------|------|--------|
| LastModifiedDate | Standard | |
| TaskSubtype | Standard | |
| Subject | Standard | |
| Description | Standard | |
| CreatedDate | Standard | |
| ActivityDate | Standard | |
| Response_Status_CP__c | Custom | |

**SOQL example (Task):**
`SELECT Id, LastModifiedDate, TaskSubtype, Subject, Description, CreatedDate, ActivityDate, Response_Status_CP__c FROM Task LIMIT 100`

Use only these fields when configuring the native Salesforce node for Account or Task. For other resources (Contact, Lead, etc.) resolve field names from Salesforce setup or intake packet.

### Working with Salesforce custom fields

To add custom fields to your request:

1. Select **Additional Fields** > **Add Field**.
2. In the dropdown, select **Custom Fields**.

You can then find and add your custom fields.

### SOQL Query Configuration

When performing a read operation via SOQL, use this exact configuration:

- **Resource**: `search`
- **Operation**: `query`

**Example JSON Parameters (Salesforce node — SOQL uses Salesforce API field names):**

```json
{
  "resource": "search",
  "operation": "query",
  "query": "SELECT Id, Name FROM Account LIMIT 100"
}
```

For **BigQuery** queries use section 4 schema field names (e.g. account_id, account_name, sf_account_id).

---

## 6. BigQuery: Common Query Patterns & Best Practices

### Key columns quick reference

| Column | Table | Notes |
|--------|-------|-------|
| `account_id` | `dim_accounts` | Primary Guesty account ID |
| `sf_account_id` | `dim_accounts` | Salesforce 18-char Account ID |
| `account_active` | `dim_accounts` | Filter: `WHERE account_active = TRUE` |
| `csm` | `dim_accounts` | Customer Success Manager name |
| `avg_mrr` | `dim_accounts` | Average MRR |
| `Guesty_Admin_ID__c` | `sf_account` | Guesty account_id in SF table |
| `Id` | `sf_account` | SF Account Id (= dim_accounts.sf_account_id) |
| `listing_id` | `dim_listings` | Listing identifier |
| `reservation_id` | `fact_reservations` | Reservation identifier |
| `check_in` / `check_out` | `fact_reservations` | DATE fields |

### Common SQL patterns

```sql
-- Accounts with ticket and call counts (3-source join via dim_accounts)
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

-- SF Account details enriched with dim_accounts metrics
SELECT
  sf.Id AS sf_id,
  sf.Name,
  sf.Status__c,
  sf.Package__c,
  sf.Average_MRR__c,
  sf.Recent_Health_Score_Num__c,
  sf.Account_Owner_Sentiment__c,
  da.active_listings,
  da.months_in_guesty,
  da.is_churn
FROM `guesty-data.salesforce.sf_account` sf
JOIN `guesty-data.guesty_analytics.dim_accounts` da
  ON sf.Guesty_Admin_ID__c = da.account_id
WHERE da.account_active = TRUE
  AND sf.Average_MRR__c > 100
ORDER BY sf.Average_MRR__c DESC
LIMIT 50;

-- Opportunity pipeline by stage
SELECT
  o.StageName,
  COUNT(*) AS opp_count,
  SUM(o.Amount) AS total_amount,
  AVG(o.Probability) AS avg_probability
FROM `guesty-data.salesforce.sf_opportunity` o
WHERE o.IsClosed = FALSE
GROUP BY o.StageName
ORDER BY total_amount DESC;

-- Risk log with account context
SELECT
  r.Name AS risk_name,
  r.Risk_Type__c,
  r.Risk_Level__c,
  r.Status__c,
  r.Date__c,
  sf.Name AS account_name,
  sf.Average_MRR__c
FROM `guesty-data.salesforce.sf_risk_log` r
JOIN `guesty-data.salesforce.sf_account` sf
  ON r.Account__c = sf.Id
WHERE r.Status__c != 'Closed'
ORDER BY r.Date__c DESC;

-- Reservations with listing details (last 30 days)
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

-- Resolve OwnerId to user name (SF-only fallback — see CSM lookup rule below)
-- ⚠️ Use this ONLY when the workflow has no BQ data source from the CSM dataset.
-- If your workflow already queries dim_accounts, csm.portfolio, csm.health_score,
-- csm.csm_churn_report, csm.mrr_calculator, or csm.segmentation_report — those
-- tables already have a `csm` column. Use it directly instead of this join.
-- See `02_SRC_CSM_Spec.md` "CSM / Account Owner Lookup Rule" for the full rule.
SELECT
  sf.Name AS account_name,
  u.Name AS owner_name,
  u.Department
FROM `guesty-data.salesforce.sf_account` sf
JOIN `guesty-data.salesforce.sf_users` u
  ON sf.OwnerId = u.Id
WHERE u.IsActive = TRUE;
```

### Filters & limits
- Always filter `WHERE account_active = TRUE` for current customers (dim_accounts)
- Date filter on reservations: use `check_in` or `created_at`
- Use `LIMIT` during exploration; remove for production aggregations
- sf_account has 736 columns — always SELECT specific fields, never SELECT *
- Join sf_account to dim_accounts via `Guesty_Admin_ID__c = account_id` or `Id = sf_account_id`
- **CSM / account owner lookups**: prefer the `csm` column from any BQ table already in your workflow (`dim_accounts`, `csm.portfolio`, etc.). Only use the `OwnerId` → `sf_users.Name` resolution above when the workflow has no BQ data source. The two sources represent different concepts (CS-team CSM vs SF account owner) and disagree on ~80% of accounts — they are NOT interchangeable. See `02_SRC_CSM_Spec.md` for the full rule.
- Boolean columns (IsClosed, IsWon, IsActive, account_active, is_churn) may be NULL in BigQuery — use `IFNULL(col, FALSE) = FALSE` instead of `col = FALSE`
