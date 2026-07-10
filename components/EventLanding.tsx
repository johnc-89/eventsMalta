import Link from 'next/link'
import { Event } from '@/types'
import EventCard from '@/components/EventCard'
import EventDisclaimer from '@/components/EventDisclaimer'
import ExpandableText from '@/components/ExpandableText'
import LandingDateFilter from '@/components/LandingDateFilter'
import { itemListJsonLd, jsonLdSafe, landingBreadcrumbJsonLd } from '@/lib/event-queries'

interface RelatedLink {
  href: string
  label: string
}

interface EventLandingProps {
  heading: string
  intro: string
  // Optional locality/tag copy rendered after the intro — unique on-page text
  // that keeps templated landings from reading as thin/doorway pages.
  paragraphs?: string[]
  events: Event[]
  relatedLinks?: RelatedLink[]
  emptyMessage?: string
  // Leaf of the breadcrumb trail (Home > Events > this page). `path` is the
  // page's canonical path, e.g. '/events/tag/music'. When set, emits
  // BreadcrumbList JSON-LD mirroring the visible Home / Events nav.
  breadcrumb?: { name: string; path: string }
  // Show in-page Today/Weekend/Month + date-range chips that narrow this page's
  // events client-side (used on location/category landings so a date filter
  // stays on this page instead of jumping to the global /events/today landing).
  dateFilter?: boolean
}

// Server-rendered SEO landing page body: H1, intro copy, ItemList JSON-LD,
// the event grid, and internal links to sibling landing pages.
export default function EventLanding({
  heading,
  intro,
  paragraphs,
  events,
  relatedLinks,
  emptyMessage = 'No upcoming events here right now — check back soon.',
  breadcrumb,
  dateFilter = false,
}: EventLandingProps) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(landingBreadcrumbJsonLd(breadcrumb)) }}
        />
      )}
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
      <ExpandableText intro={intro} paragraphs={paragraphs} />

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

      {dateFilter && events.length > 0 ? (
        <LandingDateFilter events={events} emptyMessage={emptyMessage} />
      ) : events.length === 0 ? (
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
