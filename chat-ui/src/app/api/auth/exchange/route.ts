import { AUTH_COOKIE_NAME, verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Receives a Google ID token from the GIS sign-in flow on the frontend.
// Verifies the token (audience, signature, expiry, allowed domain), and on
// success sets it as an httpOnly cookie so subsequent server-component renders
// + first-party API calls can read the user without re-sending the token.
//
// Cookie attributes:
//   HttpOnly  — JavaScript on the page can't read the token, mitigating XSS.
//   Secure    — only over HTTPS (Cloud Run is HTTPS-only).
//   SameSite=None — required so the cookie flows when chat-ui is iframed inside
//                   the Hub (Direction-3 / Session 4). Modern browsers also
//                   require Secure when SameSite=None.
//   Max-Age   — matches Google ID token lifetime (~1 hour) to encourage natural
//               re-authentication. The frontend will refresh by calling GIS
//               again when /api/auth/me returns 401.
export async function POST(req: Request): Promise<Response> {
  let body: { id_token?: string };
  try {
    body = (await req.json()) as { id_token?: string };
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const idToken = body.id_token;
  if (!idToken || typeof idToken !== 'string') {
    return new Response('id_token required', { status: 400 });
  }

  const user = await verifyToken(idToken);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Set-Cookie: encode the ID token directly. Maximum 4KB cookie size; Google
  // ID tokens are ~1.5KB so this fits comfortably.
  const cookieValue = [
    `${AUTH_COOKIE_NAME}=${idToken}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    'Max-Age=3600',
  ].join('; ');

  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookieValue,
    },
  });
}
