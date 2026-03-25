# Feedback Loop State

*Last updated: 2026-03-20 (Session G)*

---

## Last Harvest

- **Date**: 2026-03-20
- **Source mode**: conversations (scans ALL Firestore conversations)
- **Conversations scanned**: 167
- **Candidates extracted**: 13 (3 high, 10 medium) — filtered to --from 2026-03-16
- **Bug fixed**: harvester output path was relative, resolved to `chat-ui/feedback-loop/` instead of project root. Fixed in `harvest_test_cases.ts` line 113: now uses `path.join(path.dirname(__dirname), ...)`.

### This Week's Candidates (Mar 16-20)

| Department | Candidates | High | Medium |
|------------|-----------|------|--------|
| CS | 5 | 2 | 3 |
| CX | 7 | 1 | 6 |
| Payments | 1 | 0 | 1 |

### Users This Week

| User | Candidates | Key Conversations |
|------|-----------|-------------------|
| alvaro.cuba@guesty.com | 4 | CS/CX/Payments testing |
| roni.shif@guesty.com | 8 | HQ Support Update, HQ Billing, Modjo pagination |
| gil.almog@guesty.com | 1 | Zendesk upsell intent detection (deployed) |

---

## v0.19 Changes Made (Session F)

### 1. Full Credential Scan & Update (all 3 priority depts)
Scanned 33 workflows across 5 n8n projects via MCP API. Updated `departments.ts`:

