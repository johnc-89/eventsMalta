import type { BlockType } from './types'

export interface BlockMeta {
  type: BlockType
  name: string
  description: string
  icon: string
  category: 'structure' | 'content' | 'data' | 'cta'
}

// The order here = the order in the "Add block" picker.
export const BLOCK_REGISTRY: BlockMeta[] = [
  // Structure
  { type: 'hero',            name: 'Hero',           description: 'Big headline with CTAs and optional background image.',     icon: '✨', category: 'structure' },
  { type: 'cta_banner',      name: 'Call to action', description: 'Coloured strip with a heading, body, and a button.',         icon: '📣', category: 'cta' },
  { type: 'spacer',          name: 'Spacer',         description: 'Vertical breathing room between blocks.',                    icon: '↕️', category: 'structure' },

  // Content
  { type: 'rich_text',       name: 'Rich text',      description: 'Markdown body — headings, lists, links, bold, italic.',     icon: '📝', category: 'content' },
  { type: 'image',           name: 'Image',          description: 'A single image with optional caption and link.',             icon: '🖼️', category: 'content' },

  // Data-driven
  { type: 'categories_strip', name: 'Categories',    description: 'Horizontal strip of category pills.',                        icon: '🏷️', category: 'data' },
  { type: 'featured_events',  name: 'Featured events', description: 'Curated events you\'ve pinned in the Featured tab.',       icon: '⭐', category: 'data' },
  { type: 'upcoming_events',  name: 'Upcoming events', description: 'Auto-pulled grid of the next N approved events.',         icon: '📅', category: 'data' },
  { type: 'faq',              name: 'FAQ',            description: 'Frequently asked questions, edited in the FAQ tab.',       icon: '❓', category: 'data' },
]

export const BLOCK_META: Record<BlockType, BlockMeta> = Object.fromEntries(
  BLOCK_REGISTRY.map((m) => [m.type, m]),
) as Record<BlockType, BlockMeta>

export const BLOCK_CATEGORIES = [
  { id: 'structure' as const, label: 'Structure' },
  { id: 'content'   as const, label: 'Content'   },
  { id: 'data'      as const, label: 'Events &amp; data' },
  { id: 'cta'       as const, label: 'Call to action' },
]
