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
  // Unique landing-page copy (one string per paragraph). Only the top localities
  // have it; the landing page falls back to its templated intro without it.
  description?: string[]
}

// Canonical localities we can produce landing pages for. Slugs are stable URLs.
export const LOCALITIES: Locality[] = [
  {
    name: 'Valletta',
    slug: 'valletta',
    description: [
      "Malta's capital and a UNESCO World Heritage city, Valletta packs more culture into less than a square kilometre than anywhere else on the islands. Built by the Knights of St John in the sixteenth century, the city hosts opera and drama at Teatru Manoel — one of Europe's oldest working theatres — contemporary arts at Spazju Kreattiv in St James Cavalier, exhibitions at MUŻA, and open-air concerts and re-enactments at Fort St Elmo.",
      "Beyond the institutions, Valletta's calendar runs all year: Notte Bianca lights up the whole city each autumn, Republic Street and the old Strait Street bars host live music most weekends, and the pjazzas fill with festivals, markets and village-festa fireworks through the summer. Most events are an easy walk from City Gate.",
    ],
  },
  { name: 'Floriana', slug: 'floriana' },
  {
    name: 'Sliema',
    slug: 'sliema',
    description: [
      "Sliema is Malta's busiest seafront town — a long promenade of cafés, restaurants and shops stretching from the Ferries to Tigné Point, looking straight across the harbour at Valletta's bastions. Its events lean social and family-friendly: seafront markets, fun runs, open-air cinema and community theatre at Teatru Salesjan.",
      "It's also one of the best-connected bases on the island: the Valletta ferry crosses in ten minutes and buses fan out along the coast, so an evening in Sliema pairs easily with events anywhere around the harbour.",
    ],
  },
  {
    name: "St Julian's",
    slug: 'st-julians',
    description: [
      "St Julian's is the nightlife capital of Malta. Paceville's clubs and bars run until the early hours year-round, while Spinola Bay and Balluta Bay offer a calmer evening of waterfront dining beneath the old fishing-village façades. Expect club nights, DJ sets, stand-up comedy and live music most nights of the week.",
      "Summer brings rooftop parties and pool events around Portomaso and the big hotels, and venues like Mercury draw international acts. If an event in Malta starts after midnight, odds are it's happening here.",
    ],
  },
  {
    name: 'Rabat',
    slug: 'rabat',
    description: [
      "Rabat sits just outside the walls of Mdina and carries two very different event calendars. By day it's one of Malta's richest heritage quarters — St Paul's Catacombs, the Domvs Romana and Wignacourt Museum host tours, reenactments and cultural evenings.",
      "By night, the countryside on Rabat's outskirts hosts the other extreme: Gianpula Village, Malta's largest open-air clubbing complex, runs festivals, brand-name club nights and multi-stage events from spring to autumn.",
    ],
  },
  {
    name: 'Mdina',
    slug: 'mdina',
    description: [
      "Mdina — the Silent City — is Malta's medieval former capital, a walled hilltop city of golden limestone alleys, palazzos and St Paul's Cathedral. Events here trade on the atmosphere: candle-lit cultural nights, classical recitals, cathedral concerts and exhibitions at the National Museum of Natural History.",
      "The Medieval Mdina festival fills the streets with re-enactors, falconry and crafts each spring, and the city's ramparts host some of the most scenic open-air performances in Malta. Pair an evening event with dinner in neighbouring Rabat.",
    ],
  },
  {
    name: 'Birgu',
    slug: 'birgu',
    description: [
      "Birgu (Vittoriosa) is the oldest of the Three Cities and the Knights' first home in Malta. Its event calendar leans historical: Fort St Angelo and the Inquisitor's Palace host tours, re-enactments and cultural evenings, and the Couvre Porte fortifications stage open-air performances.",
      "The highlight is Birgufest each October, when the city switches off its street lights and the alleys glow with thousands of candles. The yacht-marina waterfront keeps restaurants and wine bars busy year-round.",
    ],
  },
  {
    name: 'Mosta',
    slug: 'mosta',
    description: [
      "Mosta is best known for the Rotunda — its vast nineteenth-century church dome is among the largest in the world, and the square beneath it anchors the town's public life. Concerts, band-club events and seasonal markets cluster around the Rotunda through the year.",
      "The town's Santa Marija festa on 15 August is one of Malta's biggest, with band marches, ground fireworks and some of the island's most spectacular aerial displays.",
    ],
  },
  { name: 'Naxxar', slug: 'naxxar' },
  {
    name: 'St Paul’s Bay',
    slug: 'st-pauls-bay',
    description: [
      "St Paul's Bay is Malta's largest seaside town, taking in the resort strips of Buġibba and Qawra. Its events are built around the water: beach-club parties and international DJ nights at Café del Mar beside the National Aquarium, seafront markets, and long summer evenings on the promenade.",
      "It's the north's most convenient base — a short hop from Gozo ferry connections and the sandy beaches of Mellieħa — so summer weekends here fill quickly with open-air events.",
    ],
  },
  { name: 'Qawra', slug: 'qawra' },
  { name: 'Tarxien', slug: 'tarxien' },
  { name: 'Qrendi', slug: 'qrendi' },
  { name: 'Kalkara', slug: 'kalkara' },
  { name: 'Birżebbuġa', slug: 'birzebbuga' },
  { name: 'Marsaxlokk', slug: 'marsaxlokk' },
  {
    name: 'Gozo',
    slug: 'gozo',
    description: [
      "Gozo, Malta's greener, quieter sister island, runs on its own event rhythm. Summer belongs to the village festas — nearly every weekend a different village fills with band marches, street food and fireworks — while Victoria's two historic opera houses stage full seasons of opera and concerts.",
      "The island also hosts some of Malta's most distinctive one-offs: the Nadur Carnival's famously anarchic February celebrations, wine and agricultural festivals in the villages, and open-air performances in the Citadella above Victoria. The ferry from Ċirkewwa takes 25 minutes.",
    ],
  },
  {
    name: 'Victoria',
    slug: 'victoria',
    description: [
      "Victoria (Rabat) is Gozo's capital and the island's cultural heart. The hilltop Citadella hosts open-air concerts and heritage events inside its restored fortifications, while Republic Street below is home to two rival nineteenth-century opera houses — Teatru Astra and the Aurora — whose opera productions and orchestral seasons draw audiences from across Malta.",
      "Add the town's twin summer festas, seasonal markets and Independence Square's café life, and Victoria offers the densest event calendar on Gozo.",
    ],
  },
  { name: 'Ħamrun', slug: 'hamrun' },
  { name: 'Paola', slug: 'paola' },
  { name: 'Żurrieq', slug: 'zurrieq' },
  { name: 'Żabbar', slug: 'zabbar' },
  { name: 'Siggiewi', slug: 'siggiewi' },
  { name: 'Swieqi', slug: 'swieqi' },
  { name: 'Marsa', slug: 'marsa' },
  { name: 'San Gwann', slug: 'san-gwann' },
  { name: 'Luqa', slug: 'luqa' },
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
  // Valletta venues
  { match: "auberge d'italie", slug: 'valletta' },
  { match: 'auberge d’italie', slug: 'valletta' },
  { match: "grand master's palace", slug: 'valletta' },
  { match: 'grand master’s palace', slug: 'valletta' },
  { match: 'offbeat music bar', slug: 'valletta' },
  // Birgu / Three Cities venues
  { match: 'quarry wharf', slug: 'birgu' },
  { match: 'fort st angelo', slug: 'birgu' },
  // Mdina venues
  { match: 'national museum of natural history', slug: 'mdina' },
  // Paola / Corradino venues
  { match: 'yoyo kids', slug: 'paola' },
  // Ħamrun venues — ASCII fallback since "Hamrun" ≠ "Ħamrun" after NFC
  { match: "hamrun", slug: "hamrun" },
  { match: "st. catherine", slug: "hamrun" },
  // Żabbar — ASCII fallback since "Zabbar" ≠ "Żabbar" after NFC
  { match: "zabbar", slug: "zabbar" },
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
