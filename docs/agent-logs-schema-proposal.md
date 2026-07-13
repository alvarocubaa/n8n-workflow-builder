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
CREATE TABLE IF NOT EXISTS `guesty-data.guesty_analytics.agent_logs` (
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
2. **Feedback is asynchronous.** 👍/👎 arrives after the turn, so `feedback`/`feedback_comment` land via an UPDATE keyed on `log_id` (or a separate append-only `agent_feedback` table if BI prefers immutable logs — open question).
3. **Location/project.** Proposed in `guesty-data.guesty_analytics` beside the dictionaries; open to a dedicated `genbi` dataset if BI wants logs separated from marts. The builder SA needs `dataEditor` on whichever dataset.
4. **PII.** `user_email` + `prompt` are personal data — confirm retention/access policy (partition expiry? row-level access?) before we start writing.
5. **Write path.** Builder backend does a single streaming insert per turn (BQ `insertAll`), non-blocking, best-effort (a logging failure must never fail a build).

## Open questions for BI
- Immutable append-only (+ separate feedback events) vs. mutable row with feedback UPDATE?
- Dataset/project + retention policy for prompt/email?
- Any fields to add for their side (cost attribution, team rollups)?

## Writer status — implemented, dormant

The builder-side writer is **already built and shipped inert** (`chat-ui/src/lib/agent-logs.ts`, wired into the chat route). It emits one row per turn — on success, truncation, and error — reusing the existing analytics data (email, department, mode, tools, tokens, latency) plus `prompt`, `status`, `workflow_built`, and `bi_tables_used`.

It is a **no-op until `AGENT_LOGS_TABLE` is set**. To turn it on once the table exists:

1. BI creates the table (DDL above).
2. Grant the builder SA `n8n-workflow-builder@agentic-workflows-485210` `roles/bigquery.dataEditor` on the target dataset.
3. Add to the chat-ui Cloud Run env: `AGENT_LOGS_TABLE=guesty-data.guesty_analytics.agent_logs` (in `deploy-cloudrun.sh`), redeploy.

Not yet populated (follow-ups): `deployed` / `workflow_id` (instrument the `/api/deploy` endpoint) and `feedback` (async update from the 👍/👎 UI). `workflow_built` is inferred from the reply containing n8n workflow markers.
