# Session 13 — Ron feedback alignment: MTD aggregation + historical retention + Hub UI fallback

**Date:** 2026-05-22
**Owner:** Alvaro Cuba (full end-to-end — we own both repos; no Kurt coordination needed)
**Estimated effort:** ~4-5 hours
**Style:** Agent-driven implementation; user reviews + smokes UI at end.

---

## 1. Why this session exists

Ron Madar-Hallevi sent 4 Slack DMs on 2026-05-20 with concrete feedback on how the Time Saved KPI rollup should behave. Our existing implementation (Session 9 Track A, deployed 2026-05-15 as `n8n-ops-00008-vqf`) gets the data plumbing right but has **three semantic mismatches** with what Ron actually needs.

Ron's exact asks (verbatim quotes from the Slack screenshots):

1. *"At the end, you should send Kurt the aggregated Time Saved per initiative, based on all the n8n workflows connected to that initiative."* — ✅ we already do this per-initiative.
2. *"If there is no Time Saved data available directly from n8n, then you should use the information provided by the user — meaning the estimated time they wrote they expect the workflow / initiative to save. First priority: use the actual Time Saved data from n8n workflow settings. If no n8n data exists: use the user's expected time saved estimate from the initiative. This logic can also sit on Kurt's side."* — ❌ today our cron overwrites the user's value with 0 when n8n has nothing.
3. *"The data should be sent to Kurt on a daily basis"* — ✅ already daily (06:15 UTC).
4. *"as a month-to-date aggregation"* — ❌ today we use rolling 30 days, not MTD.
5. *"At the end of each month, the count should reset and start again for the new month. Keep the data for each month."* — ❌ today we overwrite one row per (initiative, kpi); no history retained.
6. The example timeline he gave (May 1–2 = 19.4h sum, May 1–3 = 26.2h sum, …) — illustrates daily snapshots of MTD totals.
7. *"Identify all n8n workflows connected to each initiative. Calculate Time Saved per workflow. Aggregate total Time Saved per initiative. Send Kurt a daily month-to-date update. Reset aggregation at the beginning of each new month. Keep the data for each month."* — the procedure spec.

## 2. Decisions LOCKED in the prior turn (do NOT re-litigate)

These were agreed by the user. Execute on them; don't suggest alternatives:

1. **Approval gate**: disable the Hub Cloud Build trigger's `approvalRequired: true` ourselves. Keep it disabled going forward (auto-deploy on merge, same model as every other Cloud Run service). The 13-day backlog showed the gate caused more harm than safety. Cancel the ~37 superseded PENDING builds while we're at it.
2. **Schema approach**: NEW table `initiative_kpi_measurements` for daily MTD historical rows. Do NOT add a `measured_impact_hours` column to `initiative_kpis`. The new table is keyed on `(initiative_id, kpi_id, period_date)` and is KPI-agnostic (future non-Time-Savings KPIs write to the same table).
3. **`initiative_kpis.expected_impact` becomes USER-OWNED**: cron stops writing to it. It only holds values the user typed via the Hub UI (the "Expected (hours): 18" input Ron showed). This is a behavioural reversal of the Session 9 Option-A "auto-overwrite" decision — explicitly logged in this session's decision-log entry.
4. **Hub UI fallback chain**: `COALESCE(latest_measurement_for_current_month.value, expected_impact, 0)`. Small UI badge ("Auto-calculated from n8n" vs "User estimate") so Ron knows which he's seeing.
5. **MTD window**: `WHERE day >= date_trunc('month', current_date) AND day <= current_date`. NOT rolling 30 days.
6. **End-of-session ritual deferred** — this session ALSO supersedes the Session 12 walkthrough as HEAD; after Session 13, Session 12 walkthrough becomes HEAD and validates the new behaviour.
7. **All Kurt coordination is OURS** — that includes the Hub UI work (KpiPanel + KpiLinkedInitiativesTable), the migration, the Hub PR, the build approval, the operational Slack message. No DMs to draft; just ship.

## 3. Repo state going in (2026-05-21 snapshot)

| Layer | Path | Branch / Rev | What it carries today |
|---|---|---|---|
| chat-ui | `/Users/alvaro.cuba/Library/CloudStorage/GoogleDrive-alvaro.cuba@guesty.com/My Drive/n8n-builder-cloud-claude/chat-ui/` | `session/2026-05-08-jira-integration` / Cloud Run `n8n-chat-ui-00049-85m` | Sessions 9-11 + 2026-05-19 prefill+auth+display hotfixes. **Not touched this session.** |
| Hub | `/Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex/` | `main` (after stash dance) / Cloud Run `ai-innovation-hub-00106-zj8` | PRs #52-#56 + 2026-05-19 hotfix. Local working tree has Kurt's AppPlatform WIP — same stash pattern as prior sessions. |
| n8n-ops | `/Users/alvaro.cuba/Library/CloudStorage/GoogleDrive-alvaro.cuba@guesty.com/My Drive/Agentic Workflows/services/n8n-ops/` | NOT git-tracked (Drive only) / Cloud Run `n8n-ops-00008-vqf` (2026-05-15) | Session 9 initiative-kpi-sync + folded into /sync-hub daily cron. **Touched this session.** |
| Hub Supabase | project `ilhlkseqwparwdwhzcek` | n/a | `initiative_kpis`, `kpi_measurements`, `strategic_ideas`, `initiative_workflow_links` all live. **Touched this session — new table.** |

