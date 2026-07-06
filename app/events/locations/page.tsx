import { Metadata } from 'next'
import Link from 'next/link'
import { getAllUpcomingCached, SITE_URL } from '@/lib/event-queries'
import { LOCALITIES, deriveLocality } from '@/lib/malta-localities'

export const revalidate = 600

const title = 'Events by Town & Locality in Malta'
const description =
  "Find events near you — browse what's on by town and locality across Malta and Gozo, from Valletta and Sliema to St Julian's, Mdina and Victoria."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/events/locations` },
  openGraph: { title, description, type: 'website', url: '/events/locations' },
}

// Directory hub: internal crawl path into every locality landing page (they
// were previously discoverable only via sitemap.xml, which passes no equity).
export default async function LocationsHubPage() {
  const events = await getAllUpcomingCached()
  const counts = new Map<string, number>()
  for (const e of events) {
    const loc = deriveLocality(e.location_name)
    if (loc) counts.set(loc.slug, (counts.get(loc.slug) ?? 0) + 1)
  }
  const withEvents = LOCALITIES.filter((l) => (counts.get(l.slug) ?? 0) > 0)

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand-teal">Home</Link>
        {' / '}
        <Link href="/events" className="hover:text-brand-teal">Events</Link>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Events by Locality</h1>
      <p className="text-gray-600 max-w-3xl mb-8">
        Browse upcoming events by town across Malta and Gozo. Pick a locality to see
        everything happening there — concerts, festivals, parties, culture and family
        events — or browse by <Link href="/venues" className="text-brand-teal-dark hover:underline">venue</Link> and{' '}
        <Link href="/events/tags" className="text-brand-teal-dark hover:underline">category</Link>.
      </p>

      {withEvents.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">No upcoming events listed right now — check back soon.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {withEvents.map((l) => {
            const count = counts.get(l.slug)!
            return (
              <Link
                key={l.slug}
                href={`/events/location/${l.slug}`}
                className="bg-white rounded-xl border p-5 hover:border-brand-gold transition-colors"
              >
                <p className="font-semibold text-gray-900">{l.name}</p>
                <p className="text-sm text-gray-500">{count} {count === 1 ? 'event' : 'events'}</p>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
