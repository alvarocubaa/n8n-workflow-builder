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
  log_id           STRING    NOT NULL,  -- uuid per turn (feedback appends key on this)
  ts               TIMESTAMP NOT NULL,  -- turn completion (UTC)
  agent_source     STRING    NOT NULL,  -- SYSTEM discriminator: 'workflow_builder' | 'genbi_slack' (per-agent granularity as needed)
  conversation_id  STRING,              -- groups turns in a session
  user_email       STRING,              -- SSO identity
  department       STRING,              -- 'cs' | 'finance' | ...
  agent_mode       STRING,              -- producer-internal sub-mode; builder: 'builder'|'data'; Slack agents: their own or NULL
  prompt           STRING,              -- user request text
  status           STRING,              -- 'success' | 'error' | 'truncated'
  workflow_built   BOOL,                -- builder-only (NULL for Slack agents)
  deployed         BOOL,                -- builder-only (phase 2: from deploy endpoint)
  workflow_id      STRING,              -- builder-only
  tools_used       ARRAY<STRING>,       -- builder-only
  bi_tables_used   ARRAY<STRING>,       -- builder: BI marts loaded = dictionary ROI (NULL for Slack agents)
  feedback         STRING,              -- 'up' | 'down' | NULL (async append)
  feedback_comment STRING,              -- optional free text
  input_tokens     INT64,
  output_tokens    INT64,
  model            STRING,
  latency_ms       INT64,
  metadata         JSON                 -- producer-specific extras (Slack agent: SQL run, source tables, channel; builder: future fields)
)
PARTITION BY DATE(ts)
CLUSTER BY department, user_email;
```

## Two producers, one table (2026-07-21 — BI wants a shared GenBI table)

BI (Shimon) will also log **GenBI Slack agents** (separate n8n workflows) into this table for a single unified ROI dashboard. To make that clean:

- **`agent_source` is the system discriminator** — `'workflow_builder'` (this app) vs `'genbi_slack'` (BI's agents). **Do not overload `assistant_mode` for this**: in the builder, `'builder'`/`'data'` are two modes of the *same* app (build vs. data-consultant) — they do NOT represent BI's Slack agents, which never touch the builder. Conflating them would silently mix the two systems in the dashboard. Renamed to `agent_mode` and made producer-internal.
- **Builder-only columns** (`workflow_built`, `workflow_id`, `tools_used`, `bi_tables_used`) are NULL for Slack-agent rows; `metadata JSON` carries each producer's own extras.
- **BI's write path:** their agents call a shared n8n sub-workflow that does the BQ append — good, and it lets us pin one canonical row shape. Both producers must set `agent_source` and use the same append/feedback convention.

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
