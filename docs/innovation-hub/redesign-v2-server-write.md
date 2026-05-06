# Redesign v2 — server-write architecture for initiatives

**Status:** design (2026-05-06). **Supersedes** the form-fill mechanism described in [`phase-flow-design.md`](phase-flow-design.md). The drawer/auth/popup layers from [`current-architecture.md`](current-architecture.md) and [`protocol-contract.md`](protocol-contract.md) stay intact — only the *write path* changes.

## Why this exists

Direction-3's form-fill mechanism (chat-ui posts `extracted_fields_updated` → Hub modal applies via `applyExtractedFields`) was fragile. Real-world failures during today's testing:

1. JSON visible in chat that the user expected to "auto-fill" but didn't (because the conversation was in `mode: 'building'` and the server-side gate at [`/api/chat/route.ts:450`](../../chat-ui/src/app/api/chat/route.ts#L450) is `initiativeMode === 'planning' && initiativeId`).
2. When the conversation *is* in planning mode but the user asks the AI for planning behaviour from inside `Generate-with-AI`, there's no `AddStrategicIdeaModal` open to receive the postMessage — `IdeaDetailModal` is read-only and isn't wired for `onExtractedFields`.
3. Coordination between two systems (chat-ui + Hub) over a one-way postMessage with no acknowledgement means the user has no signal whether the write took or not.

The fix is to flip the ownership: **the chat-ui owns the write**. The Hub becomes a read view of `strategic_ideas`. No more modal coordination; no more "did the postMessage land in the right place?" failure modes.

## New flow

```
Plan-with-AI (new initiative)
    or Edit + Plan-with-AI (saved initiative)
    or Generate-with-AI then "update the card" request
              │
              ▼
   ┌──────────────────────────────────────────────────────┐
   │ Phase 1 — Interview (unchanged from Chunk A)         │
   │ AI asks KPI, current state, dept, baseline,          │
   │ "will this need a workflow?"                         │
   └─────────────────────┬────────────────────────────────┘
                         │
                         ▼
   ┌──────────────────────────────────────────────────────┐
   │ Phase 2 — Confirm + write                            │
   │ AI summarises in plain text, then asks               │
   │   "Ready to create the initiative?" (yes/no)         │
   │ On yes, AI emits ONE response containing:            │
   │   • plain-text "Saving now…"                         │
   │   • <create_initiative /> sentinel                   │
   │   • fenced ```json with the 13-key payload           │
   └─────────────────────┬────────────────────────────────┘
                         │
                         ▼
   ┌──────────────────────────────────────────────────────┐
   │ chat-ui server detects sentinel post-stream:         │
   │   1. Parse JSON via existing                         │
   │      extractAndValidatePlanningFields()              │
   │   2. POST Hub Edge Function n8n-initiative-upsert    │
   │      with X-Hub-Secret + payload                     │
   │   3. On 200: emit SSE event 'initiative_upserted'    │
   │   4. On error: emit SSE event 'initiative_upsert_    │
   │      failed' with reason; AI's next turn handles     │
   │      conversationally                                │
   └─────────────────────┬────────────────────────────────┘
                         │
                         ▼
   ┌──────────────────────────────────────────────────────┐
   │ ChatWindow renders inline link in chat:              │
   │   "✓ Initiative created — [Open in Hub →]"           │
   │ User clicks → opens IdeaDetailModal at the new id    │
   └──────────────────────────────────────────────────────┘
