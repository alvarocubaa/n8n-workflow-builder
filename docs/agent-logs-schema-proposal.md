# Proposed `agent_logs` schema — builder-native usage telemetry

**Status:** Proposal for BI collaboration · **Created:** 2026-07-13
**Context:** BI + builder agreed the builder writes usage telemetry natively (not via per-analyst n8n snippets). This is the runtime/usage half of the two-way exchange — BI supplies context (the data dictionary), the builder supplies usage. Pairs with [bi-dictionary-integration.md](bi-dictionary-integration.md).

## Why builder-native

The builder already holds, per interaction, everything BI wants — no snippet injection needed:

| Field BI wants | Where the builder already has it |
|---|---|
| user email | IAP SSO identity (injected per request) |
| input prompt | the chat message |
| department | department scope (`departments.ts`) |
| success status | tool-loop outcome / `stop_reason` |
| satisfaction | the 👍/👎 feedback UI |
| token cost | `TokenUsage` already tracked in `claude.ts` |
| which tools ran | `turnToolCalls` already tracked in `claude.ts` |

## Proposed DDL

```sql
-- One row per completed builder chat turn. Written by the chat-ui backend.
-- NOTE: a DEDICATED dataset (e.g. genbi_logs), NOT guesty_analytics — the builder SA
-- needs dataEditor (write) on this dataset, and we must not give it write access to
-- BI's curated marts. Keep logs physically separate from the dictionary/marts.
CREATE TABLE IF NOT EXISTS `guesty-data.genbi_logs.agent_logs` (
  log_id           STRING    NOT NULL,  -- uuid per turn (feedback updates key on this)
  ts               TIMESTAMP NOT NULL,  -- turn completion (UTC)
  conversation_id  STRING,              -- Firestore conversation id (groups turns)
  user_email       STRING,              -- IAP SSO identity
  department       STRING,              -- 'cs' | 'finance' | ...
  assistant_mode   STRING,              -- 'builder' | 'data'
  prompt           STRING,              -- user request text
  status           STRING,              -- 'success' | 'error' | 'truncated'
  workflow_built   BOOL,                -- produced workflow JSON?
  deployed         BOOL,                -- deployed to n8n?
  workflow_id      STRING,              -- n8n workflow id, if deployed
  tools_used       ARRAY<STRING>,       -- tool calls this turn
  bi_tables_used   ARRAY<STRING>,       -- BI marts loaded via get_bi_table  ← measures dictionary ROI
  feedback         STRING,              -- 'up' | 'down' | NULL (filled async)
  feedback_comment STRING,              -- optional free text
  input_tokens     INT64,
  output_tokens    INT64,
  model            STRING,
  latency_ms       INT64
)
PARTITION BY DATE(ts)
CLUSTER BY department, user_email;
```

## Design notes to align on

1. **`bi_tables_used` closes the ROI loop.** It records exactly which BI marts the builder loaded, so BI can measure how often the dictionary is actually used — direct evidence for the GenBI ROI story, and it tells BI which tables to prioritize documenting next.
2. **Feedback is asynchronous — LOCKED: immutable appends** (Shimon, 2026-07-16). No `UPDATE`s (BQ DML quotas). When 👍/👎 arrives, append a NEW row with the same `log_id` + feedback payload. BI reads latest-state via `ROW_NUMBER() OVER (PARTITION BY log_id ORDER BY ts DESC)`.
   - ⚠️ **Open detail for the sync-up:** a whole-row `ROW_NUMBER = 1` picks the *entire* latest row — so a feedback row carrying only `feedback` + NULLs would blank the original `prompt`/`tools`/etc. in the view. Two clean options: (a) the builder **re-emits the full original row** + feedback on the feedback event (needs us to hold the row / read it back), or (b) BI's view **coalesces per column** (`LAST_VALUE(... IGNORE NULLS)`) instead of whole-row-latest. Pick one before we wire the feedback path.
3. **Location/project — use a dedicated dataset.** Put `agent_logs` in its own dataset (e.g. `guesty-data.genbi_logs`), NOT in `guesty_analytics`. The builder SA needs `dataEditor` (write) on the logs dataset; scoping it to a dedicated dataset keeps that write grant away from BI's curated marts. (dataViewer on `guesty_analytics` for reads stays as-is.)
4. **PII / retention — LOCKED: no retention cap** (Shimon, 2026-07-16). Internal SSO usage; kept for adoption trends, audits, per-department/user value analysis. No partition expiry.
5. **Write path.** Builder backend does a single streaming insert per turn (BQ `insertAll`), non-blocking, best-effort (a logging failure must never fail a build). Append-only — already compatible with the immutable model.

## Decisions (resolved 2026-07-16, Shimon/BI)
- ✅ **Immutable appends**, not UPDATEs. Feedback = new row, same `log_id`.
- ✅ **No retention cap.**
- ✅ BI creating dataset + table + IAM grant to the builder SA today (Igor approved).
- 🔲 **To lock in the 20-min sync:** feedback-row shape (full re-emit vs. per-column coalescing view — see note 2), dedicated dataset name, and go-live sequence (grant → set `AGENT_LOGS_TABLE` → redeploy).

## Writer status — implemented, dormant

The builder-side writer is **already built and shipped inert** (`chat-ui/src/lib/agent-logs.ts`, wired into the chat route). It emits one row per turn — on success, truncation, and error — reusing the existing analytics data (email, department, mode, tools, tokens, latency) plus `prompt`, `status`, `workflow_built`, and `bi_tables_used`.

It is a **no-op until `AGENT_LOGS_TABLE` is set**. To turn it on once the table exists:

1. BI creates the table in a dedicated dataset (DDL above; e.g. `genbi_logs`).
2. Grant the builder SA `n8n-workflow-builder@agentic-workflows-485210` `roles/bigquery.dataEditor` on that **logs** dataset (not `guesty_analytics`).
3. Add to the chat-ui Cloud Run env: `AGENT_LOGS_TABLE=guesty-data.genbi_logs.agent_logs`, redeploy.

Not yet populated (follow-ups): `deployed` / `workflow_id` (instrument the `/api/deploy` endpoint) and `feedback` (async update from the 👍/👎 UI). `workflow_built` is inferred from the reply containing n8n workflow markers.
