import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getAllUpcomingCached, currentMonthYearLabel, SITE_URL } from '@/lib/event-queries'
import { getLocalityBySlug, deriveLocality, LOCALITIES } from '@/lib/malta-localities'
import EventLanding from '@/components/EventLanding'

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loc = getLocalityBySlug(params.slug)
  if (!loc) return { title: 'Not Found' }
  const count = (await getLocalityEvents(loc.slug)).length

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
    alternates: { canonical: `${SITE_URL}/events/location/${loc.slug}` },
    openGraph: { title, description, type: 'website', url: `/events/location/${loc.slug}` },
  }
}

export default async function LocationLandingPage({ params }: Props) {
  const loc = getLocalityBySlug(params.slug)
  if (!loc) notFound()

  const events = await getLocalityEvents(loc.slug)

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
