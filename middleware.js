import { next } from '@vercel/edge';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/favicon.ico'];

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return next();
  }

  // Check for session cookie
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)setup_session=([^;]+)/);
  const token = match ? match[1] : null;

  if (!token) {
    return Response.redirect(new URL('/login', request.url), 302);
  }

  // Verify token is valid HMAC
  const password = process.env.SETUP_PASSWORD;
  if (!password) return next(); // No password configured = no protection

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode('setup-session')
  );
  const expected = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (token !== expected) {
    return Response.redirect(new URL('/login', request.url), 302);
  }

  return next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
