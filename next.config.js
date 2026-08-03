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
    // Serve images directly (no /_next/image). Vercel's optimizer has a
    // monthly transformation allowance; exhausting it makes every uncached
    // /_next/image request return 402 and the whole site shows broken
    // thumbnails (July 2026 incident). Optimization is redundant anyway:
    // mirrored images are already downscaled to ≤1600px and recompressed at
    // import time (lib/importers/image-mirror.ts). If this is ever flipped
    // back, remotePatterns below is the allowlist — every image we render
    // lives under *.supabase.co (imports are mirrored there; user uploads and
    // site assets live there too), so new adapters never need an entry added.
    unoptimized: true,
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
