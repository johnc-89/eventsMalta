import { Metadata } from 'next'
import Link from 'next/link'
import { getAllUpcomingCached, SITE_URL, landingBreadcrumbJsonLd, jsonLdSafe } from '@/lib/event-queries'
import { groupByVenue } from '@/lib/venues'
import { deriveLocality } from '@/lib/malta-localities'

export const revalidate = 600

const title = 'Event Venues in Malta — Browse by Venue'
const description =
  'All venues with upcoming events in Malta and Gozo — theatres, clubs, museums and open-air spaces. Pick a venue to see everything on there.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/venues` },
  openGraph: { title, description, type: 'website', url: '/venues' },
}

// Directory hub: internal crawl path into every venue landing page.
export default async function VenuesHubPage() {
  const events = await getAllUpcomingCached()
  const venues = Array.from(groupByVenue(events).entries())
    .sort((a, b) => b[1].events.length - a[1].events.length)

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(landingBreadcrumbJsonLd({ name: 'Event Venues in Malta', path: '/venues' })) }}
      />
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand-teal">Home</Link>
        {' / '}
        <Link href="/events" className="hover:text-brand-teal">Events</Link>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Event Venues in Malta</h1>
      <p className="text-gray-600 max-w-3xl mb-8">
        Every venue with upcoming events across Malta and Gozo. Pick a venue to see
        what&apos;s on there, or browse by{' '}
        <Link href="/events/locations" className="text-brand-teal-dark hover:underline">locality</Link> and{' '}
        <Link href="/events/tags" className="text-brand-teal-dark hover:underline">category</Link>.
      </p>

      {venues.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">No upcoming events listed right now — check back soon.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {venues.map(([slug, venue]) => {
            const count = venue.events.length
            const locality = deriveLocality(venue.displayName)
            return (
              <Link
                key={slug}
                href={`/venues/${slug}`}
                className="bg-white rounded-xl border p-5 hover:border-brand-gold transition-colors"
              >
                <p className="font-semibold text-gray-900">{venue.displayName}</p>
                <p className="text-sm text-gray-500">
                  {locality ? `${locality.name} · ` : ''}{count} {count === 1 ? 'event' : 'events'}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
