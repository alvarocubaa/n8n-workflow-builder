# Plan — End-to-end integration walkthrough (Hub × chat-ui × n8n-ops)

**Date:** 2026-05-20
**Owner:** Alvaro Cuba (user-driven walkthrough; Claude annotates + verifies)
**Why now:** Three major arcs landed in two weeks (Sessions 7-8 Time Saved KPI, Session 9 Track A initiative-KPI auto-sync, Sessions 9-Track-B / 10 / 11 redesign-v2 + PoC plumbing). On top of that, two production hotfixes shipped 2026-05-19 (prefill empty-title decoder bug; embed auth 5s timeout race; solution_url read-only display). All pieces verified in isolation; **never validated end-to-end as a single human-driven user journey.** This session does that.

---

## Goal

Walk one user journey from "I have an idea" → "the KPI rolled up my workflow's time saved" through the live UI. Surface any gap between what the architecture doc claims and what actually happens. Produce a decision-log entry + refreshed [`docs/innovation-hub/end-to-end-flow.md`](../../docs/innovation-hub/end-to-end-flow.md) status table.

**Not a build session.** No new features. Only fixes if walkthrough finds something broken.

## Pre-flight (Claude runs before the walkthrough — ~10 min)

Static verification — no user input needed. Run these queries up-front so the live walkthrough doesn't pause for diagnostics.

### Deployed revisions
- chat-ui: `gcloud --project=agentic-workflows-485210 run services describe n8n-chat-ui --region=europe-west1 --format="value(status.traffic[0].revisionName)"` — expect `n8n-chat-ui-00049-85m` or newer.
- Hub: `gcloud --project=ai-innovation-484111 run services describe ai-innovation-hub --region=us-central1 --format="value(status.traffic[0].revisionName)"` — expect `ai-innovation-hub-00106-zj8` or newer.
- n8n-ops: `gcloud run services describe n8n-ops --region=europe-west1 --format="value(status.traffic[0].revisionName)"` — expect `n8n-ops-00008-vqf`.

### DB state baseline
```sql
-- Are recent planning sessions writing rows?
select count(*), max(created_at) from public.initiative_chat_creations;

-- AI-drafted initiatives present?
select count(*), max(created_at) from public.strategic_ideas
  where description ilike '%AI-drafted via Plan with AI%';

-- Initiative-KPI auto-sync — is it running?
select count(*), max(updated_at) from public.initiative_kpis
  where kpi_id = 'e6f47f5b-5de7-4630-84b5-441741270e53';  -- Marketing Time Saved

-- PoCs with solution_url populated (mix of typed + auto-filled)
select id, title, solution_url, updated_at from public.innovation_items
  where solution_url is not null
  order by updated_at desc limit 10;

-- Initiative ↔ workflow links populated by chat-ui Builder?
select count(*) from public.initiative_workflow_links
  where created_via = 'ai_builder';
```

### Recent log entries (Cloud Run, last 24h)
- `planning_turn` lines from `n8n-chat-ui` — confirms Plan-with-AI sessions are reaching the SSE handler.
- `context_decode_drop` lines — should be **zero** post-2026-05-19 hotfix. Non-zero = the prefill decoder still rejects something.
- n8n-ops `initiative-kpi-sync` invocations — confirms daily cron actually fires.

### Edge Function freshness
```bash
supabase functions list  # confirm all 4 Hub Edge Functions ACTIVE
# n8n-conversation-callback, n8n-builder-callback, n8n-initiative-upsert, n8n-promote-callback
```

Pre-flight output is one structured table the user reads before starting the walkthrough.

## Walkthrough (~45-60 min — user-driven via UI; Claude observes + queries)

Follow ONE complete journey. After each step, Claude queries the DB / logs to confirm the expected state change.

### Path A: Idea → PoC → Workflow → KPI rollup (Team Ideas pipeline)

