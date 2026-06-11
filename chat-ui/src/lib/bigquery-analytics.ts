/**
 * Read-only BigQuery client for the company-wide n8n executions analytics
 * (the n8n_ops dataset, populated by the n8n_kpi_ingestion workflow that lives
 * in the Agentic Workflows project — see ../Agentic Workflows/workflows/n8n_kpi_ingestion/).
 *
 * This module is independent of the AI-built deploy analytics in firestore.ts.
 * It surfaces production runtime metrics for ALL workflows in guesty.app.n8n.cloud,
 * not just AI-built ones.
 *
 * Auth: ADC (Application Default Credentials). Cloud Run uses the SA
 * n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com which
 * needs roles/bigquery.dataViewer on the n8n_ops dataset.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'agentic-workflows-485210';
const DATASET = 'n8n_ops';

let bqClient: BigQuery | null = null;

function getClient(): BigQuery {
  if (!bqClient) {
    bqClient = new BigQuery({ projectId: PROJECT_ID });
  }
  return bqClient;
}

export interface WorkflowStats {
  workflowId: string;
  workflowName: string | null;
  ownerHandle: string | null;
  active: boolean | null;
  totalRuns: number;
  successRuns: number;
  errorRuns: number;
  successRate: number;
  avgDurationSeconds: number | null;
  p95DurationSeconds: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

export interface ExecutionFailure {
  executionId: string;
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  mode: string | null;
}

/**
 * Aggregate stats for every workflow that has had at least one execution in the window.
 *
 * Reads from daily_workflow_stats (pre-aggregated by the daily_rollup scheduled query)
 * and joins to the workflows SCD2 dimension to get the current name/active state. Owner
 * handle is parsed from the workflow name's "@handle" suffix per the naming convention.
 */
export async function getAllWorkflowStats(days = 30): Promise<WorkflowStats[]> {
  const sql = `
    WITH agg AS (
      SELECT
        workflow_id,
        SUM(total_runs)   AS total_runs,
        SUM(success_runs) AS success_runs,
        SUM(error_runs)   AS error_runs,
        AVG(avg_duration_seconds) AS avg_duration_seconds,
        MAX(p95_duration_seconds) AS p95_duration_seconds,
      FROM \`${PROJECT_ID}.${DATASET}.daily_workflow_stats\`
      WHERE day >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      GROUP BY workflow_id
    ),
    last_run AS (
      SELECT
        workflow_id,
        ARRAY_AGG(STRUCT(started_at, status) ORDER BY started_at DESC LIMIT 1)[OFFSET(0)] AS r,
      FROM \`${PROJECT_ID}.${DATASET}.executions\`
      WHERE DATE(started_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      GROUP BY workflow_id
    ),
    current_wf AS (
      SELECT workflow_id, name, active
      FROM \`${PROJECT_ID}.${DATASET}.workflows\`
      WHERE valid_to IS NULL
    )
    SELECT
      agg.workflow_id            AS workflowId,
      current_wf.name            AS workflowName,
      current_wf.active          AS active,
      agg.total_runs             AS totalRuns,
      agg.success_runs           AS successRuns,
      agg.error_runs             AS errorRuns,
      agg.avg_duration_seconds   AS avgDurationSeconds,
      agg.p95_duration_seconds   AS p95DurationSeconds,
      last_run.r.started_at      AS lastRunAt,
      last_run.r.status          AS lastRunStatus,
    FROM agg
    LEFT JOIN current_wf USING (workflow_id)
    LEFT JOIN last_run   USING (workflow_id)
    ORDER BY agg.total_runs DESC
  `;

  const [rows] = await getClient().query({
    query: sql,
    params: { days },
    location: 'EU',
  });

  return (rows as Array<{
    workflowId: string;
    workflowName: string | null;
    active: boolean | null;
    totalRuns: number;
    successRuns: number;
    errorRuns: number;
    avgDurationSeconds: number | null;
    p95DurationSeconds: number | null;
    lastRunAt: { value: string } | string | null;
    lastRunStatus: string | null;
  }>).map((r) => {
    const total = Number(r.totalRuns) || 0;
    const success = Number(r.successRuns) || 0;
    const lastRunAt = r.lastRunAt && typeof r.lastRunAt === 'object' && 'value' in r.lastRunAt
      ? r.lastRunAt.value
      : (r.lastRunAt as string | null);
    return {
      workflowId: r.workflowId,
      workflowName: r.workflowName,
      ownerHandle: parseOwnerHandle(r.workflowName),
      active: r.active,
      totalRuns: total,
      successRuns: success,
      errorRuns: Number(r.errorRuns) || 0,
      successRate: total > 0 ? success / total : 0,
      avgDurationSeconds: r.avgDurationSeconds != null ? Number(r.avgDurationSeconds) : null,
      p95DurationSeconds: r.p95DurationSeconds != null ? Number(r.p95DurationSeconds) : null,
      lastRunAt,
      lastRunStatus: r.lastRunStatus,
    };
  });
}

/** Parse an "@handle" suffix from a workflow name following the convention. */
function parseOwnerHandle(name: string | null): string | null {
  if (!name) return null;
  const match = name.match(/@([A-Za-z0-9._-]+)\s*$/);
  return match ? match[1] : null;
}

/** Recent failures for a single workflow, useful for an expand-row drilldown. */
export async function getRecentFailures(
  workflowId: string,
  hours = 168, // last 7 days by default
  limit = 20,
): Promise<ExecutionFailure[]> {
  const sql = `
    SELECT
      id              AS executionId,
      started_at      AS startedAt,
      duration_seconds AS durationSeconds,
      status,
      mode,
    FROM \`${PROJECT_ID}.${DATASET}.executions\`
    WHERE workflow_id = @workflowId
      AND status != 'success'
      AND started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @hours HOUR)
    ORDER BY started_at DESC
    LIMIT @limit
  `;

  const [rows] = await getClient().query({
    query: sql,
    params: { workflowId, hours, limit },
    location: 'EU',
  });

  return (rows as Array<{
    executionId: string;
    startedAt: { value: string } | string;
    durationSeconds: number | null;
    status: string;
    mode: string | null;
  }>).map((r) => ({
    executionId: r.executionId,
    startedAt: typeof r.startedAt === 'object' && 'value' in r.startedAt ? r.startedAt.value : (r.startedAt as string),
    durationSeconds: r.durationSeconds != null ? Number(r.durationSeconds) : null,
    status: r.status,
    mode: r.mode,
  }));
}