```

For **Phase 3 (workflow handoff)** — same as Chunk D, but cleaner because the `initiative_id` is real from the moment Phase 2 succeeds. The AI's offer to build the workflow simply continues with that real id; deploy → `n8n-builder-callback` → `initiative_workflow_links` row. No auto-save dance needed.

## What stays / what goes / what's new

### Stays (works as-is)

- Embed drawer + iframe (Chunk B z-index, Chunk C popup, auth/GIS handler)
- `extractAndValidatePlanningFields` (server-side validator) — still used; just routed to an Edge Function call instead of an SSE-then-postMessage chain
- `n8n-conversation-callback` Edge Function (AI Sessions card)
- `workflow_deployed` postMessage + `n8n-builder-callback` Edge Function (workflow → initiative link)
- Phase 1 interview rule in `<rule name="planning_mode">` (Chunk A)
- All auth/CORS/origin allowlist work (Chunks B + C)

### Goes (delete on the redesign-v2 commit)

**chat-ui:**

- `ChatEvent` types `extracted_fields` and `request_workflow_handoff` ([`src/lib/types.ts:60-76`](../../chat-ui/src/lib/types.ts))
- `extracted_fields_updated` postMessage emit ([`src/components/ChatWindow.tsx:318`](../../chat-ui/src/components/ChatWindow.tsx))
- `request_workflow_handoff` SSE handler + relay ([`src/components/ChatWindow.tsx`](../../chat-ui/src/components/ChatWindow.tsx))
- `current_initiative_id` body field on `/api/chat` (Chunk D)
- `initiative_saved` postMessage listener (Chunk D)
- `handoffInitiativeIdRef` state (Chunk D)
- `updateConversationInitiativeId` firestore helper (Chunk D)
- `<initiative_context_update>` injection in `/api/chat/route.ts` (Chunk D)
- `extracted_fields` SSE emit in `/api/chat/route.ts:450-475`
- `request_workflow_handoff` sentinel detection at `/api/chat/route.ts:438-449`
- Planning JSON-stripping useMemo in `MessageBubble.tsx` (Chunk C) — the JSON is now part of the canonical user-facing content, no need to hide it

**Hub:**

- `applyExtractedFields` 13-field setter ([`components/AddStrategicIdeaModal.tsx`](../../components/AddStrategicIdeaModal.tsx))
- `applyAiSuggestions` (visibilitychange-poll path)
- `aiSuggestions` / `aiSuggestionsAt` / `aiApplyResult` state
- `dismissedSuggestionsAtRef` / `lastSuggestionsFetchAtRef`
- The "AI suggestions ready" pill UI
- `refetchAiSuggestions` + the visibilitychange listener
- `onExtractedFields` prop on `EmbeddedChatPanel` + the modal callsite
- Chunk D handlers: `handleSaveInitiativeRequested`, `autoSavedIdRef`, `onSaveInitiativeRequested` prop, `sendInitiativeSaved`, `request_save_initiative` switch case, `initiative_saved` postMessage emit
- `ExtractedPlanningFields` interface ([`services/initiativeChatConversations.ts`](../../services/initiativeChatConversations.ts)) — only used by the dying form-fill path

### New

**chat-ui:**

- New SSE event types: `initiative_upserted` and `initiative_upsert_failed`
- New sentinel detection: `<create_initiative />` and `<update_initiative />` (regex on streamed assistant text)
- New helper `callHubInitiativeUpsert(...)` in a new file `src/lib/hub-callback.ts` (or extend an existing one) — POST to Edge Function with `X-Hub-Secret`, parse response
- System-prompt rewrite of Phase 2 in `<rule name="planning_mode">` to include the confirm-before-write pattern + sentinel emission rules
- Inline link rendering in `MessageBubble.tsx` for the `initiative_upserted` case (small banner showing `✓ Initiative {created|updated} — Open in Hub →`)

**Hub:**

- New Edge Function `supabase/functions/n8n-initiative-upsert/index.ts` (mirrors `n8n-conversation-callback` shape — `X-Hub-Secret` auth, defense-in-depth re-validation, service-role write).

## Edge Function spec — `n8n-initiative-upsert`

```
POST /functions/v1/n8n-initiative-upsert
Headers: X-Hub-Secret: <shared secret>
Content-Type: application/json
```

**Body:**

```ts
{
  mode: 'create' | 'update';
  // For idempotency on `create` retries — Edge Function should detect a prior
  // create for this conversation_id+created_by and return the existing id
  // instead of inserting a duplicate.
  conversation_id: string;
  // Required for `update`; ignored on `create`. Must be a valid UUID and
  // (when set) refer to a row the caller's email created.
  initiative_id?: string;
  created_by: string;  // email — used for `created_by` column on insert
  fields: {
    title?: string;
    description?: string;
    improvement_kpi?: string;
    business_justification?: string;
    current_state?: string;
    department?: string;          // Hub display name; validated against enum
    data_sources?: string;
    level_of_improvement?: 'Low' | 'Medium' | 'High' | 'Very High';
    impact_category?: 'Time Savings' | 'Improved Quality' | 'Reduced Cost'
                    | 'Increased Revenue' | 'Efficiency' | 'Quality' | 'Business';
    effort?: 'Low' | 'Medium' | 'High';
    current_process_minutes_per_run?: number;
    current_process_runs_per_month?: number;
    current_process_people_count?: number;
  };
}
```

**Behavior:**

1. **Auth:** verify `X-Hub-Secret` matches `HUB_CALLBACK_SECRET`. Reject with 401 otherwise.
2. **Validate** every field (defense-in-depth): re-run the same bounds + enum checks chat-ui already does. Drop unknown / out-of-bounds values silently. (Mirror the `n8n-conversation-callback` validation block.)
3. **Resolve user UUID:** look up `auth.users.id` by `created_by` email via `supabase.auth.admin.listUsers` (same pattern as [`n8n-builder-callback`](../../supabase/functions/n8n-builder-callback/index.ts)).
4. **Idempotency check (mode='create'):** if a row exists in `strategic_ideas` with `created_by=<uuid>` AND has been the target of a `n8n-initiative-upsert` for this `conversation_id` (track via a sidecar table `initiative_chat_creations(conversation_id, initiative_id)` or denormalize on the convo row), return that id with `action='no_changes'`.
5. **Mode = 'create':**
   - INSERT `strategic_ideas` row with the validated fields + safe defaults:
     - `title`: incoming value OR `'Untitled initiative (AI-drafted)'`
     - `description`: incoming OR `'AI-drafted via Plan with AI. Edit the initiative card to fill details.'`
     - `owner_type`: `'AI Team'`
     - `priority`: `'Medium'`
     - `status`: `'Not Started'`
     - All other fields nullable
   - Return `{ initiative_id: <new-uuid>, url: '/#/item/<uuid>', action: 'created' }`.
6. **Mode = 'update':**
   - Verify the initiative_id row exists AND was created by the same user (or user has admin role). If not, 403.
   - Fetch the current row. For each incoming field, **only fill it if the current value is null or empty** (preserves typed values — same invariant Chunk D's auto-save respected).
   - UPDATE the row.
   - Return `{ initiative_id, url, action: 'updated' | 'no_changes', updated_fields: [<key>...] }`.
7. **Error handling:** on any DB error, return 500 with `{ error: '<reason>' }`. chat-ui side surfaces this to the AI for conversational recovery.

**Response shape:**

```ts
{
  initiative_id: string;
  url: string;                  // '/#/item/<uuid>' (relative — Hub origin is implicit)
  action: 'created' | 'updated' | 'no_changes';
  updated_fields?: string[];    // present on 'updated' and 'no_changes'
}
```

## System-prompt changes

In [`chat-ui/src/lib/system-prompt.ts`](../../chat-ui/src/lib/system-prompt.ts), inside `<rule name="planning_mode" priority="critical">`:

**Phase 2 (revised):**

> Once you have enough to fill the 13-key whitelist, summarise your assumptions in plain text, then **ask the user "Ready to create the initiative? (yes/no)"** Wait for confirmation.
>
> When the user confirms, emit ONE response containing:
> - A short plain-text "Saving now…" or "Updating now…" message
> - On its own line: the literal sentinel `<create_initiative />` (or `<update_initiative />` for edits to a saved initiative — detect via prefill's `initiative_id !== '__draft__'`)
> - The fenced ```json block with the 13-key payload
>
> Do NOT emit the sentinel pre-emptively or in any earlier turn. Emit it ONCE per conversation, and only after explicit user confirmation. The Hub's API path will write the row; the chat-ui will render an "Open in Hub" link inline in the next assistant turn — direct the user there.

