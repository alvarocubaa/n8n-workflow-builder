import { NextResponse, type NextRequest } from 'next/server';

// Layouts in Next.js receive params + children, never searchParams. We need
// embed-mode awareness (Direction 3, Hub iframe) inside chat/layout.tsx, so
// expose the search-param-derived state through a request header that the
// layout reads via headers(). This is the documented pattern.
//
// Matcher is narrow — only /chat routes need the header. /api/* is unaffected.

export function middleware(req: NextRequest) {
  const isEmbed = req.nextUrl.searchParams.get('embed') === 'true';
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-embed', isEmbed ? '1' : '0');
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/chat', '/chat/:path*'],
};
