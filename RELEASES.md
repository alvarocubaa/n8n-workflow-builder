# n8n Workflow Builder -- Release History

## v0.23 -- 2026-04-10 (deployed, revision n8n-chat-ui-00027-5q4)

### Changes

**CSM/owner field rule (K-3)** — driven by Gil + Céline Slack feedback (Apr 9) and live BQ verification:
- Live data finding: `dim_accounts.csm` (BQ analytics CSM, 100% populated) and SF `Owner.Name` / `Account_Owner_F__c` are different concepts at Guesty and disagree on **~80% of random active accounts**. `Account_Owner_F__c` is sparse (10.7% populated, mostly tier-specific). Documented in `feedback_two_csm_concepts.md`.
- Bug pattern: harvested_cs_005 selected `c.csm` from `csm_churn_report` AND made a redundant SF round-trip to `Owner.Name` — Slack output showed both with conflicting values. Multi-layered fix:
  1. **System prompt** new `<rule name="csm_owner_field">`: when a BQ table with a `csm` column is already in the workflow, SELECT it directly. Only fall back to SF Owner.Name when no BQ data source.
  2. **CSM spec callout** + verified SQL example pair (✅ correct in-query pattern + ❌ wrong SF round-trip pattern).
  3. **Salesforce spec** OwnerId precedence annotation referencing the CSM rule.
  4. **`audit_workflow.py` check #11** `csm_no_sf_roundtrip` — static check that flags BQ-already-has-csm AND SF owner lookup. Verified: catches harvested_cs_005, 0 false positives across 44 harvested workflows.
  5. **Regression test** `cs_churn_bq_slack` fixed: removed `salesforceOAuth2Api` from expected_creds (was rewarding the bug), added `csm_no_sf_roundtrip` check.

**Phase 4 self-check #6 — field-shape contracts (K-3)** — driven by Roni's Apr 5 chat (`bYJaD5Gt3tpgwvTR98DG`):
- Bug pattern: builder modified a Set node to convert `attachments_url` from string to array via `.split().map()`, but failed to update the downstream `IF Attachment URL Valid` node which still compared with `notEquals "N/A"`. Result: `["N/A"] != "N/A"` evaluated TRUE in n8n's loose comparison → workflow tried to download "N/A" as a URL → broken.
- Fix: Phase 4 self-check #6 added — for every Set node that produces an array, scan downstream IF/Filter/Switch nodes; if they use string operators on array-typed fields, fix with `field[0]` or array semantics. Currently a passive guardrail; synthetic test case TBD.

**v0.23-prep (K-1, queued from Apr 1)** — bundled because system-prompt.ts changes overlapped with K-3:
- **Phase 4 self-check #5**: cross-check workflow against original user request (catches Gil's "missing email/recipients" pattern from harvested_payments_007).
- **JSON-first output order**: workflow JSON before explanations (so truncation cuts explanations, not JSON).
- **`PINNED_START_SIZE = 4`** (was 2): preserves Phase 1+2 in long conversations through context windowing.
- **Truncation UX polish**: yellow warning → teal "extensive workflow" message with download.
- **CX/Payments wrong-cred examples**: programmatic JSON examples to anchor against credential hallucination.

### Triggered by

- **Gil + Céline Slack feedback (Apr 9, 6:15-6:37 AM)**: "Big query is csm" / "SF is `Account_Owner_F__c`" — investigated, found Account_Owner_F__c populated only on 10.7% of active accounts and that the BQ csm column was the right canonical source (CS-team always meant the analytics CSM, not the SF account owner).
- **Roni chat `bYJaD5Gt3tpgwvTR98DG` (Apr 5, 20 messages)**: Builder introduced an array-vs-string bug while modifying a CX billing-ticket workflow.
- **K-1 backlog**: v0.23-prep code was queued since Apr 1 awaiting regression and Docker.

### Files changed

