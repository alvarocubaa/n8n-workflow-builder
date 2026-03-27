'use client';

import type { DeployEvent } from '@/lib/types';

interface Props {
  deploys: DeployEvent[];
}

export default function DeployLog({ deploys }: Props) {
  return (
    <div className="rounded-lg border border-warm-100 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-guesty-400">Deployed Workflows</h3>

      {deploys.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">No workflows deployed yet</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Dept</th>
                <th className="pb-2 pr-3">Workflow</th>
                <th className="pb-2 pr-3 text-right">Nodes</th>
                <th className="pb-2 pr-3 text-right">Complexity</th>
                <th className="pb-2 pr-3 text-right">Hours Saved</th>
                <th className="pb-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {deploys.map((d, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 pr-3 text-gray-400">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">
                    {d.userEmail.split('@')[0]}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {d.departmentId}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <a
                      href={d.workflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-guesty-300 hover:underline"
                    >
                      {d.workflowName || d.workflowId}
                    </a>
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600">{d.nodeCount}</td>
                  <td className="py-2 pr-3 text-right">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      d.complexityScore >= 4
                        ? 'bg-guesty-100 text-guesty-400'
                        : d.complexityScore >= 2
                          ? 'bg-navy-50 text-navy-200'
                          : 'bg-warm-50 text-gray-600'
                    }`}>
                      {d.complexityScore}/5
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600">
                    {d.estimatedHoursSaved.toFixed(1)}h
                  </td>
                  <td className="py-2 text-right font-medium text-green-700">
                    ${d.estimatedValueUsd.toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
