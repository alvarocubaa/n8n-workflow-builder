export interface User {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Parse the user identity from Google IAP-injected headers.
 * In production, Cloud IAP injects:
 *   x-goog-authenticated-user-email: accounts.google.com:user@domain.com
 *   x-goog-authenticated-user-id:    accounts.google.com:1234567890
 *
 * Locally (no IAP), MOCK_USER_EMAIL env var is used instead.
 */
export function getUserFromHeaders(headers: Headers): User | null {
  const rawEmail = headers.get('x-goog-authenticated-user-email');

  if (rawEmail) {
    const email = rawEmail.replace('accounts.google.com:', '');
    const rawId = headers.get('x-goog-authenticated-user-id') ?? '';
    const id = rawId.replace('accounts.google.com:', '') || email;
    return {
      id,
      email,
      displayName: email.split('@')[0],
    };
  }

  // Local development fallback
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
