import { getUserFromRequest } from '@/lib/auth';
import { getConversation } from '@/lib/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const conversation = await getConversation(user.email, id);
    if (!conversation) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    return Response.json(conversation);
  } catch (err) {
    console.error('Failed to get conversation:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
