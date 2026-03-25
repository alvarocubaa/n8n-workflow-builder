# n8n Workflow Builder -- Release History

## v0.20 -- 2026-03-24 (deployed, revision n8n-chat-ui-00023-z2c)
### Changes
- **Output truncation fix**: max_tokens 16384 -> 32768. Claude Sonnet 4.6 supports 64K; 32K gives 2x headroom for complex workflows. Adds stop_reason detection — user sees visible warning if output is still truncated.
- **Token monitoring**: Extracts input_tokens, output_tokens, cache_read/write_tokens from streaming events. Logged to Firestore analytics_events on every turn. Enables data-driven context management.
- **Tool context persistence**: New `buildToolSummary()` produces compact summaries of tool calls per turn (specs loaded, nodes searched, validation results). Persisted as `toolContext` on model messages in Firestore. Reconstructed into Claude's history on subsequent turns — fixes "tool result amnesia" where Claude lost awareness of loaded specs between turns.
- **Smart context windowing**: `manageContext()` uses SDK `countTokens()` to measure context before sending. When >16 messages AND >80K tokens: pins first 2 messages (Phase 1 requirements) + keeps last 12 messages. Graceful degradation if countTokens fails.
- **File upload awareness**: System prompt `file_uploads` rule tells Claude it can read attached files. Fixes "I can't receive file attachments" response.

### Triggered by
- Gil Almog (Payments): Workflow JSON output truncated mid-sentence on 15+ node builds (24 msg conversation, 3 rebuilds)
- Roni Shif (CS): "Less smart" perception in long conversations (34-40 msgs). Root cause: tool result amnesia + context bloat + output truncation.

### Files changed
- chat-ui/src/lib/claude.ts (max_tokens, usage tracking, tool summaries, context windowing)
- chat-ui/src/lib/types.ts (TokenUsage interface, analytics fields)
- chat-ui/src/app/api/chat/route.ts (context management call, usage/toolContext capture)
- chat-ui/src/lib/firestore.ts (toolContext field on DisplayMessage)
- chat-ui/src/lib/system-prompt.ts (file_uploads rule)

### Verification
- Replayed both reported conversations (Gil 12 turns, Roni 9 turns) against local build
- Zero truncation (max response: 25,665 chars)
- Token monitoring logging to Firestore on every turn (confirmed cache_read ~7.6K = system prompt cached)
- Tool context persisted on 5 model messages across both replays

---

## v0.19 -- 2026-03-20 (deployed, revision n8n-chat-ui-00022-v8t, superseded by v0.20)
### Changes
- **Credential overhaul**: Full scan of 5 n8n projects (CS/CX/Marketing sandbox+prod). ~40 credential changes across 3 departments — fixed wrong IDs, added missing, removed stale, corrected env tags
- **AI node recommendation**: New `ai_for_classification` rule defaults to AI/LLM nodes for classification, intent detection, sentiment tasks. States assumption in Phase 1 instead of asking.
- **BQ empty query check**: Phase 4 self-check item #4 catches empty BigQuery queries before output
- **File upload overhaul**: Files sent as Vertex AI `DocumentBlockParam` — PDFs processed natively by Claude, text files as `PlainTextSource`. No more text injection into message string. Max size 50KB -> 200KB. Added .txt/.csv/.yaml support.
- **Harvester bug fix**: Output path was relative (wrote to `chat-ui/feedback-loop/`). Fixed to absolute path via `path.dirname(__dirname)`.
- CS department: added `zendesk` spec, BQ prompt rule for correct credential

### Files changed
- chat-ui/src/lib/departments.ts (credential overhaul — CS, CX, Marketing sections)
- chat-ui/src/lib/system-prompt.ts (ai_for_classification rule, BQ check, ai_nodes proactive)
- chat-ui/src/lib/claude.ts (FileAttachment interface, document block content building)
- chat-ui/src/components/ChatInput.tsx (base64 PDF, new file types, 200KB limit)
- chat-ui/src/components/ChatWindow.tsx (file sent as structured object, not message text)
- chat-ui/src/app/api/chat/route.ts (accept file field, pass through)
- tools/harvest_test_cases.ts (output path fix)
- feedback-loop/STATE.md (updated to Session F)

### Triggered by
Gil Almog feedback: Code nodes for classification, BQ empty queries, wrong credentials, credential naming changes
Roni Shif feedback: "less smart" perception, file upload as text (50KB flood), broken deploys

### Deploy status
Deployed Session G (Mar 20). Superseded by v0.20 (Mar 24).

---

## v0.18 -- 2026-03-16
### Changes
- 5 bug fixes from conversation analysis (PCiTcWlociMj4RCe5vXJ, CS dept, roni.shif)
- Sandbox credential priority: ENVIRONMENT PRIORITY rule + generateCredentialExamples() prefers sandbox
- UUID guardrail expanded: covers all sub-IDs (assignment, condition, rule IDs) not just node IDs
- New AI/LLM node skill: chainLlm v1.9, Gemini (googlePalmApi), OpenAI, sub-node wiring, output parsing
- max_tokens doubled: 8192 -> 16384 to prevent truncation on large workflows
- Truncation detection: yellow warning banner + download button when workflow JSON is cut off
- Download JSON button on all valid workflow JSON blocks
- Phase 2 softened: state assumptions inline instead of blocking with questions (hard gate preserved)

### Prompt changes
- system-prompt.ts: json_encoding rule expanded, ai_nodes in tools_guidance, Phase 2 inline assumptions
- claude.ts: ai_nodes in skill enum, max_tokens 16384
- knowledge.ts: ai_nodes -> n8n-ai-nodes skill mapping
- MessageBubble.tsx: DownloadButton component, truncation detection

### New files
- n8n-skills/skills/n8n-ai-nodes/SKILL.md

### Deployed
- Cloud Run revision 00021 (n8n-chat-ui-00021-m52)

### Test results
- TypeScript compile: clean
- Next.js production build: successful
- Regression: 7/29 run — 5 PASS, 1 PARTIAL (uc1_finance: Phase 2 gate held, harness needs 3-turn), 1 FAIL (pay_multi_bq_merge: Payments BQ cred gap + sandbox Slack not respected)
- Key findings: Code node overuse for Slack formatting (3/5), Phase 2 gate held 57% (4/7), Payments dept needs BQ credential
- Full regression table in `feedback-loop/STATE.md`

---

## v0.17 -- 2026-03-13
### Changes
- Smart defaults in Phase 1: AI states assumed defaults instead of asking questions for non-technical users
- Credential table ordering: dept-specific credentials appear first in examples (before shared/cross-dept)
- UC1 Finance test prompt updated to include all required details

### Prompt changes
- system-prompt.ts: Phase 1 smart defaults rule ("State your assumed defaults and ask for confirmation")
- departments.ts: credential example ordering (dept-specific first)

### Git range
b2a6fdd..69410c4

### Deployed
- Cloud Run revision 00018 (credential ordering) + 00019 (smart defaults)

### Test results
- UC1 Finance: PASS (smart defaults applied, Phase 2 gate held, correct SQL)
- CS regression (cs_churn_bq_slack): 8/8 PASS
- Marketing regression: all pass

---

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
