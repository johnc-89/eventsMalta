import Link from 'next/link'
import { Event } from '@/types'
import EventCard from '@/components/EventCard'
import EventDisclaimer from '@/components/EventDisclaimer'
import { itemListJsonLd, jsonLdSafe } from '@/lib/event-queries'

interface RelatedLink {
  href: string
  label: string
}

interface EventLandingProps {
  heading: string
  intro: string
  events: Event[]
  relatedLinks?: RelatedLink[]
  emptyMessage?: string
}

// Server-rendered SEO landing page body: H1, intro copy, ItemList JSON-LD,
// the event grid, and internal links to sibling landing pages.
export default function EventLanding({
  heading,
  intro,
  events,
  relatedLinks,
  emptyMessage = 'No upcoming events here right now — check back soon.',
}: EventLandingProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {events.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListJsonLd(events)) }}
        />
      )}

      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand-teal">Home</Link>
        {' / '}
        <Link href="/events" className="hover:text-brand-teal">Events</Link>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">{heading}</h1>
      <p className="text-gray-600 max-w-3xl mb-8">{intro}</p>

      {relatedLinks && relatedLinks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {relatedLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <EventDisclaimer variant="card" className="mt-10" />
    </main>
  )
}
