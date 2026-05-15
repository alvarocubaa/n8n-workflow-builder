# Innovation Hub × n8n Workflow Builder

This folder collects every design document for the Hub × chat-ui integration. Read these in order if you're new; pick by topic if you're returning.

## Contents

| File | Read when |
|---|---|
| [`current-architecture.md`](current-architecture.md) | You want a fast picture of where each piece lives and how data moves between Hub, chat-ui iframe, and Vertex AI Claude. Start here. |
| [`protocol-contract.md`](protocol-contract.md) | You're touching cross-frame messaging (`workflow_deployed`, `auth_required`/`auth_token`). Wire-level details, origin allowlist, JSON shapes. **Originally `direction-3-design.md`** — moved here. The `extracted_fields_updated` half is **deprecated** by `redesign-v2-server-write.md`. |
| [`redesign-v2-server-write.md`](redesign-v2-server-write.md) | **Read before changing the planning/edit write path.** Pivots from form-fill via postMessage to server-side write through a new Edge Function. Supersedes `phase-flow-design.md`. |
| [`pop-out-design.md`](pop-out-design.md) | You're touching the embedded drawer's window lifecycle (popup vs drawer, message routing via `window.opener`). |
| [`promote-design.md`](promote-design.md) | You're implementing the "Take to Production" button on PROJ items. Includes the parallel agent's plan + a critical-review pass with 6 load-bearing items to address before coding. **Land redesign-v2 first.** |
| [`phase-flow-design.md`](phase-flow-design.md) | **SUPERSEDED** — kept for historical context only. The Phase 1 interview rule it describes is still live in the system prompt; Phase 2 (form auto-fill) and Phase 3 (auto-save handoff) are being deleted by redesign-v2. |

## Repos involved

- **chat-ui** (this repo, `/`) — the Next.js iframe app, Vertex Claude.
- **Hub** (sibling at `/Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex`) — Vite + React + Supabase. Mounts the iframe.
- **n8n-ops** (separate Cloud Run) — workflow stats sync. Tangential.

## Status of each piece (as of 2026-05-06 EOD)

- **Direction-3 embed** (drawer + iframe): live in production. See `protocol-contract.md` + `pop-out-design.md`.
- **Auto-apply 13-field suggestions** (Chunks A–D shipped 2026-05-06): live but **scheduled for deletion** by redesign-v2.
- **Phase 1 interview rule** (Chunk A): live and stays.
- **Pop-out drawer**: live (Chunk C).
- **Phase 3 auto-save handoff** (Chunk D): live but redundant once redesign-v2 lands; the new `<create_initiative />` sentinel does the same job cleanly.
- **Workflow deploy → optimistic stats placeholder** (Hub-side INSERT): deferred — postMessage event ships, no Hub listener yet.
- **Take-to-Production button**: design only. See `promote-design.md`.
- **redesign-v2 server-write**: design drafted. See `redesign-v2-server-write.md`. **Pending implementation.**
