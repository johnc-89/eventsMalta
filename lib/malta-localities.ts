// Malta localities for SEO location landing pages. Locality is derived from an
// event's free-text `location_name` (set by importers / submitters), since the
// town is usually NOT in the string — most values are bare venue names. We map
// known venues → locality, and fall back to parsing a trailing ", <Town>".
//
// Derivation is deterministic and computed at request time (current event
// volume is small). If volume grows, promote this to a denormalised
// `events.locality` column + backfill using deriveLocality().

export interface Locality {
  name: string
  slug: string
}

// Canonical localities we can produce landing pages for. Slugs are stable URLs.
export const LOCALITIES: Locality[] = [
  { name: 'Valletta', slug: 'valletta' },
  { name: 'Floriana', slug: 'floriana' },
  { name: 'Sliema', slug: 'sliema' },
  { name: "St Julian's", slug: 'st-julians' },
  { name: 'Rabat', slug: 'rabat' },
  { name: 'Mdina', slug: 'mdina' },
  { name: 'Birgu', slug: 'birgu' },
  { name: 'Mosta', slug: 'mosta' },
  { name: 'Naxxar', slug: 'naxxar' },
  { name: 'St Paul’s Bay', slug: 'st-pauls-bay' },
  { name: 'Qawra', slug: 'qawra' },
  { name: 'Tarxien', slug: 'tarxien' },
  { name: 'Qrendi', slug: 'qrendi' },
  { name: 'Kalkara', slug: 'kalkara' },
  { name: 'Birżebbuġa', slug: 'birzebbuga' },
  { name: 'Marsaxlokk', slug: 'marsaxlokk' },
  { name: 'Gozo', slug: 'gozo' },
  { name: 'Victoria', slug: 'victoria' },
]

const BY_SLUG = new Map(LOCALITIES.map((l) => [l.slug, l]))
export const getLocalityBySlug = (slug: string): Locality | undefined => BY_SLUG.get(slug)

// Known venue → locality. Keys are lowercased substrings matched against the
// event's location_name. Order doesn't matter; first match wins.
const VENUE_LOCALITY: { match: string; slug: string }[] = [
  { match: 'teatru manoel', slug: 'valletta' },
  { match: 'valletta campus theatre', slug: 'valletta' },
  { match: 'underground valletta', slug: 'valletta' },
  { match: 'malta society of arts', slug: 'valletta' },
  { match: 'fort st elmo', slug: 'valletta' },
  { match: 'national war museum', slug: 'valletta' },
  { match: 'auberge de provence', slug: 'valletta' },
  { match: 'muża', slug: 'valletta' },
  { match: 'muza', slug: 'valletta' },
  { match: 'st james cavalier', slug: 'valletta' },
  { match: 'micas', slug: 'floriana' },
  { match: 'phoenicia', slug: 'floriana' },
  { match: 'teatru salesjan', slug: 'sliema' },
  { match: 'mercury', slug: 'st-julians' },
  { match: 'gianpula', slug: 'rabat' },
  { match: 'st paul’s catacombs', slug: 'rabat' },
  { match: "st paul's catacombs", slug: 'rabat' },
  { match: 'domvs romana', slug: 'rabat' },
  { match: 'esplora', slug: 'kalkara' },
  { match: 'inquisitor', slug: 'birgu' },
  { match: 'couvre porte', slug: 'birgu' },
  { match: 'haġar qim', slug: 'qrendi' },
  { match: 'hagar qim', slug: 'qrendi' },
  { match: 'mnajdra', slug: 'qrendi' },
  { match: 'tarxien', slug: 'tarxien' },
  { match: 'għar dalam', slug: 'birzebbuga' },
  { match: 'ghar dalam', slug: 'birzebbuga' },
  { match: 'palazzo parisio', slug: 'naxxar' },
  { match: 'café del mar', slug: 'st-pauls-bay' },
  { match: 'cafe del mar', slug: 'st-pauls-bay' },
  { match: 'national aquarium', slug: 'st-pauls-bay' },
]

function norm(s: string): string {
  return s.toLowerCase().normalize('NFC').trim()
}

// Derive a locality from a free-text location_name. Returns null when we can't
// confidently place it (so no wrong landing page is ever produced).
export function deriveLocality(locationName: string | null | undefined): Locality | null {
  if (!locationName) return null
  const n = norm(locationName)

  // 1. Known-venue override.
  for (const v of VENUE_LOCALITY) {
    if (n.includes(v.match)) return BY_SLUG.get(v.slug) ?? null
  }

  // 2. Any canonical locality name appearing in the string (handles trailing
  //    ", Floriana" / "Malta Society of Arts, Valletta" and inline mentions).
  for (const loc of LOCALITIES) {
    if (n.includes(norm(loc.name))) return loc
  }

  return null
}
