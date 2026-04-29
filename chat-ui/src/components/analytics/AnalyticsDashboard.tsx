'use client';

import { useState } from 'react';
import type { AnalyticsEvent, DeployEvent, FeedbackEntry } from '@/lib/types';
import UsageOverview from './UsageOverview';
import QualityMetrics from './QualityMetrics';
import ROICalculator from './ROICalculator';
import DeployLog from './DeployLog';
import FeedbackLog from './FeedbackLog';
import AllWorkflowsTab from './AllWorkflowsTab';

interface Props {
  events: AnalyticsEvent[];
  deploys: DeployEvent[];
  feedback: FeedbackEntry[];
  dateRange: { from: string; to: string };
}

type TabId = 'ai-built' | 'all-workflows';

export default function AnalyticsDashboard({ events, deploys, feedback, dateRange }: Props) {
  const fromDate = new Date(dateRange.from).toLocaleDateString();
  const toDate = new Date(dateRange.to).toLocaleDateString();
  const [tab, setTab] = useState<TabId>('ai-built');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-guesty-400">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">
            {fromDate} &ndash; {toDate} &middot; {events.length} sessions &middot; {deploys.length} deploys
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-warm-100">
        <TabButton active={tab === 'ai-built'} onClick={() => setTab('ai-built')}>
          AI-built
        </TabButton>
        <TabButton active={tab === 'all-workflows'} onClick={() => setTab('all-workflows')}>
          All Workflows
        </TabButton>
      </div>

      {tab === 'ai-built' && (
        <>
          {/* Top-level KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Unique Users"
              value={new Set(events.map(e => e.userEmail)).size}
            />
            <KpiCard label="Total Sessions" value={events.length} />
            <KpiCard label="Workflows Deployed" value={deploys.length} />
            <KpiCard label="Feedback Entries" value={feedback.length} />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <UsageOverview events={events} />
            <QualityMetrics events={events} deploys={deploys} feedback={feedback} />
          </div>

          {/* ROI */}
          <ROICalculator deploys={deploys} />

          {/* Deploy log */}
          <DeployLog deploys={deploys} />

          {/* Feedback log */}
          <FeedbackLog feedback={feedback} />
        </>
      )}

      {tab === 'all-workflows' && <AllWorkflowsTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-guesty-300 text-guesty-400'
          : 'border-transparent text-gray-500 hover:text-guesty-300'
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-warm-100 bg-white p-4 shadow-sm border-t-2 border-t-guesty-200">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-guesty-400">{value.toLocaleString()}</p>
    </div>
  );
}
