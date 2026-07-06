import type { Metadata } from 'next'
import Link from 'next/link'
import EventsList from './EventsList'
import { supabase } from '@/lib/supabase'
import { fetchLandingEvents, itemListJsonLd, jsonLdSafe, SITE_URL } from '@/lib/event-queries'
import { BlockRenderer, type RenderContext } from '@/lib/blocks/Renderer'
import type { BlockInstance } from '@/lib/blocks/types'
import type { Category, Event } from '@/types'

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

interface FaqItem { id: number; question: string; answer: string }

// The initial list is fetched server-side (never from searchParams — that would
// opt the route out of ISR) so crawlers get the full default grid in the static
// HTML. EventsList only re-fetches client-side when URL filters are present.
export default async function Page() {
  const nowISO = new Date().toISOString()

  const [initialEvents, blockPageRes] = await Promise.all([
    fetchLandingEvents({ limit: 60 }),
    supabase.from('block_pages_public').select('published_blocks').eq('slug', 'events').single(),
  ])

  const blocks: BlockInstance[] = (blockPageRes.data?.published_blocks as BlockInstance[] | null) ?? []
  const useBlocks = blocks.length > 0

  const jsonLd = initialEvents.length > 0 && (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListJsonLd(initialEvents)) }}
    />
  )

  // -----------------------------------------------------------------------
  // BLOCK MODE — an admin has published a block layout for /events. Render it
  // (the events_browser block carries the searchable/filterable list).
  // -----------------------------------------------------------------------
  if (useBlocks) {
    const [featuredRes, categoriesRes, faqRes] = await Promise.all([
      supabase.from('events').select('*').eq('status', 'approved').eq('is_featured', true).is('deleted_at', null).gte('date_start', nowISO).order('featured_order', { ascending: true, nullsFirst: false }).order('date_start').limit(12),
      supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
      supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
    ])
    const ctx: RenderContext = {
      upcomingEvents: initialEvents,
      featuredEvents: (featuredRes.data as Event[] | null) ?? [],
      categories: (categoriesRes.data as Category[] | null) ?? [],
      faqs: (faqRes.data as FaqItem[] | null) ?? [],
      afterISO: nowISO,
    }
    return (
      <main>
        {jsonLd}
        {blocks.map((b) => <BlockRenderer key={b.id} block={b} context={ctx} />)}
      </main>
    )
  }

  // -----------------------------------------------------------------------
  // FALLBACK MODE — fixed layout, used until an admin publishes blocks.
  // -----------------------------------------------------------------------
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {jsonLd}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Browse Events</h1>
        <Link href="/events/past" className="text-sm text-brand-teal-dark hover:text-brand-teal font-medium">
          View past events →
        </Link>
      </div>
      <p className="text-gray-600 max-w-3xl mb-6">
        Every upcoming event across Malta and Gozo in one place — concerts, parties, festivals,
        theatre, markets and family days out, with new listings added daily. Filter by date,
        category or price, or jump straight to what&apos;s on{' '}
        <Link href="/events/today" className="text-brand-teal-dark hover:underline">today</Link>,{' '}
        <Link href="/events/this-weekend" className="text-brand-teal-dark hover:underline">this weekend</Link> or{' '}
        <Link href="/events/this-month" className="text-brand-teal-dark hover:underline">this month</Link>.
      </p>
      <EventsList initialEvents={initialEvents} />
    </main>
  )
}
