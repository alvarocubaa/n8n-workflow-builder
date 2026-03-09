'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import type { DeployEvent } from '@/lib/types';

interface Props {
  deploys: DeployEvent[];
}

const COMPLEXITY_LABELS: Record<number, string> = {
  1: 'Trivial',
  2: 'Simple',
  3: 'Moderate',
  4: 'Complex',
  5: 'Advanced',
};

const COMPLEXITY_COLORS: Record<number, string> = {
  1: '#94A3B8',
  2: '#3B82F6',
  3: '#8B5CF6',
  4: '#F59E0B',
  5: '#EF4444',
};

export default function ROICalculator({ deploys }: Props) {
  const totalHours = deploys.reduce((sum, d) => sum + d.estimatedHoursSaved, 0);
  const totalValue = deploys.reduce((sum, d) => sum + d.estimatedValueUsd, 0);
  const totalWorkflows = deploys.length;

  // Complexity distribution
  const complexityCounts: Record<number, number> = {};
  for (const d of deploys) {
    complexityCounts[d.complexityScore] = (complexityCounts[d.complexityScore] ?? 0) + 1;
  }
  const complexityData = [1, 2, 3, 4, 5].map(score => ({
    label: COMPLEXITY_LABELS[score],
    count: complexityCounts[score] ?? 0,
    color: COMPLEXITY_COLORS[score],
  }));

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">ROI Estimate</h3>

      {/* Big numbers */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-green-600">{totalWorkflows}</p>
          <p className="text-xs text-gray-500">Workflows Deployed</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-blue-600">{totalHours.toFixed(0)}h</p>
          <p className="text-xs text-gray-500">Hours Saved</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-green-600">${totalValue.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Estimated Value</p>
        </div>
      </div>

      {/* Process comparison */}
      <div className="mb-6 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-semibold text-red-600">Old Process</p>
            <p>Submit request &rarr; Wait for dev &rarr; Build &rarr; Test &rarr; Iterate</p>
            <p className="mt-1 text-gray-400">Average: 2-5 business days</p>
          </div>
          <div>
            <p className="font-semibold text-green-600">New Process</p>
            <p>Describe automation &rarr; Review workflow &rarr; Deploy</p>
            <p className="mt-1 text-gray-400">Average: 5-15 minutes</p>
          </div>
        </div>
      </div>

      {/* Complexity distribution */}
      <h4 className="mb-2 text-xs font-semibold text-gray-500">Complexity Distribution</h4>
      {deploys.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No deployments yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={complexityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Workflows" radius={[4, 4, 0, 0]}>
              {complexityData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Formula transparency */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
          How is this calculated?
        </summary>
        <div className="mt-2 rounded bg-gray-50 p-3 text-xs text-gray-500 font-mono">
          <p>Complexity = min(5, nodePoints + sqlBonus + integrationBonus)</p>
          <p className="mt-1">nodePoints: 1-3 nodes=1, 4-7=2, 8+=3</p>
          <p>sqlBonus: +1 if BigQuery node present</p>
          <p>integrationBonus: +1 if 2+ credential types</p>
          <p className="mt-1">Hours saved: [1=1h, 2=2.5h, 3=5h, 4=10h, 5=20h]</p>
          <p>Value = hours_saved x $25/hr (non-technical staff rate)</p>
        </div>
      </details>
    </div>
  );
}
