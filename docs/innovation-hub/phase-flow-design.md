# Phase-flow design: initiative-first → optional workflow

**Status:** design (2026-05-06).
**Goal:** one coherent journey from idea to deployed workflow, all started from "Plan with AI" inside the Innovation Hub. Eliminates the current mode contamination where the planning-mode AI cheerfully builds workflows when prompted.

For the wire protocol underneath, see [`protocol-contract.md`](protocol-contract.md). For the live plumbing this design assumes, see [`current-architecture.md`](current-architecture.md).

## Why this design

The current planning-mode rule is permissive — it tells the AI to interview about the initiative, but doesn't forbid it from building. So a user typing "Daily report email from Google Sheets" gets an immediate workflow build, not the intended initiative interview. Worse, because the planning-mode JSON is emitted alongside workflow JSON, the rendered output ends with the AI saying "Paste this JSON into the Hub form" — implying the auto-fill we shipped didn't fire.

We want the AI to drive the user through three phases inside one conversation, with a clean optional fork at the workflow handoff:

```
   Plan with AI   ─────►  Phase 1: Interview
                          KPI · current state · department · baseline
                                  │
                                  │ early in convo, AI asks:
                                  │ "Will this need a workflow to automate?"
                                  │
                                  ▼
                          Phase 2: Emit fields
                          JSON parsed → form auto-fills on left
                          AI summarises in plain text
                                  │
                          ┌───────┴────────┐
                          │                │
                    "no workflow"    "yes workflow"
                          │                │
                          ▼                ▼
              Initiative is        Hub auto-saves
              ready. Convo ends.   the initiative
              User can save        as a draft → real
              the form when        initiative_id
              they want.                 │
                                          ▼
                                  Phase 3: Build workflow
                                  Same conversation transitions
                                  to building behaviour.
                                          │
                                          ▼
                                  Phase 4: Deploy + link
                                  n8n-builder-callback creates
                                  initiative_workflow_links row
                                  with created_via='ai_builder'
```

## Design choices

### A — The mode URL parameter does not change

`mode=planning` enters the conversation. The AI orchestrates phases internally via the system prompt. Phase 3 (workflow building) happens *inside the same conversation* — we do **not** spawn a fresh `mode=building` conversation for it. The mode parameter exists for the initial system-prompt selection; the AI is allowed to evolve into building behaviour once Phases 1–2 complete and the user opts in.

**Why not switch URLs?** Two reasons.
1. Continuity for the user. They asked "yes build the workflow" — popping a new chat would feel like starting over.
2. The chat-ui already has the initiative_id from the original prefill; spawning a new conversation would mean re-passing it.

### B — Hub auto-saves at the planning→building handoff

Today, "Plan with AI" on a new initiative carries `initiative_id='__draft__'`. That's fine for auto-fill (the form is the open modal, not addressed by id), but it's **not** fine for `initiative_workflow_links` — that table requires a real UUID.

When the user says "yes, build the workflow," the chat-ui posts an event (TBD: probably extending `extracted_fields_updated` with a `next_step: 'build_workflow'` flag, or a new `request_save_initiative` event). The Hub:

