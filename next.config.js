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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Imported event hosts. Add a new entry as each adapter ships.
      // Phase 3 plan: download these to Supabase Storage so we can drop
      // these patterns entirely — but until then we hotlink.
      { protocol: 'https', hostname: 'teatrumanoel.mt', pathname: '/wp-content/uploads/**' },
      { protocol: 'https', hostname: 'esplora.org.mt', pathname: '/wp-content/uploads/**' },
      { protocol: 'https', hostname: 'heritagemalta.org', pathname: '/wp-content/uploads/**' },
      { protocol: 'https', hostname: 'salesjan.edu.mt', pathname: '/**' }, // Teatru Salesjan
      { protocol: 'https', hostname: 'popp.com.mt', pathname: '/**' },
      { protocol: 'https', hostname: 'visitmalta.com', pathname: '/**' },
      { protocol: 'https', hostname: 'static.wixstatic.com', pathname: '/media/**' }, // Festivals Malta (Wix CDN)
      { protocol: 'https', hostname: 'maltaartisanmarkets.com', pathname: '/**' },
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
