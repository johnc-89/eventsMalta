import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAllUpcomingCached, currentMonthYearLabel, SITE_URL } from '@/lib/event-queries'
import { getLocalityBySlug, deriveLocality, LOCALITIES } from '@/lib/malta-localities'
import EventLanding from '@/components/EventLanding'
import LandingRenderer from '@/components/LandingRenderer'
import { resolveLandingBlocks, landingMetadata } from '@/lib/blocks/landing'
import { countLabel, type PlaceholderValues } from '@/lib/blocks/placeholders'

export const revalidate = 600

// Localities are a fixed hardcoded list — prerender all of them at build time.
export function generateStaticParams() {
  return LOCALITIES.map((l) => ({ slug: l.slug }))
}

interface Props {
  params: { slug: string }
}

// Shared between generateMetadata and the page body (the count goes in the
// <title>, the cards in the grid) — cache() keeps it to one fetch per request.
const getLocalityEvents = cache(async (slug: string) => {
  const all = await getAllUpcomingCached()
  return all.filter((e) => deriveLocality(e.location_name)?.slug === slug)
})

// {placeholder} values available to a block-editable location template.
function localityPlaceholders(name: string, count: number): PlaceholderValues {
  return {
    location: name,
    count,
    count_label: countLabel(count),
    month_year: currentMonthYearLabel(),
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loc = getLocalityBySlug(params.slug)
  if (!loc) return { title: 'Not Found' }
  const count = (await getLocalityEvents(loc.slug)).length
  const canonical = `${SITE_URL}/events/location/${loc.slug}`

  // Admin-authored SEO override (block-editable) wins; else the templated copy.
  const data = await resolveLandingBlocks('location', loc.slug)
  const override = landingMetadata(data, localityPlaceholders(loc.name, count), canonical)
  if (override) return override

  // Live count + current month/year: matches dated queries and reads fresher
  // in the SERP than any static competitor title.
  const title = count > 0
    ? `Events in ${loc.name} – ${currentMonthYearLabel()} (${count} Upcoming)`
    : `Events in ${loc.name} — What's On`
  const description = count > 0
    ? `${count} upcoming ${count === 1 ? 'event' : 'events'} in ${loc.name}, Malta — concerts, parties, culture, festivals and things to do. Dates, venues and tickets, updated daily on Events Malta.`
    : `Upcoming events in ${loc.name}, Malta — concerts, parties, culture, festivals and things to do. Dates, venues and tickets, updated daily on Events Malta.`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: `/events/location/${loc.slug}` },
  }
}

export default async function LocationLandingPage({ params }: Props) {
  const loc = getLocalityBySlug(params.slug)
  if (!loc) notFound()

  const events = await getLocalityEvents(loc.slug)

  // Block mode: an admin-published template/override renders via blocks with
  // {placeholders} filled. Otherwise fall back to the hard-coded EventLanding.
  const data = await resolveLandingBlocks('location', loc.slug)
  if (data) {
    return (
      <LandingRenderer
        data={data}
        landingEvents={events}
        placeholders={localityPlaceholders(loc.name, events.length)}
      />
    )
  }

  const relatedLinks = [
    { href: '/events/this-weekend', label: 'This weekend' },
    { href: '/events/today', label: 'Today' },
    { href: '/events/locations', label: 'All localities' },
  ]

  return (
    <EventLanding
      heading={`Events in ${loc.name}`}
      intro={`Discover what's on in ${loc.name}, Malta. Browse upcoming concerts, parties, cultural events and things to do — with dates, venues and ticket details.`}
      paragraphs={loc.description}
      events={events}
      relatedLinks={relatedLinks}
      emptyMessage={`No upcoming events listed in ${loc.name} right now — check back soon or browse all events.`}
    />
  )
}
