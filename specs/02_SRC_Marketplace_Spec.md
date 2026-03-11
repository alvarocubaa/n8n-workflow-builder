# Marketplace Partners, Add-Ons & Integrations Spec

> Use this spec when the user asks about: marketplace partners, add-ons, apps, integrations,
> channel connections (Airbnb, Booking.com, VRBO, etc.), upsell opportunities, or partner usage.

## 1. Table Overview

| Logical table | Full BigQuery path | Rows | Purpose |
|---|---|---|---|
| marketplace_partners | `guesty-data.datalake_glue.marketplace_partners` | ~464 | Catalog of all marketplace partners (PriceLabs, Minut, RemoteLock, etc.) |
| marketplace_integrations | `guesty-data.datalake_glue.marketplace_integrations` | ~83K | Which accounts use which marketplace partner apps (account-partner link) |
| dim_applications | `guesty-data.guesty_analytics.dim_applications` | ~22M | All installed apps/add-ons per account with category and type |
| integration_accounts | `guesty-data.datalake_glue.integration_accounts` | ~27K | Account-partner relationships with Guesty integration IDs |
| integrations | `guesty-data.datalake_glue.integrations` | ~424K | Channel integrations per account (Airbnb, Booking.com, etc.) with status and sync info |
| dim_channel_integrations | `guesty-data.guesty_analytics.dim_channel_integrations` | ~302K/day | Analytics-ready: channel connections per account with listing counts (partitioned by date) |
| dim_listing_integrations | `guesty-data.guesty_analytics.dim_listing_integrations` | large | Per-listing channel connection details (partitioned by date) |
| listings_integrations | `guesty-data.datalake_glue.listings_integrations` | — | Per-listing integration array (nested STRUCT) |

## 2. Table Schemas

### 2.1. marketplace_partners (Partner Catalog)

**BigQuery table:** `guesty-data.datalake_glue.marketplace_partners`

| Column | Type | Notes |
|---|---|---|
| `_id` | STRING | Partner ID (PK) |
| `name` | STRING | Partner name (e.g., "PriceLabs", "RemoteLock", "Lighthouse") |
| `category` | STRING | Always "PARTNERS" |
| `partnertype` | STRING | "INTEGRATED" or "COMMUNITY" |
| `type` | STRING | Partner type key (uppercase, e.g., "PRICELABS", "REMOTELOCK") |
| `active` | BOOL | Is the partner currently active in the marketplace |
| `description` | STRING | Partner description |
| `tags` | ARRAY\<STRING\> | Categorization tags |
| `isdeleted` | BOOL | Soft delete flag (use IFNULL(isdeleted, FALSE) = FALSE) |
| `poweredby` | STRING | "Powered by" attribution |

### 2.2. marketplace_integrations (Account-Partner Links)

**BigQuery table:** `guesty-data.datalake_glue.marketplace_integrations`

> **This is the key table for "which accounts use which marketplace partners."**

| Column | Type | Notes |
|---|---|---|
| `_id` | STRING | Integration ID (PK) |
| `accountid` | STRING | **Guesty account_id** (joins to datalake_glue.accounts._id) |
| `partnerid` | STRING | Partner ID (joins to marketplace_partners._id) |
| `applicationid` | STRING | Application ID |
| `active` | BOOL | Is this integration currently active |
| `expiredat` | NUMERIC | Expiration timestamp (0 = never expires) |

**Verified SQL -- Accounts using a specific partner:**
```sql
SELECT mi.accountid, mp.name AS partner_name, mi.active
FROM `guesty-data.datalake_glue.marketplace_integrations` mi
JOIN `guesty-data.datalake_glue.marketplace_partners` mp ON mi.partnerid = mp._id
WHERE mp.name = 'PriceLabs'
  AND mi.active = TRUE
```

**Verified SQL -- All active partners per account:**
```sql
SELECT mi.accountid, mp.name AS partner_name, mp.partnertype, mp.type
FROM `guesty-data.datalake_glue.marketplace_integrations` mi
JOIN `guesty-data.datalake_glue.marketplace_partners` mp ON mi.partnerid = mp._id
WHERE mi.active = TRUE
  AND IFNULL(mp.isdeleted, FALSE) = FALSE
  AND mp.active = TRUE
ORDER BY mi.accountid, mp.name
```

### 2.3. dim_applications (Apps/Add-Ons per Account)