- `chat-ui/src/lib/system-prompt.ts` (Phase 4 self-checks #5 + #6, csm_owner_field rule, JSON-first output)
- `chat-ui/src/lib/claude.ts` (PINNED_START_SIZE=4, softer truncation message)
- `chat-ui/src/components/MessageBubble.tsx` (teal truncation UX)
- `chat-ui/src/lib/departments.ts` (CX/Payments wrong-cred examples)
- `specs/02_SRC_CSM_Spec.md` (section 2 callout, section 5 csm column ref + verified SQL pattern pair)
- `specs/02_SRC_Salesforce_Spec.md` (OwnerId precedence annotation, filter list update)
- `tools/audit_workflow.py` (new check #11 csm_no_sf_roundtrip with regex-precise SELECT detection)
- `tools/test_cases.yaml` (cs_churn_bq_slack fix: removed SF cred, added new check)
- `feedback-loop/STATE.md` (Session K-3 entry)
- `MEMORY.md` (Where We Left Off)
- `~/.claude/projects/.../memory/feedback_two_csm_concepts.md` (new feedback memory)

### Verification

- TypeScript clean (`npx tsc --noEmit`)
- Next.js build clean (compiled in 6.6s, 5/5 static pages OK)
- Docker build clean (local rebuild + restart)
- Audit check #11 against all 44 harvested workflows: 1 true positive (harvested_cs_005), 0 false positives
- **End-to-end LLM regression `cs_churn_bq_slack`**: PASS — AI Phase 1 plan literally said *"Account owner: csm column from the same table (no Salesforce round-trip needed — it's 100% populated)"*. Final workflow: 6 nodes (BQ + Slack only, NO Salesforce). Audit: 8 PASS, 0 FAIL.
- Cloud Build 5d658f33 (1m16s)
- Cloud Run revision `n8n-chat-ui-00027-5q4` serving 100% of traffic
- Production smoke test: HTTP 302 → IAP OAuth (correct)
- **Rollback target**: `n8n-chat-ui-00026-qf5` (v0.22)

---

## v0.22 -- 2026-03-27 (superseded by v0.23, revision n8n-chat-ui-00026-qf5)
### Changes
- **Context window 10x increase**: `CONTEXT_TOKEN_THRESHOLD` 80K → 800K. Vertex AI supports 1M input tokens for Sonnet 4.6 GA. 200K margin for system prompt, tools, output, and safety.
- **Output capacity doubled**: `max_tokens` 32768 → 65536.
- **Sliding window widened**: `RECENT_WINDOW_SIZE` 12 → 20.
- **Typing lag fix**: `React.memo` on MessageBubble with custom comparator, memoized `MessageList` component, stable `crypto.randomUUID()` keys. Eliminates re-render cascade on keystroke in long conversations.
- **Full Guesty rebrand**: Teal palette (guesty-50→400), Figtree font, AI avatar, typing indicator, code block headers. All 20+ components restyled.

### Triggered by
- User feedback: "takes almost a minute to show what I'm typing" in multi-day conversation
- Context windowing triggered at only 80K (8% of available 1M)

### Files changed
- chat-ui/src/lib/claude.ts (context threshold, max_tokens, window size)
- chat-ui/src/components/MessageBubble.tsx, ChatWindow.tsx, ChatInput.tsx (performance + rebrand)
- chat-ui/tailwind.config.ts, globals.css (Guesty design system)
- 15+ additional components (rebrand), Toast.tsx (new), guesty-logo.png (new)

### Verification
- TypeScript clean, Next.js build passes, Docker build succeeds
- Cloud Run revision `n8n-chat-ui-00026-qf5` serving 100%
- Rollback target: `n8n-chat-ui-00024-6sm` (v0.21)

---

## v0.21 -- 2026-03-25 (superseded by v0.22, revision n8n-chat-ui-00024-6sm)
### Changes
- **Data Consultant mode**: New dual-mode assistant — Builder (existing workflow builder) + Data Consultant for schema exploration, SQL generation, and AI agent planning. ModeSelector card UI on landing page, mode-aware system prompt routing, tool filtering (no workflow tools in data mode), credential stripping in data mode. Mode persisted in Firestore conversations + analytics. Builder mode has zero overhead (3 if-checks per request).
- **Feedback loop process**: New harvest-test-learn-improve cycle as core development process. Harvester tool (`tools/harvest_test_cases.ts`) extracts test candidates from Firestore conversations. First harvest: 54 candidates from 140 conversations across CS, CX, Payments departments.
- **AI nodes skill**: New `n8n-ai-nodes` skill guide for AI Agent, LLM Chain, and tool nodes configuration.
- **Expanded regression suite**: 26 test cases (up from ~10), covering all 6 departments.

### Files changed
- chat-ui/src/components/ModeSelector.tsx (new — mode selection cards)
- chat-ui/src/lib/system-prompt-data.ts (new — data consultant system prompt)
- chat-ui/src/lib/claude.ts (mode-aware tool filtering, credential stripping)
- chat-ui/src/app/api/chat/route.ts (mode routing, context management)
- chat-ui/src/components/ChatWindow.tsx (mode selector integration)
- chat-ui/src/components/ChatInput.tsx (mode-specific example prompts)
- chat-ui/src/components/MessageBubble.tsx (data mode message styling)
- chat-ui/src/lib/departments.ts (department context for data mode)
- chat-ui/src/lib/firestore.ts (mode field on conversations)
- chat-ui/src/lib/types.ts (AssistantMode type, mode fields)
- chat-ui/src/lib/system-prompt.ts (mode-aware prompt selection)
- feedback-loop/ (new — process docs, candidates, learnings)
- n8n-skills/skills/n8n-ai-nodes/SKILL.md (new — AI nodes skill)
- tools/harvest_test_cases.ts (new — conversation harvester)
- tools/test_cases.yaml (expanded to 26 cases)

### Verification
- TypeScript compiles clean, Next.js build passes, Docker build succeeds
- Cloud Run revision n8n-chat-ui-00024-6sm healthy (1.44s startup)
- Rollback target: n8n-chat-ui-00023-z2c

---

## v0.20 -- 2026-03-24 (superseded by v0.21, revision n8n-chat-ui-00023-z2c)
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
