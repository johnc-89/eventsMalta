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
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
