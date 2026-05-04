import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getUserFromRequest } from '@/lib/auth';
import { getRecentFailures } from '@/lib/bigquery-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const workflowId = url.searchParams.get('workflowId');
  if (!workflowId) {
    return NextResponse.json({ error: 'workflowId required' }, { status: 400 });
  }
  const hours = Math.min(Math.max(parseInt(url.searchParams.get('hours') ?? '168', 10) || 168, 1), 720);

  try {
    const failures = await getRecentFailures(workflowId, hours);
    return NextResponse.json({ failures });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'bigquery_error', detail }, { status: 500 });
  }
}
