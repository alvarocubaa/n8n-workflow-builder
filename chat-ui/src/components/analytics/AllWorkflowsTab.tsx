'use client';

import { useEffect, useState } from 'react';

interface WorkflowStats {
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

interface ExecutionFailure {
  executionId: string;
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  mode: string | null;
}

const N8N_BASE = 'https://guesty.app.n8n.cloud';

export default function AllWorkflowsTab() {
  const [stats, setStats] = useState<WorkflowStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, ExecutionFailure[]>>({});
  const [failuresLoading, setFailuresLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/all-workflows?days=${days}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ stats: WorkflowStats[] }>;
      })
      .then((body) => {
        if (cancelled) return;
        setStats(body.stats);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  async function toggleExpand(workflowId: string) {
    if (expandedId === workflowId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(workflowId);
    if (!failures[workflowId]) {
      setFailuresLoading(workflowId);
      try {
        const res = await fetch(`/api/analytics/workflow-failures?workflowId=${encodeURIComponent(workflowId)}`);
        const body = (await res.json()) as { failures?: ExecutionFailure[] };
        setFailures((prev) => ({ ...prev, [workflowId]: body.failures ?? [] }));
      } finally {
        setFailuresLoading(null);
      }
    }
  }

  return (
    <div className="rounded-lg border border-warm-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-guesty-400">All Workflows (company-wide)</h3>
          <p className="text-xs text-gray-500">
            Source: n8n_ops BigQuery dataset, populated every 15 min by the Agentic Workflows kpi ingestion job.
          </p>
        </div>
        <select
          className="rounded border border-warm-100 bg-white px-2 py-1 text-xs"
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading && <p className="py-8 text-center text-sm text-gray-400">Loading...</p>}

      {error && (
        <div className="rounded border border-red-100 bg-red-50 p-3 text-xs text-red-700">
          <p className="font-medium">BigQuery query failed</p>
          <p className="mt-1 break-all">{error}</p>
          <p className="mt-2 text-red-600">
            Confirm the SA <code>n8n-workflow-builder@agentic-workflows-485210.iam.gserviceaccount.com</code> has{' '}
            <code>roles/bigquery.dataViewer</code> on the <code>n8n_ops</code> dataset, and that the kpi ingestion
            workflow in Agentic Workflows is active.
          </p>
        </div>
      )}

      {!loading && !error && stats.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No execution data in the selected window.</p>
      )}

      {!loading && !error && stats.length > 0 && (
        <div className="max-h-[640px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="pb-2 pr-3">Workflow</th>
                <th className="pb-2 pr-3">Owner</th>
                <th className="pb-2 pr-3">Active</th>
                <th className="pb-2 pr-3 text-right">Runs</th>
                <th className="pb-2 pr-3 text-right">Success</th>
                <th className="pb-2 pr-3 text-right">p95 (s)</th>
                <th className="pb-2 pr-3">Last run</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const expanded = expandedId === row.workflowId;
                return (
                  <FragmentRow
                    key={row.workflowId}
                    row={row}
                    expanded={expanded}
                    onToggle={() => toggleExpand(row.workflowId)}
                    failures={failures[row.workflowId]}
                    failuresLoading={failuresLoading === row.workflowId}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  row,
  expanded,
  onToggle,
  failures,
  failuresLoading,
}: {
  row: WorkflowStats;
  expanded: boolean;
  onToggle: () => void;
  failures?: ExecutionFailure[];
  failuresLoading: boolean;
}) {
  const successPct = (row.successRate * 100).toFixed(1);
  const lastRunDate = row.lastRunAt ? new Date(row.lastRunAt) : null;
  const successColor =
    row.successRate >= 0.99
      ? 'text-green-700'
      : row.successRate >= 0.9
        ? 'text-yellow-700'
        : 'text-red-700';

  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-50 hover:bg-warm-50"
        onClick={onToggle}
      >
        <td className="py-2 pr-3">
          <a
            href={`${N8N_BASE}/workflow/${row.workflowId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-guesty-300 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.workflowName ?? row.workflowId}
          </a>
        </td>
        <td className="py-2 pr-3 text-gray-600">
          {row.ownerHandle ? `@${row.ownerHandle}` : <span className="text-gray-400">—</span>}
        </td>
        <td className="py-2 pr-3">
          {row.active === true && <span className="text-green-700">on</span>}
          {row.active === false && <span className="text-gray-400">off</span>}
          {row.active === null && <span className="text-gray-300">—</span>}
        </td>
        <td className="py-2 pr-3 text-right text-gray-600">{row.totalRuns.toLocaleString()}</td>
        <td className={`py-2 pr-3 text-right font-medium ${successColor}`}>{successPct}%</td>
        <td className="py-2 pr-3 text-right text-gray-600">
          {row.p95DurationSeconds != null ? row.p95DurationSeconds.toFixed(1) : '—'}
        </td>
        <td className="py-2 pr-3 text-gray-500">
          {lastRunDate ? (
            <>
              {lastRunDate.toLocaleString()}
              {row.lastRunStatus && row.lastRunStatus !== 'success' && (
                <span className="ml-2 inline-block rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                  {row.lastRunStatus}
                </span>
              )}
            </>
          ) : (
            '—'
          )}
        </td>
        <td className="py-2 pr-3 text-right text-gray-400">{expanded ? '▾' : '▸'}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-warm-50">
          <td colSpan={8} className="px-3 py-3">
            <div className="text-xs text-gray-700">
              <p className="font-medium">Recent failures (last 7 days)</p>
              {failuresLoading && <p className="mt-1 text-gray-400">Loading...</p>}
              {!failuresLoading && failures && failures.length === 0 && (
                <p className="mt-1 text-gray-400">No failures in the window.</p>
              )}
              {!failuresLoading && failures && failures.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {failures.map((f) => (
                    <li key={f.executionId} className="font-mono text-xs">
                      <a
                        href={`${N8N_BASE}/workflow/${row.workflowId}/executions/${f.executionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-guesty-300 hover:underline"
                      >
                        {new Date(f.startedAt).toLocaleString()}
                      </a>
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">{f.status}</span>
                      {f.durationSeconds != null && (
                        <span className="ml-2 text-gray-500">{f.durationSeconds.toFixed(1)}s</span>
                      )}
                      {f.mode && <span className="ml-2 text-gray-400">{f.mode}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
