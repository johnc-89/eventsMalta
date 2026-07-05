// Discriminated union of every block type. Adding a new type =
//   1. Add a new BlockType + Config interface here
//   2. Add an entry to lib/blocks/defaults.ts
//   3. Add a metadata entry to lib/blocks/registry.ts
//   4. Add a render branch in lib/blocks/Renderer.tsx
//   5. Add an editor branch in lib/blocks/Editor.tsx

export type BlockType =
  | 'hero'
  | 'rich_text'
  | 'image'
  | 'spacer'
  | 'cta_banner'
  | 'categories_strip'
  | 'featured_events'
  | 'upcoming_events'
  | 'events_browser'
  | 'faq'

export type BlockMaxWidth = 'narrow' | 'standard' | 'wide' | 'full'
export type SpacerSize = 'sm' | 'md' | 'lg' | 'xl'
export type CtaColor = 'gold' | 'teal' | 'burgundy' | 'dark' | 'accent'

export interface HeroConfig {
  title_pre: string
  title_highlight: string
  title_post: string
  subtitle: string
  primary_cta:   { label: string; href: string }
  secondary_cta: { label: string; href: string; enabled: boolean }
  image_url: string | null
  overlay_opacity: number
}

export interface RichTextConfig {
  content_md: string
  max_width: BlockMaxWidth
  background: 'none' | 'cream' | 'dark'
  align: 'left' | 'center'
}

export interface ImageBlockConfig {
  image_url: string | null
  caption: string
  alt: string
  link_href: string
  max_width: BlockMaxWidth
  rounded: boolean
}

export interface SpacerConfig {
  size: SpacerSize
}

export interface CtaBannerConfig {
  title: string
  body: string
  button_label: string
  button_href: string
  color: CtaColor
}

export interface CategoriesStripConfig {
  /** Empty array = show all categories. Otherwise restricted to these slugs. */
  category_slugs: string[]
  title: string  // optional title above the strip; '' to hide
}

export interface FeaturedEventsConfig {
  title: string
  count: number
  show_view_all_link: boolean
}

export interface UpcomingEventsConfig {
  title: string
  /** How many to render initially (server-side first page). */
  count: number
  /** Cap on total events lazy-loaded as the visitor scrolls. */
  max_items: number
  /** Empty = all categories. Otherwise filter to these category slugs. */
  category_slugs: string[]
  show_view_all_link: boolean
}

/**
 * The full interactive events page: heading + intro, then the searchable,
 * filterable, infinite-scroll list (components/../events/EventsList). The
 * initial (unfiltered) grid is seeded from ctx.upcomingEvents so crawlers and
 * the first paint get real content; the list self-fetches when filters change.
 */
export interface EventsBrowserConfig {
  title: string
  intro_md: string
  /** Show the "View past events →" link beside the heading. */
  show_past_link: boolean
}

export interface FaqConfig {
  title: string
  intro: string
  /** 0 = show all enabled FAQ items. */
  limit: number
}

export interface BlockConfigMap {
  hero:             HeroConfig
  rich_text:        RichTextConfig
  image:            ImageBlockConfig
  spacer:           SpacerConfig
  cta_banner:       CtaBannerConfig
  categories_strip: CategoriesStripConfig
  featured_events:  FeaturedEventsConfig
  upcoming_events:  UpcomingEventsConfig
  events_browser:   EventsBrowserConfig
  faq:              FaqConfig
}

export interface BlockInstance<T extends BlockType = BlockType> {
  id: string                // stable UUID for React keys & DnD
  type: T
  config: BlockConfigMap[T]
}

/** Cheap-and-cheerful UUID-ish ID (no crypto required server-side). */
export function newBlockId(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
