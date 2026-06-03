import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep private / authenticated areas out of the index.
        disallow: ['/admin', '/api', '/profile', '/my-events', '/saved', '/reset-password', '/forgot-password', '/auth'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
