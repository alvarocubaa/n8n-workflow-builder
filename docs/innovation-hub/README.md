# Innovation Hub × n8n Workflow Builder

This folder collects every design document for the Hub × chat-ui integration. Read these in order if you're new; pick by topic if you're returning.

## Contents

| File | Read when |
|---|---|
| [`current-architecture.md`](current-architecture.md) | You want a fast picture of where each piece lives and how data moves between Hub, chat-ui iframe, and Vertex AI Claude. Start here. |
| [`protocol-contract.md`](protocol-contract.md) | You're touching cross-frame messaging (`extracted_fields_updated`, `workflow_deployed`, `auth_required`/`auth_token`). Wire-level details, origin allowlist, JSON shapes. **Originally `direction-3-design.md`** — moved here, content unchanged. |
| [`phase-flow-design.md`](phase-flow-design.md) | You're touching the planning-mode system prompt or the planning↔building handoff. Defines the initiative-first → optional-workflow journey and the auto-save handoff. |
| [`pop-out-design.md`](pop-out-design.md) | You're touching the embedded drawer's window lifecycle (popup vs drawer, message routing via `window.opener`). |

## Repos involved

- **chat-ui** (this repo, `/`) — the Next.js iframe app, Vertex Claude.
- **Hub** (sibling at `/Users/alvaro.cuba/code/AI-Innovation-Hub-Vertex`) — Vite + React + Supabase. Mounts the iframe.
- **n8n-ops** (separate Cloud Run) — workflow stats sync. Tangential.

## Status of each piece (as of 2026-05-06)

- **Direction-3 embed** (drawer + iframe): live in production. See `protocol-contract.md`.
- **Auto-apply 13-field suggestions**: live (commit `3d84188`). Replaces the previous "AI suggestions ready" pill in the embed flow.
- **Planning-mode JSON hidden in chat**: live (commit `f1c0951`). The form auto-fills; the user no longer sees a redundant code block.
- **Phase-flow design** (initiative-first → workflow): in design. See `phase-flow-design.md`.
- **Pop-out drawer**: in design. See `pop-out-design.md`.
- **Workflow deploy → optimistic stats placeholder** (Hub-side INSERT): deferred — postMessage event ships, no Hub listener yet.
