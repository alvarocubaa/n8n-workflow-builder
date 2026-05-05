import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import ConversationList from '@/components/ConversationList';
import SidebarToggle from '@/components/SidebarToggle';
import AuthGate from '@/components/AuthGate';
import { isAdmin } from '@/lib/admin';
import { getUserFromServerContext } from '@/lib/auth-server';

/**
 * Shared layout for /chat and /chat/[id].
 * Renders the header (with user identity) and sidebar — except in embed mode
 * (Direction 3, Hub iframe), where chrome is suppressed and the Hub provides
 * its own. Embed flag comes from src/middleware.ts which sets `x-embed` based
 * on the URL's ?embed=true search param.
 */
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve user via cookie (post-IAP) → IAP header (during dual-auth) → mock (dev).
  const user = await getUserFromServerContext();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const headerStore = await headers();
  const isEmbed = headerStore.get('x-embed') === '1';

  // Unauthenticated branch — render the sign-in shell. Once the user signs
  // in, /api/auth/exchange sets the cookie and reloads — server then re-renders
  // this layout with `user` populated and we hit the authenticated branch below.
  // AuthGate reads ?embed=true client-side and switches to the postMessage flow.
  if (!user) {
    return <AuthGate clientId={clientId}>{null}</AuthGate>;
  }

  if (isEmbed) {
    return (
      <div className="flex h-screen flex-col bg-warm-50">
        {children}
      </div>
    );
  }

  const email = user.email;
  const displayName = user.displayName;

  return (
    <div className="flex h-screen flex-col bg-warm-50">
      {/* Top header */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-warm-100 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Image
            src="/guesty-logo.png"
            alt="Guesty"
            width={80}
            height={24}
            className="h-6 w-auto"
            priority
          />
          <span className="text-sm font-semibold text-guesty-400">Workflow Builder</span>
          <span className="rounded-full bg-guesty-100 px-2 py-0.5 text-xs font-semibold text-guesty-300">
            AI
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {isAdmin(email) && (
            <Link href="/analytics" className="rounded-lg bg-warm-50 px-2.5 py-1 text-xs font-medium text-guesty-400 hover:bg-guesty-100 hover:text-guesty-300 transition">
              Analytics
            </Link>
          )}
          <span className="h-7 w-7 rounded-full bg-guesty-300 flex items-center justify-center text-xs font-bold text-white">
            {displayName[0]?.toUpperCase() ?? '?'}
          </span>
          <span className="hidden sm:inline">{email}</span>
        </div>
      </header>

      {/* Body: sidebar + main content */}
      <SidebarToggle sidebar={<ConversationList />}>
        {children}
      </SidebarToggle>
    </div>
  );
}
