import { OAuth2Client } from 'google-auth-library';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

// Read from env at module load — both are baked in at deploy. Empty values mean
// the corresponding code path is disabled (e.g., no client ID → token verification
// rejects everything; no allowed domains → no domain check is enforced).
const OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
const ALLOWED_DOMAINS = (process.env.ALLOWED_OAUTH_DOMAINS ?? 'guesty.com,rentalsunited.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// One client instance reused across requests; google-auth-library caches the
// JWKS for us so verifyIdToken is cheap after the first call.
const oauthClient = OAUTH_CLIENT_ID ? new OAuth2Client(OAUTH_CLIENT_ID) : null;

function isAllowedDomain(email: string): boolean {
  if (ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return ALLOWED_DOMAINS.includes(domain);
}

/**
 * Verify a Google ID token signed by Google for our OAuth client.
 * Returns null on any failure — invalid signature, expired, wrong audience,
 * disallowed domain, malformed.
 *
 * Used by the OAuth (post-IAP) path. The token is what Google Identity
 * Services hands the frontend on sign-in; the frontend forwards it as
 * Authorization: Bearer.
 */
async function verifyGoogleIdToken(token: string): Promise<User | null> {
  if (!oauthClient) return null;
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) return null;
    if (!isAllowedDomain(payload.email)) return null;
    return {
      id: payload.sub,
      email: payload.email,
      displayName: payload.name ?? payload.email.split('@')[0],
    };
  } catch (err) {
    console.warn('Google ID token verification failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Name of the cookie set by /api/auth/exchange after a successful GIS sign-in.
// Holds the verified Google ID token so server components can resolve the user
// without the client having to forward Bearer headers on every page load.
export const AUTH_COOKIE_NAME = 'gid_token';

/**
 * Resolve the user identity for an incoming request. Tries four sources in
 * priority order:
 *   1. gid_token cookie                          (post-IAP, set by /api/auth/exchange)
 *   2. Authorization: Bearer <google-id-token>   (post-IAP, cross-origin clients)
 *   3. x-goog-authenticated-user-email           (IAP, while still enabled)
 *   4. MOCK_USER_EMAIL env var                   (local dev only)
 *
 * The OAuth paths (1 + 2) are checked first so that once IAP is disabled,
 * cookie- or Bearer-bearing requests work immediately. While IAP is still
 * enabled, requests without an OAuth credential fall through to the IAP-header
 * path — keeping existing users working unchanged. Returns null when no source
 * identifies a valid user.
 */
export async function getUserFromRequest(req: Request): Promise<User | null> {
  // 1) gid_token cookie (server components + first-party API calls post-IAP)
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match) {
      const user = await verifyGoogleIdToken(match[1]);
      if (user) return user;
      // Cookie present but invalid (expired, tampered) — fall through. The
      // client will see a 401 from /api/auth/me and re-prompt sign-in.
    }
  }

  // 2) Bearer token (cross-origin clients)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const user = await verifyGoogleIdToken(token);
      if (user) return user;
      // Bearer present but invalid — explicit reject (don't fall through to IAP/mock,
      // because a Bearer was provided and it's not legitimate).
      return null;
    }
  }

  // 3) IAP-injected headers
  const rawEmail = req.headers.get('x-goog-authenticated-user-email');
  if (rawEmail) {
    const email = rawEmail.replace('accounts.google.com:', '');
    if (isAllowedDomain(email)) {
      const rawId = req.headers.get('x-goog-authenticated-user-id') ?? '';
      const id = rawId.replace('accounts.google.com:', '') || email;
      return {
        id,
        email,
        displayName: email.split('@')[0],
      };
    }
    return null;
  }

  // 4) Local dev fallback
  const mockEmail = process.env.MOCK_USER_EMAIL;
  if (mockEmail) {
    return {
      id: mockEmail,
      email: mockEmail,
      displayName: mockEmail.split('@')[0],
    };
  }

  return null;
}

/**
 * Resolve the user identity from Next.js server-component context (cookies +
 * IAP headers). Server components don't have a Request object — they go
 * through the next/headers + next/cookies APIs.
 */
export async function getUserFromCookiesAndHeaders(
  cookieValue: string | undefined,
  headers: Headers,
): Promise<User | null> {
  // 1) Cookie
  if (cookieValue) {
    const user = await verifyGoogleIdToken(cookieValue);
    if (user) return user;
  }

  // 2) IAP-injected headers
  const rawEmail = headers.get('x-goog-authenticated-user-email');
  if (rawEmail) {
    const email = rawEmail.replace('accounts.google.com:', '');
    if (isAllowedDomain(email)) {
      const rawId = headers.get('x-goog-authenticated-user-id') ?? '';
      const id = rawId.replace('accounts.google.com:', '') || email;
      return { id, email, displayName: email.split('@')[0] };
    }
    return null;
  }

  // 3) Local dev fallback
  const mockEmail = process.env.MOCK_USER_EMAIL;
  if (mockEmail) {
    return { id: mockEmail, email: mockEmail, displayName: mockEmail.split('@')[0] };
  }
  return null;
}

/**
 * Verify a raw Google ID token string. Exposed for /api/auth/exchange to call
 * during cookie-set, separate from the request-resolving paths above.
 */
export async function verifyToken(idToken: string): Promise<User | null> {
  return verifyGoogleIdToken(idToken);
}

export function getAllowedOAuthDomains(): string[] {
  return [...ALLOWED_DOMAINS];
}

/**
 * Back-compat shim. Existing routes call getUserFromHeaders(req.headers).
 * Kept synchronous for the IAP-header + mock paths so we don't have to
 * touch every route in the same change. New code should call
 * getUserFromRequest(req) which also handles Bearer tokens.
 *
 * @deprecated Use getUserFromRequest(req) — supports both IAP and OAuth.
 */
export function getUserFromHeaders(headers: Headers): User | null {
  const rawEmail = headers.get('x-goog-authenticated-user-email');

  if (rawEmail) {
    const email = rawEmail.replace('accounts.google.com:', '');
    if (!isAllowedDomain(email)) return null;
    const rawId = headers.get('x-goog-authenticated-user-id') ?? '';
    const id = rawId.replace('accounts.google.com:', '') || email;
    return { id, email, displayName: email.split('@')[0] };
  }

  const mockEmail = process.env.MOCK_USER_EMAIL;
  if (mockEmail) {
    return { id: mockEmail, email: mockEmail, displayName: mockEmail.split('@')[0] };
  }

  return null;
}
