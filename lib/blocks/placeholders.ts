// Placeholder interpolation for block-editable landing pages.
//
// Landing pages are *templates* that generate many URLs (one per locality, tag,
// venue, month, …). Their block text and SEO meta can embed {placeholders} like
// {location} or {count} that are filled in per-URL at render time. The editor
// previews templates with sample values so the admin sees realistic copy.
//
// Kept server-safe (no 'use client', no imports) so both the server Renderer
// and the client Editor can use it.

export type LandingType =
  | 'location'
  | 'tag'
  | 'venue'
  | 'today'
  | 'this-weekend'
  | 'this-month'
  | 'month'

/** Values substituted into {tokens}. Numbers are stringified. */
export type PlaceholderValues = Record<string, string | number>

interface PlaceholderDef {
  token: string
  description: string
  sample: string | number
}

interface LandingTypeMeta {
  type: LandingType
  /** block_pages template slug, e.g. 'landing:location'. */
  slug: string
  label: string
  /** True when the type fans out into many URLs (has per-instance overrides). */
  hasInstances: boolean
  /** Tokens available to this type's copy, with samples for editor preview. */
  placeholders: PlaceholderDef[]
}

const COUNT_PH: PlaceholderDef[] = [
  { token: 'count',       description: 'Number of upcoming events on this page', sample: 8 },
  { token: 'count_label', description: '"event" or "events" (matches {count})',  sample: 'events' },
]

export const LANDING_TYPES: Record<LandingType, LandingTypeMeta> = {
  location: {
    type: 'location', slug: 'landing:location', label: 'Location pages', hasInstances: true,
    placeholders: [
      { token: 'location',   description: 'Locality name, e.g. Valletta', sample: 'Valletta' },
      { token: 'month_year', description: 'Current month and year',       sample: 'July 2026' },
      ...COUNT_PH,
    ],
  },
  tag: {
    type: 'tag', slug: 'landing:tag', label: 'Category pages', hasInstances: true,
    placeholders: [
      { token: 'tag',        description: 'Category name, e.g. Live Music', sample: 'Live Music' },
      { token: 'month_year', description: 'Current month and year',    sample: 'July 2026' },
      ...COUNT_PH,
    ],
  },
  venue: {
    type: 'venue', slug: 'landing:venue', label: 'Venue pages', hasInstances: true,
    placeholders: [
      { token: 'venue',    description: 'Venue name',                 sample: 'Teatru Manoel' },
      { token: 'locality', description: 'Venue locality (if known)',  sample: 'Valletta' },
      ...COUNT_PH,
    ],
  },
  today: {
    type: 'today', slug: 'landing:today', label: 'Today', hasInstances: false,
    placeholders: [...COUNT_PH],
  },
  'this-weekend': {
    type: 'this-weekend', slug: 'landing:this-weekend', label: 'This weekend', hasInstances: false,
    placeholders: [...COUNT_PH],
  },
  'this-month': {
    type: 'this-month', slug: 'landing:this-month', label: 'This month', hasInstances: false,
    placeholders: [...COUNT_PH],
  },
  month: {
    type: 'month', slug: 'landing:month', label: 'Month pages (Jan–Dec)', hasInstances: true,
    placeholders: [
      { token: 'month', description: 'Month name, e.g. October', sample: 'October' },
      { token: 'year',  description: 'Year of the next occurrence', sample: '2026' },
      ...COUNT_PH,
    ],
  },
}

export const LANDING_TYPE_LIST: LandingTypeMeta[] = Object.values(LANDING_TYPES)

/** Sample values keyed by token, for previewing a template in the editor. */
export function samplePlaceholders(type: LandingType): PlaceholderValues {
  const out: PlaceholderValues = {}
  for (const p of LANDING_TYPES[type].placeholders) out[p.token] = p.sample
  return out
}

/**
 * Replace every {token} in `text` with its value. Unknown tokens are left
 * untouched (so an admin can see which placeholder is unresolved). Returns the
 * input unchanged when there are no values or no braces.
 */
export function interpolate(text: string, values?: PlaceholderValues): string {
  if (!text || !values || text.indexOf('{') === -1) return text
  return text.replace(/\{([a-z0-9_]+)\}/gi, (whole, token) => {
    const v = values[token]
    return v === undefined || v === null ? whole : String(v)
  })
}

/** "event" / "events" helper the render layer can pass in as {count_label}. */
export function countLabel(n: number): string {
  return n === 1 ? 'event' : 'events'
}

/**
 * Deep-interpolate every string in a block config (nested objects and arrays
 * included), returning a new value. Non-strings pass through untouched. Lets
 * the renderer resolve {placeholders} across all text fields of any block type
 * without each renderer knowing about placeholders.
 */
export function interpolateDeep<T>(value: T, values?: PlaceholderValues): T {
  if (!values) return value
  if (typeof value === 'string') return interpolate(value, values) as unknown as T
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, values)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateDeep(v, values)
    }
    return out as T
  }
  return value
}
