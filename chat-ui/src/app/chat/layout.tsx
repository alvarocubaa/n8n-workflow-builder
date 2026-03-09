import { headers } from 'next/headers';
import Link from 'next/link';
import ConversationList from '@/components/ConversationList';
import { isAdmin } from '@/lib/admin';

/**
 * Shared layout for /chat and /chat/[id].
 * Renders the header (with user identity) and sidebar.
 */
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read user from IAP headers server-side for display
  const hdrs = await headers();
  const rawEmail = hdrs.get('x-goog-authenticated-user-email') ?? '';
  const email = rawEmail
    ? rawEmail.replace('accounts.google.com:', '')
    : (process.env.MOCK_USER_EMAIL ?? 'dev@example.com');
  const displayName = email.split('@')[0];

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top header */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-gray-900">n8n Builder</span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
            AI
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {isAdmin(email) && (
            <Link href="/analytics" className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-800">
              Analytics
            </Link>
          )}
          <span className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="hidden sm:inline">{email}</span>
        </div>
      </header>

      {/* Body: sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        <ConversationList />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