| Dept | Before | After | Key Changes |
|------|--------|-------|-------------|
| CS | 13 creds | 21 creds | Fixed Modjo ID, added zendesk spec, 7 new creds (Roni's Sheets/Drive/Slack, Sheets Trigger, CX auto Sheets, n8n CS Read BQ), env fixes, BQ prompt rule |
| CX | 20 creds | 27 creds | Replaced stale ZD sandbox, fixed Gemini/Translate env, added LiteLLM+Gemini PaLM+ZD Main+Kurt Sheets+Inbal Sheets+Slack variants, removed unfound BQ CX |
| Marketing | 23 creds | 26 creds | Replaced Monday.com with 3 per-user IDs, added 13 (OpenAI, Cohere, Supabase x2, Postgres, Sheets Erik, HubSpot Dev, Gmail Samuel, Slack Samuel, Gemini Content, Trustpilot Ron), removed 10 unfound |

### 2. System Prompt Updates
- **`ai_for_classification` rule**: Defaults to AI/LLM node for classification/intent/sentiment tasks. States assumption in Phase 1 ("I'll use Gemini to classify... let me know if you prefer keywords").
- **BQ empty query check**: Phase 4 self-check item #4 — every BQ node must have non-empty SQL.
- **`ai_nodes` skill made proactive**: Changed from reactive ("when using AI nodes") to proactive ("when the workflow needs classification, intent detection...").

### 3. File Upload — Vertex AI Document Blocks
- PDFs now sent as native `DocumentBlockParam` with `Base64PDFSource` — Claude reads them directly
- Text files sent as `PlainTextSource` document blocks — not injected into message string
- Max file size raised from 50KB to 200KB
- Added file types: `.txt`, `.csv`, `.yaml/.yml`
- Files: ChatInput.tsx, ChatWindow.tsx, route.ts, claude.ts

### 4. Harvester Bug Fix
- Output path was relative (`feedback-loop/candidates`), resolved to `chat-ui/feedback-loop/` when run from chat-ui dir
- Fixed to use `path.join(path.dirname(__dirname), 'feedback-loop', 'candidates')` — absolute path from project root

---

## Pending Review

13 fresh candidates on disk (from Mar 20 harvest):

**Gil (CX)**: 1 candidate — Zendesk upsell detection (deployed, 3 unknown creds)
**Roni (CX+CS)**: 8 candidates — HQ Support Update, HQ Billing, Modjo pagination, etc.
**Alvaro (CS+CX+Pay)**: 4 candidates — testing

---

## Regression Status (v0.18 → v0.19 pending)

**v0.18 progress (unchanged)**: 7/29 run | 5 PASS | 1 PARTIAL | 1 FAIL | 22 UNTESTED

**v0.19 needs full re-run** — system prompt changed (cache bust), credentials updated, file upload reworked. Run all 29 existing + 3 new test cases = 32 total.

---

## Session G Progress (Mar 20)

- [x] **Add 3 new test cases** to `tools/test_cases.yaml`:
  - `cx_zendesk_upsell_ai` — FAIL (1 cred mismatch: Zendesk sandbox ID). AI classification works (no Code nodes).
  - `cs_zendesk_bq_aging` — PASS. CS BQ credential correct, SQL present, phase 2 gate held.
  - `cs_weekly_support_update_ai` — PASS. Gemini LangChain used, all 3 credentials correct, no Code nodes.
- [x] **Add 2 audit checks** to `tools/audit_workflow.py`:
  - `bq_query` — flags BQ nodes with empty SQL (verified against Gil's deployed workflow)
  - `no_code_nodes` — flags Code nodes when AI nodes expected (opt-in via `checks` field)
- [x] **Runner fix**: `checks` field in test_cases.yaml now filters audit results. Non-matching failures show as `(warn)`.
- [x] **Review Gil's and Roni's harvested conversations** — 13 candidates analyzed:
  - Gil: Zendesk upsell (deployed, 15 nodes) validates all 3 v0.19 fixes
  - Roni: Weekly support + Gemini summarization patterns captured in new test cases
  - Alvaro: 3 high-confidence cases overlap with existing regression
- [x] **Full 32-case regression** — 27/32 PASS (84.4%). Details below.
- [x] **Deploy to Cloud Run** — v0.19 deployed, revision `n8n-chat-ui-00022-v8t`
- [ ] Share feedback with Gil and Roni about fixes

### Systemic Fixes Applied (Session G)
1. **Strip MCP credentials** from search_nodes/get_node results (`claude.ts`) — prevents AI copying stale creds from existing workflows
2. **Sandbox DEFAULT labels** + production wrong-examples in credential examples (`departments.ts`)
3. **CS wrong-BQ-cred example** in CS promptRules — correct/wrong JSON for VQ7CU7dKViVcv8Ah vs h7fJ82YhtOnUL58u

### Regression v0.19 Final: 27/32 PASS (84.4%)
| Category | Pass | Fail | Cases |
|----------|------|------|-------|
| Core UCs (finance, cx, cs) | 4 | 1 | uc2_cx (CX BQ cred confusion) |
| CS regression | 4 | 0 | All pass |
| Marketing hackathon | 10 | 2 | hubspot_insights, event_command_center (multi-user cred picks) |
| OB | 4 | 0 | All pass |
| Payments | 3 | 1 | zuora_sf_reconcile (no SF node + BQ cred) |
| Varied patterns | 3 | 1 | cx_loop_zendesk_comment (BQ/ZD confusion) |
| v0.19 new | 3 | 0 | All pass |

---

## Session H Progress (Mar 24-25)

- [x] **Investigated "less smart" reports**: Queried Firestore for 10 most recent conversations + 2 specific bug reports (Gil `RZYtu3ZXwl8713Fw0XzA`, Roni `iGYjAAytXxl4L8fEL7aG`)
- [x] **Root cause analysis**: 3 issues: tool result amnesia, unbounded context growth, output truncation (max_tokens too low)
- [x] **Confirmed Claude-only**: No Gemini fallback anywhere in the codebase (stale README references only)
- [x] **Implemented v0.20**: 4-phase fix (max_tokens 32K, file upload awareness, token monitoring, tool context persistence, smart context windowing)
- [x] **Deployed**: Cloud Run revision `n8n-chat-ui-00023-z2c`
- [x] **Verified**: Replayed both conversations locally — 0 truncation, token monitoring working, tool context persisted

## Session I Notes (Mar 25, 2026)

- No feedback loop work this session (focus was Data Consultant mode + deployment planning)
- Harvest still due ~Mar 27 (5 days since last harvest on Mar 20)
- 13 candidates still pending review from Mar 20 harvest

## Next Actions (Session I)

- [ ] **Fix remaining 5 regression failures** (carried from Session G):
  - CX BQ confusion (uc2_cx, cx_loop_zendesk_comment): Add wrong-cred example to CX promptRules
  - Marketing multi-user creds (hack_hubspot_insights, hack_event_command_center): Relax test
  - pay_zuora_sf_reconcile: Update test expectation
- [ ] **Share feedback with Gil and Roni** — truncation fixed, tool context persists, file uploads work
- [ ] **Monitor v0.20 token analytics** — check Firestore analytics_events for inputTokens trends, any truncated=true events, context windowing triggers (inputTokens > 80K)
- [ ] **Harvest** (due ~Mar 27) — scan new conversations post-v0.20 deploy
- [ ] **Run full regression** against v0.20 (carried)

---

## Known Gaps

1. **OB/Payments have zero real user data** -- no conversations from these departments yet.
2. **Code node overuse** -- systemic for Slack formatting. New `ai_for_classification` rule addresses AI-eligible tasks but Slack formatting still uses Code nodes.
3. **Phase 2 gate inconsistent** -- ~57% compliance. May need structural change.
4. **Payments BQ credential gap** -- still no BigQuery credential. Requires admin/IT action.
5. **Harvester doesn't scan ALL workflows for credentials** -- scanned top 5-8 by node count per project. Some credentials in simple workflows may be missed.

---

## Learnings Log

| Date | Issue | Fix | Status |
|------|-------|-----|--------|
| 2026-03-20 | Gil: Code nodes for upsell classification | Added ai_for_classification rule to system prompt | Fixed, untested |
| 2026-03-20 | Gil: BQ node deployed with empty query | Added Phase 4 self-check #4 | Fixed, untested |
| 2026-03-20 | Gil: Wrong BQ credential for CS | Added BQ prompt rule + correct credential IDs to CS dept | Fixed, untested |
| 2026-03-20 | Roni: File upload dumps text into message | Implemented Vertex AI document blocks (PDF native, text as PlainTextSource) | Fixed, untested |
| 2026-03-20 | Roni: "Less smart" perception | Root cause: tool result amnesia (specs lost between turns) + unbounded context (40-msg history) + output truncation. Fixed in v0.20 with tool context persistence, context windowing, max_tokens 32K. | Fixed, verified |
| 2026-03-20 | Credential naming convention changes | Full scan of 5 projects, updated 3 depts (~40 credential changes) | Fixed |
| 2026-03-20 | Harvester writes to wrong directory | Fixed relative path to absolute using path.dirname(__dirname) | Fixed |
| 2026-03-16 | Bug 1-5 from Session E | See Session E entries below | Fixed |
| 2026-03-16 | Production credentials over sandbox | ENVIRONMENT PRIORITY rule | Fixed |
| 2026-03-16 | Non-random UUID v4 sub-IDs | Expanded json_encoding rule | Fixed |
| 2026-03-16 | No AI/LLM node skill | Created n8n-ai-nodes skill | Fixed |
| 2026-03-16 | Workflow JSON truncated | max_tokens 16384 + detection | Fixed |
| 2026-03-16 | Phase 2 too rigid | Inline assumptions | Fixed |
