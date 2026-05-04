// Server-component-only helpers for auth resolution. These wrap the request-
// agnostic helpers in auth.ts with the Next.js cookies()/headers() APIs so
// pages and layouts can resolve a user without seeing a Request object.

import { cookies, headers } from 'next/headers';
import { AUTH_COOKIE_NAME, getUserFromCookiesAndHeaders, type User } from './auth';

export async function getUserFromServerContext(): Promise<User | null> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return getUserFromCookiesAndHeaders(c.get(AUTH_COOKIE_NAME)?.value, h);
}
