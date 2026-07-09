/**
 * sync_bi_dictionary.ts — materialize BI's data dictionary into builder specs.
 *
 * Reads BI's two governance tables:
 *   guesty-data.guesty_analytics.agent_table_dictionary   (full build query per table)
 *   guesty-data.guesty_analytics.agent_column_dictionary  (per-column description + sql_snippet)
 *
 * and writes one markdown doc per covered table into specs/bi/, plus an _INDEX.md.
 * These are loaded on demand by the builder's get_bi_table tool (see
 * chat-ui/src/lib/bi-dictionary.ts) and give the AI verified, BI-blessed SQL —
 * our ~95% anti-hallucination guardrail. See docs/bi-dictionary-integration.md.
 *
 * Auth: ADC. The identity needs bigquery.jobUser on a billing project and
 * bigquery.dataViewer on guesty-data.guesty_analytics.
 *   Local:  gcloud auth application-default login   (as alvaro.cuba@guesty.com)
 *   Deploy: grant dataViewer to n8n-workflow-builder@agentic-workflows-485210
 *
 * Run:  cd chat-ui && npx tsx ../tools/sync_bi_dictionary.ts
 */

import fs from 'fs';
import path from 'path';
import { BigQuery } from '@google-cloud/bigquery';

const SRC_PROJECT = process.env.BI_SRC_PROJECT ?? 'guesty-data';
const DATASET = 'guesty_analytics';
const LOCATION = 'US'; // agent_*_dictionary tables live in the US multi-region
const TABLE_DICT = `\`${SRC_PROJECT}.${DATASET}.agent_table_dictionary\``;
const COLUMN_DICT = `\`${SRC_PROJECT}.${DATASET}.agent_column_dictionary\``;

const OUT_DIR = process.env.BI_OUT_DIR ?? path.resolve(process.cwd(), '..', 'specs', 'bi');

const STALE_WEEKS = 2; // warn if a table's last_updated is older than this

// ─── Row shapes ───────────────────────────────────────────────────────────────

interface TableRow {
  dataset_id: string;
  table_name: string;
  full_query: string | null;
  query_explanation: string | null;
  table_grain: string | null;
  upstream_sources: string | null;
  last_updated: { value: string } | string | null;
}

interface ColumnRow {
  dataset_id: string;
  table_name: string;
  column_name: string;
  description: string | null;
  business_logic: string | null;
  sql_snippet: string | null;
  source_tables: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const keyOf = (dataset: string, table: string) => `${dataset}__${table}`;
const nonEmpty = (s: string | null | undefined): s is string => !!s && s.trim() !== '';

function tsToIso(v: TableRow['last_updated']): string | null {
  if (!v) return null;
  return typeof v === 'object' && 'value' in v ? v.value : (v as string);
}

/** Find hardcoded date literals ('2025-12-31') that will silently rot. */
function findDateLiterals(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  const re = /'20\d\d-\d\d-\d\d'/g;
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(re)) found.add(m[0]);
  }
  return [...found].sort();
}

function stalenessNote(lastUpdatedIso: string | null): string {
  if (!lastUpdatedIso) return '⚠️ last_updated unknown — treat freshness as unverified.';
  const ageMs = Date.now() - new Date(lastUpdatedIso).getTime();
  const weeks = ageMs / (1000 * 60 * 60 * 24 * 7);
  const stamp = lastUpdatedIso.slice(0, 10);
  return weeks > STALE_WEEKS
    ? `⚠️ Source last refreshed ${stamp} (~${Math.round(weeks)} weeks ago) — verify logic hasn't drifted before relying on it.`
    : `Source last refreshed ${stamp}.`;
}

// ─── Markdown rendering ───────────────────────────────────────────────────────

