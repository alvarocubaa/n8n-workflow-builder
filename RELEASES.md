# n8n Workflow Builder -- Release History

## v0.16 -- 2026-03-13
### Changes
- JSON-example credential guardrails: programmatic correct/wrong examples generated per department
- Phase 4 self-check checklist (credentials, BQ projectId, future dates)
- If node v2.3 guardrail added to node_config_overrides
- Audit tool: credential type mismatch detection, future date detection
- 2 CS regression test cases (focused + full bad-conversation scenario)
- 12 Marketing hackathon workflow JSONs in examples/marketing/

### Prompt changes
- system-prompt.ts: credential rule points to <credential_examples>, Phase 4 checklist, If node v2.3, BQ Phase 3 reinforcement
- departments.ts: generateCredentialExamples() adds correct/wrong JSON per dept

### Git range
eed0c4a..b2a6fdd

### Test results
- Audit tool catches 4/4 bugs from bad conversation (BQ projectId, Slack type, missing slackApi, SF trigger config)
- CS regression tests: added, pending first run

---

## v0.15 -- 2026-03-11
### Changes
- User attribution: workflow names prefixed `[AI by username]`
- Deploy tracker table (DeployLog component)
- UI: collapsible sidebar, file upload, single-node detection
- New Marketplace spec (8 tables)
- Zendesk comments alias + subdomain URLs
- Finance/CX sandbox project ID corrections

### Prompt changes
- SF-vs-BQ routing rule (Guesty account master data exception)
- Single-node clipboard output rule
- Cross-system ID mapping rule (7 sources)
- Marketplace added to spec list

### Git range
574b8de..eed0c4a

---

## v0.14 -- 2026-03-10
### Changes
- Deploy workflows to department n8n sandbox projects (create + transfer)
- Analytics instrumentation: events, deploys, feedback collections
- Admin dashboard: UsageOverview, QualityMetrics, ROICalculator, DeployLog, FeedbackLog
- Historical seeding: 85 conversations from 6 users

### Prompt changes
- None (analytics + deploy are backend/UI changes)

### Git range
45b276b..574b8de

---

## v0.13 -- 2026-03-09
### Changes
- BigQuery boolean NULL gotcha: IFNULL(col, FALSE) pattern
- UC2 redesigned around data known to exist
- EXISTS-in-JOIN limitation documented across all specs
- Merge node v3 parameter override (combineBy vs combinationMode)
- Verified SQL examples prioritized over text rules
- Phase 1 skip clause tightened

### Prompt changes
- system-prompt.ts: boolean IFNULL rule, EXISTS-in-JOIN rule, Merge v3 override
- Specs: Zendesk, Jira updated with CTE+UNNEST patterns
- Phase 1 skip: require ALL details explicit

### Git range
f667756..45b276b

---

## v0.12 -- 2026-03-04
### Changes
- Initial production deployment
- 6 departments, 11 specs, 7 skills
- Phase-gated conversation flow
- On-demand knowledge loading (specs + skills)
- Node config overrides for BQ, SF, Slack, Merge

### Git range
Initial commit (f667756)
