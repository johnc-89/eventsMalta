import { newBlockId, type BlockInstance } from './types'
import { BLOCK_DEFAULTS } from './defaults'
import type { LandingType } from './placeholders'

/** SEO title/description templates ({placeholder}-aware). Structurally matches
 *  BlockEditorContext's PageMeta and landing.ts's LandingMeta. */
export interface StarterMeta {
  seo_title?: string
  seo_description?: string
}

// Starter layouts for the landing-page block editor. "Load starter layout"
// drops in a block list that reproduces the current hard-coded EventLanding look
// (H1 + intro, related links, event grid) with the right {placeholders}, so an
// admin edits a real page instead of a blank canvas. Server-safe (no imports
// that pull client code) so it can run in the client editor too.

interface StarterCopy {
  heading: string
  intro: string
  seo_title: string
  seo_description: string
  related: { label: string; href: string }[]
}

const SIBLINGS = [
  { label: 'Today', href: '/events/today' },
  { label: 'This weekend', href: '/events/this-weekend' },
  { label: 'This month', href: '/events/this-month' },
]

const STARTER_COPY: Record<LandingType, StarterCopy> = {
  location: {
    heading: 'Events in {location}',
    intro: "Discover what's on in {location}, Malta. Browse upcoming concerts, parties, cultural events and things to do — with dates, venues and ticket details.",
    seo_title: 'Events in {location} – {month_year} ({count} Upcoming)',
    seo_description: '{count} upcoming {count_label} in {location}, Malta — concerts, parties, culture, festivals and things to do. Dates, venues and tickets, updated daily on Events Malta.',
    related: [...SIBLINGS, { label: 'All localities', href: '/events/locations' }],
  },
  tag: {
    heading: '{tag} in Malta',
    intro: "Find the best upcoming {tag} events happening across Malta and Gozo. Browse what's on, check dates and prices, and grab tickets.",
    seo_title: '{tag} in Malta – {month_year} ({count} Upcoming)',
    seo_description: 'Browse upcoming {tag} events across Malta and Gozo. Dates, venues, tickets and details — updated daily on Events Malta.',
    related: [...SIBLINGS, { label: 'All categories', href: '/events/tags' }],
  },
  venue: {
    heading: 'Events at {venue}',
    intro: "Find upcoming events at {venue}, Malta. Browse what's on — concerts, parties, shows and more — with dates and ticket details.",
    seo_title: 'Events at {venue}',
    seo_description: "Upcoming events at {venue}, Malta — see what's on, with dates, times and ticket details. Updated daily on Events Malta.",
    related: [...SIBLINGS, { label: 'All venues', href: '/venues' }],
  },
  today: {
    heading: 'Events in Malta Today',
    intro: "Looking for something to do today? Here's everything happening across Malta and Gozo right now — parties, live music, comedy, culture and more.",
    seo_title: "What's On in Malta Today",
    seo_description: 'Things to do in Malta tonight and today — parties, gigs, concerts and events across Malta and Gozo, updated daily.',
    related: SIBLINGS,
  },
  'this-weekend': {
    heading: 'Events in Malta This Weekend',
    intro: 'Plan your weekend in Malta. Browse every event happening this Saturday and Sunday across the islands — from beach parties to concerts, markets and family days out.',
    seo_title: "What's On in Malta This Weekend",
    seo_description: 'The best events in Malta this weekend — parties, concerts, festivals and things to do across Malta and Gozo, Saturday and Sunday.',
    related: SIBLINGS,
  },
  'this-month': {
    heading: 'Events in Malta This Month',
    intro: 'Everything happening in Malta and Gozo this month, in one place. Explore festivals, concerts, parties, exhibitions and more, and plan ahead.',
    seo_title: "What's On in Malta This Month",
    seo_description: 'A full guide to events in Malta this month — festivals, concerts, parties and things to do across Malta and Gozo.',
    related: SIBLINGS,
  },
  month: {
    heading: 'Events in Malta – {month} {year}',
    intro: 'Browse every event announced so far across Malta and Gozo for {month} {year} — concerts, festivals, parties, culture and family days out. New listings are added daily.',
    seo_title: 'Events in Malta – {month} {year}: Concerts, Festivals & Things to Do',
    seo_description: '{count} upcoming {count_label} in Malta in {month} {year} — concerts, festivals, parties, culture and family days out, with dates, venues and tickets.',
    related: SIBLINGS,
  },
}

export function starterLayout(type: LandingType): { blocks: BlockInstance[]; meta: StarterMeta } {
  const s = STARTER_COPY[type]
  const blocks: BlockInstance[] = [
    {
      id: newBlockId(),
      type: 'rich_text',
      config: { ...BLOCK_DEFAULTS.rich_text, content_md: `# ${s.heading}\n\n${s.intro}`, max_width: 'wide' },
    },
    {
      id: newBlockId(),
      type: 'related_links',
      config: { ...BLOCK_DEFAULTS.related_links, links: s.related },
    },
    {
      id: newBlockId(),
      type: 'landing_events',
      config: { ...BLOCK_DEFAULTS.landing_events },
    },
  ]
  return { blocks, meta: { seo_title: s.seo_title, seo_description: s.seo_description } }
}
