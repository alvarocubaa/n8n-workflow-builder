'use client';

import type { AnalyticsEvent, DeployEvent, FeedbackEntry } from '@/lib/types';
import UsageOverview from './UsageOverview';
import QualityMetrics from './QualityMetrics';
import ROICalculator from './ROICalculator';
import FeedbackLog from './FeedbackLog';

interface Props {
  events: AnalyticsEvent[];
  deploys: DeployEvent[];
  feedback: FeedbackEntry[];
  dateRange: { from: string; to: string };
}

export default function AnalyticsDashboard({ events, deploys, feedback, dateRange }: Props) {
  const fromDate = new Date(dateRange.from).toLocaleDateString();
  const toDate = new Date(dateRange.to).toLocaleDateString();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">
            {fromDate} &ndash; {toDate} &middot; {events.length} sessions &middot; {deploys.length} deploys
          </p>
        </div>
      </div>

      {/* Top-level KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Unique Users"
          value={new Set(events.map(e => e.userEmail)).size}
        />
        <KpiCard
          label="Total Sessions"
          value={events.length}
        />
        <KpiCard
          label="Workflows Deployed"
          value={deploys.length}
        />
        <KpiCard
          label="Feedback Entries"
          value={feedback.length}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UsageOverview events={events} />
        <QualityMetrics events={events} deploys={deploys} feedback={feedback} />
      </div>

      {/* ROI */}
      <ROICalculator deploys={deploys} />

      {/* Feedback log */}
      <FeedbackLog feedback={feedback} />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}
