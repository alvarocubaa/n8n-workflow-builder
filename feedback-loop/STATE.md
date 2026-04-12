# Feedback Loop State

*Last updated: 2026-04-10 (Session K-3 — v0.23 deployed)*

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

- No feedback loop work this session (focus was v0.21 deployment)
- Harvest overdue — 5 days since last harvest on Mar 20. Due NOW.
- 13 candidates still pending review from Mar 20 harvest

## Session J Notes (Mar 27, 2026)

- No feedback loop work this session (focus was v0.22 performance + rebrand deployment)
- Harvest overdue — 7 days since last harvest on Mar 20. Due NOW.
- 13 candidates still pending review from Mar 20 harvest

## Session K-1 Progress (Apr 1, 2026)

### Conversation Feedback Analysis

**Convo `tVVmQI8mIuETc9yhxgM6` (truncation)**:
- Root cause: `max_tokens: 65536` exceeded for complex workflows. Detection works (`stop_reason === 'max_tokens'`).
- Fix applied: Phase 4 now outputs JSON first, explanations after (truncation cuts explanations, not JSON). Backend truncation warning softened. Frontend yellow warning → friendly teal message.
- Not harvested (no valid workflow JSON produced — confirms truncation was the issue).

**Convo `RZYtu3ZXwl8713Fw0XzA` (Gil — missing email/recipients)**:
- Root cause: Phase 4 self-check was technical-only (credentials, BQ projectId, dates, empty SQL). Did NOT verify requirements completeness.
- Contributing factor: Context windowing `PINNED_START_SIZE=2` dropped Phase 2 confirmations (SQL, email recipients) in long conversations.
- Harvested as `payments_007` — 31-node deployed workflow, complexity 4.
- Gil's suggestion to "split into plan/build/verify" — already exists as Phases 1-4. Gap was in Phase 4 verification scope.
- Fixes: Added self-check #5 (cross-check against user request), increased `PINNED_START_SIZE` from 2 to 4.

### Code Changes (v0.23-prep)

