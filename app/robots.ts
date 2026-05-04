import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved', '/reset-password', '/forgot-password'],
      },
      // Explicitly allow AI crawlers — events are public content
      { userAgent: 'GPTBot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'ChatGPT-User', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'OAI-SearchBot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'ClaudeBot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Claude-Web', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'anthropic-ai', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'PerplexityBot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Perplexity-User', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Google-Extended', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Googlebot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Bingbot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Applebot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Applebot-Extended', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'CCBot', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'cohere-ai', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
      { userAgent: 'Meta-ExternalAgent', allow: '/', disallow: ['/admin', '/admin/*', '/api/*', '/profile', '/saved'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
