import { supabase } from '@/lib/supabase'
import { BlockRenderer, type RenderContext } from '@/lib/blocks/Renderer'
import type { LandingPageData } from '@/lib/blocks/landing'
import type { PlaceholderValues } from '@/lib/blocks/placeholders'
import type { Category, Event } from '@/types'
import EventDisclaimer from '@/components/EventDisclaimer'
import { landingBreadcrumbJsonLd, jsonLdSafe } from '@/lib/event-queries'

interface FaqItem { id: number; question: string; answer: string }

/**
 * Renders a block-editable landing page. `landingEvents` is the scoped list the
 * page was built for (this locality/tag/venue/time); the `landing_events` block
 * consumes it. Categories + FAQs are fetched so a landing template may also use
 * categories_strip / faq / upcoming_events blocks. Placeholders are interpolated
 * across all block text by the renderer.
 */
export default async function LandingRenderer({
  data,
  landingEvents,
  placeholders,
  breadcrumb,
}: {
  data: LandingPageData
  landingEvents: Event[]
  placeholders: PlaceholderValues
  // Leaf of the Home > Events > this-page trail; emits BreadcrumbList JSON-LD.
  breadcrumb?: { name: string; path: string }
}) {
  const nowISO = new Date().toISOString()
  const [catsRes, faqRes] = await Promise.all([
    supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
    supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
  ])

  const ctx: RenderContext = {
    // Scope generic event blocks to this landing's events too, so an
    // upcoming_events block on a locality page shows that locality's events.
    upcomingEvents: landingEvents,
    featuredEvents: [],
    categories: (catsRes.data as Category[]) ?? [],
    faqs: (faqRes.data as FaqItem[]) ?? [],
    afterISO: nowISO,
    landingEvents,
    placeholders,
  }

  return (
    <main>
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(landingBreadcrumbJsonLd(breadcrumb)) }}
        />
      )}
      {data.blocks.map((b) => <BlockRenderer key={b.id} block={b} context={ctx} />)}
      <EventDisclaimer variant="card" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 mb-10" />
    </main>
  )
}
