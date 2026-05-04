import { supabase } from '@/lib/supabase'
import EventCard from '@/components/EventCard'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data: featuredEvents } = await supabase
    .from('events')
    .select('*, category:categories(*)')
    .eq('status', 'approved')
    .eq('is_featured', true)
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(3)

  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('*, category:categories(*)')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(6)

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.com'

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Events Malta',
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    description: 'Events Malta is a public events discovery platform for Malta and Gozo, listing parties, comedy gigs, concerts, festivals and more.',
    areaServed: { '@type': 'Country', name: 'Malta' },
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Events Malta',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/events?search={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }

  const faqs = [
    {
      q: 'How do I post an event on Events Malta?',
      a: 'Create a free account, then visit the "Post Event" page. Submissions are reviewed by an admin before they go live, usually within 24 hours.',
    },
    {
      q: 'Is it free to list an event?',
      a: 'Yes — listing events on Events Malta is completely free for organisers and free for visitors to browse.',
    },
    {
      q: 'What kinds of events are listed?',
      a: 'Parties, comedy gigs, concerts, festivals, theatre, sports, food & drink, arts and charity events happening across Malta and Gozo.',
    },
    {
      q: 'Do you cover events in Gozo?',
      a: 'Yes. Events Malta covers events on both Malta and Gozo.',
    },
    {
      q: 'How do I buy tickets?',
      a: 'Each event links out to the organiser\'s ticketing platform — we don\'t process payments ourselves. Some events are free entry with no ticket required.',
    },
  ]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero Section */}
      <section className="bg-brand-dark text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold mb-4">
            Discover Events in <span className="text-brand-gold">Malta</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto font-body">
            Parties, comedy gigs, concerts, festivals and more — find your next night out or day event across Malta and Gozo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/events"
              className="bg-brand-gold text-brand-dark px-8 py-3 rounded-lg font-semibold hover:bg-brand-gold/90 transition-colors"
            >
              Browse Events
            </Link>
            <Link
              href="/events/create"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Post Your Event
            </Link>
          </div>
        </div>
      </section>

      {/* Category Pills */}
      {categories && categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
          <div className="bg-white rounded-xl shadow-sm border p-4 flex gap-3 overflow-x-auto">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/events?category=${cat.slug}`}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-brand-cream hover:bg-brand-gold/15 hover:text-brand-dark text-sm font-medium text-brand-dark transition-colors"
              >
                <span>{cat.icon}</span>
                {cat.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Events */}
      {featuredEvents && featuredEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-heading font-bold text-brand-dark mb-6">Featured Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-heading font-bold text-brand-dark">Upcoming Events</h2>
          <Link href="/events" className="text-brand-cyan hover:text-brand-teal font-medium text-sm transition-colors">
            View all →
          </Link>
        </div>
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border">
            <p className="text-gray-500 text-lg mb-4 font-body">No upcoming events yet.</p>
            <Link
              href="/events/create"
              className="inline-block bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Be the first to post!
            </Link>
          </div>
        )}
      </section>

      {/* FAQ — also surfaced as JSON-LD for AI/search engines */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-heading font-bold text-brand-dark mb-6 text-center">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <details key={faq.q} className="bg-white rounded-xl border p-5 group">
              <summary className="font-semibold text-brand-dark cursor-pointer list-none flex justify-between items-center">
                <span>{faq.q}</span>
                <span className="text-brand-gold text-xl group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-gray-600 mt-3 text-sm leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-brand-dark mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400 font-body">Events Malta — Discover what's happening on the island.</p>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link href="/events" className="hover:text-brand-gold transition-colors">Browse</Link>
              <Link href="/events/create" className="hover:text-brand-gold transition-colors">Post Event</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