Drop the current Phase 2/3 language about "the form on the left auto-fills" — that path is gone.

Phase 3 (workflow handoff) stays mechanically identical to Chunk D, but the prerequisite is now "after the `initiative_upserted` SSE event has fired" rather than "after the user manually saves." The id from the upsert response is what subsequent workflow build / deploy uses.

## Inline link rendering

When the chat-ui client receives an `initiative_upserted` SSE event, it appends a synthetic non-streaming assistant message after the in-flight assistant turn:

```
✓ Initiative {created|updated}.
   [Open in Hub →](https://thehub.gue5ty.com/#/item/<uuid>)
```

The Hub origin is read from `NEXT_PUBLIC_HUB_PARENT_ORIGIN` (set in `deploy-cloudrun.sh`). For multi-origin deployments, default to the user-facing one (currently `https://thehub.gue5ty.com`).

## Verification

1. **Plan-with-AI happy path** — open new initiative → chat → confirm → expect link in chat → click → `IdeaDetailModal` shows the new initiative with values populated.
2. **Edit-with-AI happy path** (saved initiative) — open `Add/Edit` modal → click Plan-with-AI → chat says "Ready to update?" → confirm → expect link → click → modal shows updated fields. Typed values preserved (verify by typing in one field before clicking Plan-with-AI; that field should NOT be overwritten).
3. **Idempotency** — retry a conversation that's already created an initiative; expect `action='no_changes'` + same id, no duplicate row.
4. **Required-field defaults** — chat that only filled 5 of 13 fields → still creates, fills `title`/`description`/`owner_type`/etc with safe defaults.
5. **User denies confirm** — AI does NOT emit the sentinel → no Edge Function call → no row created → no link in chat.
6. **Mode contamination** — user starts Plan-with-AI, asks to build a workflow → Phase 1 still refuses (Chunk A behaviour intact).
7. **Edge Function failure** — simulate by sending a bad `X-Hub-Secret` from a curl test against a local Supabase emulator; confirm chat-ui surfaces the failure as an `initiative_upsert_failed` event and the AI's next turn says something like *"Sorry, I couldn't save the initiative. The Hub returned: <reason>. Please try again or contact AI Team."*
8. **Workflow handoff after creation** — confirm Chunk D's workflow build flow still works using the `initiative_id` returned by the upsert (no `__draft__` ever appears).

