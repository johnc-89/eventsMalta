// unomalta.com adapter.
//
// UNO Malta runs The Events Calendar (Tribe) plugin, which exposes a clean
// public REST API at /wp-json/tribe/events/v1/events. We page through future
// events ordered by start date.
//
// Field notes (Tribe events schema):
//   • start_date / end_date     — "YYYY-MM-DD HH:MM:SS" in the site's local TZ
//   • utc_start_date / utc_end_date — same, normalised to UTC (what we use)
//   • all_day                   — true → date-only
//   • image.url                 — hero image
//   • cost / cost_details       — price string ("€20", "Free", "")
//   • website                   — external ticket/info URL
//   • venue                     — {} or {venue, address, city} (often empty)
//   • description / excerpt      — HTML
//
// The site blocks generic browser User-Agents (403) but serves our importer
// UA fine, so no UA override is needed — fetchText's default works.

import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText } from '../http'

const API_BASE = 'https://unomalta.com/wp-json/tribe/events/v1/events'
const PAGE_SIZE = 50

export const unomaltaAdapter: Adapter = {
  name: 'unomalta',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    const startFrom = new Date().toISOString().slice(0, 10) // today, YYYY-MM-DD
    let page = 1
    let yielded = 0

    while (yielded < ctx.maxEvents) {
      const url =
        `${API_BASE}?per_page=${PAGE_SIZE}&page=${page}` +
        `&start_date=${startFrom}&status=publish`
      ctx.log(`Fetching UNO Malta API page ${page}: ${url}`)

      let body: TribeResponse
      try {
        body = JSON.parse(await fetchText(url))
      } catch (err) {
        // Tribe returns a 404 JSON body once you page past the last page.
        ctx.log(`  page ${page} stopped: ${err instanceof Error ? err.message : String(err)}`)
        return
      }

      const events = body.events ?? []
      if (events.length === 0) {
        ctx.log(`  page ${page} empty — done`)
        return
      }
      ctx.log(`  page ${page}: ${events.length} event(s)`)

      for (const e of events) {
        if (yielded >= ctx.maxEvents) break
        const ev = buildEvent(e)
        if (!ev) continue
        if (new Date(ev.startsAt) > ctx.cutoffDate) continue
        yielded++
        yield ev
      }

      if (events.length < PAGE_SIZE) return
      page++
    }
  },
}

function buildEvent(e: TribeEvent): ExternalEvent | null {
  const title = decodeEntities((e.title ?? '').trim())
  if (!title) return null

  const startsAt = tribeDateToISO(e.utc_start_date || e.start_date)
  if (!startsAt) return null

  const endsAt = tribeDateToISO(e.utc_end_date || e.end_date) || undefined
  const hasTime = !e.all_day && /\d{2}:\d{2}:\d{2}/.test(e.utc_start_date || e.start_date || '')

  const imageUrl =
    e.image && !Array.isArray(e.image) ? e.image.url : undefined

  const venueObj = !Array.isArray(e.venue) ? e.venue : undefined
  const venueName = venueObj?.venue?.trim() || undefined
  const venueAddress =
    venueObj
      ? [venueObj.address, venueObj.city].filter(Boolean).join(', ') || undefined
      : undefined

  const { priceMin, currency } = parseCost(e.cost)

  const description = stripHtml(e.description || e.excerpt || '').slice(0, 1000).trim() || undefined

  return {
    externalId: String(e.id),
    url: e.url || `https://unomalta.com/event/${e.slug ?? e.id}/`,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    venueName,
    venueAddress,
    imageUrl,
    ticketUrl: e.website?.trim() || undefined,
    priceMin,
    currency,
    categoryHint: 'nightlife',
    // UNO Malta is a nightlife promoter — every event is ticketed, even when
    // the Tribe `cost` field is blank or says "Free" (that's occasionally
    // used for a free-entry-before-Xpm window, not the whole event).
    // Hardcoded rather than keyword-detected.
    hasPaidKeyword: true,
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TribeResponse {
  events?: TribeEvent[]
  total?: number
}

interface TribeEvent {
  id: number
  slug?: string
  url?: string
  title?: string
  description?: string
  excerpt?: string
  start_date?: string
  end_date?: string
  utc_start_date?: string
  utc_end_date?: string
  all_day?: boolean
  cost?: string
  website?: string
  image?: { url?: string } | unknown[] | false
  venue?: { venue?: string; address?: string; city?: string } | unknown[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "2026-06-04 21:00:00" (UTC) → ISO 8601. */
function tribeDateToISO(s?: string): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  return new Date(Date.UTC(
    +m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0),
  )).toISOString()
}

function parseCost(cost?: string): { priceMin?: number; currency?: string; free: boolean } {
  const c = (cost ?? '').trim()
  if (!c) return { free: false }
  if (/free/i.test(c)) return { free: true }
  const m = c.match(/(\d+(?:\.\d{1,2})?)/)
  if (!m) return { free: false }
  return { priceMin: parseFloat(m[1]), currency: 'EUR', free: false }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
