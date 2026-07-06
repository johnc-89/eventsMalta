import type { BlockConfigMap, BlockType } from './types'

// Defaults for newly-created blocks. Should make sense out-of-the-box so the
// admin can drop in a block and immediately see something reasonable.

export const BLOCK_DEFAULTS: { [K in BlockType]: BlockConfigMap[K] } = {
  hero: {
    title_pre: 'Discover Events in',
    title_highlight: 'Malta',
    title_post: '',
    subtitle: 'Parties, comedy gigs, concerts, festivals and more — find your next night out across Malta and Gozo.',
    primary_cta:   { label: 'Browse Events',   href: '/events' },
    secondary_cta: { label: 'Post Your Event', href: '/events/create', enabled: true },
    image_url: null,
    overlay_opacity: 0.55,
  },
  rich_text: {
    content_md: '## Add a heading\n\nAdd some body text here. Markdown is supported — **bold**, *italic*, [links](https://example.com), lists, and more.',
    max_width: 'standard',
    background: 'none',
    align: 'left',
  },
  image: {
    image_url: null,
    caption: '',
    alt: '',
    link_href: '',
    max_width: 'standard',
    rounded: true,
  },
  spacer: {
    size: 'md',
  },
  cta_banner: {
    title: 'Got an event to share?',
    body: 'Listing is free and reaches thousands of locals every month.',
    button_label: 'Post your event',
    button_href: '/events/create',
    color: 'accent',
  },
  categories_strip: {
    category_slugs: [],   // empty = all
    title: '',
  },
  featured_events: {
    title: 'Featured Events',
    count: 3,
    show_view_all_link: false,
  },
  upcoming_events: {
    title: 'Upcoming Events',
    count: 6,
    max_items: 36,
    category_slugs: [],
    show_view_all_link: true,
  },
  events_browser: {
    title: 'Browse Events',
    intro_md:
      "Every upcoming event across Malta and Gozo in one place — concerts, parties, festivals, theatre, markets and family days out, with new listings added daily. Filter by date, category or price, or jump straight to what's on [today](/events/today), [this weekend](/events/this-weekend) or [this month](/events/this-month).",
    show_past_link: true,
  },
  landing_events: {
    empty_message: 'No upcoming events here right now — check back soon or browse all events.',
    columns: 3,
    show_json_ld: true,
  },
  related_links: {
    title: '',
    links: [
      { label: 'Today', href: '/events/today' },
      { label: 'This weekend', href: '/events/this-weekend' },
      { label: 'This month', href: '/events/this-month' },
    ],
  },
  faq: {
    title: 'Frequently Asked Questions',
    intro: '',
    limit: 0,
  },
  contact_form: {
    title: 'Contact Us',
    intro_md:
      "Questions, corrections, or an event you'd like to see listed? Send us a message and we'll get back to you within a couple of days.",
    show_email: true,
  },
}
