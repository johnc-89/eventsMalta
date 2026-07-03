// maltaartisanmarkets.com adapter.
//
// The site is a React SPA built on top of Supabase. Site content lives in a
// `site_content` key/value table, and the upcoming-markets schedule is a
// single row at `(section='schedule', key='markets')` whose `value` is a JSON
// array of markets.
//
// The anon key + Supabase project URL are shipped in the client bundle and
// therefore public — we use them with their PostgREST endpoint directly. No
// scraping required.
//
// Each market row looks like:
//   { date: "May 24", month: "MAY", day: 24, venue: "Mercury",
//     venueType: "mercury", location: "Mercury, St Julian's",
//     time: "16:00 - 22:00", deadline: "2026-05-09", stalls: [...] }
//
// Year inference: prefer `deadline` (YYYY-MM-DD); fallback to current year.

import type { Adapter, ExternalEvent, ImportContext } from '../types'

const SUPABASE_URL = 'https://xqwmwqlevpqgbysuapze.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhxd213cWxldnBxZ2J5c3VhcHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDEyODQsImV4cCI6MjA4NzE3NzI4NH0' +
  '.dGhqTMjTQ-3yt1nLPRXi--A9Kye2LF7Rpks1UsyDx3M'
const SITE_URL = 'https://maltaartisanmarkets.com'
const EVENTS_PATH = '/upcoming-events'

export const maltaartisanmarketsAdapter: Adapter = {
  name: 'maltaartisanmarkets',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching Malta Artisan Markets schedule from Supabase site_content`)

    const scheduleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/site_content?section=eq.schedule&key=eq.markets&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
          'User-Agent': 'EventsMalta-Importer/1.0 (+https://eventsmalta.org)',
        },
      },
    )
    if (!scheduleRes.ok) {
      throw new Error(`maltaartisanmarkets: HTTP ${scheduleRes.status} from site_content`)
    }
    const rows = (await scheduleRes.json()) as Array<{ value: string }>
    if (rows.length === 0) {
      ctx.log('No schedule row found')
      return
    }

    let markets: RawMarket[]
    try {
      markets = JSON.parse(rows[0]!.value) as RawMarket[]
    } catch (err) {
      throw new Error(`maltaartisanmarkets: schedule.markets is not valid JSON: ${err}`)
    }
    ctx.log(`Schedule contains ${markets.length} market(s)`)

    // Fetch the "featured" image once — used as fallback for all events.
    const featuredImage = await fetchFeaturedImage().catch(() => undefined)

    const now = Date.now()
    let yielded = 0

    for (const m of markets) {
      if (yielded >= ctx.maxEvents) break

      const out = buildEvent(m, featuredImage)
      if (!out) continue

      const endTs = out.endsAt ? Date.parse(out.endsAt) : Date.parse(out.startsAt)
      if (!Number.isFinite(endTs) || endTs < now) continue

      yielded++
      yield out
    }

    ctx.log(`Yielded ${yielded} upcoming market(s)`)
  },
}

// ---------------------------------------------------------------------------
// Build an ExternalEvent from a market row
// ---------------------------------------------------------------------------
function buildEvent(m: RawMarket, fallbackImage?: string): ExternalEvent | null {
  const month = MONTH_MAP[(m.month ?? '').toUpperCase()]
  const day = Number(m.day)
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) return null

  // Year: prefer the deadline field; fallback to the current Malta year.
  const year =
    parseYearFromDeadline(m.deadline) ??
    new Date().getFullYear()

  const { startsAt, endsAt, hasTime } = parseDateTime(year, month, day, m.time)
  if (!startsAt) return null

  const venue = (m.venue ?? '').trim()
  if (!venue) return null

  // Stable id: "<year>-<month>-<day>-<venueType>" so re-runs match.
  const externalId = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${(m.venueType ?? venue).toLowerCase()}`

  const title = `Malta Artisan Market — ${venue}`
  const venueAddress = (m.location ?? '').trim() || undefined
  const description = buildDescription(m)

  return {
    externalId,
    url: `${SITE_URL}${EVENTS_PATH}`,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    venueName: venue,
    venueAddress,
    imageUrl: fallbackImage,
    // No per-event ticket link — markets are free entry. Don't set ticketUrl
    // to the generic listing page; the pipeline treats any ticketUrl as a
    // paid signal, which would wrongly flag every market as paid.
    priceMin: 0,
    currency: 'EUR',
    categoryHint: 'market',
  }
}

function buildDescription(m: RawMarket): string {
  const parts: string[] = []
  parts.push(`A Malta Artisan Markets event at ${m.venue}${m.location ? `, ${m.location}` : ''}.`)
  parts.push('Curated handmade crafts, art, gifts and artisan food from Maltese makers.')
  parts.push('Free entrance.')
  if (m.deadline) parts.push(`Stallholder application deadline: ${m.deadline}.`)
  return parts.join(' ').slice(0, 800)
}

/** Fetch the featured market image once per run (used as fallback hero). */
async function fetchFeaturedImage(): Promise<string | undefined> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/site_content?section=eq.featured&key=eq.image&select=value`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    },
  )
  if (!res.ok) return undefined
  const rows = (await res.json()) as Array<{ value: string }>
  const url = rows[0]?.value?.trim()
  return url || undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

function parseYearFromDeadline(deadline?: string): number | undefined {
  if (!deadline) return undefined
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(deadline)
  if (!m) return undefined
  // Deadline is typically ~2 weeks before the event, so same year is safe.
  return Number(m[1])
}

/** Build start/end UTC ISO from Malta-local date + optional "HH:MM - HH:MM" time. */
function parseDateTime(
  year: number, month: number, day: number, time: string | undefined,
): { startsAt: string | undefined; endsAt: string | undefined; hasTime: boolean } {
  const offsetHours = isMaltaDst(year, month, day) ? 2 : 1

  const tm = time ? /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(time.trim()) : null
  if (tm) {
    const [, sh, sm, eh, em] = tm
    const startsAt = new Date(
      Date.UTC(year, month - 1, day, +sh! - offsetHours, +sm!),
    ).toISOString()
    const endsAt = new Date(
      Date.UTC(year, month - 1, day, +eh! - offsetHours, +em!),
    ).toISOString()
    return { startsAt, endsAt, hasTime: true }
  }

  // No time — assume Malta midnight; consumers treat hasTime=false as date-only.
  const startsAt = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0)).toISOString()
  return { startsAt, endsAt: undefined, hasTime: false }
}

/** True if the given Malta-local date is in CEST (UTC+2). */
function isMaltaDst(y: number, m: number, d: number): boolean {
  if (m < 3 || m > 10) return false
  if (m > 3 && m < 10) return true
  const lastSun = lastSundayOf(y, m)
  return m === 3 ? d >= lastSun : d < lastSun
}

function lastSundayOf(year: number, month1to12: number): number {
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(year, month1to12 - 1, lastDay)).getUTCDay()
  return lastDay - lastDow
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RawMarket {
  date?: string
  month?: string
  day?: number | string
  venue?: string
  venueType?: string
  location?: string
  time?: string
  deadline?: string
  stalls?: unknown[]
}
