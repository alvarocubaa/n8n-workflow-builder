# Gus — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Gus API | `httpHeaderAuth` or `oAuth2Api` | HTTP Request node |

| Item | Value |
|------|--------|
| **Auth Type** | API Key (header) or OAuth2 — confirm with Gus API docs. |
| **Node Type** | **HTTP Request** (no native Gus node in standard n8n). |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: Gus entity id (e.g. listing id, unit id, account id). Document in the intake packet or project documentation how this links to other systems. **Join to Jira**: when **account_id** is exposed, account_id = *unnested* jira_hierarchy.**account_ids**. See Jira spec section 2.2.
- **API field names**: Use exact property names from Gus API responses (not UI labels). Custom fields use Gus naming.
- **Data types**: String, Number, Date, Boolean, Enum per API. Document in the intake packet or project documentation.

---

## 3. Query Constraints & Filters

- **Date ranges**: Bound queries by date (e.g. created_at, updated_at, availability window) to avoid timeouts.
- **Status filters**: e.g. only active listings; exclude archived.
- **Limits**: Use pagination if available; set max records per run.
- **Scope**: Filter by account, property, or region when the API supports it.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | [Set from Gus API docs, e.g. https://api.gus.com/v1/] |
| **Endpoints** | Document: e.g. GET /listings, GET /units, GET /accounts. Include query params for filter/pagination. |
| **Response structure** | Paste a small JSON snippet so the AI knows how to map fields. |

**Example (replace with real Gus response shape):**

```json
{
  "results": [
    { "id": "...", "name": "...", "status": "active" }
  ]
}
```

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Gus
Node Type: HTTP Request.
Credential: GUS_API_PROD.
Auth Type: API Key or OAuth2 (per Gus docs).
Base URL: [Set from Gus API docs]
Linkage: Document primary id and cross-system key in intake packet or project documentation. Cross-source joins: No BQ/warehouse tables in this spec. Jira: when account_id is available, account_id IN UNNEST(jira_hierarchy.account_ids). Other links per intake or project documentation. See Jira spec section 2.2.
Query: Apply date and status filters; paginate; limit per run.
```
