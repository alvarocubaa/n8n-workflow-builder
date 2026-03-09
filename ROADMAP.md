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

## Action Items (Next Session)

- [ ] Test deploy button end-to-end: generate a workflow in any department, click "Deploy to n8n", verify it lands in the correct project folder in n8n
- [ ] Test feedback buttons end-to-end (thumbs up/down on a real response in production)
- [ ] Re-verify UC1 and UC2 with redesigned prompts (carried over)
- [ ] Wire `run_regression.py` into CI/CD pipeline (carried over)
- [ ] Identify next spec to add (carried over)
- [ ] Push latest commits to GitHub (`alvarocubaa/n8n-workflow-builder`)

---

*Update when priorities shift, milestones complete, timelines change, or new blockers emerge. If you are changing the "what" or "why," update STRATEGY.md instead.*
