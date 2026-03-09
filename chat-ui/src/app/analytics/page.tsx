import { headers } from 'next/headers';
import { isAdmin } from '@/lib/admin';
import { getAnalyticsEvents, getDeployEvents, getFeedbackEntries } from '@/lib/firestore';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const hdrs = await headers();
  const rawEmail = hdrs.get('x-goog-authenticated-user-email') ?? '';
  const email = rawEmail
    ? rawEmail.replace('accounts.google.com:', '')
    : (process.env.MOCK_USER_EMAIL ?? '');

  if (!isAdmin(email)) return null; // layout already shows access denied

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
