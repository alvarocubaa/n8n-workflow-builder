import { getUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns the resolved user identity for the current request. Used by the
// client-side AuthGate to decide whether to render the sign-in flow. Returns
// 401 when no IAP/Cookie/Bearer/Mock source identifies a valid user.
export async function GET(req: Request): Promise<Response> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return Response.json({ user });
}
