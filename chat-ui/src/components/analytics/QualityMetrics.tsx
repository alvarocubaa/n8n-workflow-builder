'use client';

import type { AnalyticsEvent, DeployEvent, FeedbackEntry } from '@/lib/types';

interface Props {
  events: AnalyticsEvent[];
  deploys: DeployEvent[];
  feedback: FeedbackEntry[];
}

export default function QualityMetrics({ events, deploys, feedback }: Props) {
  const totalSessions = events.length;
  const totalDeploys = deploys.length;
  const deployRate = totalSessions > 0 ? Math.round((totalDeploys / totalSessions) * 100) : 0;

  const thumbsUp = feedback.filter(f => f.rating === 'up').length;
  const thumbsDown = feedback.filter(f => f.rating === 'down').length;
  const totalFeedback = thumbsUp + thumbsDown;
  const satisfactionRate = totalFeedback > 0 ? Math.round((thumbsUp / totalFeedback) * 100) : 0;

  // Exclude seeded events — they have approximate tool counts and no latency data
  const liveEvents = events.filter(e => !e.seeded);

  const avgToolCalls = liveEvents.length > 0
    ? (liveEvents.reduce((sum, e) => sum + e.toolCallCount, 0) / liveEvents.length).toFixed(1)
    : 'N/A';

  const avgLatency = liveEvents.filter(e => e.latencyMs > 0).length > 0
    ? (liveEvents.filter(e => e.latencyMs > 0).reduce((sum, e) => sum + e.latencyMs, 0) /
       liveEvents.filter(e => e.latencyMs > 0).length / 1000).toFixed(1)
    : 'N/A';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Quality Metrics</h3>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="Deploy Rate"
          value={`${deployRate}%`}
          detail={`${totalDeploys} of ${totalSessions} sessions`}
          color={deployRate >= 50 ? 'green' : deployRate >= 25 ? 'yellow' : 'red'}
        />
        <MetricCard
          label="Satisfaction"
          value={totalFeedback > 0 ? `${satisfactionRate}%` : 'N/A'}
          detail={`${thumbsUp} up / ${thumbsDown} down`}
          color={satisfactionRate >= 80 ? 'green' : satisfactionRate >= 50 ? 'yellow' : 'red'}
        />
        <MetricCard
          label="Avg Tool Calls"
          value={avgToolCalls}
          detail="per session"
          color="blue"
        />
        <MetricCard
          label="Avg Latency"
          value={`${avgLatency}s`}
          detail="per turn (live only)"
          color="blue"
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, color }: {
  label: string;
  value: string;
  detail: string;
  color: 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colorMap = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
  };

  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-400">{detail}</p>
    </div>
  );
}
