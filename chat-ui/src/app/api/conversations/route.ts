import { getUserFromHeaders } from '@/lib/auth';
import { listConversations } from '@/lib/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const user = getUserFromHeaders(req.headers);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const conversations = await listConversations(user.email);
    return Response.json(conversations);
  } catch (err) {
    console.error('Failed to list conversations:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
