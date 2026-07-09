import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { fetchAllUpcoming, SITE_URL } from '@/lib/event-queries'
import { groupByVenue } from '@/lib/venues'
import { deriveLocality } from '@/lib/malta-localities'
import EventLanding from '@/components/EventLanding'
import LandingRenderer from '@/components/LandingRenderer'
import { resolveLandingBlocks, landingMetadata } from '@/lib/blocks/landing'
import { countLabel, type PlaceholderValues } from '@/lib/blocks/placeholders'

export const revalidate = 600

function venuePlaceholders(venue: string, locality: string, count: number): PlaceholderValues {
  return { venue, locality, count, count_label: countLabel(count) }
}

// Venues are derived from event data at request time; render on demand (ISR).
export async function generateStaticParams() {
  return []
}

interface Props {
  params: { slug: string }
}

async function getVenue(slug: string) {
  const all = await fetchAllUpcoming()
  const group = groupByVenue(all).get(slug)
  return group ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const venue = await getVenue(params.slug)
  if (!venue) return { title: 'Venue Not Found' }
  const canonical = `${SITE_URL}/venues/${params.slug}`

  const locality = deriveLocality(venue.displayName)
  const blockData = await resolveLandingBlocks('venue', params.slug)
  const override = landingMetadata(
    blockData,
    venuePlaceholders(venue.displayName, locality?.name ?? '', venue.events.length),
    canonical,
  )
  if (override) return override

  const title = `Events at ${venue.displayName}`
  const description = `Upcoming events at ${venue.displayName}, Malta — see what's on, with dates, times and ticket details. Updated daily on Events Malta.`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website', url: `/venues/${params.slug}` },
  }
}

export default async function VenuePage({ params }: Props) {
  const venue = await getVenue(params.slug)
  if (!venue) notFound()

  const locality = deriveLocality(venue.displayName)

  const blockData = await resolveLandingBlocks('venue', params.slug)
  if (blockData) {
    return (
      <LandingRenderer
        data={blockData}
        landingEvents={venue.events}
        placeholders={venuePlaceholders(venue.displayName, locality?.name ?? '', venue.events.length)}
        breadcrumb={{ name: venue.displayName, path: `/venues/${params.slug}` }}
      />
    )
  }

  const relatedLinks = [
    { href: '/events/this-weekend', label: 'This weekend' },
    ...(locality ? [{ href: `/events/location/${locality.slug}`, label: `More in ${locality.name}` }] : []),
  ]

  return (
    <EventLanding
      heading={`Events at ${venue.displayName}`}
      intro={`Find upcoming events at ${venue.displayName}${locality ? `, ${locality.name}` : ''}, Malta. Browse what's on — concerts, parties, shows and more — with dates and ticket details.`}
      events={venue.events}
      relatedLinks={relatedLinks}
      emptyMessage={`No upcoming events at ${venue.displayName} right now — check back soon.`}
      breadcrumb={{ name: venue.displayName, path: `/venues/${params.slug}` }}
    />
  )
}
