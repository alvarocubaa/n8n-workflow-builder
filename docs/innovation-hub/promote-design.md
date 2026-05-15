# Take-to-Production button — design + critical review

**Status:** design (2026-05-06). Drafted by a parallel agent. **Pending implementation.** Should land **after** [`redesign-v2-server-write.md`](redesign-v2-server-write.md) ships, since both touch the system-prompt mode structure.

The plan body is below verbatim from the parallel agent. Critical-review notes from a separate review pass (this session) follow at the end. Six items in that review are **load-bearing** — read them before starting implementation.

---

## The plan (parallel agent)

### Context

PROJ-153 ("Monitoring and follow up for inactive accounts") under INIT-232 is sitting in Project Testing. Today the path to production is fully manual: open n8n, transfer the workflow to the production project, swap sandbox→prod credentials, activate, then update the Hub stage by hand. Lena (assigned reviewer) has no structured way to validate it.

The Hub already has most of the pieces — they just aren't tied to the n8n side:

- **Go-Live workflow already exists**: `InnovationStatus.Project_Live`, `requestGoLiveApproval` / `approveGoLive` / `rejectGoLive` API, `go_live_status` enum (`not_requested|pending|approved|rejected`), `go_live_requested_at`, `go_live_feedback`, `live_app_url` columns on `innovation_items`. Migration: `migrations/add_go_live_approval.sql`. Notifications + gamification already wired.
- **Workflow ↔ initiative linkage already exists**: `initiative_workflow_links` (PR #12, `migrations/add_n8n_workflow_links.sql`) with `is_primary` flag. Auto-populated by Edge Function `supabase/functions/n8n-builder-callback/index.ts` on every chat-ui deploy.
- **Chat-ui has the 7-point promotion checklist** in [chat-ui/src/lib/system-prompt.ts:329-345](../../chat-ui/src/lib/system-prompt.ts) (trigger: "promote to production"; gate: "yes promote").
- **Sandbox→production transfer primitive exists** in [chat-ui/src/lib/n8n-deploy.ts:54-75](../../chat-ui/src/lib/n8n-deploy.ts).
- **Embedded chat panel pattern exists** (Direction 3 live since 2026-05-05) — drawer-in-iframe, postMessage protocol per [`protocol-contract.md`](protocol-contract.md).
- **Production project IDs verified live in n8n** (see table at end).

What's actually missing: the n8n actions (transfer + activate + cred swap) aren't triggered when an item gets approved for go-live, and there's no streamlined single-click path for low-risk items where committee review isn't required.

**Outcome.** A new "Take to Production" button on PROJ items in `Project_Testing` whose parent INIT has at least one primary linked workflow AND whose department has a known production project. Click → opens the embedded chat-ui drawer in promote mode → existing 7-point checklist runs → user types "yes promote" → automation:

1. **n8n:** transfer the workflow to dept prod project, swap creds, activate.
2. **Hub:** stamp `status='Project Live'`, `go_live_status='approved'`, `go_live_requested_at=now`, `go_live_feedback='Auto-promoted via AI Builder by {user}'`, `live_app_url=<production workflow url>`. Reuses the existing Go-Live columns + notifications + gamification.

Single-click for the user (one button + one "yes promote" confirmation in chat). Lena's role is "validate and provide feedback" per the PROJ description — she can review the AI Sessions card / WorkflowHealthCard before the owner pushes the button. If the org later wants formal committee approval for some depts, slot that in via the existing `requestGoLiveApproval` path.

### Architecture

```
Hub                                                                        
  IdeaDetailModal (PROJ-153, status=Project_Testing)                   
   • parent: source_strategic_idea_id → INIT-232 (strategic_ideas.id)  
   • lookup: initiative_workflow_links WHERE initiative_id=INIT-232    
             AND is_primary=true → n8n_workflow_id                     
   • dept lookup: PROJ.department → Hub-side DEPT_HAS_PROD enum        
   • NEW button "Take to Production" (visible iff link found AND       
     dept has prod project)                                            
   • click → opens EmbeddedChatPanel iframe in promote mode            
                                                              
NEW supabase/functions/n8n-promote-callback/index.ts                 
  • re-validate input (defense-in-depth)                              
  • UPDATE innovation_items SET                                       
      status='Project Live',                                          
      go_live_status='approved',                                      
      go_live_requested_at=now(), go_live_feedback=<auto note>,       
      live_app_url=<production_workflow_url>                          
  • RPC sync_initiative_status(parent_init_id, 'Done')                
  • OPTIONAL: insert notification rows mirroring approveGoLive        

chat-ui                                                                    
  /chat?promote=true&workflow_id=…&innovation_item_id=…&department_id=…
   • synthetic first turn: "Promote workflow {id} to production."      
   • existing system-prompt 7-point checklist runs                     
   • on "yes promote" → AI regenerates JSON w/ prod creds              
   • promote-mode UI shows "Apply Promotion" instead of "Apply"        

NEW POST /api/promote                                                
   1. updateWorkflow(workflowId, newJson, dept.n8nProductionProjectId) 
      → existing helper does PUT JSON + tag + transfer in one call     
   2. activateWorkflow(workflowId) — NEW helper in n8n-deploy.ts       
   3. POST callback to Hub n8n-promote-callback                        
   4. Emit `workflow_promoted` postMessage so drawer can auto-close    
```

### Implementation phases

1. **Add `n8nProductionProjectId` to `DepartmentConfig`** (chat-ui) — `cs` and `cx` only initially; others undefined → button hidden.
2. **Add `activateWorkflow` primitive** (chat-ui) — try `POST /api/v1/workflows/${id}/activate`, fall back to `PATCH /api/v1/workflows/${id}` with `{active:true}`.
3. **`/api/promote` orchestration endpoint** (chat-ui) — auth check; transfer; activate; POST Hub callback; emit `workflow_promoted` SSE/postMessage.
4. **Promote-mode handler** (chat-ui) — read `?promote=true` URL params; inject synthetic first turn `"Promote workflow ${workflowId} (${departmentId} dept) to production. Run the production checklist."`; promote-mode UI shows "Apply Promotion" button.
5. **Hub button + Edge Function** — `IdeaDetailModal.tsx` button; `supabase/functions/n8n-promote-callback/index.ts`; `services/api.ts` thin client wrapper.
6. **Verification** — activate-primitive smoke; `/api/promote` direct curl; Hub callback smoke; end-to-end happy path on PROJ-153.

### Critical files

| Repo | Path | Change |
|------|------|--------|
| chat-ui | `src/lib/departments.ts` | Add `n8nProductionProjectId`; populate CS + CX |
| chat-ui | `src/lib/n8n-deploy.ts` | New `activateWorkflow` helper |
| chat-ui | `src/app/api/promote/route.ts` | NEW orchestration endpoint |
| chat-ui | `src/lib/system-prompt.ts` | Confirmation gate language adapts to promote mode |
| chat-ui | `src/app/api/chat/route.ts` | Inject synthetic first turn when `mode='promote'` |
| chat-ui | `src/app/chat/page.tsx` | Read `?promote=true&…` URL params |
| chat-ui | `src/components/PromoteButton.tsx` (NEW or extend existing apply CTA) | "Apply Promotion" in promote mode |
| Hub | `components/IdeaDetailModal.tsx` | "Take to Production" button + visibility rules |
| Hub | `supabase/functions/n8n-promote-callback/index.ts` | NEW Edge Function (mirrors `n8n-builder-callback`) |
| Hub | `services/api.ts` | Thin `takeToProduction` client wrapper |

**No new Supabase migration needed** — reuses existing columns: `status`, `go_live_status`, `go_live_requested_at`, `go_live_feedback`, `live_app_url`.

### Production project ID table (verified live)

| Dept | Sandbox | Production | Source / status |
|------|---------|------------|-----------------|
| Marketing | `PkYJF1B9yVB8Imbl` (172 wf) | — | sandbox-only confirmed |
| CS | `kh5kTQJhrQ8KNoSC` (64 wf) | `HSINMLm9Tt4FHjL3` (23 wf) | both verified |
| CX | `EuTGww8zaCWPb8Cr` (128 wf) | `W62G9hxuK9c7cKwo` (165 wf) | both verified |
| OB | `Yh0x22sXaF1PEsGT` (39 wf) | — | sandbox-only |
| Payments | `ahDlEt5r1gShUBKY` (47 wf) | — | sandbox-only |
| Finance | `WrQXt2ZvpTq5Lkzo` (3 wf) | ⚠️ **none** | MEMORY.md was wrong — `EuTGww8zaCWPb8Cr` is CX sandbox, not Finance prod |
| Product | `cC2MXxyCdYtzY46e` (7 wf) | — | sandbox-only |
| People | `GG87KkXICRSZxeQu` (6 wf) | — | sandbox-only |
| Information Systems | `3wBiKLqcGT5en7HH` (13 wf) | candidate `UCEMQoFhrGZ3FChz` | strong candidate; **confirm with manager before populating** |

### Risks and open items

1. Activate endpoint shape — test both `POST` and `PATCH` against sandbox first.
2. IS production project — needs manager confirmation.
3. Activation safety for webhook workflows — auto-activating exposes a webhook URL.
4. MEMORY.md correction — clear the bogus Finance production ID.
5. Multi-workflow initiatives — default to `is_primary=true`; chooser deferred to v2.
6. Committee approval coexistence — existing `requestGoLiveApproval` flow stays.
7. Notifications — defer fan-out to v2.

---

## Critical-review notes (this session)

The plan above is solid in shape but has six load-bearing gaps. Address before starting implementation.

### 1. There's no production-credential mapping anywhere

The plan adds `n8nProductionProjectId` but **does not** add production credential IDs. The 7-point checklist's "credential diff shows real CS sandbox→prod mappings" line is doing all the work — but where do those mappings come from? Today `departments.ts` has only sandbox cred IDs. Without per-service prod cred IDs the AI literally cannot regenerate the JSON correctly. **This is the central technical task** and the plan glosses over it.

Fix before Phase 1: add `productionCredentials: { bigQuery?: string; slack?: string; salesforce?: string; ... }` to `DepartmentConfig`, populate at least for CS + CX, surface in the `<department_context>` block alongside the sandbox set, and expand the system-prompt rule to teach the AI the swap.

### 2. Activation should be opt-in for webhook workflows

A webhook URL flipping live the moment of promotion can fire on real production data before downstream consumers are ready. Listed as a risk but the plan still ships auto-activate in v1. Real fix: detect webhook trigger nodes during the checklist, ask the user explicitly ("Activate now? Or leave inactive so you can wire the consumer first?"), default to inactive when a webhook is detected.

### 3. `audit_workflow.py --env production` should run server-side, not be optional v2

That's the only deterministic guardrail against cred-swap mistakes. Conversational checklist is ~95% reliable per memory's meta-learning notes; for a *production* button the gap matters. Run it server-side in `/api/promote`, fail closed on credential mismatches.

### 4. Transactional consistency between n8n + Hub

Plan says "POST callback to Hub" after transfer + activate. What if the callback fails after n8n succeeds? n8n shows prod-active, Hub shows `Project_Testing`. Specify:

- Only fire the Hub callback if transfer **and** activate succeed.
- On partial failure (transfer ok, activate fails), surface the partial state to chat-ui ("workflow is in prod project but inactive — toggle in n8n when ready"), don't update Hub.
- Hub callback failures are logged + retried in background; the user sees a toast either way.

### 5. `live_app_url` is wrong

Plan: `${N8N_API_URL}/workflow/${workflowId}`. `N8N_API_URL` is the API base, not the user-facing UI URL. The UI URL is `https://guesty.app.n8n.cloud/workflow/{id}`. Need a separate `N8N_UI_URL` env or derive the UI base by stripping `/api/v1`.

### 6. Mode contamination — same shape as Chunk A's fix

Adding `mode='promote'` to `ChatPrefillMode` (today: `'building' | 'planning'`) needs a system-prompt rule that's *exclusive* with the planning rule. If a user opens promote mode but types "actually let's revise the KPI", what wins? The new rule needs an explicit boundary line: "in promote mode, refuse non-promotion topics — direct user back to Plan-with-AI on the parent INIT."

**Note (2026-05-06):** `PromoteContext` interface was added to `chat-ui/src/lib/types.ts` during this session — the parallel agent has begun the type plumbing. Keep that work; integrate with the items above before extending.

## Smaller concerns (non-blocking)

- **No permission check on `/api/promote`** beyond `dept.n8nProductionProjectId` existing. Should also gate on user being PROJ owner OR dept admin.
- **Synthetic first turn** mechanism is fine, but use a structured `<promote_context workflow_id=… innovation_item_id=…>` block (mirroring `<initiative_context>`) rather than free-text — discoverable for the AI, survives prompt updates.
- **Reuse the email→userID resolution** from `n8n-builder-callback` in the new Edge Function (factor into a shared helper).
- **Lena's notifications deferred** — at minimum post a Slack message via the existing `SLACK_WEBHOOK_URL`; if Lena lives in Slack she'd otherwise miss it.
- **Multi-workflow chooser** — out of scope for v1, but if multiple `is_primary=true` exist (shouldn't), **fail visibly** rather than silently pick.
- **`mcp__n8n-mcp__n8n_get_workflow` server-side fetch** — fine, but cleaner to have the AI call it as a tool when it starts the checklist.

## Open question for the user

The plan straddles two stories:

- (a) "this is the streamlined alternative for low-risk items"
- (b) "the existing committee approval `requestGoLiveApproval` path remains untouched"

Right now the **only signal of risk** is whether the dept has a prod project. That's a coarse gate — every workflow in CS is automatically "low-risk enough for one-click." Is that actually the operational rule? If not, we need a per-PROJ flag (e.g. `requires_committee_review: bool` on `innovation_items`) to decide which path applies, with a sensible default.

## Recommendation

Ship after redesign-v2 lands. Address items 1-5 in the planning doc before coding (~1-2 hours of design work). Item 6 is automatically resolved by the redesign-v2 system-prompt structure.
