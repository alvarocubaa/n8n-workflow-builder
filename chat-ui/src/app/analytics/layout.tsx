import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import { isAdmin } from '@/lib/admin';
import { getUserFromServerContext } from '@/lib/auth-server';

export default async function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserFromServerContext();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';

  if (!user) {
    return <AuthGate clientId={clientId}>{null}</AuthGate>;
  }

  if (!isAdmin(user.email)) {
    return (
      <div className="flex h-screen flex-col bg-warm-50">
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-warm-100 bg-white px-4 shadow-sm">
          <span className="text-base font-bold text-guesty-400">Guesty Workflow Builder</span>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 rounded-full bg-warm-50 p-4 inline-block">
              <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">You don&apos;t have access to this page</h2>
            <p className="mt-1 text-sm text-gray-500">Contact your administrator if you need access.</p>
            <Link href="/chat" className="mt-4 inline-block text-sm text-guesty-300 hover:text-guesty-400">
              Back to Chat
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-warm-50">
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-warm-100 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-base font-bold text-guesty-400 hover:text-guesty-300 transition">
            Workflow Builder
          </Link>
          <span className="text-warm-100">/</span>
          <span className="text-sm font-medium text-gray-600">Analytics</span>
        </div>
        <Link href="/chat" className="text-sm text-guesty-300 hover:text-guesty-400 transition">
          Back to Chat
        </Link>
      </header>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
