# Innovation Hub × n8n-builder × n8n-ops — end-to-end flow

**Audience:** anyone joining the project who needs to know how a user's initiative becomes a working n8n workflow + a measured KPI in the Hub.

**Last updated:** 2026-05-15.

---

## TL;DR

Two pipelines (Team Ideas and Roadmap Initiatives) **converge at PoC**. From PoC onward, the n8n-builder chat-ui helps the user build the actual workflow; the deployed workflow is auto-linked back to the originating initiative; and once-a-day a cron rolls up real workflow execution data into the initiative's "Contributes to KPI" card.

Three repos, one flow:

| Repo | Owner role | Purpose |
|---|---|---|
| [`alvarocubaa/n8n-workflow-builder`](https://github.com/alvarocubaa/n8n-workflow-builder) (chat-ui + n8n-mcp + plans) | AI team | The Builder UI that interviews the user, writes the initiative row, builds the workflow, deploys to n8n. |
| [`kurtpabilona-code/AI-Innovation-Hub-Vertex`](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex) (Hub) | Hub team (Kurt) | The Innovation Hub UI, Supabase schema, and Edge Functions that the chat-ui calls. |
| `Agentic Workflows/services/n8n-ops` (not yet git-tracked) | AI team | Cloud Run service that ingests n8n executions, computes KPIs, writes back to the Hub. |

---

## The user journey

```
PIPELINE 1: TEAM IDEAS                       PIPELINE 2: ROADMAP INITIATIVES
─────────────────────                        ──────────────────────────────
User: any                                    Author: champions + AI team
Table: innovation_items                      Table: strategic_ideas
Status: Idea → Approved                      Pre-approved (no committee)

  Smart Add Idea (analyse w/ AI)               Add Initiative
            │                                       │
            ▼                                       │
   innovation_items                                 │
   (status='Idea',                                  │
    analysis_data jsonb)                            │
            │                                       │
     ┌─Approver decides via                         │
     │ Innovation Hub Slack bot                     │
     │                                              │
     ▼ Approved                                     │
   innovation_items                                 │
   (status='Approved')                              │
            │                                       │
            └──────────────────┐    ┌───────────────┘
                               ▼    ▼

                    ★ CONVERGENCE: Start PoC ★

           Click "Start POC" → StartPocModal opens
                               │
                ┌──────────────┴──────────────┐
                ▼                              ▼
       FROM AN IDEA                  FROM AN INITIATIVE
       markAsPocActive               createPocFromInitiative
         UPDATE same                   INSERT new
         innovation_items              innovation_items row
         SET status='POC Active'       SET status='POC Active'
                                       + source_strategic_idea_id
                                       = strategic_ideas.id
                                          │
                                          │ ← join key keeping the
                                          │   initiative ↔ PoC
                                          │   relationship intact
                                          ▼
                       innovation_items   (the "PoC card")
                       title, description, owner, department,
                       poc_guidelines_doc, validation_notes,
                       test_data_source, solution_url
```

**Three things to notice about convergence:**

- **Both pipelines write to the same table** (`innovation_items`) with status `POC Active`. An idea PoC and an initiative PoC are the same row shape; only the parent linkage differs.
- **The `strategic_ideas` row stays around.** Its status bumps to `POC` so the Hub UI can render the initiative card with a "PoC in flight" badge, but the PoC's actual fields live on the `innovation_items` row.
- **There is no separate `innovation_items_pocs` table.** It's a status-discriminator pattern. See [`services/api.ts::createPocFromInitiative`](https://github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex/blob/main/services/api.ts).

---

## Where the Builder slots in

```
                       PoC card open (innovation_items row)
                                    │
                                    ▼
                  ┌────────────────────────────────────┐
                  │  Generate workflow with AI         │  ← Session 10 (2026-05-15):
                  │  (Hub launches chat-ui in iframe)  │    button now on BOTH
                  └─────────────────┬──────────────────┘    initiative AND PoC cards.
                                    │
                                    ▼
                chat-ui receives ONE of three payloads:
                   - `prefill=<base64>` → InitiativePrefill (initiative card)
                   - `poc=<base64>`     → PocContext        (PoC card — Session 10)
                   - `promote=<base64>` → PromoteContext    (Take-to-Production)
                (Mutually exclusive — PoC scope wins if multiple arrive)
                                    │
                                    ▼
                  ┌──────────────────────────────────────┐
                  │ chat-ui runs the Builder conversation │
                  │ AI emits JSON + sentinels             │
                  └─────────────────┬────────────────────┘
                                    │
        ┌───────────────────────────┼────────────────────────────┐
        ▼                           ▼                            ▼
WRITE-BACK #1               WRITE-BACK #2                WRITE-BACK #3
extracted_fields            <create_initiative />        workflow_deployed
(every turn)                (Phase 2 — once, after       (when user clicks
                             user confirms save)          Deploy in chat)
        │                           │                            │
        ▼                           ▼                            ▼
n8n-conversation-callback   n8n-initiative-upsert        n8n-builder-callback
        │                           │                            │
        ▼                           ▼                            ▼
initiative_chat_              strategic_ideas              initiative_workflow_links
conversations                 (INSERT new or                (PoC's deployed workflow,
(AI sessions panel,           UPDATE existing —              role='primary',
extracted_fields jsonb)       only fills empty               created_via='ai_builder')
                              columns)                                │
                                                                      ▼
                                                            innovation_items.solution_url
                                                            (auto-fill if currently
                                                             null; preserve typed
                                                             values)
```

### Fields chat-ui writes back

Whitelist + bounds enforced both in chat-ui ([`src/app/api/chat/route.ts`](../../chat-ui/src/app/api/chat/route.ts)) **and** on the Hub Edge Function (defence-in-depth).

| Field | Type | Bounds | Hub column |
|---|---|---|---|
| `title` | string | 1–200 chars | `strategic_ideas.title` |
| `description` | string | 1–2000 chars | `.description` |
| `improvement_kpi` | string | 1–500 chars | `.improvement_kpi` |
| `business_justification` | string | 1–1000 chars | `.business_justification` |
| `current_state` | string | 1–1000 chars | `.current_state` |
| `department` | enum | one of 9 depts | `.department` |
| `data_sources` | string | 1–500 chars | `.data_sources` |
| `level_of_improvement` | enum | Low / Medium / High / Very High | `.level_of_improvement` |
| `impact_category` | free text | ≤80 chars | `.impact_category` |
| `effort` | enum | Low / Medium / High | `.effort` |
| `jira_ticket_ids` | string[] | up to 5, regex-validated | `initiative_jira_links` |

**Retired on 2026-05-13:** `current_process_minutes_per_run`, `_runs_per_month`, `_people_count` — the new KPI rollup pulls per-execution minutes directly from n8n's `settings.timeSavedPerExecution`, so these initiative-level estimates became dead weight. Hub form section also dropped (PR #51).

**Invariants the Edge Functions enforce:**

- **Update mode never overwrites typed values** (`only fill if currently null/empty`). If Ron typed an `improvement_kpi` and the AI later infers a different one, **Ron's value wins**.
- **`<create_initiative />` is idempotent.** A sidecar table `initiative_chat_creations(conversation_id PK, initiative_id FK)` maps each conversation to at most one initiative row. Retries return `action='no_changes'` + the existing id.
- **Standalone chat sessions can never write to the Hub.** The `source` field on the conversation doc is set once at creation; the Edge Functions reject `source='standalone'`.

---

## How the Time Saved KPI rollup folds in

Once a workflow exists and is linked to an initiative, the n8n-ops service does the rest.

```
        ┌──────────────────┐    /ingest    ┌─────────────────────┐
        │ guesty.app.n8n   │  every 15 min │ BQ n8n_ops.workflows│
        │   /workflows     │ ─────────────→│ + daily_workflow_   │
        │ (per-workflow    │               │   stats             │
        │  settings        │               │ (time_saved_per_    │
        │  including       │               │  execution_min,     │
        │  timeSavedPer    │               │  success_runs/day,  │
        │  Execution)      │               │  project_id,        │
        └──────────────────┘               │  project_env)       │
                                           └──────────┬──────────┘
                                                      ↓
        ┌──────────────────────────────────────────────────────────┐
        │ n8n-ops Cloud Run — /sync-hub (daily 06:15 UTC)          │
        │ folds in /initiative-kpi-sync:                           │
        │                                                          │
        │  1. read strategic_ideas + initiative_workflow_links     │
        │     from Hub Supabase                                    │
        │  2. read workflows_dim + daily_workflow_stats from BQ    │
        │  3. resolve dept → KPI                                   │
        │     (kpis.scope='department' AND department=…            │
        │      AND unit='hours' AND name ILIKE '%time saved%'      │
        │      AND is_active=true)                                 │
        │  4. compute expected_impact per initiative               │
        │  5. UPSERT initiative_kpis via Hub Supabase REST         │
        └────────────────────────┬─────────────────────────────────┘
                                 ↓
                       ┌──────────────────────┐
                       │ Hub initiative_kpis  │
                       │ "Contributes to"     │
                       │ card auto-populated  │
                       └──────────────────────┘
```

### Algorithm (per initiative)

```
SKIP if impact_category ≠ 'Time Savings'
SKIP if no rows in initiative_workflow_links
RESOLVE dept → KPI; SKIP if no active "time saved" KPI for that dept

FOR EACH workflow linked to this initiative:
  runs_30d        = SUM(daily_workflow_stats.success_runs)
                    WHERE day >= today − 30 AND workflow_id = X
  minutes_per_run = workflows_dim.time_saved_per_execution_min
                    (null → 0 contribution — owner hasn't set the value)
  workflow_hours  = runs_30d × minutes_per_run / 60

total = SUM(workflow_hours)
UPSERT initiative_kpis (initiative_id, kpi_id, expected_impact = total)
       created_by = '<auto-sync-uuid>'    -- so we know it's machine-set
```

**Triggers** (any of these fires the recompute):

- Daily cron at 06:15 UTC (folded into `/sync-hub`).
- Workflow linked / unlinked to an initiative (via the chat-ui `n8n-builder-callback` path, or manual link in the Hub).
- A workflow owner edits `Settings → Time Saved Per Execution` in n8n. The next `/ingest` (≤15 min later) writes the new value to BQ; the next cron picks it up.

**Conflict policy (locked-in default — Option A):** auto-overwrite. Measured data is the authority. The Hub renders `expected_impact` as *"Auto-calculated from execution data."* Initiative owners can still type values manually, but the next cron rewrites them.

---

## What's live today (2026-05-15)

| Layer | Status |
|---|---|
| Convergence at `innovation_items` (status discriminator) | ✅ live since Hub launch |
| **chat-ui → Hub field write-back** (planning JSON → `strategic_ideas`) | ✅ live as of 2026-05-15. Edge Function `n8n-initiative-upsert` + chat-ui `<create_initiative />` sentinel. |
| **chat-ui → Hub workflow link** (initiative-level) | ✅ live since 2026-05-04 (Direction-2). `initiative_workflow_links` populated by `n8n-builder-callback`. |
| **chat-ui → Hub workflow link** (PoC-level via `innovation_items.solution_url`) | ✅ DB column + Hub modals + Edge Function shipped 2026-05-15 (Hub PR #52, chat-ui rev `n8n-chat-ui-00046-k9b`). Auto-fill path stays dormant until Phase 2.2 plumbs `innovation_item_id` end-to-end. |
| **Per-workflow `timeSavedPerExecution` in n8n Settings** | ✅ 111 workflows bulk-populated via node-count heuristic (5/10/15/25/40 min tiers). Owners can override in Settings; next `/ingest` picks it up. |
| **Department-centric Time Saved KPI rollup** | ✅ Marketing Time Saved KPI live at [`/business-kpis/e6f47f5b-…`](https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53). April 38 h, May 88 h (partial). |
| **Per-initiative `initiative_kpis` auto-fill** | ⏳ Plan ready: [`.claude/plans/2026-05-15-initiative-kpi-auto-sync.md`](../../.claude/plans/2026-05-15-initiative-kpi-auto-sync.md). Execution next session (HEAD). |

---

## What's open

- **Phase 2.2** — surface "Generate workflow with AI" on PoC cards (not only initiatives), with a new `poc_context` prefill payload + `<rule name="poc_mode" priority="critical">` system-prompt rule so the chat-ui treats the PoC description + spec doc as the build target (skipping the Phase 1/2 interview that's for initiative drafting). Plumbs `innovation_item_id` from the Hub → chat-ui conversation → deploy callback so the `solution_url` auto-fill wire from PR #52 actually fires.
- **Phase 2.3** — modal trim: retire `StartPocModal` as a standalone modal (fold its 6 fields into `EditInnovationItemModal`'s PoC section); add a "Skip Analysis" toggle to `SmartAddIdeaModal` for power users.
- **Initiative KPI auto-fill** — the cron rollup described above; HEAD session.

---

## Read next

- **Sequencing + history of design decisions:** [`docs/decision-log.md`](../decision-log.md). Every architecture pivot from v1 (initiative-baseline minutes) → v2 (per-workflow `settings.timeSavedPerExecution`) → v3 (department-centric rollup) → today's `solution_url` field is logged there.
- **Active session HEAD:** [`.claude/next-session.md`](../../.claude/next-session.md) (always reflects the next thing to ship).
- **Full session arc:** [`.claude/session-queue.md`](../../.claude/session-queue.md).
- **Active plan files:** [`.claude/plans/`](../../.claude/plans/) (one per design pivot; most recent = next to ship).
- **Adjacent Hub design docs:** other files in this folder ([`current-architecture.md`](current-architecture.md), [`redesign-v2-server-write.md`](redesign-v2-server-write.md), [`promote-design.md`](promote-design.md), [`phase-flow-design.md`](phase-flow-design.md), [`pop-out-design.md`](pop-out-design.md), [`protocol-contract.md`](protocol-contract.md)).
