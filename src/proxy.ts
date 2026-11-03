import { NextResponse, type NextRequest } from 'next/server'

/**
 * Lightweight routing guard. It only checks that the right session cookie is present
 * so unauthenticated visitors are redirected early. Real authorization (session
 * validity, role, permissions, suspension) happens server-side on every page and API.
 */
const PUBLIC_ADMIN = ['/admin/login', '/admin/setup', '/admin/mfa', '/admin/forgot-password', '/admin/reset-password']

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  if (pathname.startsWith('/account') && !req.cookies.has('ti_session')) {
    const url = new URL('/login', req.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  if (pathname.startsWith('/admin') && !PUBLIC_ADMIN.some((p) => pathname.startsWith(p)) && !req.cookies.has('ti_admin')) {
    return NextResponse.redirect(new URL('/admin/login', req.url))
  }
  const res = NextResponse.next()
  if (pathname.startsWith('/admin') || pathname.startsWith('/account')) {
    res.headers.set('Cache-Control', 'no-store')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }
  return res
}

export const config = { matcher: ['/account/:path*', '/admin/:path*'] }