| # | UI action | Expected DB / log state | Claude verifies |
|---|---|---|---|
| 1 | Hub: click "Smart Add Idea". Fill title + dept. Click **Add with AI analysis** (toggle OFF). | `innovation_items` row inserted with `status='Idea'`, `analysis_data` JSONB populated. | `select id, title, status, analysis_data is null from public.innovation_items where created_at > now() - interval '5 minutes';` |
| 2 | Approver receives Slack DM via Innovation Hub bot. Click Approve. | Status flips to `Approved`. | Same query. Expect `status='Approved'`. |
| 3 | Click idea → "Start POC". Fill PocFieldsSection (title, owner, optionally paste a draft workflow URL into Solution URL). Click Start POC. | `markAsPocActive` flips same row to `status='POC Active'`. `source_strategic_idea_id IS NULL` (Idea-path PoC). | Same query. Expect `status='POC Active'`, `source_strategic_idea_id` null. |
| 4 | Reopen the PoC card. Verify PoC Details section now shows **Solution: Open Workflow ↗** (if you typed a URL in step 3). | Read-only display from PR #56. | (Visual; Claude confirms via screenshot description.) |
| 5 | Click **"Generate workflow with AI"** in PoC Details section. | Hub drawer opens chat-ui iframe with `?poc=<base64>`. AuthGate fires `auth_required` → Hub overlay GIS button → user clicks → cookie set → drawer renders chat. | Cloud Run logs: `planning_turn` line absent (poc_mode, not planning). Any error?: `gcloud logging read 'severity>=ERROR AND resource.labels.service_name="n8n-chat-ui"' --freshness=5m`. |
| 6 | AI in `poc_mode` skips Phase 1/2. Asks 1 clarifying question. Build workflow. Click **Deploy to n8n**. | `initiative_workflow_links` row inserted (only if PoC has parent initiative — Idea-path won't; row absent is correct). `innovation_items.solution_url` auto-populates IF currently null. | Two queries: `select * from public.initiative_workflow_links order by created_at desc limit 1;` AND `select solution_url, updated_at from public.innovation_items where id = '<poc_id>';` |
| 7 | Reopen PoC card. Verify Solution row now shows the auto-populated n8n URL. | Display refreshes after Hub data reload. | Visual. |
| 8 | Wait until next 06:15 UTC cron OR manually trigger `/initiative-kpi-sync` via OIDC. Then check Marketing KPI page. | `initiative_kpis` row updated with `expected_impact` ≈ runs_30d × time_saved_per_execution_min / 60. **Note:** Idea-path PoCs without a parent initiative WON'T roll up (no initiative_id to attach). Confirm + log this as the documented limitation. | `select * from public.initiative_kpis where kpi_id = 'e6f47f5b-…' order by updated_at desc;` |

### Path B: Initiative → PoC → Workflow → KPI rollup (Roadmap Initiatives pipeline)

Same steps but starting from "Add Roadmap Initiative" → "Plan with AI" instead of "Smart Add Idea". The PoC inherits `source_strategic_idea_id`, so step 8 actually rolls up.

| # | UI action | Expected | Claude verifies |
|---|---|---|---|
| 1 | "Add Roadmap Initiative" → form open → click **Plan with AI**. | Hub launches chat-ui iframe with `?prefill=...` (title="" on new initiative — the decoder fix from today must accept this). | Cloud Run logs: `context_decode_drop` should be **0** for this session. |
| 2 | Sign-in flow inside drawer. Verify NO "Sign-in didn't reach the chat panel" timeout. | Auth completes inside drawer; user is in `poc_mode='planning'`. | Logs: `planning_turn` line will fire on the first turn. |
| 3 | Interview 2-3 turns. Confirm "yes" when AI asks "Ready to create the initiative?". | AI emits `<create_initiative />` + JSON → server calls `n8n-initiative-upsert` Edge Function → `strategic_ideas` row inserted. Chat panel shows **"✓ Initiative created — Open in Hub →"** link. | `select id, title, description, created_at from public.strategic_ideas where description ilike '%AI-drafted%' order by created_at desc limit 1;` |
| 4-7 | Same as Path A steps 3-6, but from this new initiative. | Includes `source_strategic_idea_id` linkage → KPI rollup will pick it up. | Same queries. |
| 8 | Trigger `/initiative-kpi-sync`. Check Marketing KPI. | `initiative_kpis.expected_impact` updates with non-zero value (initiative has linked workflow). | Same query. |

### Path C: Negative tests (~10 min)

Probe failure modes the hotfixes specifically protect against.

- **Empty-title prefill:** open the chat URL manually with `?prefill=<empty-title base64>` — expect chat panel to render in standalone mode (decoder rejects) AND show the yellow "Hub context didn't load" banner above the input. `context_decode_drop` log line fires.
- **Slow sign-in:** open chat panel, then walk away 35 seconds before clicking the Hub GIS overlay. Expect the in-iframe GIS button + "Open in a new tab instead" link to render. Click in-iframe GIS — should still complete sign-in.
- **Auth timeout but late token:** open chat, wait 35s without clicking, then click Hub overlay. Expect sign-in to STILL complete (listener stayed alive past timeout per today's fix).
- **PoC without workflow:** open a PoC card with no `solution_url` set. PoC Details section should render WITHOUT the Solution row (conditional `{item.solution_url && ...}`).

## Findings report (~20 min, Claude writes)

After walkthrough, produce three artifacts:

1. **Decision-log entry 2026-05-20** in [`docs/decision-log.md`](../../docs/decision-log.md). Format: Date / Decision (none if no decisions) / Observations / Anomalies / Action items.

2. **Refreshed status table** in [`docs/innovation-hub/end-to-end-flow.md`](../../docs/innovation-hub/end-to-end-flow.md) — update each "Status" cell with today's reality + revision/PR refs.

3. **Verification queue** at the bottom of `docs/decision-log.md` — log anything observed-but-not-fixed (e.g. "Idea-path PoCs don't roll up to KPI because no parent initiative — documented limitation; revisit if signal").

If walkthrough surfaces a real bug, fold a fix into the same session (small) OR queue as the next HEAD session (larger).

## What we're NOT doing this session

- New features.
- Performance testing.
- Cost analysis.
- Touching the approval-gate decision pending Kurt's reply (separate item).
- Touching Cloud Run autoscaling, IAM, or networking — only application-level walkthrough.

## Pre-requisites

- **Approval-gate clarity from Kurt** (not blocking — just affects whether a discovered fix can ship same-session). If still on, any Hub fix requires me to approve the new build.
- **`gcloud auth login` fresh** in your shell.
- **VPN or thehub.gue5ty.com access** for browser-driven steps.
- **The Hub Cloud Build queue still has 37 PENDING superseded builds** — they don't block the walkthrough but worth a note. Cancel them if Kurt OKs.

## Estimated effort

- Pre-flight: ~10 min (Claude only)
- Walkthrough Path A + B + C: ~60-75 min (mostly user clicks; Claude queries take seconds)
- Findings report: ~20 min (Claude writes; user reviews)
- **Total: ~90-105 min**, one focused session.

## Files Claude will likely touch (findings phase only)

- [`docs/decision-log.md`](../../docs/decision-log.md) — new 2026-05-20 entry.
- [`docs/innovation-hub/end-to-end-flow.md`](../../docs/innovation-hub/end-to-end-flow.md) — refresh "What's live today" table.
- `.claude/session-queue.md` — close out this session into the Shipped Log, derive next HEAD.
- `.claude/next-session.md` — refresh from new HEAD.

## Rollback

N/A — no production changes unless a real bug surfaces. Any fix gets its own commit + revert path.
