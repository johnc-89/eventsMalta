import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { fetchAllUpcoming, SITE_URL } from '@/lib/event-queries'
import { getLocalityBySlug, deriveLocality } from '@/lib/malta-localities'
import EventLanding from '@/components/EventLanding'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export function generateMetadata({ params }: Props): Metadata {
  const loc = getLocalityBySlug(params.slug)
  if (!loc) return { title: 'Not Found' }
  const title = `Events in ${loc.name} — What's On`
  const description = `Upcoming events in ${loc.name}, Malta — concerts, parties, culture, festivals and things to do. Dates, venues and tickets, updated daily on Events Malta.`
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

  const all = await fetchAllUpcoming()
  const events = all.filter((e) => deriveLocality(e.location_name)?.slug === loc.slug)

  const relatedLinks = [
    { href: '/events/this-weekend', label: 'This weekend' },
    { href: '/events/today', label: 'Today' },
  ]

  return (
    <EventLanding
      heading={`Events in ${loc.name}`}
      intro={`Discover what's on in ${loc.name}, Malta. Browse upcoming concerts, parties, cultural events and things to do — with dates, venues and ticket details.`}
      events={events}
      relatedLinks={relatedLinks}
      emptyMessage={`No upcoming events listed in ${loc.name} right now — check back soon or browse all events.`}
    />
  )
}
