import fs from 'fs';
import path from 'path';

/**
 * Reader for the BI-blessed data dictionary.
 *
 * Source of truth is BI's `guesty-data.guesty_analytics.agent_table_dictionary`
 * and `agent_column_dictionary`. Those are materialized into flat markdown files
 * (one per covered table) by `tools/sync_bi_dictionary.ts`, which the Docker build
 * ships under SPECS_DIR/bi (docker-compose mounts ./specs → /app/knowledge/specs).
 *
 * Each file documents one curated analytics mart: its full build query, grain,
 * lineage, and documented columns — the verified SQL the builder inherits instead
 * of hand-writing (our ~95% anti-hallucination guardrail). See
 * docs/bi-dictionary-integration.md.
 *
 * The reader degrades gracefully: if the sync has never run, BI_DIR is absent and
 * getBiTableKeys() returns [] — claude.ts then omits the get_bi_table tool entirely,
 * so there is zero production impact until the first sync.
 */

// ─── Directory configuration ──────────────────────────────────────────────────
// Mirrors knowledge.ts. Defaults to <SPECS_DIR>/bi so a single mount covers both.

const SPECS_DIR =
  process.env.SPECS_DIR ?? path.join(process.cwd(), 'knowledge', 'specs');
const BI_DIR = process.env.BI_DIR ?? path.join(SPECS_DIR, 'bi');

const INDEX_FILE = '_INDEX.md';

/**
 * List the BI table keys that have been synced (filenames without extension,
 * excluding the index). Returns [] if the sync has never run — callers use this
 * to decide whether to expose the get_bi_table tool at all.
 */
export function getBiTableKeys(): string[] {
  try {
    return fs.readdirSync(BI_DIR)
      .filter(f => f.endsWith('.md') && f !== INDEX_FILE)
      .map(f => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

/** Read the index of available BI tables (one-line summary per table). */
export function listBiTables(): string {
  const indexPath = path.join(BI_DIR, INDEX_FILE);
  if (fs.existsSync(indexPath)) {
    return fs.readFileSync(indexPath, 'utf-8');
  }
  const keys = getBiTableKeys();
  if (keys.length === 0) {
    return 'No BI dictionary tables have been synced yet. Run tools/sync_bi_dictionary.ts.';
  }
  return `Available BI tables: ${keys.join(', ')}\nCall get_bi_table with one of these keys.`;
}

/**
 * Read the materialized doc for one BI table key (e.g. "performance__ndr").
 * Returns a useful message string (not a throw) on unknown/missing keys so the
 * model sees actionable feedback.
 */
export function readBiTable(tableKey: string): string {
  const key = (tableKey ?? '').trim();
  if (!key || key === 'index') return listBiTables();

  const filePath = path.join(BI_DIR, `${key}.md`);
  if (!fs.existsSync(filePath)) {
    const keys = getBiTableKeys();
    return `Unknown BI table: "${key}". Available: ${keys.length ? keys.join(', ') : '(none synced yet)'}`;
  }
  return fs.readFileSync(filePath, 'utf-8');
}
