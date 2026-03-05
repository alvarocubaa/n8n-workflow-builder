# hiBob — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| HiBob API | `httpBasicAuth` | HTTP Request node |

| Item | Value |
|------|--------|
| **Auth Type** | Basic Auth. |
| **Node Type** | **HTTP Request node** only (no native hiBob node). |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: hiBob **employee id** or **work email** as unique identifier. Use for linkage to other HR or identity systems. **Join to Jira**: by person only — HiBob work email = jira_hierarchy.**PM** or **RND_TL** when those fields store email (no account-level join). See Jira spec section 2.2.
- **API field names**: Use exact property names from hiBob API (e.g. `id`, `firstName`, `lastName`, `work.email`, custom field names). Not UI labels.
- **Objects**: People/Employees, Departments, etc. Refer to hiBob API object model.
- **Data types**: String, Number, Date, Boolean, Enum. Match API schema.

---

## 3. Query Constraints & Filters

- **Date ranges**: Filter by hire date, last modified, or similar to bound queries.
- **Status filters**: e.g. only active employees; exclude terminated.
- **Limits**: Use pagination (page/size or cursor); set max records per run. Respect rate limits.
- **Department / scope**: Filter by department or location when supported.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://api.hibob.com/v1/` (or current version from hiBob docs). |
| **People** | e.g. `GET /people` (with pagination and filters). |
| **Single person** | `GET /people/{identifier}`. |
| **Response** | JSON; structure per hiBob API (e.g. `employees` array, nested objects). |

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: hiBob
Node Type: HTTP Request node (per 01_INFRA_Credentials_Guide.md).
Credential: **HiBob Service Account**. API: Basic Auth.
Linkage: Use employee id or work email as unique key. Cross-source joins: No BQ/warehouse tables in this spec. Jira: by person (work email = jira_hierarchy.PM or RND_TL when those store email). Other links per intake or project documentation.
Query: Apply status (e.g. active only) and date filters; paginate; limit per run.
```
