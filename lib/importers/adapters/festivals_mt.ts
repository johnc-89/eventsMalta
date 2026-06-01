// festivals.mt adapter.
//
// festivals.mt is a Wix site that uses the Wix Events app. The published page
// at /events embeds the full upcoming-events dataset as a JSON blob inside the
// HTML (Wix Thunderbolt renders SSR data into the page). We find the wrapper
// "\/Events":{...} where the value is an object keyed by event UUID, parse it,
// and yield one ExternalEvent per SCHEDULED entry.
//
// A Chrome User-Agent is required — Wix returns a stripped-down page for
// unknown UAs (no SSR data).
//
// Each event object exposes (relevant subset):
//   title, description (plain text, often short), longDescription (rich text)
//   start.$date, end.$date  (ISO timestamps, UTC; scheduleTbd flag if no time)
//   locationName, locationAddress, latitude, longitude, timeZoneId
//   mainImage  ("image://v1/<file>/<dims>/<file>" — convert to wixstatic URL)
//   slug, siteEventPageUrl, registrationUrl
//   status     ("SCHEDULED", "ENDED", "STARTED", "CANCELED")

import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText } from '../http'

const EVENTS_URL = 'https://www.festivals.mt/events'
const SITE_URL = 'https://www.festivals.mt'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export const festivalsMtAdapter: Adapter = {
  name: 'festivals_mt',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching ${EVENTS_URL}`)
    const html = await fetchText(EVENTS_URL, { userAgent: CHROME_UA, timeoutMs: 30_000 })

    const events = extractWixEvents(html)
    ctx.log(`Extracted ${events.length} event(s) from Wix Events blob`)

    const now = Date.now()
    let yielded = 0

    for (const ev of events) {
      if (yielded >= ctx.maxEvents) break

      if (ev.status !== 'SCHEDULED' && ev.status !== 'STARTED') continue

      const startMs = ev.start?.$date ? Date.parse(ev.start.$date) : NaN
      if (!Number.isFinite(startMs) || startMs < now) continue

      const out = buildEvent(ev)
      if (!out) continue

      yielded++
      yield out
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Extract the Wix Events JSON blob from the page HTML
// ---------------------------------------------------------------------------
function extractWixEvents(html: string): WixEvent[] {
  // The actual events blob lives at: ...\/Events":{"<uuid>":{...}, ...}
  // (The leading backslash escapes the forward slash in JSON.) Wix also
  // embeds a schema definition at the same marker but keyed by "id"/"isDeleted"
  // — so match only the variant whose first key looks like a UUID.
  const re = /\\\/Events":\{"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/
  const m = re.exec(html)
  if (!m) return []

  // Position right after the colon: the opening `{` of the events object.
  const objStart = m.index + '\\/Events":'.length
  if (html[objStart] !== '{') return []

  // Walk braces to find the matching close.
  let depth = 0
  let i = objStart
  while (i < html.length) {
    const ch = html[i]
    if (ch === '"') {
      // Skip over a string literal (handle escaped quotes).
      i++
      while (i < html.length && html[i] !== '"') {
        if (html[i] === '\\') i += 2
        else i++
      }
      i++
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { i++; break }
    }
    i++
  }

  const chunk = html.slice(objStart, i)
  try {
    const obj = JSON.parse(chunk) as Record<string, WixEvent>
    return Object.values(obj)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Build an ExternalEvent from a Wix Event object
// ---------------------------------------------------------------------------
function buildEvent(ev: WixEvent): ExternalEvent | null {
  const title = (ev.title ?? '').trim()
  if (!title) return null

  const startsAt = ev.start?.$date
  if (!startsAt) return null
  const endsAt = ev.end?.$date

  // scheduleTbd === true means date is set but time is "TBA"
  const hasTime = !ev.scheduleTbd

  // Slug or _id for stable external id; slug is preferred (URL-stable).
  const externalId = ev.slug || ev._id
  if (!externalId) return null

  const url = ev.siteEventPageUrl
    ? `${SITE_URL}${ev.siteEventPageUrl}`
    : `${SITE_URL}/event-details/${ev.slug}`

  const venueName = (ev.locationName ?? '').trim() || undefined
  const venueAddress = (ev.locationAddress ?? '').trim() || undefined

  const imageUrl = wixImageUrl(ev.mainImage)
  const ticketUrl = (ev.registrationUrl ?? '').trim() || undefined

  // `description` field is already plain text and includes a price prefix
  // like "€15 - €50\n\n<real description>". Strip a leading price line.
  let description: string | undefined
  if (ev.description) {
    description = ev.description.replace(/^€[^\n]*\n+/, '').trim().slice(0, 1500)
    if (!description) description = undefined
  }

  // Best-effort price extraction from the leading "€X - €Y" line.
  const { priceMin, priceMax, currency } = parsePrice(ev.description ?? '')

  return {
    externalId,
    url,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    venueName,
    venueAddress,
    imageUrl,
    ticketUrl,
    priceMin,
    priceMax,
    currency,
    categoryHint: 'festival',
  }
}

/** Convert Wix `image://v1/<file>/<w>_<h>/<file>` URI to a public URL.
 *  We always request a 1600px CDN-transformed variant — Wix originals are
 *  routinely 10–20 MB, which blows the image-mirror size cap and leaves the
 *  event with an un-mirrored wixstatic URL that Next/Image then refuses. */
function wixImageUrl(uri?: string): string | undefined {
  if (!uri || !uri.startsWith('image://')) return undefined
  const parts = uri.replace(/^image:\/\//, '').split('/')
  if (parts.length < 2) return undefined
  const filename = parts[1]
  if (!filename) return undefined
  return `https://static.wixstatic.com/media/${filename}/v1/fit/w_1600,h_1600,q_85/file.jpg`
}

/** Parse a leading price line like "€15 - €50" or "€10" from the description. */
function parsePrice(text: string): {
  priceMin?: number; priceMax?: number; currency?: string
} {
  const firstLine = text.split('\n', 1)[0] ?? ''
  if (!firstLine.includes('€')) return {}
  if (/free/i.test(firstLine)) return { priceMin: 0, currency: 'EUR' }
  const nums = Array.from(firstLine.matchAll(/€\s*(\d+(?:[.,]\d{1,2})?)/g))
    .map((m) => parseFloat((m[1] ?? '').replace(',', '.')))
    .filter((n) => !isNaN(n) && n > 0)
  if (nums.length === 0) return {}
  return {
    priceMin: Math.min(...nums),
    priceMax: nums.length > 1 ? Math.max(...nums) : undefined,
    currency: 'EUR',
  }
}

// ---------------------------------------------------------------------------
// Types — narrow shape we read from the Wix event object
// ---------------------------------------------------------------------------
interface WixDate { $date?: string }
interface WixEvent {
  _id?: string
  title?: string
  description?: string
  slug?: string
  start?: WixDate
  end?: WixDate
  scheduleTbd?: boolean
  status?: 'SCHEDULED' | 'STARTED' | 'ENDED' | 'CANCELED' | string
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  timeZoneId?: string
  mainImage?: string
  siteEventPageUrl?: string
  registrationUrl?: string
}
