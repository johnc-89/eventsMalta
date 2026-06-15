import { Event } from '@/types'

// Venue pages are derived from each event's free-text `location_name` (there is
// no venues table). We slugify the venue name for a stable URL and group
// events by that slug at request time.

export function slugifyVenue(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// Generic/placeholder location values that should NOT get a venue page.
const NON_VENUES = new Set(['malta', 'gozo', 'various', 'roaming', 'tba', 'tbc'])

export function isRealVenue(name: string | null | undefined): boolean {
  if (!name) return false
  const slug = slugifyVenue(name)
  return slug.length >= 2 && !NON_VENUES.has(slug)
}

// Group upcoming events by venue slug. Returns slug → { displayName, events }.
// displayName is the most common original spelling for that slug.
export function groupByVenue(events: Event[]): Map<string, { displayName: string; events: Event[] }> {
  const groups = new Map<string, { names: Map<string, number>; events: Event[] }>()
  for (const e of events) {
    if (!isRealVenue(e.location_name)) continue
    const name = e.location_name!.trim()
    const slug = slugifyVenue(name)
    if (!slug) continue
    let g = groups.get(slug)
    if (!g) {
      g = { names: new Map(), events: [] }
      groups.set(slug, g)
    }
    g.names.set(name, (g.names.get(name) ?? 0) + 1)
    g.events.push(e)
  }

  const out = new Map<string, { displayName: string; events: Event[] }>()
  for (const [slug, g] of groups) {
    const displayName = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
    out.set(slug, { displayName, events: g.events })
  }
  return out
}
