# n8n Builder — Company Specs Manifest

This folder (`specs/`) is the single source of truth for **Guesty-specific facts**:
API names, field schemas, credential names, node policies, and BigQuery table paths.

**n8n skills** (expression syntax, code nodes, validation, workflow patterns) live in
`n8n-skills/skills/` and are loaded on demand via the `get_n8n_skill()` tool.

---

## 🚨 Knowledge Hierarchy (Non-Negotiable)

```
02_SRC_* company specs  >  n8n skills  >  general n8n knowledge
```

- **Specs define facts** — field names, credential names, table paths, node policies
- **Skills define implementation** — syntax, patterns, validation rules
- When sources conflict: the spec wins

---

## 🔐 01. Infrastructure

| File | Purpose |
|------|---------|
| `01_INFRA_Credentials_Guide.md` | Canonical credential names for all systems — use exact names, never invent |

---

## 📋 02. Integration Specs (Highest Authority)

One file per system. Each contains: native node type, field schema, credential names,
node policy (read-only vs write), BigQuery table paths, and cross-source join conditions.

| File | System | BigQuery tables |
|------|--------|-----------------|
| `02_SRC_Salesforce_Spec.md` | Salesforce CRM | `guesty-data.guesty_analytics.dim_accounts`, `dim_listings`, `fact_reservations` |
| `02_SRC_Zendesk_Spec.md` | Zendesk Support | `guesty-data.zendesk_analytics.tickets_clean`, `productivity_hourly` |
| `02_SRC_Jira_Spec.md` | Jira | `guesty-data.jira.jira_hierarchy` (+ 10 other tables) |
| `02_SRC_Hubspot_Spec.md` | HubSpot CRM | API only — no BigQuery |
| `02_SRC_Modjo_Spec.md` | Modjo (call intelligence) | `guesty-data.csm.modjo_transcripts_structured` |
| `02_SRC_Zuora_Spec.md` | Zuora (billing) | `guesty-data.zuora_analytics.invoices`, `invoice_items`, `product_catalog` |
| `02_SRC_Hibob_Spec.md` | HiBob (HR) | API only — no BigQuery |
| `02_SRC_AdminData_Spec.md` | Admin Data (internal) | `guesty-data.datalake_glue.accounts` |
| `02_SRC_Gus_Spec.md` | Gus (internal chat) | API only — no BigQuery |
| `02_SRC_Siit_Spec.md` | Siit (ITSM) | API only — no BigQuery |

**⚠️ Critical join warning:** Zuora `invoices.mongo_account_id` = Guesty account_id.
`invoices.account_id` is Zuora's internal ID — never use it for cross-source joins.

---

## 🔗 03. Cross-Source Joins

| File | Purpose |
|------|---------|
| `03_JOIN_MAP.md` | Universal join key reference — all sources to Guesty account_id, UNNEST patterns, multi-source examples |

---

## 🛑 Core Rules

1. **Credential names** — use exact names from `01_INFRA_Credentials_Guide.md`; never invent
2. **Field names** — use exact names from the `02_SRC_` spec; never guess
3. **BigQuery paths** — use exact `guesty-data.<dataset>.<table>` paths above; no other project names
4. **Node policy** — if a spec says read-only, refuse write operations and explain
5. **No fabrication** — if a field isn't in the spec, use `REPLACE_WITH_FIELD_NAME` and ask
