import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PUBLIC = ['/login', '/api/auth', '/api/setup', '/api/webhooks'];

/** Cek cepat (optimistic): tanpa cookie sesi → arahkan ke /login. Validasi sesi sebenarnya di server. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  // token API (Authorization: Bearer comel_…) divalidasi di route handler
  if (pathname.startsWith('/api/') && /^Bearer\s+comel_/i.test(request.headers.get('authorization') || '')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg)$).*)'],
};
