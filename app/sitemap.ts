import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/events`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/events/today`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/this-weekend`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/this-month`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/signup`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const { data: events } = await supabase
    .from('events')
    .select('slug, updated_at, date_start')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })

  const { data: tags } = await supabase
    .from('tags')
    .select('slug')
    .eq('enabled', true)

  const eventRoutes: MetadataRoute.Sitemap = (events || []).map((e) => ({
    url: `${SITE_URL}/events/${e.slug}`,
    lastModified: new Date(e.updated_at),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const tagRoutes: MetadataRoute.Sitemap = (tags || [])
    .filter((t): t is { slug: string } => !!t.slug)
    .map((t) => ({
      url: `${SITE_URL}/events/tag/${t.slug}`,
      changeFrequency: 'daily',
      priority: 0.6,
    }))

  return [...staticRoutes, ...tagRoutes, ...eventRoutes]
}
