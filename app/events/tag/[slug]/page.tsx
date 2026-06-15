import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { Tag } from '@/types'
import { fetchLandingEvents, SITE_URL } from '@/lib/event-queries'
import EventLanding from '@/components/EventLanding'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

async function getTag(slug: string): Promise<Tag | null> {
  const { data } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .eq('enabled', true)
    .single()
  return (data as Tag) || null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = await getTag(params.slug)
  if (!tag) return { title: 'Not Found' }
  const title = `${tag.name} in Malta — Upcoming Events`
  const description = `Browse upcoming ${tag.name.toLowerCase()} events across Malta and Gozo. Dates, venues, tickets and details — updated daily on Events Malta.`
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/events/tag/${tag.slug}` },
    openGraph: { title, description, type: 'website', url: `/events/tag/${tag.slug}` },
  }
}

export default async function TagLandingPage({ params }: Props) {
  const tag = await getTag(params.slug)
  if (!tag) notFound()

  const events = await fetchLandingEvents({ tagNames: [tag.name] })

  const { data: others } = await supabase
    .from('tags')
    .select('name, slug')
    .eq('enabled', true)
    .neq('slug', tag.slug)
    .order('display_order', { ascending: true })
    .limit(12)

  const relatedLinks = [
    { href: '/events/this-weekend', label: 'This weekend' },
    { href: '/events/today', label: 'Today' },
    ...((others as { name: string; slug: string | null }[] | null) || [])
      .filter((t) => t.slug)
      .map((t) => ({ href: `/events/tag/${t.slug}`, label: t.name })),
  ]

  return (
    <EventLanding
      heading={`${tag.icon ? `${tag.icon} ` : ''}${tag.name} in Malta`}
      intro={`Find the best upcoming ${tag.name.toLowerCase()} events happening across Malta and Gozo. From venues in Valletta and St Julian's to Gozo, browse what's on, check dates and prices, and grab tickets.`}
      events={events}
      relatedLinks={relatedLinks}
      emptyMessage={`No upcoming ${tag.name.toLowerCase()} events listed right now — check back soon or browse all events.`}
    />
  )
}
