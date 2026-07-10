import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { Category } from '@/types'
import { fetchLandingEvents, currentMonthYearLabel, SITE_URL } from '@/lib/event-queries'
import EventLanding from '@/components/EventLanding'
import LandingRenderer from '@/components/LandingRenderer'
import { resolveLandingBlocks, landingMetadata } from '@/lib/blocks/landing'
import { countLabel, type PlaceholderValues } from '@/lib/blocks/placeholders'

export const revalidate = 600

function tagPlaceholders(name: string, count: number): PlaceholderValues {
  return { tag: name, count, count_label: countLabel(count), month_year: currentMonthYearLabel() }
}

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
  const tag = (data as Category) || null
  if (!tag) return null
  const events = await fetchLandingEvents({ tagNames: [tag.name] })
  return { tag, events }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getTagPageData(params.slug)
  if (!data) return { title: 'Not Found' }
  const { tag, events } = data
  const count = events.length
  const canonical = `${SITE_URL}/events/tag/${tag.slug}`

  const blockData = await resolveLandingBlocks('tag', tag.slug ?? undefined)
  const override = landingMetadata(blockData, tagPlaceholders(tag.name, count), canonical)
  if (override) return override

  const title = count > 0
    ? `${tag.name} in Malta – ${currentMonthYearLabel()} (${count} Upcoming ${count === 1 ? 'Event' : 'Events'})`
    : `${tag.name} in Malta — Upcoming Events`
  const description = tag.description
    ? tag.description.replace(/\s+/g, ' ').slice(0, 160)
    : `Browse upcoming ${tag.name.toLowerCase()} events across Malta and Gozo. Dates, venues, tickets and details — updated daily on Events Malta.`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: `/events/tag/${tag.slug}` },
  }
}

export default async function TagLandingPage({ params }: Props) {
  const data = await getTagPageData(params.slug)
  if (!data) notFound()
  const { tag, events } = data

  const blockData = await resolveLandingBlocks('tag', tag.slug ?? undefined)
  if (blockData) {
    return (
      <LandingRenderer
        data={blockData}
        landingEvents={events}
        placeholders={tagPlaceholders(tag.name, events.length)}
        breadcrumb={{ name: tag.name, path: `/events/tag/${tag.slug}` }}
        landingType="tag"
      />
    )
  }

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
      breadcrumb={{ name: tag.name, path: `/events/tag/${tag.slug}` }}
      dateFilter
    />
  )
}
