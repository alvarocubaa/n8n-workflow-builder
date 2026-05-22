# Next session brief — Session 12: End-to-end integration walkthrough (Hub × chat-ui × n8n-ops)

**Date:** 2026-05-22 or later
**Style:** Pre-flight by Claude; walkthrough is user-driven; findings report by Claude.
**Estimated effort:** ~90-105 minutes single focused session.

## What you're picking up

Session 13 shipped 2026-05-21 — Ron Madar-Hallevi's feedback alignment is live in production. Session 12 (originally HEAD before being preempted by Ron's spec feedback) is now re-promoted with two NEW verification points covering Session 13 behaviour. This is a verification + state-snapshot session, NOT a build session.

**Read these in order before starting:**
1. **[`.claude/plans/2026-05-20-integration-walkthrough.md`](plans/2026-05-20-integration-walkthrough.md)** — the canonical walkthrough plan. Three phases (pre-flight / walkthrough / findings report). Two new Session-13-specific points threaded in below.
2. `docs/decision-log.md` — the 2026-05-21 Session 13 entry covers exactly what changed (cron behaviour, table schema, UI fallback chain). Skim before the walkthrough so you can explain the new badges to the user.
3. `docs/innovation-hub/end-to-end-flow.md` — current architecture summary. Will be refreshed by you at the end of this session.

## NEW Session-13 verification points (thread into Path A or run standalone)

