# Siit — Data Source Spec (n8n / AI)

This document gives **exact** connection, schema, and query details so the AI does not guess credential names or field names. Use it to generate runnable n8n JSON.

---

## 1. Node & Credential Type Mapping

| Path | Credential Type | Node |
|------|----------------|------|
| Siit API | `httpHeaderAuth` or `oAuth2Api` | HTTP Request node |

| Item | Value |
|------|--------|
| **Auth Type** | API Key (header) or OAuth2 — confirm with Siit API docs. |
| **Node Type** | **HTTP Request** (no native Siit node in standard n8n). |
| **Credentials** | Specific credential names and IDs are provided per-department in the conversation context. |

---

## 2. Object & Field Schema (Source of Truth)

- **Primary key / linkage**: Siit entity id (e.g. booking id, reservation id). Document in the intake packet or project documentation how this links to other systems (e.g. property id, guest id).
- **API field names**: Use exact property names from Siit API responses (not UI labels). Custom fields if any use Siit's naming.
- **Data types**: String, Number, Date, Boolean, Enum per API. Document in the intake packet or project documentation.

---

## 3. Query Constraints & Filters

- **Date ranges**: Bound queries by date (e.g. check-in/check-out, created_at, updated_at) to avoid timeouts.
- **Status filters**: e.g. only confirmed bookings; exclude cancelled.
- **Limits**: Use pagination if available; set max records per run.
- **Property / scope**: Filter by property id or account when the API supports it.

---

## 4. API Endpoints (When Using HTTP Request)

| Item | Value |
|------|--------|
| **Base URL** | `https://api.siit.io/` (or current production base from Siit docs). |
| **Endpoints** | Document in this section: e.g. GET /bookings, GET /properties, GET /reservations/{id}. Paste exact paths and query params. |
| **Response structure** | Paste a small JSON snippet so the AI knows how to map fields (e.g. `data`, `items`, nested objects). |

**Example (replace with real Siit response shape):**

```json
{
  "data": [
    { "id": "...", "property_id": "...", "status": "confirmed" }
  ]
}
```

---

## Data Source Spec (copy into Gem / instructions)

```
Data Source: Siit
Node Type: HTTP Request.
Credential: SIIT_API_PROD.
Auth Type: API Key or OAuth2 (per Siit docs).
Base URL: [Set from Siit API docs]
Linkage: Document primary id and cross-system key in intake packet or project documentation. Cross-source joins: No BQ/warehouse tables in this spec. Jira: no standard account key; link per intake (e.g. property/account id if available). See Jira spec section 2.2. Other links per intake or project documentation.
Query: Apply date and status filters; paginate; limit per run.
```