## Migration / rollout strategy

1. **Pre-merge:** verify the `initiative_chat_creations` table (if used for idempotency) is in a Supabase migration, applied LIVE before chat-ui ships.
2. **Ship chat-ui first** (with feature flag if desired — `PLAN_AI_SERVER_WRITE=true` env var). Old behaviour stays active behind the flag for one revision so we can rollback by env-var toggle.
3. **Smoke** all 8 verification cases.
4. **Once stable, ship the Hub deletion PR** removing `applyExtractedFields` + `aiSuggestions` state + the pill. Keep `IdeaDetailModal`'s read view unchanged.
5. **One revision later:** drop the feature flag in chat-ui; the old code paths stay unreachable but compiled out.
6. **One more revision:** delete the dead code in chat-ui.

This phased deletion avoids a single big-bang rewrite.

## Out of scope (file as follow-ups)

- **Take-to-Production button** — separate plan in [`promote-design.md`](promote-design.md). Should be implemented *after* this redesign lands, since it adds a new mode and the prompt rule structure depends on Phase 1/2/3 being stable.
- **Deleting / archiving auto-created initiatives** (admin path) — manual via the Hub Edit modal for now.
- **Multi-language** — current scope is English only.
- **Notifications** when an AI-drafted initiative is created — defer to v2; the chat-side link is enough for the creating user, and Lena/team will see it on next IdeaDetailModal open.

## Pointers

- [`current-architecture.md`](current-architecture.md) — diagram + file map of what's there now (post-Chunks-A-D)
- [`protocol-contract.md`](protocol-contract.md) — wire-level postMessage shapes (still valid for `workflow_deployed` + `auth_required` + `auth_token`; obsolete for `extracted_fields_updated` once redesign-v2 ships)
- [`phase-flow-design.md`](phase-flow-design.md) — superseded by THIS doc as of 2026-05-06; kept for historical context
- [`pop-out-design.md`](pop-out-design.md) — popup handoff (unaffected)
- Chunk D commit: `b9a43f8` (chat-ui) + `b193bf6` (Hub) — these will be partially reverted by redesign-v2