### Key URLs

- chat-ui prod: `https://n8n-chat-ui-fhehssni7q-ew.a.run.app/`
- Hub prod (VPN): `https://thehub.gue5ty.com/`
- Hub prod (Cloud Run direct): `https://ai-innovation-hub-721337864706.us-central1.run.app/`
- n8n-ops Cloud Run: `https://n8n-ops-fhehssni7q-ew.a.run.app/`
- Marketing Time Saved KPI: `https://thehub.gue5ty.com/business-kpis/e6f47f5b-5de7-4630-84b5-441741270e53`
- PMM HubSpot initiative (Ron's example): query `select id from public.strategic_ideas where title ilike '%PMM HubSpot%'` to get the UUID

### Live `initiative_kpis` schema (verified 2026-05-21)

```
id              uuid     NOT NULL  PK
initiative_id   uuid     NOT NULL  FK strategic_ideas.id
kpi_id          uuid     NOT NULL  FK kpis.id
signal_kpi_id   uuid     NULL
impact_period   text     NULL      ('monthly' / 'quarterly' / etc — text not enum)
expected_impact numeric  NULL      ← THIS BECOMES USER-OWNED after this session
created_at      timestamptz NOT NULL
updated_at      timestamptz NOT NULL
```

Partial unique index: `(initiative_id, kpi_id) WHERE kpi_id IS NOT NULL`. Use SELECT→UPDATE/INSERT pattern (NOT PostgREST `on_conflict` — Session 9 already discovered this).

### Current cron behaviour (BEFORE this session) — verified 2026-05-21

**Files (read both before editing):**
- `Agentic Workflows/services/n8n-ops/src/routes/initiative-kpi-sync.ts` (260 lines) — the route. Defines `runInitiativeKpiSync()`, called by both the HTTP wrapper `initiativeKpiSync()` AND from `src/routes/sync-hub.ts:131-137` inside the daily cron.
- `Agentic Workflows/services/n8n-ops/src/services/supabase.ts` (lines 216-356) — defines `listAllInitiativesWithCategory`, `listAllWorkflowLinks`, `findCanonicalKpiForDept`, `upsertInitiativeKpi`. The `upsertInitiativeKpi` uses SELECT→PATCH-or-POST (NOT PostgREST `on_conflict`) because `initiative_kpis` has a PARTIAL unique index `(initiative_id, kpi_id) WHERE kpi_id IS NOT NULL`.

**Current BQ query** ([initiative-kpi-sync.ts:151-175](Agentic%20Workflows/services/n8n-ops/src/routes/initiative-kpi-sync.ts)):

```sql
WITH links AS (
  SELECT
    JSON_VALUE(row, '$.initiative_id') AS initiative_id,
    JSON_VALUE(row, '$.workflow_id')   AS workflow_id
  FROM UNNEST(JSON_QUERY_ARRAY(@payload)) AS row
)
SELECT
  l.initiative_id,
  ROUND(
    SUM(IFNULL(s.success_runs, 0) * IFNULL(w.time_saved_per_execution_min, 0) / 60.0),
    2
  ) AS hours_30d
FROM links l
LEFT JOIN ${fq('workflows')} w
  ON w.workflow_id = l.workflow_id AND w.valid_to IS NULL
LEFT JOIN (
  SELECT workflow_id, SUM(success_runs) AS success_runs
  FROM ${fq('daily_workflow_stats')}
  WHERE day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)   -- ← LINE TO CHANGE
  GROUP BY workflow_id
) s ON s.workflow_id = l.workflow_id
GROUP BY l.initiative_id
```

The alias `hours_30d` is referenced in `interface BqInitiativeHoursRow { initiative_id: string; hours_30d: number | null; }` (line 60-63) and downstream in `hoursByInitiative.set(r.initiative_id, Number(r.hours_30d ?? 0))` (line 184). After this session: rename to `hours_mtd` everywhere.

Then `upsertInitiativeKpi` is called per plan (line 200), which writes `initiative_kpis.expected_impact = hours_30d`. **That `upsertInitiativeKpi` call disappears completely this session** — replaced by a new helper writing to `initiative_kpi_measurements` instead. The `upsertInitiativeKpi` function itself can be deleted from `services/supabase.ts` if grep confirms nothing else uses it.

## 4. Execution plan — 6 work items in order

### Step 0 — Hub Cloud Build approval gate (10 min)

**Disable the gate + cancel superseded queue.**

```bash
# Disable approval requirement
gcloud --project=ai-innovation-484111 beta builds triggers update ai-innovation-hub-deploy \
  --no-require-approval

# Verify it took
gcloud --project=ai-innovation-484111 builds triggers describe ai-innovation-hub-deploy \
  --format="value(approvalConfig.approvalRequired)"
# Expected: false  (or empty field)

# Cancel superseded PENDING builds (all of them — main has moved past every one)
for id in $(gcloud --project=ai-innovation-484111 builds list \
              --filter="status=PENDING" --limit=50 --format="value(id)"); do
  gcloud --project=ai-innovation-484111 builds cancel "$id"
done

# Verify queue cleared
gcloud --project=ai-innovation-484111 builds list --filter="status=PENDING" --format="value(id)" | wc -l
# Expected: 0
```

**Why first**: subsequent steps push to the Hub repo and we want auto-deploy from this point forward. If anything in Step 0 fails, the Hub work later in the session still ships (we can manually approve like before), but auto-deploy is cleaner.

### Step 1 — Migration: create `initiative_kpi_measurements` table (15 min)

**File:** create `Agentic Workflows/services/n8n-ops/migrations/2026-05-22_initiative_kpi_measurements.sql` (n8n-ops-side reference — apply via supabase CLI against Hub project). Also commit a copy at `Hub repo: supabase/migrations/20260522120000_add_initiative_kpi_measurements.sql` for source-control durability.

```sql
-- 2026-05-22 — Daily per-initiative MTD measurements for canonical KPIs.
--
-- Holds one row per (initiative, kpi, period_date) written daily by
-- n8n-ops /initiative-kpi-sync route (folded into /sync-hub 06:15 UTC cron).
-- Replaces the prior overwrite-in-place pattern on initiative_kpis.expected_impact
-- so historical month-by-month data is retained. initiative_kpis.expected_impact
-- becomes USER-OWNED (manual UI input only).
--
-- Per Ron's 2026-05-20 spec: daily snapshots of month-to-date totals; reset at
-- beginning of each new month (handled by the MTD window in the BQ query, not
-- by row deletion); historical rows preserved.

create table if not exists public.initiative_kpi_measurements (
  id              uuid primary key default gen_random_uuid(),
  initiative_id   uuid not null references public.strategic_ideas(id) on delete cascade,
  kpi_id          uuid not null references public.kpis(id) on delete cascade,
  period_date     date not null,                      -- the day the measurement was taken
  period_type     text not null default 'month_to_date'  -- room for daily / weekly later
                  check (period_type in ('month_to_date', 'daily', 'weekly', 'monthly_total')),
  value           numeric not null,                   -- hours
  source          text not null default 'n8n_auto'    -- audit trail of who wrote it
                  check (source in ('n8n_auto', 'manual', 'backfill')),
  workflow_count  integer,                            -- how many workflows contributed
  created_at      timestamptz not null default now(),
  -- One measurement per (initiative, kpi, day, type). Idempotent re-runs upsert.
  unique (initiative_id, kpi_id, period_date, period_type)
);

create index if not exists idx_ikm_initiative_kpi_period
  on public.initiative_kpi_measurements (initiative_id, kpi_id, period_date desc);

create index if not exists idx_ikm_kpi_period
  on public.initiative_kpi_measurements (kpi_id, period_date desc);

alter table public.initiative_kpi_measurements enable row level security;

-- Service-role only; Hub UI reads via existing RLS-bypassing service path.
-- No anon policies — Hub Edge Functions / chat-ui SA / Kurt UI server-side use service role.

comment on table public.initiative_kpi_measurements is
  'Daily per-initiative MTD snapshots written by n8n-ops /initiative-kpi-sync. Source of truth for the auto-calculated Time Saved value Kurt''s UI displays. initiative_kpis.expected_impact stays user-owned as fallback.';
```

**Apply:**

```bash
cd /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex
supabase db query --linked -f supabase/migrations/20260522120000_add_initiative_kpi_measurements.sql
supabase migration repair --status applied 20260522120000

# Verify
supabase db query --linked "select column_name, data_type from information_schema.columns where table_name='initiative_kpi_measurements' order by ordinal_position;"
```

### Step 2 — n8n-ops: MTD window + write to new table + stop writing `expected_impact` (1.5 h)

**File:** `Agentic Workflows/services/n8n-ops/src/routes/initiative-kpi-sync.ts`

Three coordinated changes:

(a) **Change BQ window** from rolling 30 days to MTD:
```ts
// OLD: WHERE s.day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
// NEW: WHERE s.day >= DATE_TRUNC(CURRENT_DATE(), MONTH) AND s.day <= CURRENT_DATE()
```

Grep for `INTERVAL 30 DAY` in `initiative-kpi-sync.ts` AND any helper it pulls from (likely `services/bigquery.ts`). Both need updating. Rename the result alias `hours_30d` → `hours_mtd` everywhere for clarity.

(b) **Replace the `upsertInitiativeKpi` call** with a new helper `insertInitiativeKpiMeasurement` writing to the new table. The OLD `expected_impact` write path is REMOVED entirely. New helper signature:

```ts
// services/supabase.ts — new helper
export async function upsertInitiativeKpiMeasurement(input: {
  initiative_id: string;
  kpi_id: string;
  period_date: string;       // 'YYYY-MM-DD'
  period_type: 'month_to_date';
  value: number;
  workflow_count: number;
  source: 'n8n_auto';
}): Promise<void> {
  const url = `${URL_BASE}/rest/v1/initiative_kpi_measurements?on_conflict=initiative_id,kpi_id,period_date,period_type`;
  await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(input),
  });
  // …existing error handling pattern from upsertInitiativeKpi…
}
```

Note: the new table HAS a full unique constraint `(initiative_id, kpi_id, period_date, period_type)` (not partial), so PostgREST `on_conflict=...` works correctly — UNLIKE the `initiative_kpis` partial index that forced Session 9 to use SELECT→UPDATE/INSERT. Verify with `\d+ initiative_kpi_measurements` in supabase db query.

(c) **Delete `upsertInitiativeKpi` from `services/supabase.ts`** if it's no longer used elsewhere. Grep `grep -rn "upsertInitiativeKpi\b" src/` first to confirm nothing else calls it. Update `summary.results` items to use new action names like `'measured'` / `'planned'` / `'skipped_*'` (drop the `'updated'` / `'inserted'` split — only `inserted` makes sense for an append-style measurements table).

**Smoke** (local before deploy):
```bash
cd "/Users/alvaro.cuba/Library/CloudStorage/GoogleDrive-alvaro.cuba@guesty.com/My Drive/Agentic Workflows/services/n8n-ops"
npm run build
# tsc clean expected. Fix any type errors.
```

### Step 3 — Deploy n8n-ops (15 min)

```bash
cd "/Users/alvaro.cuba/Library/CloudStorage/GoogleDrive-alvaro.cuba@guesty.com/My Drive/Agentic Workflows/services/n8n-ops"
./deploy.sh
# Wait for "Service [n8n-ops] revision [n8n-ops-00009-...] has been deployed"
```

Trigger a manual run for today's data (don't wait for tomorrow's cron):

```bash
SVC_URL=$(gcloud run services describe n8n-ops --region=europe-west1 --project=agentic-workflows-485210 --format='value(status.url)')

# OIDC token — DO NOT use plain print-identity-token (no email claim).
TOKEN=$(gcloud auth print-identity-token --audiences="${SVC_URL}" \
  --impersonate-service-account=n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com \
  --include-email)

# Dry run first
curl -X POST "${SVC_URL}/initiative-kpi-sync" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true}' | jq .

# Live
curl -X POST "${SVC_URL}/initiative-kpi-sync" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq .
```

**Verify:**
```bash
cd /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex
supabase db query --linked "select initiative_id, kpi_id, period_date, value, workflow_count, source from public.initiative_kpi_measurements order by created_at desc limit 10;"
```
Expect rows for today's date. `value` should be a 21-day MTD sum (today = May 22), NOT 30 days.

Manually verify one initiative against BQ:
```bash
# Look up PMM HubSpot UUID + linked workflow IDs first
supabase db query --linked "
  select s.id, l.n8n_workflow_id
  from public.strategic_ideas s
  join public.initiative_workflow_links l on l.initiative_id = s.id
  where s.title ilike '%PMM HubSpot%';"

# Then run a hand-BQ:
bq query --use_legacy_sql=false "
  SELECT SUM(s.success_runs * COALESCE(w.time_saved_per_execution_min, 0) / 60.0) AS hours_mtd
  FROM \`agentic-workflows-485210.n8n_ops.daily_workflow_stats\` s
  JOIN \`agentic-workflows-485210.n8n_ops.workflows\` w
    ON w.workflow_id = s.workflow_id AND w.valid_to IS NULL
  WHERE s.day >= DATE_TRUNC(CURRENT_DATE(), MONTH)
    AND s.day <= CURRENT_DATE()
    AND s.workflow_id IN ('<id1>', '<id2>', '<id3>')"
```
Numbers must match. If they don't, the new SQL is wrong.

### Step 4 — Hub UI: read measurements + fallback chain + source badge (1.5 h)

**Files involved (verified 2026-05-21):**

| File | Lines | Role |
|---|---|---|
| `components/kpis/KpiPanel.tsx` | 784 | Per-initiative KPI Tracking card (right column in `IdeaDetailModal.tsx:2466`). Renders contributions list with each `c.expected_impact` via `formatExpectedImpact(c.expected_impact, c.impact_period, c.kpi?.unit)` at line ~570. |
| `components/kpis/KpiLinkedInitiativesTable.tsx` | 160 | "Linked AI Initiatives" table on the canonical KPI page. Sorts + sums rows by `expected_impact`. Lines 37, 42, 128 reference `expected_impact`. **`rows` is a prop** — assembled by the parent (likely `KpiDataSourcePage.tsx` or whichever component renders the canonical KPI page; grep `<KpiLinkedInitiativesTable` to find caller). |
| `services/api.ts` | 4577 + 4598 | `getInitiativeKpis(initiativeId): Promise<InitiativeKpi[]>` and `getAllInitiativeKpis(): Promise<InitiativeKpi[]>`. Both use `.from('initiative_kpis').select(KPI_INITIATIVE_JOIN + KPI_CANONICAL_JOIN + KPI_SIGNAL_JOIN)`. The KPI_SIGNAL_JOIN already includes a `kpi_measurements` subjoin pattern — we'll mirror it for the new table. |
| `types.ts` | search `^export interface InitiativeKpi` | The shape returned to UI. Extend with `latest_measurement?: { period_date: string; value: number; source: string }`. |

**Implementation approach (do it at the API layer, not per-component):**

(a) **Extend `InitiativeKpi` type** in `types.ts`:
```ts
export interface InitiativeKpi {
  // ...existing fields...
  /**
   * Latest auto-calculated measurement for the CURRENT month.
   * Written daily by n8n-ops /initiative-kpi-sync. Null when no
   * measurement exists yet (this month, or ever). UI fallback:
   * COALESCE(latest_measurement.value, expected_impact, 0).
   */
  latest_measurement?: {
    period_date: string;        // 'YYYY-MM-DD'
    value: number;              // hours
    source: 'n8n_auto' | 'manual' | 'backfill';
  } | null;
}
```

(b) **Add a new constant join** in `services/api.ts` near the existing `KPI_*_JOIN` consts:
```ts
// 2026-05-22 — join the latest MTD measurement for the current calendar
// month so the UI can COALESCE(latest_measurement.value, expected_impact).
// Filter to current month + descending by period_date + limit 1.
const KPI_LATEST_MEASUREMENT_JOIN =
  'latest_measurement:initiative_kpi_measurements(period_date,value,source)'
  // PostgREST embedded filter syntax. Filtered + limited at query time via
  // .or() / .order() / .limit() chained calls — see getInitiativeKpis below.
  ;
```

Actually PostgREST embedded resources can't filter by date dynamically via simple select string. Two options:
- **Option I (clean, more code)**: in `getInitiativeKpis` and `getAllInitiativeKpis`, do TWO queries: existing `initiative_kpis` query + a second `initiative_kpi_measurements` query filtered to `period_date >= date_trunc('month', current_date)` + ordered by period_date DESC. Merge client-side by `(initiative_id, kpi_id)`. Cleaner SQL, slightly more code.
- **Option II (one query, embedded resource)**: include `latest_measurement:initiative_kpi_measurements(period_date,value,source,...)` in the select string with `order=period_date.desc,limit=1` via the supabase-js `.order()` chain. Returns ALL measurements for each KPI; UI filters to current month + first row. Simpler code, more data over wire.

**Pick Option I** — performance + correctness. Two short queries beat assembling-and-filtering arrays.

(c) **Modify `getInitiativeKpis`** to fetch + merge:
```ts
export const getInitiativeKpis = async (initiativeId: string): Promise<InitiativeKpi[]> => {
  const { data: kpiData, error: kpiErr } = await supabase
    .from('initiative_kpis')
    .select([KPI_INITIATIVE_JOIN, KPI_CANONICAL_JOIN, KPI_SIGNAL_JOIN].join(','))
    .eq('initiative_id', initiativeId);
  if (kpiErr) throw kpiErr;
  if (!kpiData?.length) return [];

  const kpiIds = kpiData.map((r) => r.kpi_id).filter(Boolean) as string[];
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const { data: measRows } = await supabase
    .from('initiative_kpi_measurements')
    .select('initiative_id,kpi_id,period_date,value,source')
    .eq('initiative_id', initiativeId)
    .in('kpi_id', kpiIds)
    .gte('period_date', monthStart.toISOString().slice(0, 10))
    .order('period_date', { ascending: false });

  // Latest-per-kpi
  const latestByKpi = new Map<string, { period_date: string; value: number; source: string }>();
  for (const r of measRows ?? []) {
    if (!latestByKpi.has(r.kpi_id)) {
      latestByKpi.set(r.kpi_id, { period_date: r.period_date, value: Number(r.value), source: r.source });
    }
  }

  return kpiData.map((k) => ({
    ...(k as InitiativeKpi),
    latest_measurement: latestByKpi.get(k.kpi_id ?? '') ?? null,
  }));
};
```

Mirror the same pattern in `getAllInitiativeKpis` (one fetch covers all initiatives; pass `initiative_id IN (...)` filter to the measurements query).

(d) **Update `KpiPanel.tsx` render** — change line ~570 from:
```tsx
{formatExpectedImpact(c.expected_impact, c.impact_period, c.kpi?.unit)} expected
```
to a `displayValue` + source-badge pattern:
```tsx
{(() => {
  const measured = c.latest_measurement?.value;
  const display = measured != null && Number.isFinite(measured)
    ? measured
    : c.expected_impact;
  const sourceLabel = measured != null
    ? `Auto-calculated from n8n · ${c.latest_measurement!.period_date}`
    : 'User estimate · type in n8n Workflow Settings to auto-calculate';
  return (
    <>
      {formatExpectedImpact(display, c.impact_period, c.kpi?.unit)}{' '}
      <span className="text-[10px] text-gray-500">expected</span>
      <p className="text-[10px] text-gray-400 mt-0.5">{sourceLabel}</p>
    </>
  );
})()}
```
The edit input STAYS writing to `expected_impact` (it's user-owned). The display now prefers measured.

(e) **`KpiLinkedInitiativesTable.tsx` data assembly**:
- Find the parent that builds `rows: LinkedInitiativeRow[]` by greping for `<KpiLinkedInitiativesTable`.
- Augment `LinkedInitiativeRow` type with `latest_measurement?` (mirror `InitiativeKpi`).
- In the assembly path, populate `latest_measurement` from `getAllInitiativeKpis()` (or whatever feeds this table) — the per-row fallback computes the same way: `display = latest_measurement?.value ?? expected_impact`.
- Change line 37 (sort), line 42 (sum), line 128 (render) to use `display` instead of raw `expected_impact`.

(f) **Tests**: existing `KpiPanel.spec.tsx` (~600 lines per the grep above) has render tests. Add 3 cases:
- `latest_measurement` present + non-zero → display measured, badge says "Auto-calculated"
- `latest_measurement` null + `expected_impact` set → display expected, badge says "User estimate"
- both null → display 0 with "No data yet"

Run `npm test -- --run` to confirm.

(g) **TS check**: `npx tsc --noEmit` MUST pass.

**Stash + branch dance first** (Kurt's AppPlatform WIP in working tree):

```bash
cd /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex
git fetch origin
git stash push -u -m "kurt-wip-appplatform-2026-05-22" -- \
  App.tsx components/Sidebar.tsx components/icons/Icons.tsx constants.ts types.ts \
  components/modals/ components/ui/DeploymentStatusCard.tsx \
  components/views/AppPlatform.tsx migrations/add_app_deployments.sql \
  services/appDeployments.ts supabase/functions/deploy-app/
git checkout -b session/2026-05-22-mtd-kpi-fallback origin/main
```

**Changes needed:**

(a) **New service function** in `services/api.ts`:
```ts
export interface InitiativeKpiSnapshot {
  initiative_id: string;
  kpi_id: string;
  measured_value: number | null;      // latest MTD measurement value for current month
  measured_date: string | null;        // YYYY-MM-DD of latest measurement
  expected_impact: number | null;      // user-typed fallback from initiative_kpis
  display_value: number | null;        // COALESCE(measured, expected, null)
  display_source: 'measured' | 'expected' | 'none';
}

export async function getInitiativeKpiSnapshot(
  initiative_id: string,
  kpi_id: string,
): Promise<InitiativeKpiSnapshot> {
  // 1. Read latest measurement for current month
  // 2. Read initiative_kpis.expected_impact
  // 3. Compute display_value + display_source
  // Mirror existing fetch patterns in api.ts
}

// Plural helper for tables (Linked AI Initiatives view) — batched query.
export async function getInitiativeKpiSnapshotsForKpi(
  kpi_id: string,
): Promise<InitiativeKpiSnapshot[]> { ... }
```

(b) **Update `KpiPanel.tsx`** — currently renders `expected_impact`. Change to render `display_value` from the new snapshot helper. Add a small subtitle below the number:
- If `display_source === 'measured'`: "Auto-calculated from n8n · last updated {measured_date}"
- If `display_source === 'expected'`: "User estimate · type in n8n Workflow Settings to auto-calculate"
- If `display_source === 'none'`: "No data yet"

(c) **Update `KpiLinkedInitiativesTable.tsx`** — the "Expected Impact" column should read from `display_value`. Add an icon/tooltip per row indicating the source (measured vs expected).

(d) **Tests** — most touched files have specs in `.spec.ts(x)`. Add coverage for the COALESCE logic. Run `npm test -- --run` to confirm clean.

(e) **TS check** — `npx tsc --noEmit` MUST pass. Kurt's stashed WIP may add `AppDeployment` references; if Step 0's stash dance worked, those won't be present and tsc will be clean.

### Step 5 — Investigate Item 7 (two "primary" workflows) (30 min)

Query to confirm the actual state:

```bash
cd /Users/alvaro.cuba/Code/AI-Innovation-Hub-Vertex
supabase db query --linked "
  select l.initiative_id, s.title as initiative,
         l.n8n_workflow_id, l.n8n_workflow_name, l.role, l.is_primary
  from public.initiative_workflow_links l
  join public.strategic_ideas s on s.id = l.initiative_id
  where s.title ilike '%PMM HubSpot%'
  order by l.created_at desc;"
```

Expect to see two rows. Likely scenario:
- Both rows have `role='primary'` (just a CHECK enum value)
- Only ONE has `is_primary=true` (enforced by partial unique index)

The dropdown UI in `WorkflowLinkPicker.tsx` probably shows `role` as the dropdown label, which is why both LOOK "primary". This isn't a bug, just a label collision. **Fix**: rename the dropdown options or add visual indicator for `is_primary=true`. Find the file via `grep -rn "primary\|WorkflowLinkPicker" components/ | head`.

If actual schema state shows TWO rows with `is_primary=true`, the partial unique index has been violated — would be a real bug. Investigate the demote-then-promote 5-step write order from Session 6 Jira pattern.

**If it's just label confusion**: 5-line fix in the picker component. If it's a real constraint violation: separate investigation, defer to a follow-up session.

### Step 6 — Commit, push, deploy, smoke (30 min)

```bash
# Hub branch — only the files YOU changed (not Kurt's WIP)
git add components/kpis/KpiPanel.tsx \
        components/kpis/KpiLinkedInitiativesTable.tsx \
        services/api.ts \
        supabase/migrations/20260522120000_add_initiative_kpi_measurements.sql \
        # + any spec files + the picker fix if applied

git -c gpg.signingkey= -c commit.gpgsign=false commit -m "$(cat <<'EOF'
feat(kpi): per-initiative MTD measurements + measured/expected fallback in UI

Aligns with Ron Madar-Hallevi's 2026-05-20 feedback spec. Three coordinated
changes across n8n-ops (separate Drive-only repo) + Hub:

1. New table public.initiative_kpi_measurements — daily MTD snapshots per
   (initiative, kpi, date). Replaces the overwrite-in-place pattern that lost
   history and clobbered user-typed estimates.

2. n8n-ops cron (Session 13 separate change) stops writing
   initiative_kpis.expected_impact. That column becomes USER-OWNED (manual
   input via KpiPanel "Expected (hours)" field). Cron writes only to the new
   measurements table.

3. Hub UI reads measurements + falls back to expected_impact:
   - KpiPanel: shows display_value with source badge.
   - KpiLinkedInitiativesTable: same COALESCE pattern.
   - getInitiativeKpiSnapshot helper in services/api.ts.

Also: investigated Ron's "two primary workflows" observation on PMM HubSpot.
[Either fix applied OR documented as label collision per Step 5 finding.]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push -u origin session/2026-05-22-mtd-kpi-fallback

# Open PR + merge (approval gate is now disabled per Step 0)
gh pr create --base main --head session/2026-05-22-mtd-kpi-fallback \
  --title "feat(kpi): per-initiative MTD measurements + fallback UI" \
  --body "$(cat <<'EOF'
Closes Ron's 2026-05-20 feedback.

## Summary
- NEW table `initiative_kpi_measurements` (daily MTD snapshots per initiative/KPI)
- n8n-ops cron writes there instead of overwriting `initiative_kpis.expected_impact`
- `expected_impact` is now USER-OWNED (manual input via KpiPanel)
- Hub UI: COALESCE(latest_measurement, expected_impact, 0) + source badge
- MTD window (was rolling 30d)

## Test plan
- [ ] Migration applied + visible in schema
- [ ] After 1 cron run: `initiative_kpi_measurements` has rows for today
- [ ] KpiPanel shows correct display_value + source label
- [ ] Setting `expected_impact` manually persists (cron no longer overwrites)
- [ ] KpiLinkedInitiativesTable totals match per-initiative measurements

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --squash --delete-branch

# Auto-deploy kicks off because we disabled the approval gate in Step 0.
# Poll until done — use `s=$(...)` NOT `status=$(...)` (zsh quirk that bit us before)
until s=$(gcloud --project=ai-innovation-484111 builds list \
            --filter="source.repoSource.commitSha=<merge sha>" \
            --format="value(status)" --limit=1 2>/dev/null) \
      && [[ "$s" == "SUCCESS" || "$s" == "FAILURE" ]]; do
  echo "[$(date +%H:%M:%S)] Hub build: $s"; sleep 30
done

# Confirm new rev serves
gcloud --project=ai-innovation-484111 run services describe ai-innovation-hub \
  --region=us-central1 --format="value(status.traffic[0].revisionName,status.traffic[0].percent)"

# Restore Kurt's WIP on local main
git checkout main
git stash pop
```

**Smoke** (user-driven, IAP-gated):
1. Open Hub → PMM HubSpot initiative → KPI Tracking card.
2. Verify Time Saved card shows a value with the new source badge.
3. Type 25 into "Expected (hours)", click Save. Refresh. Persists.
4. Trigger `/initiative-kpi-sync` again (curl). Refresh PoC card. `expected_impact` should STILL be 25 (cron doesn't touch it).
5. Open Marketing KPI page (`/business-kpis/e6f47f5b-…`) — Linked AI Initiatives table should show per-initiative values from new measurements.

## 5. End-of-session ritual

1. **Decision-log entry 2026-05-22** in `docs/decision-log.md`:
   - Reversal of Session 9 Option A (auto-overwrite) → now Option C-ish (separate tables, user-owned column preserved)
   - New table schema rationale (KPI-agnostic, room for non-Time-Savings KPIs later)
   - MTD vs rolling 30d
   - Approval-gate disabled going forward
2. **Refresh `docs/innovation-hub/end-to-end-flow.md`** — update the KPI rollup algorithm section + status table to reflect new behaviour. Specifically the "Algorithm" code block and the live data row.
3. **Session queue update**:
   - Move Session 13 to SHIPPED log with outcome summary.
   - Promote Session 12 (walkthrough) back to HEAD. The walkthrough now ALSO validates this new behaviour (Path A step 8 etc) — read [`2026-05-20-integration-walkthrough.md`](2026-05-20-integration-walkthrough.md) and add 2-3 new verification steps for the measurements table.
   - Rewrite `next-session.md` from the new HEAD.
4. **MEMORY.md `Where We Left Off`** — add a Session 13 section. Update the rev numbers.
5. **Commit the doc updates**: `docs(session-13-close): decision log + flow doc refresh + queue promotion`.

## 6. Gotchas worth carrying forward

- **`gcloud auth` expires every ~4 days.** First thing in a fresh session: `gcloud auth login` interactively. If you see "Reauthentication failed. cannot prompt during non-interactive execution" — you need to re-auth.
- **zsh has `status` as a read-only variable.** Polling scripts must use `s=$(...)` or any other variable name. Don't use `status=`.
- **Hub local working tree always has Kurt's AppPlatform WIP** uncommitted. Stash explicitly (file list above), never `git add -A`.
- **`Agentic Workflows/services/n8n-ops` is NOT git-tracked.** Drive is the source of truth. Migrations live in Hub repo for source-control durability; n8n-ops code is Drive-only. Verify the working tree matches MEMORY.md before deploying.
- **OIDC tokens for n8n-ops calls** need `--impersonate-service-account=…workflow-builder@…` + `--include-email`. Plain `gcloud auth print-identity-token` lacks the email claim and the n8n-ops `requireOidc` middleware will reject with 401.
- **`gcloud secrets list --project=<number>`** fails — must use project ID. The Hub project ID is `ai-innovation-484111` (number 721337864706). Marketing/AI project is `agentic-workflows-485210`.
- **`/tmp/cloudbuild-chat-XXXXXX.yaml` leftover** can block consecutive chat-ui deploys. `rm -f /tmp/cloudbuild-chat-*.yaml` before re-running `./deploy-cloudrun.sh --ui-only`. (Not relevant this session — we're not touching chat-ui.)
- **Hub local main is usually behind origin/main by 25+ commits** because Kurt's WIP keeps it from fast-forwarding. Always branch from `origin/main`, not local main.
- **Supabase `db push` rejects** because remote has migrations the local dir doesn't (Hub team authors migrations directly via SQL editor historically). Use `supabase db query --linked -f <file>` to apply, then `supabase migration repair --status applied <timestamp>` to mark.
- **PostgREST `on_conflict` requires a FULL unique constraint**, not a partial index. `initiative_kpis (initiative_id, kpi_id) WHERE kpi_id IS NOT NULL` is partial → Session 9 had to use SELECT→UPDATE/INSERT. Our new table has a full unique constraint → `on_conflict` works.
- **PR squash-merge commit SHA != branch HEAD SHA.** When polling Cloud Build after `gh pr merge --squash`, get the squash SHA from `gh pr view <num> --json mergeCommit`.
- **Hub Cloud Build SUCCESS doesn't always mean a new rev serves traffic.** Verify with `gcloud run services describe ai-innovation-hub --region=us-central1 --format="value(status.traffic[0].revisionName)"`.

## 7. Rollback plan

If anything goes sideways:

**n8n-ops rollback**: `gcloud run services update-traffic n8n-ops --to-revisions=n8n-ops-00008-vqf=100 --region=europe-west1 --project=agentic-workflows-485210`. The new table stays (empty rows are harmless). User's `expected_impact` values are preserved either way because the new cron doesn't touch them.

**Hub rollback**: `gcloud run services update-traffic ai-innovation-hub --to-revisions=ai-innovation-hub-00106-zj8=100 --region=us-central1 --project=ai-innovation-484111`. Reverts to the UI that reads `expected_impact` directly. New measurement table sits unused.

**Migration rollback**: `drop table if exists public.initiative_kpi_measurements cascade;` — only run if the rollout is fully torn down; otherwise n8n-ops will keep trying to insert.

**Approval-gate re-enable** (if disabling caused a problem): `gcloud --project=ai-innovation-484111 beta builds triggers update ai-innovation-hub-deploy --require-approval`.

## 8. Out of scope (do NOT do in this session)

- chat-ui changes (none needed).
- Other KPI categories (Improved Quality, Reduced Cost, etc.). Table is KPI-agnostic — they'll work when their own canonical KPI mappings are configured.
- The Session 12 integration walkthrough — that becomes HEAD AFTER Session 13.
- Backfill historical measurements for past months — only forward-looking data from today on. If Ron wants April data backfilled, separate session.
- Workflow → KPI direct linking (Ron mentioned in his message: "for each initiative, you need to take the relevant workflows in n8n that are connected to that initiative, and link them to the relevant departmental Time Saved KPI"). Today linking is initiative-level via `initiative_workflow_links`; Ron's wording about workflow → KPI direct is aspirational. Out of scope unless he clarifies he means something different.
