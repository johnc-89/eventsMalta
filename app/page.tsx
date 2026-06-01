import { supabase } from '@/lib/supabase'
import EventCard from '@/components/EventCard'
import Link from 'next/link'
import { getPublishedSiteSettings, DEFAULT_SETTINGS, type HomepageSectionId } from '@/lib/site-settings'
import { BlockRenderer, type RenderContext } from '@/lib/blocks/Renderer'
import type { BlockInstance } from '@/lib/blocks/types'
import EventDisclaimer from '@/components/EventDisclaimer'

export const dynamic = 'force-dynamic'

interface FaqItem { id: number; question: string; answer: string }

export default async function Home() {
  const settings = await getPublishedSiteSettings().catch(() => null)
  const safe = settings ?? DEFAULT_SETTINGS
  const { hero, sections } = safe

  const isEnabled = (id: HomepageSectionId) => sections.find((s) => s.id === id)?.enabled !== false
  const orderOf = (id: HomepageSectionId) => {
    const idx = sections.findIndex((s) => s.id === id)
    return idx === -1 ? 999 : idx
  }

  const [
    featuredEventsRes,
    upcomingEventsRes,
    categoriesRes,
    faqRes,
    blockPageRes,
  ] = await Promise.all([
    supabase.from('events').select('*').eq('status', 'approved').eq('is_featured', true).is('deleted_at', null).gte('date_start', new Date().toISOString()).order('featured_order', { ascending: true, nullsFirst: false }).order('date_start').limit(12),
    supabase.from('events').select('*').eq('status', 'approved').is('deleted_at', null).gte('date_start', new Date().toISOString()).order('date_start').limit(24),
    supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
    supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
    supabase.from('block_pages_public').select('published_blocks').eq('slug', 'home').single(),
  ])

  const featuredEvents = featuredEventsRes.data ?? []
  const upcomingEvents = upcomingEventsRes.data ?? []
  const categories     = categoriesRes.data ?? []
  const faqs: FaqItem[] = (faqRes.data as FaqItem[] | null) ?? []
  const blocks: BlockInstance[] = (blockPageRes.data?.published_blocks as BlockInstance[] | null) ?? []
  const useBlocks = blocks.length > 0

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.com'

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: safe.brand.name,
    url: siteUrl,
    logo: safe.brand.logo_url ?? `${siteUrl}/logo.png`,
    description: safe.seo.default_meta_description,
    areaServed: { '@type': 'Country', name: 'Malta' },
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: safe.brand.name,
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/events?search={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  }

  // -----------------------------------------------------------------------
  // BLOCK MODE — published_blocks is non-empty, render via BlockRenderer.
  // -----------------------------------------------------------------------
  if (useBlocks) {
    const ctx: RenderContext = { upcomingEvents, featuredEvents, categories, faqs }
    return (
      <main>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        {blocks.map((b) => <BlockRenderer key={b.id} block={b} context={ctx} />)}
      </main>
    )
  }

  // -----------------------------------------------------------------------
  // FALLBACK MODE — fixed sections, ordered/toggled via site_settings.sections.
  // Used until the admin builds and publishes a block layout.
  // -----------------------------------------------------------------------
  const renderHero = () => (
    <section
      key="hero"
      className="relative bg-brand-dark text-white overflow-hidden"
      style={hero.image_url ? {
        backgroundImage: `linear-gradient(rgba(26,31,54,${hero.overlay_opacity}), rgba(26,31,54,${hero.overlay_opacity})), url(${hero.image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center relative">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold mb-4">
          {hero.title_pre}{hero.title_pre && ' '}
          <span className="theme-accent-text">{hero.title_highlight}</span>
          {hero.title_post && ' '}{hero.title_post}
        </h1>
        <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto font-body">{hero.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href={hero.primary_cta.href} className="theme-accent-bg px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">
            {hero.primary_cta.label}
          </Link>
          {hero.secondary_cta.enabled && (
            <Link href={hero.secondary_cta.href} className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors">
              {hero.secondary_cta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  )

  const renderCategories = () => categories.length > 0 ? (
    <section key="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
      <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {([
            { date: 'today',   label: '📅 Today' },
            { date: 'weekend', label: '🎉 This Weekend' },
            { date: 'week',    label: '📆 This Week' },
            { date: 'month',   label: '🗓️ This Month' },
          ]).map(({ date, label }) => (
            <Link
              key={date}
              href={`/events?date=${date}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-gold/10 hover:bg-brand-gold/25 text-brand-dark text-sm font-medium transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {categories.filter((cat) => cat.slug).map((cat) => (
            <Link
              key={cat.id}
              href={`/events?tag=${cat.slug}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-cream hover:bg-brand-gold/15 hover:text-brand-dark text-sm font-medium text-brand-dark transition-colors"
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  ) : null

  const renderFeatured = () => featuredEvents.length > 0 ? (
    <section key="featured" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 className="text-2xl font-heading font-bold text-brand-dark mb-6">Featured Events</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {featuredEvents.slice(0, 3).map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </section>
  ) : null

  const renderUpcoming = () => (
    <section key="upcoming" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-heading font-bold text-brand-dark">Upcoming Events</h2>
        <Link href="/events" className="text-brand-cyan hover:text-brand-teal font-medium text-sm transition-colors">
          View all →
        </Link>
      </div>
      {upcomingEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingEvents.slice(0, 6).map((event) => <EventCard key={event.id} event={event} />)}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500 text-lg mb-4 font-body">No upcoming events yet.</p>
          <Link href="/events/create" className="inline-block theme-accent-bg px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">
            Be the first to post!
          </Link>
        </div>
      )}
    </section>
  )

  const renderFaq = () => faqs.length === 0 ? null : (
    <section key="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h2 className="text-2xl font-heading font-bold text-brand-dark mb-6 text-center">
        Frequently Asked Questions
      </h2>
      <div className="space-y-4">
        {faqs.map((faq) => (
          <details key={faq.id} className="bg-white rounded-xl border p-5 group">
            <summary className="font-semibold text-brand-dark cursor-pointer list-none flex justify-between items-center">
              <span>{faq.question}</span>
              <span className="theme-accent-text text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-gray-600 mt-3 text-sm leading-relaxed whitespace-pre-line">{faq.answer}</p>
          </details>
        ))}
      </div>
      <EventDisclaimer variant="inline" className="mt-6 text-center" />
    </section>
  )

  const RENDERERS: Record<HomepageSectionId, () => React.ReactNode> = {
    hero:       renderHero,
    categories: renderCategories,
    featured:   renderFeatured,
    upcoming:   renderUpcoming,
    faq:        renderFaq,
  }

  const orderedIds = (Object.keys(RENDERERS) as HomepageSectionId[])
    .filter(isEnabled)
    .sort((a, b) => orderOf(a) - orderOf(b))

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      {orderedIds.map((id) => RENDERERS[id]())}
    </main>
  )
}