**BigQuery table:** `guesty-data.guesty_analytics.dim_applications`

> **This is the most comprehensive add-on/app table.** Contains all installed applications
> per account, including category, type, and permissions.

| Column | Type | Notes |
|---|---|---|
| `integration_id` | STRING | Integration instance ID |
| `app_id` | STRING | Application ID |
| `account_id` | STRING | **Guesty account_id** |
| `app_name` | STRING | Application name (e.g., "PriceLabs", "AcroCharge", "Agoda") |
| `active` | BOOL | Is this app currently active for the account |
| `created_at` | TIMESTAMP | When the app was installed |
| `app_category` | STRING | Category: "partners", "operations", "channels_and_ota", "insurance_and_fraud_prevention", etc. |
| `app_type` | STRING | Type key (uppercase, e.g., "PRICELABS", "AGODA") |
| `app_role` | STRING | App role/permissions level |
| `app_permissions` | STRING | Granted permissions |
| `app_description` | STRING | App description |
| `partition_date` | DATE | **Partition key -- REQUIRED in WHERE clause** |

**Verified SQL -- All active apps for an account:**
```sql
SELECT app_name, app_category, app_type, active, created_at
FROM `guesty-data.guesty_analytics.dim_applications`
WHERE account_id = 'ACCOUNT_ID_HERE'
  AND partition_date = CURRENT_DATE()
  AND active = TRUE
ORDER BY app_name
```

**Verified SQL -- Accounts using a specific app type:**
```sql
SELECT account_id, app_name, app_category, created_at
FROM `guesty-data.guesty_analytics.dim_applications`
WHERE partition_date = CURRENT_DATE()
  AND app_type = 'PRICELABS'
  AND active = TRUE
```

### 2.4. dim_channel_integrations (Channel Connections)

**BigQuery table:** `guesty-data.guesty_analytics.dim_channel_integrations`

> Active OTA/channel connections (Airbnb, Booking.com, VRBO, Expedia, etc.) per account.

| Column | Type | Notes |
|---|---|---|
| `integration_id` | STRING | Integration instance ID |
| `account_id` | STRING | **Guesty account_id** |
| `channel_name` | STRING | Channel: "Airbnb_official", "Booking_Com", "vrboLite", "Home_Away", "expedia", etc. |
| `integration_active` | BOOL | Is this channel connection active |
| `integration_status` | STRING | Connection status |
| `integration_created_at` | TIMESTAMP | When connected |
| `integration_actived_at` | TIMESTAMP | When activated |
| `integration_last_synced` | TIMESTAMP | Last sync time |
| `num_connected_listings` | INT64 | Number of listings connected to this channel |
| `credentials_username` | STRING | Channel account username |
| `integration_nickname` | STRING | User-given nickname |
| `partition_date` | DATE | **Partition key -- REQUIRED in WHERE clause** |

**Top channels by account count:** Airbnb (42K), Booking.com (16K), VRBO (14K), HomeAway (9K), Expedia (4K), Google VR (3K)

**Verified SQL -- Channel connections for an account:**
```sql
SELECT channel_name, integration_active, num_connected_listings, integration_last_synced
FROM `guesty-data.guesty_analytics.dim_channel_integrations`
WHERE account_id = 'ACCOUNT_ID_HERE'
  AND partition_date = CURRENT_DATE()
  AND integration_active = TRUE
ORDER BY num_connected_listings DESC
```

### 2.5. integration_accounts (Account-Partner with Guesty Integration)

**BigQuery table:** `guesty-data.datalake_glue.integration_accounts`

| Column | Type | Notes |
|---|---|---|
| `_id` | STRING | Record ID (PK) |
| `accountid` | STRING | Guesty account_id (legacy field) |
| `guestyAccountId` | STRING | Guesty account_id (preferred -- same value as accountid) |
| `partnerId` | STRING | Partner ID (joins to marketplace_partners._id) |
| `guestyIntegrationId` | STRING | Guesty-side integration ID |
| `createdAt` | TIMESTAMP | Created timestamp |
| `updatedAt` | TIMESTAMP | Updated timestamp |

### 2.6. integrations (Raw Channel Integrations)

**BigQuery table:** `guesty-data.datalake_glue.integrations`

