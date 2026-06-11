# Session K-2: Spec Enrichment + Token Analytics

**Date**: Apr 1, 2026
**Trigger phrase**: "Let's run the next session this patch"
**Parallel with**: Session K-1 (regression running on localhost — do NOT restart Docker, deploy, or edit chat-ui code)

---

## Context

Session K-1 (same day) made code changes for v0.23-prep and is running a full regression. This session handles independent work that touches ONLY `specs/`, `bigquery/`, and read-only Firestore queries — zero overlap with K-1.

---

## Task 1: CSM Spec Enrichment (HIGH — critical gap)

CSM is the biggest spec gap: 568 lines but lacks verified SQL examples. Users (especially CS and CX departments) ask for CSM-related queries and the AI has no reference patterns.

### Steps

1. **Read the current spec**: `specs/02_SRC_CSM_Spec.md` — understand what tables/columns are documented
2. **Read the BQ CLAUDE.md for setup**: `bigquery/CLAUDE.md`
3. **Query BigQuery** to discover CSM tables and verify column availability:
   - Use `execute_sql` MCP tool (or equivalent BQ access)
   - Run: `SELECT table_name FROM csm_analytics.INFORMATION_SCHEMA.TABLES` (or whichever dataset CSM uses — check the spec for the dataset name)
   - For each key table: `SELECT column_name, data_type FROM csm_analytics.INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'X'`
4. **Create `bigquery/csm.md`** — BQ reference doc with:
   - Dataset and table listing
   - Key columns per table
   - 2-3 verified SQL examples for common use cases (e.g., CSM assignment by account, CSM activity history, account health scores)
   - Join conditions to other datasets (check `specs/03_JOIN_MAP.md` for existing patterns)
5. **Add verified SQL examples to `specs/02_SRC_CSM_Spec.md`**:
   - Target: 2-3 verified SQL patterns
   - Follow the pattern in other specs (e.g., `specs/02_SRC_Zendesk_Spec.md` has `<verified_sql>` blocks)
   - Verify each query actually returns data before adding it

### Key gotchas (from CLAUDE.md)
- Boolean columns often NULL, not FALSE → use `IFNULL(col, FALSE)`
- EXISTS not supported in JOIN ON → use CTE + UNNEST
- BigQuery project: `guesty-data`
- Use `execute_sql` to run queries and verify results

---

## Task 2: Zuora + AdminData Spec Enrichment (MEDIUM)

Same pattern as CSM but lower priority. These specs exist (355 and 353 lines) but need verified SQL examples.

### Steps

1. **Read**: `specs/02_SRC_Zuora_Spec.md` and `bigquery/zuora.md` (already exists)
2. **Query BQ** for 2-3 common Zuora patterns:
   - Invoice totals by account
   - Subscription status by account
   - Revenue reconciliation (joins to SF via `mongo_account_id` — see JOIN_MAP.md)
3. **Add verified SQL** to the Zuora spec
4. **Read**: `specs/02_SRC_AdminData_Spec.md` and `bigquery/admin_data.md` (already exists)
5. **Query BQ** for 2-3 AdminData patterns
6. **Add verified SQL** to the AdminData spec

---

## Task 3: Monitor v0.22 Token Analytics (MEDIUM)

First real data since v0.22 deployment (Mar 27). Check if the 800K context window and 64K output tokens are working as expected.

### Steps

1. **Query Firestore** `analytics_events` collection for events since Mar 27:
   - Filter: `timestamp >= 2026-03-27`
   - Look for fields: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `truncated`
2. **Specific questions to answer**:
   - Are conversations running longer before context windowing triggers? (inputTokens should stay under 800K)
   - Any `truncated: true` events? (should be rare with 64K output)
   - Is prompt caching working? (cacheReadTokens should be ~7-8K for system prompt)
   - Average token usage per turn?
3. **Check for context windowing events**: Look for conversations where inputTokens exceeded the old 80K threshold — these would have been windowed before v0.22 but now run smoothly
4. **Write findings**: Add a "Token Analytics (v0.22)" section to `feedback-loop/STATE.md`

### How to query Firestore
Use the Firebase Admin SDK or the GCP console. Project: `agentic-workflows-485210`. Collection: `analytics_events`.

---

## Files you CAN edit

- `specs/02_SRC_CSM_Spec.md` — add verified SQL
- `specs/02_SRC_Zuora_Spec.md` — add verified SQL
- `specs/02_SRC_AdminData_Spec.md` — add verified SQL
- `bigquery/csm.md` — NEW file (create it)
- `feedback-loop/STATE.md` — add token analytics findings

## Files you MUST NOT edit (K-1 owns these)

- `chat-ui/src/lib/*` (system-prompt.ts, claude.ts, departments.ts)
- `chat-ui/src/components/*` (MessageBubble.tsx)
- `tools/test_cases.yaml`
- `tools/scan_credentials.ts`
- Docker / deployment (regression running on localhost)

---

## Definition of Done

- [ ] `bigquery/csm.md` created with table schemas and join conditions
- [ ] `specs/02_SRC_CSM_Spec.md` has 2-3 verified SQL examples in `<verified_sql>` blocks
- [ ] `specs/02_SRC_Zuora_Spec.md` has 2-3 verified SQL examples (if time)
- [ ] `specs/02_SRC_AdminData_Spec.md` has 2-3 verified SQL examples (if time)
- [ ] Token analytics findings documented in `feedback-loop/STATE.md`
- [ ] No chat-ui code or Docker touched
