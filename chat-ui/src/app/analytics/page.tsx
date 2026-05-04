import { isAdmin } from '@/lib/admin';
import { getAnalyticsEvents, getDeployEvents, getFeedbackEntries } from '@/lib/firestore';
import { getUserFromServerContext } from '@/lib/auth-server';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const user = await getUserFromServerContext();
  if (!user || !isAdmin(user.email)) return null; // layout already handles auth/admin gate

  // Default: last 30 days
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const [events, deploys, feedback] = await Promise.all([
    getAnalyticsEvents(from, to),
    getDeployEvents(from, to),
    getFeedbackEntries(from, to),
  ]);

  return (
    <AnalyticsDashboard
      events={events}
      deploys={deploys}
      feedback={feedback}
      dateRange={{ from: from.toISOString(), to: to.toISOString() }}
    />
  );
}
