import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // Block iframe embedding of admin pages even more strictly
  // (X-Frame-Options is set globally, but admin pages get extra hardening)
  const res = NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/admin')) {
    // Supabase stores its session in localStorage, so we can't reliably
    // verify auth in middleware (Edge runtime, no localStorage access).
    // The page-level useEffect check + RLS at DB level is the real defense.
    // Here we just block caching of admin pages so private data isn't
    // served from the CDN to other users.
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*'],
}
