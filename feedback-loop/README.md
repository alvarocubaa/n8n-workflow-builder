# Feedback Loop -- Continuous Improvement Process

The harvest-test-learn-improve cycle is the core development process for the n8n Workflow Builder. Real user conversations from production feed back into the test suite, which drives quality improvements.

---

## The Cycle

```
HARVEST  -->  REVIEW  -->  PROMOTE  -->  TEST  -->  LEARN  -->  IMPROVE
  |                                                                |
  +--- Firestore conversations                   fix prompts/specs +
  |    become candidates                          guardrails/config |
  |                                                                |
  +----------------------------------------------------------------+
                         (weekly cycle)
```

### 1. HARVEST (weekly, Fridays)

Scan Firestore conversations for workflow JSONs. Each candidate captures two data points:
- **First user message** -- what the user actually asked
- **Last workflow JSON** -- the final workflow the AI produced

By default, scans ALL conversations (not just deployed ones). Filters out short/test conversations automatically.

```bash
cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts
```

Options:
- `--source conversations` -- (default) scan all conversations for workflows
- `--source deploys` -- only scan conversations with deploy events
- `--from 2026-03-13` -- only conversations after this date
- `--department ob` -- filter by department
- `--min-confidence medium` -- skip low-confidence candidates
- `--include-tests` -- include short/test conversations (< 2 user messages or < 15 char prompt)
- `--dry-run` -- preview without writing files

Output: `feedback-loop/candidates/{department}/`

### 2. REVIEW

For each candidate in `candidates/{department}/`:

**Check the YAML:**
- Is the prompt clear enough to pass Phase 1 without questions?
- Are expected_nodes and expected_creds correct for this department?
- Is the confidence high or medium?

**Check the workflow JSON:**
```bash
python3 tools/audit_workflow.py feedback-loop/candidates/cs/harvested_cs_001_workflow.json
```

**Decision:**
- **Promote** -- candidate is good, add to test suite
- **Reject** -- too vague, wrong creds, or not representative

### 3. PROMOTE

Copy the candidate's test case definition into `tools/test_cases.yaml`:
1. Copy the YAML block from the candidate file
2. Remove the `_metadata` section
3. Adjust the prompt if it's too vague for Phase 1
4. Move files to `feedback-loop/reviewed/promoted/`

### 4. TEST

Run the full regression suite:
```bash
python3 tools/run_regression.py                           # all cases
python3 tools/run_regression.py --case harvested_cs_001   # single case
python3 tools/run_regression.py --save-dir /tmp/regression # save outputs
```

Requires chat UI running on localhost:3004 (`docker-compose up -d`).

### 5. LEARN

When tests fail, document the pattern in `feedback-loop/learnings/`:

```markdown
# 2026-03-13: Credential type hallucination

## Failure
CS test used `slackOAuth2Api` instead of `slackApi` for department credentials.

## Root cause
Pre-training bias toward OAuth2 variant. Text rule not strong enough.

## Fix
Added correct/wrong JSON examples to department context (v0.16).

## Verification
CS regression 8/8 PASS after fix.
```

### 6. IMPROVE

Fix the root cause:
- System prompt rules (`chat-ui/src/lib/system-prompt.ts`)
- Department config (`chat-ui/src/lib/departments.ts`)
- Spec files (`specs/`)
- Node config overrides (in system prompt)

Deploy and retest.

---

## Cadence

| Day | Action |
|-----|--------|
| **Friday** | Run harvest, review new candidates |
| **As needed** | Promote candidates, run regression, fix failures |
| **After deploys** | Run targeted regression on affected departments |

At session start, Claude reads `STATE.md`. If harvest is overdue (>=5 days since last), it flags the reminder.

---

## Department Coverage Goals

| Department | Hand-written | Harvested | Target | Gap |
|------------|-------------|-----------|--------|-----|
| Marketing | 12 | 0 | 12+ | -- |
| CS | 4 | 1 | 6+ | Need more variety |
| CX | 2 | 3 | 6+ | Good pipeline |
| OB | 4 | 0 | 4+ | Need real users |
| Payments | 4 | 0 | 4+ | Need real users |
| Finance | 2 | 0 | 4+ | Need real users |

---

## Directory Structure

```
feedback-loop/
  README.md              <-- this file
  STATE.md               <-- living state (last harvest, pending reviews, gaps)
  candidates/            <-- harvested candidates by department
    cs/
    cx/
    ob/
    payments/
    finance/
    marketing/
  reviewed/
    promoted/            <-- candidates added to test_cases.yaml
    rejected/            <-- candidates not suitable (with reason)
  learnings/             <-- post-mortem notes from test failures
```
