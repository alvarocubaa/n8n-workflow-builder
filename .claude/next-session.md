# Next session brief — Cleanup + follow-ups after Time Saved KPI v3 ship

**Last touched:** 2026-05-13 (post-v3 ship). v3 shipped end-to-end today; this brief is the cleanup tail.

## What's live as of 2026-05-13

Marketing Time Saved KPI in Hub is **fully running**:
- April 2026 = 38.08 h (pushed to `kpi_measurements`)
- May 2026 = 87.57 h (partial; monthly cron re-pushes June 1)
- Cloud Run `n8n-ops` on revision `n8n-ops-00007-tmm`
- 159 workflows in BQ dim with a `time_saved_per_execution_min` value (46 owner-set + 111 we bulk-populated + 2 drift)
- BQ migrations v2 + v3 applied; project_id / project_env / time_saved fields all populated on the workflows dim

## Pickup queue (small + parallel, no big new work)

### 1. chat-ui whitelist cleanup
Stop extracting the 3 deprecated baseline fields in planning-mode auto-extract:
- `current_process_minutes_per_run`
- `current_process_runs_per_month`
- `current_process_people_count`

These wire through `chat-ui/src/app/api/chat/route.ts` (`extractAndValidatePlanningFields`) and the SSE `extracted_fields` event. They no longer drive anything in our rollup (n8n workflow settings are the source of truth). Harmless drift; cleaner to remove. **Coordinate with Kurt** — he's stripping the form inputs on his side; remove our extraction at the same time so we don't keep writing to columns no UI uses.

Files to touch (chat-ui):
- `chat-ui/src/app/api/chat/route.ts` — whitelist drops 3 keys (14 → 11 keys, but check current count)
- Edge Function `n8n-conversation-callback` — drop the same 3 keys from re-validation
- Whatever planning system prompt referenced them

Estimated effort: 30 min. Single small PR.

### 2. Kurt DM follow-through
DM draft sits in `kurt.pabilona`'s Slack drafts (channel `D0A9V1YRRQT`, draft `Dr0B3G9SK0Q5`) since 2026-05-13. Review and send.

### 3. The 24 errored workflows (only when an affected KPI lands)
Documented in [docs/decision-log.md](../docs/decision-log.md) §"24-error breakdown":
- 21 IS production project: needs `n8n-workflow-builder` API key granted editor role on project `UCEMQoFhrGZ3FChz`. Path: ask Louie (IS team) OR have IT add project-editor for the SA. Not blocking until an IS Time Saved KPI is created in Hub.
- 2 Cura (Product) workflows: same scope issue on project `Wh25Z3w6AZxTFnWf`. Not blocking until a Product Time Saved KPI lands.
- 1 Upsell Detection 2.1 (CS): workflow has TWO webhook nodes both at `path='upsell-approval'`. n8n PUT rejects. Ronishif must either rename one webhook or set value via the n8n UI (the UI uses a different save code path that accepts the existing state). Not blocking until a CS Time Saved KPI lands.

### 4. bulk-estimate eligibility check tweak (cosmetic)
`tools/bulk-estimate-time-saved.ts::classifyOrPropose` skips on `mode === 'fixed' && value > 0`. Workflows we populated via API have `mode=null + value=N` so they re-appear as eligible on dry-runs. Re-applies are idempotent no-ops but verbose. Tighten the check to `value > 0 && mode !== 'dynamic'` to match the rollup's semantic. ~3 LOC.

### 5. Feedback-loop harvest (carried forward, ~5 weeks overdue)
Run `cd chat-ui && NODE_PATH=./node_modules npx tsx ../tools/harvest_test_cases.ts`. Last run 2026-04-15.

## Quick-reference URLs (unchanged)

```
Hub (VPN):         https://thehub.gue5ty.com/
chat-ui:           https://n8n-chat-ui-535171325336.europe-west1.run.app
n8n-ops:           https://n8n-ops-fhehssni7q-ew.a.run.app  (rev n8n-ops-00007-tmm)
Hub Supabase:      ilhlkseqwparwdwhzcek

Marketing Time Saved KPI
  kpi_id:           e6f47f5b-5de7-4630-84b5-441741270e53
  Hub link:         https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53
  Secret Manager:   kpi-webhook-token-e6f47f5b-5de7-4630-84b5-441741270e53

How to mint an audience-correct OIDC token to call n8n-ops endpoints from shell
(gcloud's default print-identity-token doesn't carry email claim → use IAM Credentials REST):

  SVC_URL="https://n8n-ops-fhehssni7q-ew.a.run.app"
  SA="n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com"
  ACCESS=$(gcloud auth print-access-token 2>/dev/null)
  TOKEN=$(curl -s -X POST \
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA}:generateIdToken" \
    -H "Authorization: Bearer ${ACCESS}" -H "Content-Type: application/json" \
    -d "{\"audience\":\"${SVC_URL}\",\"includeEmail\":true}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
```

## User preferences (carried forward)
- **Direct + terse.** No fluff.
- **Verify-before-destructive** especially when writing to live data / n8n / Hub. Today's session executed step 4a (single PUT test) before step 4b (bulk-apply 135) for exactly this reason.
- **Skip team-wide Slack comms unless explicit.** Kurt DM is OK (specific stakeholder ping); broad workflow-owner blast was skipped per direction.
- **`gcloud auth print-identity-token` ≠ `iamcredentials.generateIdToken`** — only the latter carries the `email` claim required by `n8n-ops`'s requireOidc middleware. Documented above.
