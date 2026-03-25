# 2026-03-16: Production credentials used instead of sandbox

## Conversation
- **ID**: PCiTcWlociMj4RCe5vXJ
- **User**: roni.shif@guesty.com
- **Department**: CS
- **Date**: 2026-03-15
- **Use case**: Accounting Qualification Automation (Google Sheets trigger -> Gemini AI evaluation -> Slack routing -> Sheets write-back)

## Failure
The builder used 3 production credentials instead of sandbox:
- `Google Sheets account 55` (prod) -- no sandbox equivalent exists for CS
- `Slack account 77` (prod) -- no sandbox equivalent exists for CS
- `Google Gemini Guesty n8n8 CSM` (prod) -- sandbox has `Gemini - AI Team` but builder chose CSM variant

The AI did not warn the user that it was using production credentials.

## Root cause
Three gaps converged:
1. **System prompt had no sandbox/production rule** -- the `<credentials>` section said "use the department table" but never mentioned environment priority
2. **`generateCredentialExamples()` was env-agnostic** -- picked first matching credential regardless of sandbox/production, so examples showed production credentials
3. **CS sandbox has only 2 credentials** (Salesforce Sandbox + Gemini AI Team) -- Google Sheets, Slack, and Gemini CSM are production-only

The AI correctly used credentials from the department table (not fabricated), but chose production over sandbox without any warning to the user.

## Additional issues in this conversation
- **Non-random UUID v4 sub-IDs**: Set node assignment IDs were sequential patterns (`a1b2c3d4-0001-...` through `...0013`)
- **LangChain chainLlm node**: Used complex AI chain pattern (correct but hard to debug for non-technical users)
- **Workflow JSON truncated**: 12-node workflow cut off mid-output, user had to request individual node JSON
- **Phase 2 asked clarifying questions**: Should only validate data, not ask new requirements

## Fixes (all applied 2026-03-16, Session E)

### Bug 1: Production credentials over sandbox
1. **System prompt** (`system-prompt.ts`): Added ENVIRONMENT PRIORITY rule to `<credentials>` section
2. **Credential examples** (`departments.ts`): `generateCredentialExamples()` now prefers sandbox credentials
3. **CS sandbox gap flagged**: CS needs sandbox credentials for Google Sheets, Slack, and Gemini

### Bug 2: Non-random UUID v4 sub-IDs
- **System prompt** (`system-prompt.ts`): Expanded `json_encoding` rule to cover ALL UUIDs (assignment IDs, condition IDs, rule IDs) with bad sequential sub-ID examples

### Bug 3: No AI/LLM node skill
- **Created** `n8n-skills/skills/n8n-ai-nodes/SKILL.md` -- covers chainLlm v1.9, Gemini (`googlePalmApi`), OpenAI (`openAiApi`), sub-node wiring, output parsing
- **claude.ts**: Added `'ai_nodes'` to skill enum
- **knowledge.ts**: Added `ai_nodes: 'n8n-ai-nodes'` to SKILL_DIR_MAP
- **system-prompt.ts**: Added `"ai_nodes"` to `<tools_guidance>`

### Bug 4: Workflow JSON truncated
- **claude.ts**: `max_tokens` 8192 -> 16384
- **MessageBubble.tsx**: Truncation detection (JSON.parse fails on `"nodes"` block) -> yellow warning banner + download button. Valid workflow JSON also gets a "Download JSON" button.

### Bug 5: Phase 2 too rigid for conversational usage
- **system-prompt.ts**: Phase 2 now instructs AI to state assumptions inline ("I'll use tab 'Form Responses 1' -- correct me if different") rather than blocking with questions. Hard gate (no JSON in same turn) preserved.

## Verification
- [x] TypeScript compile: clean
- [x] Next.js production build: successful
- [x] Docker rebuild: successful
- [x] Cloud Build + deploy: revision n8n-chat-ui-00021-m52 serving 100%
- [ ] Manual test with CS department (AI/Gemini workflow)
- [ ] Run CS regression tests
- [ ] Test large workflow (10+ nodes) for truncation handling
- [ ] Test download button on valid and truncated JSON