function renderTableDoc(
  dataset: string,
  table: string,
  tbl: TableRow | undefined,
  cols: ColumnRow[],
): string {
  const documented = cols.filter(c => nonEmpty(c.sql_snippet) || nonEmpty(c.description));
  const dateLiterals = findDateLiterals(tbl?.full_query, ...cols.map(c => c.sql_snippet));

  const out: string[] = [];
  out.push(`# BI mart — \`${SRC_PROJECT}.${dataset}.${table}\``);
  out.push('');
  out.push('> **Source of truth:** BI data dictionary (Dataplex-generated, BI-owned).');
  out.push(`> ${stalenessNote(tsToIso(tbl?.last_updated ?? null))}`);
  out.push('> Prefer this SQL over hand-written queries for this table. On conflict with a source-system spec, this wins for the mart\'s own columns.');
  if (dateLiterals.length) {
    out.push('>');
    out.push(`> ⚠️ **Hardcoded date literal(s) detected:** ${dateLiterals.join(', ')}. These will age out — surface them to the user for confirmation instead of copying blindly.`);
  }
  out.push('');

  if (tbl) {
    if (nonEmpty(tbl.query_explanation)) {
      out.push('## What this table is');
      out.push(tbl.query_explanation.trim());
      out.push('');
    }
    if (nonEmpty(tbl.table_grain)) {
      out.push(`**Grain:** ${tbl.table_grain.trim()}`);
      out.push('');
    }
    if (nonEmpty(tbl.upstream_sources)) {
      out.push(`**Upstream sources:** ${tbl.upstream_sources.trim()}`);
      out.push('');
    }
    if (nonEmpty(tbl.full_query)) {
      out.push('## Verified build query');
      out.push('```sql');
      out.push(tbl.full_query.trim());
      out.push('```');
      out.push('');
    }
  } else {
    out.push('_No table-level build query available; column-level docs only._');
    out.push('');
  }

  out.push(`## Documented columns (${documented.length} of ${cols.length})`);
  if (documented.length === 0) {
    out.push('_No columns documented yet in the BI dictionary for this table._');
  } else {
    out.push('');
    out.push('| Column | Description | Business logic | SQL snippet |');
    out.push('|---|---|---|---|');
    for (const c of documented) {
      const cell = (s: string | null) => (s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
      out.push(`| \`${c.column_name}\` | ${cell(c.description)} | ${cell(c.business_logic)} | ${cell(c.sql_snippet) ? '`' + cell(c.sql_snippet) + '`' : ''} |`);
    }
  }
  out.push('');
  return out.join('\n');
}

function renderIndex(
  entries: Array<{ key: string; dataset: string; table: string; grain: string | null; cols: number; documented: number; lastUpdated: string | null }>,
): string {
  const out: string[] = [];
  out.push('# BI dictionary — available tables');
  out.push('');
  out.push('Generated by `tools/sync_bi_dictionary.ts` from BI\'s `agent_table_dictionary` + `agent_column_dictionary`.');
  out.push('Call `get_bi_table("<key>")` to load one. These are BI-blessed marts — prefer their SQL over hand-writing.');
  out.push('');
  out.push('| Key | Table | Grain | Documented cols | Last refreshed |');
  out.push('|---|---|---|---|---|');
  for (const e of entries.sort((a, b) => a.key.localeCompare(b.key))) {
    out.push(`| \`${e.key}\` | \`${e.dataset}.${e.table}\` | ${e.grain ?? '—'} | ${e.documented}/${e.cols} | ${e.lastUpdated?.slice(0, 10) ?? '—'} |`);
  }
  out.push('');
  return out.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const bq = new BigQuery({ projectId: SRC_PROJECT });

  console.log(`Reading BI dictionaries from ${SRC_PROJECT}.${DATASET} …`);
  const [tableRows] = await bq.query({
    query: `SELECT dataset_id, table_name, full_query, query_explanation, table_grain, upstream_sources, last_updated FROM ${TABLE_DICT}`,
    location: LOCATION,
  }) as unknown as [TableRow[]];

  const [colRows] = await bq.query({
    query: `SELECT dataset_id, table_name, column_name, description, business_logic, sql_snippet, source_tables FROM ${COLUMN_DICT}`,
    location: LOCATION,
  }) as unknown as [ColumnRow[]];

  console.log(`  ${tableRows.length} table-dict rows, ${colRows.length} column-dict rows`);

  // Group by key. Union of tables present in either dictionary.
  const tableByKey = new Map<string, TableRow>();
  for (const t of tableRows) tableByKey.set(keyOf(t.dataset_id, t.table_name), t);

  const colsByKey = new Map<string, ColumnRow[]>();
  for (const c of colRows) {
    const k = keyOf(c.dataset_id, c.table_name);
    (colsByKey.get(k) ?? colsByKey.set(k, []).get(k)!).push(c);
  }

  const allKeys = new Set<string>([...tableByKey.keys(), ...colsByKey.keys()]);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const indexEntries: Parameters<typeof renderIndex>[0] = [];
  for (const key of allKeys) {
    const [dataset, table] = key.split('__');
    const tbl = tableByKey.get(key);
    const cols = colsByKey.get(key) ?? [];
    const documented = cols.filter(c => nonEmpty(c.sql_snippet) || nonEmpty(c.description)).length;

    fs.writeFileSync(path.join(OUT_DIR, `${key}.md`), renderTableDoc(dataset, table, tbl, cols), 'utf-8');
    indexEntries.push({
      key, dataset, table,
      grain: tbl?.table_grain ?? null,
      cols: cols.length,
      documented,
      lastUpdated: tsToIso(tbl?.last_updated ?? null),
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, '_INDEX.md'), renderIndex(indexEntries), 'utf-8');

  console.log(`✅ Wrote ${allKeys.size} table docs + _INDEX.md to ${OUT_DIR}`);
  console.log(`   Tables with a build query: ${tableByKey.size}. Tables column-only: ${allKeys.size - tableByKey.size}.`);
}

main().catch(err => {
  console.error('❌ sync_bi_dictionary failed:', err?.message ?? err);
  console.error('   If this is an auth error, run: gcloud auth application-default login');
  process.exit(1);
});
