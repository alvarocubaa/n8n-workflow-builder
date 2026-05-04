import { getUserFromRequest } from '@/lib/auth';
import { logFeedback } from '@/lib/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/feedback
 *
 * Body: { conversationId: string, messageIndex: number, rating: 'up'|'down', comment?: string }
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    conversationId?: string;
    messageIndex?: number;
    rating?: string;
    comment?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { conversationId, messageIndex, rating, comment } = body;
  if (!conversationId || messageIndex === undefined || (rating !== 'up' && rating !== 'down')) {
    return Response.json({ error: 'conversationId, messageIndex, and rating (up/down) are required' }, { status: 400 });
  }

  await logFeedback({
    userEmail: user.email,
    conversationId,
    messageIndex,
    rating,
    comment: comment?.trim() || null,
    createdAt: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}
