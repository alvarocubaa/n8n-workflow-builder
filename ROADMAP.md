# Roadmap -- n8n Workflow Builder

*Last updated: 2026-04-10 (Session K-3 — v0.23 deployed). This document answers "how and when." For "what and why," see [STRATEGY.md](STRATEGY.md).*

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

## Completed (Mar 27, 2026 — Session J)

- [x] **v0.22 deployed to production**: Context window 80K→800K, output tokens 32K→64K, sliding window 12→20. React.memo typing lag fix. Full Guesty rebrand (20+ components). Cloud Run revision `n8n-chat-ui-00026-qf5`. Rollback target: `n8n-chat-ui-00024-6sm`.
- [x] **Status report updated**: `chat-ui/public/status-report.html` updated with deployment details, Guesty rebrand section, live revision info.

## Completed (Mar 24, 2026 — Session H)

- [x] **Context degradation fix (v0.20)**: Investigated "less smart" reports from Roni+Gil. Root cause: tool result amnesia + output truncation + unbounded context. Deployed 4-phase fix: max_tokens 32K, token monitoring, tool context persistence, smart context windowing (80K threshold). Cloud Run revision `n8n-chat-ui-00023-z2c`.
- [x] **Verified deployment**: Replayed both reported conversations (Gil 12 turns, Roni 9 turns) — 0 truncation, token monitoring active, tool context persisted.
- [x] **Confirmed Claude-only**: Investigated model usage — no Gemini fallback anywhere. Stale references in README only.

## Completed (Mar 25, 2026 — Session I)

- [x] **Data Consultant mode designed and implemented**: New assistant mode for schema exploration, SQL generation, AI agent planning. ModeSelector UI (card selector), mode-aware system prompt routing, tool filtering, department context.
- [x] **Architecture audit passed**: 4 audit issues identified, all 4 already fixed in current code. Builder mode performance verified: zero overhead (3 if-checks per request).
- [x] **v0.21 deployed to production**: Cloud Run revision `n8n-chat-ui-00024-6sm`. PR #1 merged to main. All verification gates passed (tsc, build, docker, health check). Rollback target: `n8n-chat-ui-00023-z2c`.

## Completed (Apr 1, 2026 — Session K)

### Session K-1 (code changes)
- [x] **Harvest completed**: 247 conversations scanned, 45 candidates (25 high, 20 medium) across 6 departments, 4 users
- [x] **5 regression failures fixed**: CX BQ cred confusion, Marketing Slack cred, Payments BQ cred, Phase 4 cross-check, truncation UX
- [x] **v0.23-prep code changes**: system-prompt.ts (Phase 4 self-check #5, JSON-first output), claude.ts (PINNED_START_SIZE=4, softer truncation), MessageBubble.tsx (teal truncation UX), departments.ts (CX/Payments wrong-cred examples)

### Session K-2 (spec enrichment + analytics)
- [x] **CSM spec enrichment (critical gap closed)**: Created `bigquery/csm.md`. Fixed 5 bugs in spec (wrong Modjo table, wrong schema, wrong risk level values, stale NPS, Boolean NULL). All 8 SQL patterns verified.
- [x] **Zuora spec enrichment**: Fixed `subscription_status` column (doesn't exist — use `effective_end_date`). Verified invoice/product_catalog queries. Added annotations.
- [x] **AdminData spec enrichment**: Verified active count (47K). Noted `software_plan_type`/`value` mostly NULL — use `plan` REPEATED field. Added annotations.
- [x] **v0.22 token analytics**: 214 events, 0 truncated, 31% exceeded old 80K limit (now handled), max 476K input. Documented in STATE.md.
- [x] **Monitor v0.20/v0.22 token analytics**: DONE — detailed findings in feedback-loop/STATE.md

## Completed (Apr 10, 2026 — Session K-3)

- [x] **v0.23 deployed to production**: Cloud Run revision `n8n-chat-ui-00027-5q4` (deployed 20:22 UTC). Bundle: K-1 v0.23-prep (Phase 4 #5, JSON-first output, PINNED_START_SIZE=4, truncation UX, CX/Payments wrong-cred examples) + K-3 (CSM/owner field rule, Phase 4 #6 field-shape contracts, audit check #11). Rollback target: `n8n-chat-ui-00026-qf5` (v0.22).
- [x] **CSM/owner field rule**: Multi-layered fix driven by Gil + Céline Slack feedback. Live BQ verification across 18,626 active accounts: `dim_accounts.csm` 100% populated, SF `Account_Owner_F__c` only 10.7% (sparse tier-specific). Two-CSM-concepts disagreement ~80%. Fix locations: system prompt rule, CSM spec section 2 callout + section 5 verified SQL pattern pair, Salesforce spec OwnerId annotation, audit_workflow.py check #11, test_cases.yaml fix.
- [x] **Audit check #11 (`csm_no_sf_roundtrip`)**: Static check verified against all 44 harvested workflows — 1 true positive (`harvested_cs_005`), 0 false positives. Catches BQ-already-has-csm + redundant SF owner lookup.
- [x] **End-to-end LLM regression `cs_churn_bq_slack`**: PASSED. AI now uses BQ csm column directly (workflow 9 nodes → 6 nodes vs the bug repro).
- [x] **Phase 4 self-check #6 (field-shape contracts)**: Driven by Roni's Apr 5 chat array-vs-string IF node bug. Passive guardrail; synthetic test case TBD.

## Action Items (Next Session — Session L)

### HIGH PRIORITY
- [ ] **Share v0.23 with Gil + Céline (Slack)**: Two-CSM-concepts data finding (~80% disagreement), what was deployed, invitation to re-test
- [ ] **Share v0.23 with Roni (Slack)**: Phase 4 self-check #6 deployed for the Set→IF array bug from her Apr 5 session
- [ ] **Monitor analytics_events** in Firestore for next 48h to confirm no regressions from v0.23
- [ ] **Production smoke tests with real users**: Builder mode + Data Consultant mode + rebrand visual check

### MEDIUM
- [ ] **Update Schedule Trigger guidance in specs/skills**: Guesty n8n cloud runs Schedule Trigger cron in `Asia/Jerusalem`, not UTC. If any generated workflow uses `scheduleTrigger`, the builder should express cron in Jerusalem local time (not "convert to UTC"). Discovered Apr 10 2026 on digest.ai. See `Agentic Workflows/CLAUDE.md` gotcha section.
- [ ] **UC1 Finance full retest**: Smart defaults deployed but UC1 needs end-to-end validation
- [ ] **UC2 CX retest**: Redesigned prompt untested since boolean IFNULL fix
- [ ] **CS full regression** (`cs_renewal_declined_full`): Full bad-conversation scenario test
- [ ] **Ron credential collection**: Slack message drafted (Search Console, WordPress, Semrush, YouTube)

### CARRIED OVER
- [ ] Test deploy button end-to-end
- [ ] Test feedback buttons end-to-end
- [ ] Wire `run_regression.py` into CI/CD pipeline

---

*Update when priorities shift, milestones complete, timelines change, or new blockers emerge. If you are changing the "what" or "why," update STRATEGY.md instead.*
