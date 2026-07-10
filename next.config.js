/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundle the admin handbook HTML into the serverless function output so
  // /api/admin/guide can readFile() it on Vercel. Without this, files outside
  // /public and /.next are tree-shaken away from the deployed function.
  experimental: {
    outputFileTracingIncludes: {
      '/api/admin/guide': ['./SUPER_ADMIN_GUIDE.html'],
    },
  },
  images: {
    // Single allowlist entry — every image we render goes through Supabase
    // Storage. Imported event images are mirrored at import time via
    // `lib/importers/image-mirror.ts`; user-uploaded event images and site
    // assets (logo, hero) also live under *.supabase.co. New adapters do
    // NOT need an entry added here — the mirror handles every host.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    // script-src uses 'unsafe-inline' because Next.js App Router emits inline
    // hydration scripts and JSON-LD is injected via dangerouslySetInnerHTML.
    // The real XSS guard is the jsonLdSafe() escaping + Supabase RLS; a
    // nonce-based strict-dynamic policy would remove unsafe-inline but requires
    // middleware nonce injection — a future improvement.
    const csp = [
      "default-src 'self'",
      // 'unsafe-eval' only in dev: webpack dev bundles execute modules via
      // eval(), so without it `npm run dev` pages never hydrate. Never in prod.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ')

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
  async redirects() {
    // Migration 0035 merged 4 overlapping tags into existing ones and deleted
    // the losing rows, so their /events/tag/<slug> landing pages would 404.
    // Redirect to the surviving tag's landing page to preserve any inbound
    // links / search-engine indexing.
    return [
      { source: '/events/tag/family-kids', destination: '/events/tag/family-friendly', permanent: true },
      { source: '/events/tag/rooftop', destination: '/events/tag/outdoor', permanent: true },
      { source: '/events/tag/arts', destination: '/events/tag/culture-arts', permanent: true },
      { source: '/events/tag/nightlife', destination: '/events/tag/party', permanent: true },
    ]
  },
}

module.exports = nextConfig
