import { BigQuery } from '@google-cloud/bigquery';
import { randomUUID } from 'node:crypto';

/**
 * Builder-native usage telemetry → BigQuery `agent_logs` (the runtime/usage half of
 * the BI two-way exchange; see docs/agent-logs-schema-proposal.md).
 *
 * DORMANT by default: writes only when AGENT_LOGS_TABLE is set to a fully-qualified
 * `project.dataset.table`. Set it ONLY after BI creates the table and the builder SA
 * has bigquery.dataEditor on that dataset. Until then this is a no-op — zero impact.
 *
 * Best-effort by contract: every path is wrapped so a logging failure can never affect
 * a chat turn or a build. Fire-and-forget from the caller.
 */

const AGENT_LOGS_TABLE = process.env.AGENT_LOGS_TABLE; // "project.dataset.table"

export interface AgentLogRow {
  log_id: string;
  ts: string;                              // ISO 8601 (BQ TIMESTAMP)
  conversation_id: string;
  user_email: string;
  department: string;
  assistant_mode: string;                  // 'builder' | 'data'
  prompt: string;
  status: 'success' | 'error' | 'truncated';
  workflow_built: boolean;
  deployed: boolean | null;                // null until deploy endpoint is instrumented
  workflow_id: string | null;
  tools_used: string[];
  bi_tables_used: string[];                // BI marts loaded via get_bi_table (dictionary ROI)
  feedback: string | null;                 // filled async via a later update
  feedback_comment: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  latency_ms: number | null;
}

/** Everything except the fields this module stamps (log_id, ts). */
export type AgentLogInput = Omit<AgentLogRow, 'log_id' | 'ts'>;

function target(): { project: string; dataset: string; table: string } | null {
  if (!AGENT_LOGS_TABLE) return null;
  const parts = AGENT_LOGS_TABLE.split('.');
  if (parts.length !== 3 || parts.some(p => !p)) {
    console.warn(`AGENT_LOGS_TABLE must be "project.dataset.table"; got "${AGENT_LOGS_TABLE}" — agent_logs disabled`);
    return null;
  }
  return { project: parts[0], dataset: parts[1], table: parts[2] };
}

/** True when a valid target table is configured (used to skip work upstream). */
export function agentLogsEnabled(): boolean {
  return target() !== null;
}

let client: BigQuery | null = null;

/**
 * Write one row per completed builder turn. No-op when unconfigured; never throws.
 */
export async function logAgentTurn(input: AgentLogInput): Promise<void> {
  const t = target();
  if (!t) return; // inert until configured
  try {
    if (!client) client = new BigQuery({ projectId: t.project });
    const row: AgentLogRow = { log_id: randomUUID(), ts: new Date().toISOString(), ...input };
    await client.dataset(t.dataset).table(t.table).insert([row]);
  } catch (err) {
    // Best-effort: log and move on. A telemetry failure must never affect the user.
    console.error('agent_logs insert failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}
