import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { deriveLocality } from '@/lib/malta-localities'
import { slugifyVenue, isRealVenue } from '@/lib/venues'
import { MONTH_SLUGS } from '@/lib/month-landing'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/events`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/events/today`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/this-weekend`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/events/this-month`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/events/locations`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/venues`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/events/tags`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/login`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/signup`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Evergreen month landing pages — same URL rolls forward each year.
  const monthRoutes: MetadataRoute.Sitemap = MONTH_SLUGS.map((slug) => ({
    url: `${SITE_URL}/events/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const { data: events } = await supabase
    .from('events')
    .select('slug, updated_at, date_start, location_name')
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

  // Location landing pages — only for localities that actually have upcoming
  // events, so we never list an empty page.
  const localitySlugs = new Set<string>()
  for (const e of events || []) {
    const loc = deriveLocality((e as { location_name: string | null }).location_name)
    if (loc) localitySlugs.add(loc.slug)
  }
  const locationRoutes: MetadataRoute.Sitemap = Array.from(localitySlugs).map((slug) => ({
    url: `${SITE_URL}/events/location/${slug}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  // Venue landing pages — one per distinct real venue with upcoming events.
  const venueSlugs = new Set<string>()
  for (const e of events || []) {
    const name = (e as { location_name: string | null }).location_name
    if (isRealVenue(name)) venueSlugs.add(slugifyVenue(name!))
  }
  const venueRoutes: MetadataRoute.Sitemap = Array.from(venueSlugs).map((slug) => ({
    url: `${SITE_URL}/venues/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticRoutes, ...monthRoutes, ...tagRoutes, ...locationRoutes, ...venueRoutes, ...eventRoutes]
}
