# Roadmap -- n8n Workflow Builder

*Last updated: 2026-03-09. This document answers "how and when." For "what and why," see [STRATEGY.md](STRATEGY.md).*

---

## Current Phase

**Phase:** Production -- Maintenance & Iteration
**Status:** Core product deployed on Cloud Run. Chat UI + MCP server operational. 11 data source specs, 7 expert skills. Used by internal teams for workflow building.

---

## OKRs -- 3-Month Horizon

### Objective 1: Expand Data Source Coverage *(from STRATEGY.md)*

| Key Result | Metric | Current | Target | How |
|-----------|--------|---------|--------|-----|
| KR1 | Data source specs | 11 | 15 | Add HubSpot, Marketing, CSM, Admin specs |
| KR2 | Verified SQL examples per spec | ~5 avg | 10 avg | Add query patterns from real use cases |

### Objective 2: Improve Workflow Quality *(from STRATEGY.md)*

| Key Result | Metric | Current | Target | How |
|-----------|--------|---------|--------|-----|
| KR1 | Regression test pass rate | ~95% | 99% | Expand test suite, fix edge cases |
| KR2 | Department coverage | 3 | 5 | Add Sales and Marketing departments |

---

## OKRs -- 6-Month Horizon

### Objective: Self-Service Workflow Building

| Key Result | Metric | Target | How |
|-----------|--------|--------|-----|
| KR1 | Workflows built by non-dev users | 20 | Training, documentation, simplified UX |
| KR2 | Average build time | < 10 min | Better templates, smarter defaults |

---

## Demo Milestone

**Repo:** `cubaalvaro/demo-n8n-workflow-builder` (private until ready)
**Prerequisite:** MVP validated with real usage or testing data

- [ ] README scaffolded from `_templates/DEMO-README.md.template`
- [ ] Key Results table filled with real metrics (before/after)
- [ ] Architecture diagram or flow visualization in `assets/`
- [ ] 2-3 screenshots showing the system in action
- [ ] Video walkthrough (Loom or similar) linked in README
- [ ] Repo made public

*Capture demo assets throughout the project -- don't wait until the end.*

---

## Dependencies & Blockers

| Dependency | Blocks | Status |
|-----------|--------|--------|
| GCP project `agentic-workflows-485210` | All deployment | Active |
| Vertex AI access (us-east5) | Claude API calls | Active |
| n8n cloud instance (guesty.app.n8n.cloud) | Workflow promotion | Active |
| BigQuery access (guesty-data) | SQL validation | Active |

---

## Completed (Mar 9, 2026)

- [x] Verify analytics dashboard loads in production — confirmed working
- [x] Check Firestore collections — 105 events, 85 conversations, all present
- [x] Firestore composite indexes — not needed (no errors in logs)
- [x] Review seeded historical data — numbers match, avg tool calls fixed (show N/A for seeded data)
- [x] Deploy-to-folder by department — tested transfer API (204 success), deployed to prod
- [x] Department n8n project IDs formalized in `departments.ts`

## Completed (Mar 13, 2026 — Session C)

- [x] Deploy credential table ordering fix (dept-specific first) — Cloud Run revision 00018
- [x] Deploy smart defaults for Phase 1 — Cloud Run revision 00019
- [x] Push all commits to GitHub (69410c4 is latest)
- [x] Run CS regression tests — all pass with shared BQ credential
- [x] UC1 Finance regression test — PASS (smart defaults working, Phase 2 gate held)
- [x] Spec enrichment gap analysis (CSM critical, Zuora/AdminData high)

## Completed (Mar 24, 2026 — Session H)

- [x] **Context degradation fix (v0.20)**: Investigated "less smart" reports from Roni+Gil. Root cause: tool result amnesia + output truncation + unbounded context. Deployed 4-phase fix: max_tokens 32K, token monitoring, tool context persistence, smart context windowing (80K threshold). Cloud Run revision `n8n-chat-ui-00023-z2c`.
- [x] **Verified deployment**: Replayed both reported conversations (Gil 12 turns, Roni 9 turns) — 0 truncation, token monitoring active, tool context persisted.
- [x] **Confirmed Claude-only**: Investigated model usage — no Gemini fallback anywhere. Stale references in README only.

## Completed (Mar 25, 2026 — Session I)

- [x] **Data Consultant mode designed and implemented**: New assistant mode for schema exploration, SQL generation, AI agent planning. ModeSelector UI (card selector), mode-aware system prompt routing, tool filtering, department context.
- [x] **Architecture audit passed**: 4 audit issues identified, all 4 already fixed in current code. Builder mode performance verified: zero overhead (3 if-checks per request).
- [x] **v0.21 deployed to production**: Cloud Run revision `n8n-chat-ui-00024-6sm`. PR #1 merged to main. All verification gates passed (tsc, build, docker, health check). Rollback target: `n8n-chat-ui-00023-z2c`.

## Action Items (Next Session — Session J)

### HIGH PRIORITY
- [ ] **Monitor v0.20 token analytics (HIGH)**: Check Firestore analytics_events for inputTokens trends, any truncated=true, context windowing triggers (>80K tokens). First real data from Roni/Gil.
- [ ] **Share feedback with Gil and Roni**: Truncation fixed, tool context persists across turns, file uploads work natively.
- [ ] **Fix remaining 5 regression failures** (carried from Session G): CX BQ confusion (2), Marketing multi-user creds (2), pay_zuora (1).
- [ ] **Harvest** (due ~Mar 27): Scan new conversations post-v0.20 deploy.
- [ ] **Spec enrichment (HIGH)**: Add verified SQL examples to CSM, Zuora, AdminData specs. Requires BQ access (`execute_sql` tool). CSM is the biggest gap (no BQ ref doc, 20 tables underdocumented). Target: 2-3 verified SQL patterns per spec.
- [ ] **UC1 Finance full retest**: Smart defaults deployed but UC1 needs end-to-end validation with audit tool (workflow JSON → audit_workflow.py)
- [ ] **UC2 CX retest**: Redesigned prompt (Zendesk open ticket aging) untested since boolean IFNULL fix
- [ ] **CS full regression** (`cs_renewal_declined_full`): Full bad-conversation scenario test — run after confirming credential ordering fix in prod
- [ ] **Ron credential collection**: Slack message drafted (Search Console, WordPress, Semrush, YouTube) — user needs to send it. Unlocks 2 remaining Tier 3 hackathon projects.
- [ ] **Scrape-and-diff template**: Needs real Google Sheet ID + Slack channel from Ron/Marketing team
- [ ] **hack_026** (Nechama Webinar Asset Creation): Tier 2 hackathon project, no test case or workflow JSON yet
- [ ] Test deploy button end-to-end (carried over)
- [ ] Test feedback buttons end-to-end (carried over)
- [ ] Wire `run_regression.py` into CI/CD pipeline (carried over)
- [ ] Create CSM BQ reference doc in `bigquery/csm.md` (new — identified as critical gap)

---

*Update when priorities shift, milestones complete, timelines change, or new blockers emerge. If you are changing the "what" or "why," update STRATEGY.md instead.*