1. Auto-saves the open form as a draft initiative — even with empty fields. Status = `Not Started`, owner = current user, all required fields back-filled with safe defaults if missing.
2. Replaces the iframe URL with one carrying the new `initiative_id` (the saved row's UUID), still in the same drawer.
3. The chat-ui notices the prefill changed (or the conversation gets a follow-up `<initiative_context>` injection) and proceeds with workflow building, knowing the link target.

User-visible message in the drawer: *"I've saved your initiative as a draft so I can attach the workflow to it."*

### C — Workflow building inside planning has the SAME guardrails as standalone building

That is, the AI must:
- Use `search_nodes`, `validate_node`, etc. as normal.
- Honour the department's credentials.
- Output a single `nodes`-keyed workflow JSON ready for deploy.
- Fire `workflow_deployed` postMessage on success — Hub listener already exists.

It must **not**:
- Re-interview about the initiative ("what KPI?"). Phase 2 is done.
- Emit a second planning JSON. The form is filled.

### D — "No workflow" is a graceful exit

If the user says no, the conversation ends naturally. The AI says something like *"Your initiative card is ready — review the form on the left, edit anything you want, and save it. You can come back to build a workflow later via Generate workflow with AI."*

No deploy fires. No initiative_workflow_links row. Just an autofilled form the user submits manually.

## System-prompt changes (chat-ui)

In [`chat-ui/src/lib/system-prompt.ts`](../../chat-ui/src/lib/system-prompt.ts), rewrite `<rule name="planning_mode">` to:

```
<rule name="planning_mode" priority="critical">
  Active only when the user arrived via mode=planning (Innovation Hub
  "Plan with AI"). Drive the conversation through three phases.

  Phase 1 — Interview about the initiative. NEVER build a workflow in this
  phase. If the user describes a workflow, acknowledge it, capture the
  intent in your notes, and ask the initiative questions instead. Topics:
    - improvement KPI (the metric this moves)
    - current state (what the manual / pre-automation process looks like)
    - department / data sources / impact category / effort
    - baseline numbers (minutes per run, runs per month, people involved)
  Early in the conversation, ask explicitly: "Will this need a workflow
  to automate, or is this initiative scoped to other work?" Remember the
  answer.

  Phase 2 — Emit the JSON. Once you have enough to fill the 13-key
  whitelist, emit it ONCE in a fenced ```json block. Do not say
  "paste this JSON" — the form on the left auto-fills. Narrate your
  assumptions in plain text alongside the JSON. The fenced block is
  hidden from the user in embed mode; it exists for parsing only.

  Phase 3 — Workflow build (only if the user said yes in Phase 1).
  After the form fills, transition: ask "Ready to build the workflow
  now? I'll save your initiative first so I can link the workflow to it."
  When they confirm, switch to standard workflow-builder behaviour:
  search_nodes, validate, output the workflow JSON, deploy. Use the
  initiative_id supplied by the prefill (it will be re-issued by the Hub
  after the auto-save). Do not re-interview about the initiative.

  If the user said no to a workflow in Phase 1: end gracefully after
  Phase 2. Tell them they can come back via "Generate workflow with AI"
  on the saved initiative if they change their mind.
</rule>
```

(Refined wording, not literal — see PR for the actual edit.)

## Hub-side changes

| Surface | Change |
|---|---|
| `services/api.ts` (`createStrategicIdea`) | Add a "draft" path that accepts a partial form (no required-field validation), used by the auto-save handoff. |
| `components/AddStrategicIdeaModal.tsx` | New `onWorkflowHandoff` handler that calls the draft create, swaps `embedUrl` to a new URL with the real initiative_id, and shows the in-drawer status message. |
| `components/EmbeddedChatPanel.tsx` | New event type in the message handler (e.g. `request_save_initiative`) → invokes `onWorkflowHandoff`. |
| Supabase migration | None required — `strategic_ideas` already supports nullable fields. |

## chat-ui-side changes

| Surface | Change |
|---|---|
| `src/lib/system-prompt.ts` | Rewrite `<rule name="planning_mode">` (above). |
| `src/app/api/chat/route.ts` | Detect Phase-3 transition via the assistant's text or a structured marker. Emit the new `request_save_initiative` SSE event so `ChatWindow` can `emitToParent`. |
| `src/lib/types.ts` | Extend `ChatEvent` with `request_save_initiative`. Extend the postMessage payload union. |

## Open questions

1. **How does the AI signal Phase 3 to the server?** Three options:
   - A magic phrase the regex picks up. Brittle.
   - A second fenced JSON block (e.g. ```json:next_step` with `{ "build_workflow": true }`). Explicit but duplicates effort.
   - A tool call (`request_workflow_build`) the AI emits. Cleanest. Likely choice.
2. **What if the auto-save fails?** (e.g. RLS, dept not set) — fall back to "I couldn't save the draft. Save manually first, then click Generate workflow with AI." Don't try to build without a real id.
3. **Multiple workflows per initiative?** Out of scope for v1; a future "build another workflow for this initiative" entry point covers it.
4. **What if the user already saved the initiative manually mid-conversation?** Detect via the prefill's `initiative_id !== '__draft__'` after a refresh. Skip auto-save in that case.

## Out of scope

- Direction-2 (new-tab) flow. Auto-fill there continues to use the visibilitychange poll path.
- "Data consultant" mode. Untouched by this design.
- Editing an *existing* saved initiative via Plan with AI. The current behaviour (re-interviews, fills empty fields only) stays.
