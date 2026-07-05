import type { Metadata } from 'next'
import Link from 'next/link'
import EventsList from './EventsList'
import { fetchLandingEvents, itemListJsonLd, jsonLdSafe, SITE_URL } from '@/lib/event-queries'

export const revalidate = 600

const title = "Browse Events in Malta & Gozo — What's On"
const description =
  'Browse every upcoming event in Malta and Gozo — concerts, parties, festivals, culture and family days out. Filter by date, category and price. Updated daily.'

// Every filter lives in the query string (?tag=&date=&from=&to=&q=&price=&sort=),
// so each filtered view is a distinct shareable URL. Those are near-duplicates of
// the bare list and of the dedicated /events/tag/* landing pages, so we point all
// query variants at the canonical /events — keeping crawlers from indexing the
// faceted permutations while the tag/location/venue landing pages rank on their own.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/events` },
  openGraph: { title, description, type: 'website', url: '/events' },
}

// The initial list is fetched server-side (never from searchParams — that would
// opt the route out of ISR) so crawlers get the full default grid in the static
// HTML. EventsList only re-fetches client-side when URL filters are present.
export default async function Page() {
  const initialEvents = await fetchLandingEvents({ limit: 60 })

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {initialEvents.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListJsonLd(initialEvents)) }}
        />
      )}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Browse Events</h1>
        <Link href="/events/past" className="text-sm text-brand-cyan hover:text-brand-teal font-medium">
          View past events →
        </Link>
      </div>
      <p className="text-gray-600 max-w-3xl mb-6">
        Every upcoming event across Malta and Gozo in one place — concerts, parties, festivals,
        theatre, markets and family days out, with new listings added daily. Filter by date,
        category or price, or jump straight to what&apos;s on{' '}
        <Link href="/events/today" className="text-brand-teal hover:underline">today</Link>,{' '}
        <Link href="/events/this-weekend" className="text-brand-teal hover:underline">this weekend</Link> or{' '}
        <Link href="/events/this-month" className="text-brand-teal hover:underline">this month</Link>.
      </p>
      <EventsList initialEvents={initialEvents} />
    </main>
  )
}
