# Agent Infrastructure Assessment — June 2026

**Status:** Track C of the 2026-06-23 modernization session.
**Question answered:** "Did we build an agent with an ADK or what? What's our agent infra and how do we improve it?"

**TL;DR:** No ADK / LangChain / Agent SDK. It's a **hand-rolled streaming tool-use loop** over the Vertex AI Anthropic SDK — deliberately, and it's the right call for now. The highest-value improvement is **diff-based workflow editing** (the capability already exists in our MCP; it just isn't exposed). Keep the custom loop; add a regression safety net in CI; reconcile our Time-Saved signal with n8n's native Insights.

---

## 1. Current state (verified in code, not from memory)

### The loop
- **File:** `chat-ui/src/lib/claude.ts` → `streamWorkflowChat()`.
- **Shape:** a plain `while (true)` tool-use loop. No framework. Each turn: build messages → stream a Vertex call → collect text + tool_use blocks → dispatch tools → append `tool_result` → loop until the model stops requesting tools.
- **SDK / model:** `@anthropic-ai/vertex-sdk` (chat-ui also has `@anthropic-ai/sdk`), model `claude-sonnet-4-6` (env-overridable), Vertex region `us-east5`.
- **Inference params:** `max_tokens: 65536`, `temperature: 0.1` (near-deterministic), `stream: true`.
- **Prompt caching:** `cache_control: { type: 'ephemeral' }` on the system-prompt block — the reason the system prompt is kept static and per-department context is injected in the first user message.
- **Resilience:** retry with exponential backoff (`MAX_RETRIES=3`, delay `min(1000·2^n, 8000)ms`) on 429/503/529.
- **Context management:** `CONTEXT_TOKEN_THRESHOLD = 800_000`; above it, pin the first N messages (Phase 1/2 context) + keep the most recent, drop the middle. Uses `countTokens` with graceful degradation (skips windowing if the count call fails).
- **Tool-context persistence:** a per-turn `toolContext`/`toolSummary` is persisted alongside the model message so the agent retains awareness of which specs/skills it already loaded across turns.

### Tools
- **Local knowledge tools** (in `claude.ts`, `handleKnowledgeTool`): `get_company_spec`, `get_n8n_skill`, `get_workflow_for_promotion`.
- **MCP tools** (bridged via `mcp-bridge.ts`, official MCP SDK 1.20.1): whitelisted set is **10, all read-only** — `tools_documentation`, `search_nodes`, `get_node`, `validate_node`, `validate_workflow`, `get_template`, `search_templates`, `n8n_get_workflow`, `n8n_list_workflows`, `n8n_health_check`. **No write/edit tools are exposed today.**
- **Credential hygiene:** `stripCredentialsFromResult` removes credential blocks from `search_nodes`/`get_node`/`get_template` results so the model can't copy stale credential IDs. (Gap: it does **not** cover `n8n_get_workflow`, which returns full JSON incl. credentials — relevant before exposing edit tools.)

### "Modes" are not separate agents
Builder / Data-Consultant / Planning / Promote / PoC are the **same loop** with different context blocks prepended and a different tool filter — not distinct agents. Phase gating (1→4) is enforced by **prompt rules in `system-prompt.ts`**, not by code.

### Deployment
chat-ui on Cloud Run (IAP), MCP on Cloud Run (`n8n-mcp-cloud`, internal). MCP is a vendored czlonkowski/n8n-mcp copy — see [`mcp-strategy-2026-06.md`](mcp-strategy-2026-06.md).

---

## 2. Honest assessment

**Strengths:** full control of context windowing, caching, phase gating, and credential injection — all things generic frameworks make awkward; cheap (prompt cache); deterministic (temp 0.1); small dependency surface; clean separation (loop in chat-ui, node knowledge in MCP).

**Weaknesses / risks:**
1. **No automated quality gate.** Changes to prompt/specs/departments ship without an enforced regression run. `tools/run_regression.py` exists but isn't in CI; current baseline isn't green (~27/32). This is the single biggest robustness gap.
2. **Full-JSON regeneration.** The agent rebuilds whole workflow JSON instead of editing — slower, more tokens, more drift. The MCP already ships `n8n_update_partial_workflow` (diff) and `n8n_autofix_workflow`; we just don't expose them.
3. **Phase gating is prompt-enforced** (~80% compliance per past learnings) — soft, not structural.
4. **Credential-stripping gap** on `n8n_get_workflow` (and any future edit tool).
5. **Observability is console.log**, not structured — hard to feed the feedback loop.

---

## 3. Recommendations (ranked)

1. **Expose diff-based editing + autofix** (Track A2/A3, behind the trust-model gate). Biggest quality/latency win; ~80–90% token savings on edits per upstream. Must add a server-side sandbox-project allowlist first (instance-wide API key).
2. **Wire `run_regression.py` into CI** as the safety net (feeds Track B). Gate merges on "no new failures vs a pinned baseline" until the suite is green. This is the prerequisite that unlocks autonomous promotion.
3. **Keep the custom loop.** Don't adopt LangGraph/Agent SDK now — we'd trade control + caching for abstractions we don't need. **Switch-trigger to revisit:** if we add multi-agent orchestration, durable cross-session state, or human-in-the-loop branching that the while-loop can't express cleanly.
4. **Reconcile Time-Saved with n8n native Insights** (`/api/v1/insights/summary`, available since n8n 2.x) — our n8n-ops heuristic vs n8n's native signal; decide which is source of truth.
5. **Structured tool-call telemetry** for the loop (which specs/skills/tools per turn, latency, tokens) — replaces console.log and feeds the harvest.
6. **Consider native n8n Evaluations + Data Tables** as an alternative/complement to the Python regression harness for AI-workflow cases.

---

## 4. What we are NOT changing
- The SDK (Vertex Anthropic), model routing, prompt-caching strategy, or the mode-via-context-block design — all working as intended.