1. **Auto-calculated badge** — On the Marketing canonical KPI page (`https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53`), find PMM HubSpot in the Linked AI Initiatives table. The Expected Impact column should show `543.33` (or the latest tomorrow morning's MTD value) with a "Auto-calculated from n8n · YYYY-MM-DD" badge. Open the initiative's KPI Tracking card and confirm the same badge there.
2. **User-estimate fallback** — Pick an initiative (or create one) that has Time Saved as a linked KPI but NO row yet in `initiative_kpi_measurements` for the current month. Type a value in the "Expected (hours)" input and Save. Refresh — value persists. Then trigger `/initiative-kpi-sync` manually (see helper below). Refresh again — the typed value is STILL there (cron no longer overwrites it), and the badge says "User estimate".
3. **No-data badge** — Open an initiative with neither a measurement row nor a typed `expected_impact`. Expect "No data yet".

## Pre-flight checks (Claude, ~10 min)

Before the user starts the walkthrough:
- Verify n8n-ops rev = `n8n-ops-00009-j6p` (or newer).
- Verify Hub rev = `ai-innovation-hub-00107-9ks` (or newer).
- `supabase db query --linked "select count(*) from public.initiative_kpi_measurements where period_date >= date_trunc('month', current_date);"` — confirm rows exist.
- Confirm 06:15 UTC cron last ran without errors (check Cloud Run logs for `[initiative-kpi-sync] done` line).
- Confirm chat-ui rev = `n8n-chat-ui-00049-85m` (or newer).

## What's live going into this session

| Layer | Revision | Notes |
|---|---|---|
| chat-ui | `n8n-chat-ui-00049-85m` (2026-05-19) | Untouched in Session 13. |
| Hub | `ai-innovation-hub-00112-p78` (2026-05-22 afternoon, audit follow-ups) | COALESCE + source badge UI + freshness badge + chunked `.in()` + index-page chip consistency. |
| n8n-ops | `n8n-ops-00009-j6p` (2026-05-21) | Writes daily MTD rows to `initiative_kpi_measurements`. |
| Hub Supabase | `ilhlkseqwparwdwhzcek` | New `initiative_kpi_measurements` table (2026-05-21). |

## Pre-requisites

- `gcloud auth login` fresh.
- VPN or `thehub.gue5ty.com` access for the walkthrough.
- Read the walkthrough plan end-to-end.

## OIDC helper (manually triggering `/initiative-kpi-sync` for verification point #2)

```bash
SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')
TOKEN=$(gcloud auth print-identity-token --audiences="${SVC_URL}" \
  --impersonate-service-account=n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com \
  --include-email)
curl -X POST "${SVC_URL}/initiative-kpi-sync" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq '{measured, eligible, period_date, errors}'
```

## Open follow-ups surfaced by Session 13 (NOT walkthrough scope unless they block)

### 🔴 Urgent — needs Kurt
- **Hub `main` branch protection** (audit C1, 2026-05-22). `gh api repos/.../branches/main/protection` returns 404 — `main` accepts direct pushes from any contributor with push access. Combined with the disabled Cloud Build approval gate (Session 13 Step 0), there is no gate on production deploys. **Ask Kurt to enable branch protection on `main`**: require PR + 1 review + status checks; disallow direct pushes & force-push. My GitHub role is `push` only, not `admin` — I cannot enable this myself.

### 🟡 Open data-hygiene + UX follow-ups
- **PMM HubSpot data hygiene**: `'Positive CSAT Analysis - @Kareen Ben Ari'` workflow (`6o7gZ5h6yXzqixae`) is linked to PMM HubSpot's `initiative_workflow_links`. Verified via BQ: that workflow lives in CX production project (`W62G9hxuK9c7cKwo`), not Marketing — `/kpi-rollup` (dept-scoped, 87.57h) correctly excludes it, but `/initiative-kpi-sync` (initiative-linked, ~575h) includes it because the link table says so. Validate with Ron whether the link is intentional. If not: `delete from public.initiative_workflow_links where initiative_id='0588fd9f-4dbf-43e0-956b-d18151a6eac4' and n8n_workflow_id='6o7gZ5h6yXzqixae';`
- **`initiative_workflow_links.role` UX collision**: `'primary'` value collides with `is_primary` boolean. Rename to `'core'`, or hide role badge when `is_primary=false`, or default new link role to `'other'`. Schema-touching → separate PR.
- **`#/item/:shortCode` deep-link broken** for both UUID and item_number — Hub returns "Item Not Found". MEMORY.md's old deep-link is stale. Investigate routing.
- **Feedback-loop harvest** overdue ~36 days.
- **IS prod project ID** (`UCEMQoFhrGZ3FChz`) awaiting confirmation.

### 🟢 Audit follow-ups SHIPPED 2026-05-22 afternoon (after Session 13)
- **C2**: explicit deny INSERT/UPDATE/DELETE policies on `initiative_kpi_measurements` (Hub `2312fd1`, migration `20260522160000_*`). Service-role still bypasses; intent is now explicit.
- **H2**: `updated_at` column + BEFORE UPDATE trigger (Hub `dc0ca29`, migration `20260522170000_*`) + `formatMeasurementAge` helper in `kpiFormatters.ts` (8 spec cases) + KpiPanel + KpiLinkedInitiativesTable now render "Auto-calculated from n8n · refreshed Xh ago". Verified live at 2026-05-22 15:47 UTC: badge showed "refreshed 34m ago" matching the 15:13 UTC cron run.
- **H3 + M1**: chunked `.in()` filter at `IN_FILTER_BATCH_SIZE=50` (Hub `eaddfbc`) protecting against PostgREST URL-length overflow on lists >100, and `getInitiativesForKpis` (batched, index page) now merges measurements identically to the singular variant. Plus a consumer fix in `LinkedInitiativesChips.tsx` (`7fa9e14`) to actually USE `latest_measurement` instead of raw `expected_impact`. Verified live: Marketing index now shows `+575.3 hours` for PMM HubSpot (matching the detail page).

### ⚪ Open audit items still standing
- **H1** — `initiative_kpi_measurements` SELECT policy is org-wide (any authenticated Guesty user reads every initiative). Mirrors `initiative_kpis` pattern, so not strictly a regression — but worth a Kurt convo: is org-wide-read the intended threat model? Time-Saved data joined with `strategic_ideas.owner` is HR/competitive-adjacent.
- **H4** — Service-role key blast radius. Same key writes to all tables. Three mitigations in increasing effort: (a) rotate; (b) wrap writes in a `security definer` Postgres function with custom-role JWT; (c) Supabase audit logging + alert on service-role writes outside the cron window.
- **L-tier** — `on delete cascade` from `kpis` wipes measurement history; `LegacyKpiMeasurement` stub functions still in `services/api.ts` though semantically dead.

### Hub Cloud Build approval gate
**DISABLED going forward** (Session 13 Step 0). If re-enabling needed: `gcloud --project=ai-innovation-484111 alpha builds triggers export ai-innovation-hub-deploy --destination=/tmp/t.yaml` → edit `approvalConfig.approvalRequired: true` → `gcloud alpha builds triggers import --source=/tmp/t.yaml`. The `update github --require-approval` flag rejects with INVALID_ARGUMENT; use the export/import path.

## Gotchas carried forward

- **zsh `status` is read-only** — use `s=$(...)` in polling loops.
- **`Agentic Workflows/services/n8n-ops` not git-tracked** — Drive is source of truth.
- **Hub local main can lag origin/main**. Branch from `origin/main`. Kurt's AppPlatform WIP is NOT in the working tree as of 2026-05-21 — the stash-dance prescribed in prior sessions isn't currently needed.
- **OIDC tokens for n8n-ops** need `--impersonate-service-account=...workflow-builder@... --include-email`. Plain `print-identity-token` lacks email claim → `requireOidc` middleware 401.
- **PostgREST `on_conflict`** requires FULL unique constraint, not partial index. `initiative_kpi_measurements` has full; `initiative_kpis` has partial.
- **Supabase `db push` rejects** because remote has migrations the local dir doesn't. Apply via `supabase db query --linked -f <file>` then `supabase migration repair --status applied <timestamp>`.
- **PR squash-merge SHA ≠ branch HEAD SHA** — `gh pr view <num> --json mergeCommit` for the polling SHA.
- **Hub Cloud Build SUCCESS ≠ rev serving traffic** — verify with `gcloud run services describe ai-innovation-hub --region=us-central1 --format='value(status.traffic[0].revisionName)'`.

## User preferences (carried forward)

- Direct + terse. No fluff.
- Verify-before-claim. DB query or log line, not visual confirmation.
- Will commit + push + merge autonomously when given approval.
- Stage explicitly when collaborator WIP is in working tree. Never `git add -A`.
- All "Kurt coordination" items: we do them ourselves end-to-end. No DMs to draft.

## Quick reference (current as of 2026-05-21)

```
Marketing Time Saved KPI:    https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53
PoC deep-link example:        https://thehub.gue5ty.com/#/item/cd0945c8-e400-4e50-9fe7-76e51603e66d (PFR Celebration)
Hub repo path:                /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex/
Hub remote:                   github.com/kurtpabilona-code/AI-Innovation-Hub-Vertex
Hub VPN URL:                  https://thehub.gue5ty.com/
Hub Cloud Run direct:         https://ai-innovation-hub-721337864706.us-central1.run.app/
Hub Cloud Build trigger:      ai-innovation-hub-deploy (approvalRequired:false going forward)
Hub GCP project:              ai-innovation-484111 (number 721337864706)
Hub Supabase project:         ilhlkseqwparwdwhzcek

n8n-ops Cloud Run rev:        n8n-ops-00009-j6p
n8n-ops region/project:       europe-west1 / agentic-workflows-485210
n8n-ops URL:                  https://n8n-ops-fhehssni7q-ew.a.run.app/

chat-ui rev:                  n8n-chat-ui-00049-85m
```
