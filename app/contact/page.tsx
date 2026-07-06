import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { getPublishedSiteSettings, DEFAULT_SETTINGS } from '@/lib/site-settings'
import { BlockRenderer, type RenderContext } from '@/lib/blocks/Renderer'
import { BLOCK_DEFAULTS } from '@/lib/blocks/defaults'
import type { BlockInstance } from '@/lib/blocks/types'
import { jsonLdSafe, SITE_URL } from '@/lib/event-queries'
import type { Category, Event } from '@/types'

export const revalidate = 600

const title = 'Contact Us'
const description =
  'Get in touch with the Events Malta team — general enquiries, event listings, corrections, and press. We usually reply within a couple of days.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/contact` },
  openGraph: { title, description, type: 'website', url: '/contact' },
}

interface FaqItem { id: number; question: string; answer: string }

export default async function ContactPage() {
  const [settings, blockPageRes] = await Promise.all([
    getPublishedSiteSettings().catch(() => null),
    supabase.from('block_pages_public').select('published_blocks').eq('slug', 'contact').single(),
  ])
  const safe = settings ?? DEFAULT_SETTINGS

  const published: BlockInstance[] = (blockPageRes.data?.published_blocks as BlockInstance[] | null) ?? []
  // Until an admin publishes a custom layout, the page is a single default
  // contact_form block — same fallback pattern as / and /events.
  const blocks: BlockInstance[] =
    published.length > 0
      ? published
      : [{ id: 'b_contact_default', type: 'contact_form', config: BLOCK_DEFAULTS.contact_form }]

  // Context for any data-driven blocks an admin might add to the layout.
  const needsEventData = blocks.some((b) =>
    ['categories_strip', 'featured_events', 'upcoming_events', 'events_browser', 'faq'].includes(b.type),
  )
  const nowISO = new Date().toISOString()
  let ctx: RenderContext = { upcomingEvents: [], featuredEvents: [], categories: [], faqs: [], afterISO: nowISO }
  if (needsEventData) {
    const [upcomingRes, featuredRes, categoriesRes, faqRes] = await Promise.all([
      supabase.from('events').select('*').eq('status', 'approved').is('deleted_at', null).gte('date_start', nowISO).order('date_start').limit(24),
      supabase.from('events').select('*').eq('status', 'approved').eq('is_featured', true).is('deleted_at', null).gte('date_start', nowISO).order('featured_order', { ascending: true, nullsFirst: false }).order('date_start').limit(12),
      supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
      supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
    ])
    ctx = {
      upcomingEvents: (upcomingRes.data as Event[] | null) ?? [],
      featuredEvents: (featuredRes.data as Event[] | null) ?? [],
      categories: (categoriesRes.data as Category[] | null) ?? [],
      faqs: (faqRes.data as FaqItem[] | null) ?? [],
      afterISO: nowISO,
    }
  }

  const contactEmail = safe.footer.contact_email
  const contactPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: `Contact ${safe.brand.name}`,
    description,
    url: `${SITE_URL}/contact`,
    mainEntity: {
      '@type': 'Organization',
      name: safe.brand.name,
      url: SITE_URL,
      ...(contactEmail && {
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: contactEmail,
          areaServed: 'MT',
          availableLanguage: ['English'],
        },
      }),
    },
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(contactPageJsonLd) }} />
      {blocks.map((b) => <BlockRenderer key={b.id} block={b} context={ctx} />)}
    </main>
  )
}