| Column | Type | Notes |
|---|---|---|
| `_id` | STRING | Integration ID (PK) |
| `accountid` | STRING | **Guesty account_id** |
| `platform` | STRING | Channel platform name |
| `active` | BOOL | Is integration active |
| `status` | STRING | Integration status |
| `applicationId` | STRING | Application ID |
| `channelId` | STRING | Channel identifier |
| `listings` | ARRAY\<STRUCT\<listingid STRING, externallistingid STRING\>\> | Connected listings with external IDs |
| `createdat` | TIMESTAMP | Created timestamp |
| `lastsynced_lasttimesynced` | TIMESTAMP | Last sync timestamp |

## 3. Join Conditions

| From | To | Join |
|---|---|---|
| marketplace_integrations.partnerid | marketplace_partners._id | Partner details |
| marketplace_integrations.accountid | datalake_glue.accounts._id | Account details |
| dim_applications.account_id | datalake_glue.accounts._id | Account details |
| dim_channel_integrations.account_id | datalake_glue.accounts._id | Account details |
| integration_accounts.accountid | datalake_glue.accounts._id | Account details |
| integration_accounts.partnerId | marketplace_partners._id | Partner details |
| Any account_id above | zendesk_analytics.tickets_clean.account_id | Tickets for that account |
| Any account_id above | guesty_analytics.dim_accounts.account_id | SF + analytics data |

## 4. Common Use Cases

### UC1: Upsell -- Find accounts using a partner's add-on (to offer Guesty's own)
```sql
-- Accounts using partner "PriceLabs" that could switch to Guesty's pricing tool
SELECT mi.accountid, a.company AS account_name, mp.name AS partner_name
FROM `guesty-data.datalake_glue.marketplace_integrations` mi
JOIN `guesty-data.datalake_glue.marketplace_partners` mp ON mi.partnerid = mp._id
JOIN `guesty-data.datalake_glue.accounts` a ON mi.accountid = a._id
WHERE mp.name = 'PriceLabs'
  AND mi.active = TRUE
```

### UC2: Tickets related to marketplace partner add-ons
```sql
-- Zendesk tickets from accounts using a specific partner
SELECT t.ticket_id, t.subject, t.ticket_status, t.created_at, mp.name AS partner_name
FROM `guesty-data.zendesk_analytics.tickets_clean` t
JOIN `guesty-data.datalake_glue.marketplace_integrations` mi ON t.account_id = mi.accountid
JOIN `guesty-data.datalake_glue.marketplace_partners` mp ON mi.partnerid = mp._id
WHERE mp.name = 'RemoteLock'
  AND mi.active = TRUE
  AND t.created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
ORDER BY t.created_at DESC
```

### UC3: Account's full integration landscape
```sql
-- All apps + channels for an account
SELECT 'app' AS source, app_name AS name, app_category AS category, active
FROM `guesty-data.guesty_analytics.dim_applications`
WHERE account_id = 'ACCOUNT_ID_HERE' AND partition_date = CURRENT_DATE()
UNION ALL
SELECT 'channel', channel_name, 'channel', integration_active
FROM `guesty-data.guesty_analytics.dim_channel_integrations`
WHERE account_id = 'ACCOUNT_ID_HERE' AND partition_date = CURRENT_DATE()
ORDER BY source, name
```

## 5. Key Gotchas

- **dim_applications** and **dim_channel_integrations** are **partitioned by `partition_date`** -- you MUST include `WHERE partition_date = CURRENT_DATE()` or the query will fail.
- **marketplace_partners.isdeleted** is often NULL, not FALSE. Use `IFNULL(isdeleted, FALSE) = FALSE`.
- **accountid vs account_id**: datalake_glue tables use `accountid` (no underscore). guesty_analytics tables use `account_id` (with underscore).
- The same partner can appear in multiple categories in dim_applications (e.g., "PriceLabs" appears under both "partners" and "operations").
- **listings_integrations** uses a nested STRUCT array for integrations -- requires UNNEST to query individual integrations per listing.

## 6. Quick Reference

```
Marketplace partners catalog:  datalake_glue.marketplace_partners
Which accounts use which partner: datalake_glue.marketplace_integrations (join partnerid -> marketplace_partners._id)
All apps/add-ons per account:   guesty_analytics.dim_applications (partition_date required)
Channel connections per account: guesty_analytics.dim_channel_integrations (partition_date required)
Account-partner link with IDs:  datalake_glue.integration_accounts
Raw channel integrations:       datalake_glue.integrations
```
