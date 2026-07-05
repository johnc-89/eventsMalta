import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { Tag } from '@/types'
import { fetchLandingEvents, currentMonthYearLabel, SITE_URL } from '@/lib/event-queries'
import EventLanding from '@/components/EventLanding'

export const revalidate = 600

// Tag slugs live in the DB; render on demand and cache (ISR).
export async function generateStaticParams() {
  return []
}

interface Props {
  params: { slug: string }
}

// Shared between generateMetadata and the page body (the count goes in the
// <title>, the cards in the grid) — cache() keeps it to one fetch per request.
const getTagPageData = cache(async (slug: string) => {
  const { data } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .eq('enabled', true)
    .single()
  const tag = (data as Tag) || null
  if (!tag) return null
  const events = await fetchLandingEvents({ tagNames: [tag.name] })
  return { tag, events }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getTagPageData(params.slug)
  if (!data) return { title: 'Not Found' }
  const { tag, events } = data
  const count = events.length

  const title = count > 0
    ? `${tag.name} in Malta – ${currentMonthYearLabel()} (${count} Upcoming ${count === 1 ? 'Event' : 'Events'})`
    : `${tag.name} in Malta — Upcoming Events`
  const description = tag.description
    ? tag.description.replace(/\s+/g, ' ').slice(0, 160)
    : `Browse upcoming ${tag.name.toLowerCase()} events across Malta and Gozo. Dates, venues, tickets and details — updated daily on Events Malta.`

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/events/tag/${tag.slug}` },
    openGraph: { title, description, type: 'website', url: `/events/tag/${tag.slug}` },
  }
}

export default async function TagLandingPage({ params }: Props) {
  const data = await getTagPageData(params.slug)
  if (!data) notFound()
  const { tag, events } = data

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

  // Admin-editable copy (migration 0025): first paragraph replaces the
  // templated intro, the rest render below it.
  const chunks = tag.description?.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
  const intro = chunks?.[0]
    ?? `Find the best upcoming ${tag.name.toLowerCase()} events happening across Malta and Gozo. From venues in Valletta and St Julian's to Gozo, browse what's on, check dates and prices, and grab tickets.`
  const paragraphs = chunks && chunks.length > 1 ? chunks.slice(1) : undefined

  return (
    <EventLanding
      heading={`${tag.icon ? `${tag.icon} ` : ''}${tag.name} in Malta`}
      intro={intro}
      paragraphs={paragraphs}
      events={events}
      relatedLinks={relatedLinks}
      emptyMessage={`No upcoming ${tag.name.toLowerCase()} events listed right now — check back soon or browse all events.`}
    />
  )
}
