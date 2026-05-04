import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { getUserFromRequest } from '@/lib/auth';
import { getAllWorkflowStats } from '@/lib/bigquery-analytics';

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
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 1), 365);

  try {
    const stats = await getAllWorkflowStats(days);
    return NextResponse.json({ stats, days });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'bigquery_error', detail }, { status: 500 });
  }
}