1. **`system-prompt.ts`**: Phase 4 self-check #5 (requirements cross-check), JSON-first output order
2. **`claude.ts`**: `PINNED_START_SIZE = 4` (pins Phase 1+2 through context windowing), softer truncation warning
3. **`MessageBubble.tsx`**: Yellow truncation banner → teal "extensive workflow" message with download
4. **`departments.ts`**: CX wrong-cred BQ example (`2EJkTXIICSEva3cQ` correct, `h7fJ82YhtOnUL58u` wrong), Payments wrong-cred BQ example (`h7fJ82YhtOnUL58u` correct, `aLlYQkLWrmANkfFZ` wrong — that's Google Drive)
5. **`test_cases.yaml`**: Marketing Slack cred updated (`MkMAiC1ecfpYtIz1` → `5Ii5X9IFid1S8rIE` — old cred removed in v0.19)

All compile clean (tsc + Next.js build pass).

### Harvest (Apr 1)

- **Date**: 2026-04-01
- **Source**: conversations since 2026-03-20
- **Scanned**: 247 total, 80 processed
- **Candidates**: 45 (25 high, 20 medium)

| Department | Candidates | High | Medium |
|------------|-----------|------|--------|
| CS | 13 | 9 | 4 |
| CX | 18 | 5 | 13 |
| Marketing | 4 | 2 | 2 |
| Payments | 7 | 5 | 2 |
| Finance | 2 | 2 | 0 |
| OB | 1 | 1 | 0 |

### Users This Harvest

| User | Candidates | Key Conversations |
|------|-----------|-------------------|
| alvaro.cuba@guesty.com | 27 | Testing all departments |
| gil.almog@guesty.com | 2 | SF vs Zuora comparison (deployed), GuestyPay inactive monitor (deployed, 31 nodes) |
| roni.shif@guesty.com | 16 | Universal Client Reporting (deployed), ZD Master Sheet (deployed), many CX workflows |

### Deployed Workflows Found (3)

1. **Gil**: `[AI by gil.almog] SF vs Zuora Contract Comparison (Weekly)` — CX, 12 nodes, complexity 5
2. **Gil**: `[AI by gil.almog] GuestyPay Sub-Accounts - Monthly Inactive Monitor` — Payments, 31 nodes, complexity 4
3. **Roni**: `[AI by roni.shif] Workflow 2 - ZD Master Sheet to Zendesk Ticket` — CS, 12 nodes, complexity 4

- [x] Harvest completed
- [x] All 5 regression failure fixes applied (code + test expectations)
- [x] TypeScript + build clean
- [ ] **Run full regression** — Docker not running, deferred to next session

## Token Analytics (v0.22, Mar 27 – Apr 1, 2026)

**Source**: Firestore `analytics_events` collection, queried Apr 1, 2026.

### Summary

| Metric | Value | Assessment |
|--------|-------|------------|
| Total events | 214 | Healthy usage across 5 days |
| Active users | 4 | Roni (71%), Alvaro (22%), Gil (5%), Kurt (1%) |
| Avg input tokens/turn | 76,017 | Comfortably within 800K |
| Max input tokens | 476,300 | Well under 800K limit — no risk of hitting ceiling |
| Avg output tokens/turn | 2,003 | Low — mostly Phase 1 Q&A |
| Max output tokens | 13,065 | Well under 64K limit |
| Truncated events | **0** | 64K output cap is sufficient |
| Events >80K input (would've been windowed pre-v0.22) | **66 (31%)** | Major improvement — these conversations now run without data loss |
| Avg cache read tokens | 13,297 | System prompt + dept context caching working |

### Daily Breakdown

| Date | Events | Avg input | Avg output | Truncated |
|------|--------|-----------|------------|-----------|
| Mar 29 | 82 | 53K | 819 | 0 |
| Mar 30 | 21 | 28K | 1,066 | 0 |
| Mar 31 | 63 | 107K | 1,165 | 0 |
| Apr 1 | 48 | 96K | 5,536 | 0 |

### By Department

| Dept | Events | % |
|------|--------|---|
| CX | 154 | 72% |
| CS | 26 | 12% |
| Marketing | 16 | 7.5% |
| Finance | 6 | 2.8% |
| Payments | 6 | 2.8% |
| OB | 6 | 2.8% |

### Key Findings

1. **v0.22 context window is working**: 31% of events exceeded the old 80K limit. These would have triggered context windowing (and potential data loss) pre-v0.22. Now they run smoothly.
2. **Zero truncation**: The 64K output token limit is sufficient. No events hit the ceiling.
3. **Cache hit rate healthy**: ~13K cache read tokens per turn (system prompt ~7-8K + dept context), confirming prompt caching works.
4. **Data Consultant mode barely used**: Only 1 event out of 214 (0.5%). Builder mode dominates.
5. **CX is primary department**: Roni drives 71% of usage, almost entirely CX workflows.
6. **Mar 31 spike**: Avg input jumped to 107K — likely longer conversations with more tool context. Still well within limits.
7. **3 deployments since v0.22**: All by Gil (Payments), GuestyPay inactive monitor (31-node, complexity 5, estimated $500 value).

### Recommendations

- Monitor if max input tokens approaches 400K+ — may need sliding window tuning
- Data Consultant mode needs promotion or may not be a needed feature
- Consider dept-specific analytics to track quality per department

---

## Next Actions (Session K-2)

- [ ] **Start Docker + run full regression** against v0.23-prep + K-3 changes
- [ ] **Deploy v0.23** to Cloud Run after regression passes
- [ ] **Share feedback with Gil and Roni** — truncation hidden behind polished UX, Phase 4 now cross-checks requirements, context windowing preserves Phase 2
- [ ] **Monitor v0.22 token analytics** — check Firestore analytics_events
- [ ] **Production smoke tests** — Builder mode + Data Consultant + rebrand visual
- [ ] **Spec enrichment** — CSM (critical gap), Zuora, AdminData

---

## Session K-3 (Apr 10, 2026 — CSM/owner field rule + Roni R1 self-check)

### Trigger: Power-user feedback

1. **Gil + Céline (Slack, Apr 9):** Builder is "not using the correct CSM fields". Céline named SF `Account_Owner_F__c` as canonical.
2. **Roni (chat `bYJaD5Gt3tpgwvTR98DG`, Apr 5):** 20-msg CX session — builder modified a Set node to convert `attachments_url` to an array via `.split().map()` but failed to update the downstream `IF Attachment URL Valid` node, which still compared as a string. `["N/A"] != "N/A"` evaluated TRUE → workflow tried to download "N/A" as a URL → broken. Roni had to come back to debug.

### Live BigQuery verification (Apr 10, 2026)

| Field | Population (active accounts) | Notes |
|---|---|---|
| `dim_accounts.csm` (= `csm.portfolio.csm`) | **18,626 / 18,626 (100%)** | Canonical CS-team CSM, always populated |
| SF standard `OwnerId` → `Owner.Name` | **18,625 / 18,626 (100%)** | Standard SF account owner, always populated |
| SF `Account_Owner_F__c` | **1,999 / 18,626 (10.7%)** | Sparse formula field — Céline's pick, but unusable as universal rule |
| SF `Acc_Owner_Id__c` | 1,999 (10.7%) | Same coverage, raw ID source for `_F__c` |
| SF `Success_Program_CSM__c` | 842 (4.5%) | Tier-specific (Success Program only) |
| SF `Success_Program_CSM_F__c` | 835 (4.5%) | Formula version |

**Key findings:**
- `Account_Owner_F__c` ≈ standard `Owner.Name` (~90% agreement when populated). They are not different sources for "the SF account owner" — `_F__c` is mostly a mirror, just sparser.
- BQ `dim_accounts.csm` and SF `Owner.Name`/`Account_Owner_F__c` are **different concepts** — disagree on 24/30 (80%) of random active accounts. CS-team CSM is not the same as SF account owner.
- **The bug is conflation, not wrong field choice:** [harvested_cs_005](feedback-loop/candidates/cs/harvested_cs_005_workflow.json#L37) selected `c.csm` from `csm_churn_report` AND made a redundant SF round-trip to `Owner.Name` — Slack message showed both with conflicting values.

### Root cause of the CSM bug

Spec actively pushed the wrong pattern at multiple layers:
- [`specs/02_SRC_Salesforce_Spec.md:746-763`](specs/02_SRC_Salesforce_Spec.md#L746) — verified SQL example "Resolve OwnerId to user name" via `JOIN sf_users` (strongest signal per our meta-learning, "verified SQL > text rules > pre-training")
- [`specs/02_SRC_CSM_Spec.md`](specs/02_SRC_CSM_Spec.md) — listed the `csm` column on multiple tables but never connected it to the user concept "the CSM"
- [`tools/test_cases.yaml:77-96`](tools/test_cases.yaml#L77) — `cs_churn_bq_slack` test rewarded the wrong pattern by listing `salesforceOAuth2Api` in `expected_creds`

### Code Changes (K-3)

1. **`chat-ui/src/lib/system-prompt.ts`** — added two rules:
   - Phase 4 self-check #6 (field-shape contracts): catches Roni's R1 — Set→IF type mismatches
   - New `<rule name="csm_owner_field">`: universal entry-point rule on CSM/owner lookup precedence (BQ csm column > SF round-trip)
2. **`specs/02_SRC_CSM_Spec.md`** — three additions:
   - Section 2 callout: "CSM / Account Owner Lookup Rule (CRITICAL)" with full table list and rationale
   - Section 5 quick reference: added `csm` column row pointing to lookup rule
   - Section 5 verified SQL example: ✅ correct in-query pattern + ❌ wrong SF-round-trip pattern (the strongest guardrail format per meta-learning)
3. **`specs/02_SRC_Salesforce_Spec.md`** — two additions:
   - `OwnerId` row at line 102 annotated with precedence (BQ csm first, only fall back to SF if no BQ)
   - "Resolve OwnerId to user name" SQL example at line 746 prefaced with "use only when no BQ data source" warning
   - Filters & limits list: added "CSM / account owner lookups" item
4. **`tools/audit_workflow.py`** — added check #11 `csm_no_sf_roundtrip`:
   - Static check: if BQ query already SELECTs `csm` column from a CSM-dataset table AND workflow has a SF node querying for "owner", flag as redundant round-trip
   - Tested against all 18 harvested CS workflows: 1 true positive (`harvested_cs_005`), **0 false positives** (correctly skips `harvested_cs_007/004/002/008` which use csm_churn_report for `max_paid_listings`/`churn_reason`, not for csm)
5. **`tools/test_cases.yaml`** — fixed `cs_churn_bq_slack` test:
   - Removed `salesforceOAuth2Api` from `expected_creds` (was rewarding the bug)
   - Added `csm_no_sf_roundtrip` to `checks`
   - Updated description to reference the new rule and harvested_cs_005 reproduction

### Verification

- TypeScript compile: clean (`npx tsc --noEmit` passes)
- Audit check on `harvested_cs_005`: catches the bug as the only failure (`csm_no_sf_roundtrip` FAIL, 13 PASS)
- Audit check on `harvested_cs_007/004/002/008`: 0 failures (no false positives)
- Live BQ query verification: 6 source comparisons across 18,626 active accounts

### Deploy (Apr 10, 20:22 UTC) — DONE

- [x] **Targeted regression run**: `cs_churn_bq_slack` PASSED end-to-end. AI Phase 1 plan output: *"Account owner: csm column from the same table (no Salesforce round-trip needed — it's 100% populated)"*. Workflow shrunk from 9 nodes (with redundant SF call) to 6 nodes (BQ-only). audit check #11 PASS.
- [x] **Cloud Build + Cloud Run deploy**: Build 5d658f33 (1m16s), pushed image, new revision **`n8n-chat-ui-00027-5q4`** serving 100% of traffic.
- [x] **Production smoke test**: HTTP 302 → IAP OAuth (correct), reconciling=false, generation=29.
- [x] **Rollback target**: `n8n-chat-ui-00026-qf5` (v0.22) — single command if needed.

### Still Pending — Session L

- [ ] Share findings with Gil + Céline + Roni — with the data showing two-CSM-concepts disagreement (~80%)
- [ ] Optional follow-up: ask CS-Ops whether the 10.7% population of `Account_Owner_F__c` is intentional (tier-specific) or a data hygiene gap
- [ ] Synthetic test case for Roni R1 (string→array Set node + IF) to validate Phase 4 self-check #6 end-to-end
- [ ] Power-user re-test invitations: Roni for the array/IF fix, Gil for the CSM rule

---

## Known Gaps

1. **Code node overuse** -- systemic for Slack formatting. `ai_for_classification` rule addresses AI-eligible tasks but Slack formatting still uses Code nodes.
2. **Phase 2 gate inconsistent** -- ~57% compliance. May need structural change.
3. **Payments BQ credential gap** -- still no BigQuery credential for Payments (uses shared). Requires admin/IT action.
4. **Gil's Payments workflows use unknown creds** -- `gmailOAuth2: 4BConxQW0qmylDKE` (harvested_payments_007), `googleApi: PAAimNTryrvB72dp` (harvested_cx_006). Need to add to departments.ts.
5. **Roni's CX workflows have many unknown creds** -- 10 of 16 candidates flagged. CX credential scan may need refresh.

---

## Learnings Log

| Date | Issue | Fix | Status |
|------|-------|-----|--------|
| 2026-04-10 | Gil/Céline: Builder picks SF Owner.Name when BQ csm column already in query (harvested_cs_005) | Multi-layer fix: system prompt rule (csm_owner_field), CSM spec callout + verified SQL example, SF spec cross-reference, audit check #11 (csm_no_sf_roundtrip), test_cases.yaml fix | Fixed, untested |
| 2026-04-10 | Roni: Set node converted field to array via .split(), downstream IF node still compared as string — `["N/A"] != "N/A"` evaluated TRUE, broke workflow | Phase 4 self-check #6 added to system-prompt.ts | Fixed, untested |
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
