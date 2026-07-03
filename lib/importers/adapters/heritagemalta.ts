// heritagemalta.mt adapter.
//
// Uses the WordPress REST API at /wp-json/wp/v2/events, which exposes a
// custom 'events' post type with Advanced Custom Fields (ACF):
//
//   acf.start_date          — "YYYYMMDD" (always present)
//   acf.end_date            — "YYYYMMDD" or empty
//   acf.opening_hours       — [{days_of_week, time_from, time_to}] (DD.MM format)
//   acf.ticket_groups       — [{ticket_name, ticket_price}]
//   acf.book_now_endpoint   — booking URL (heritage Malta store)
//   acf.external_website_cta — {title, url, target} | '' | null
//   acf.getting_here_address_line_1/2, getting_here_city — venue address
//
// Images come via the _embedded['wp:featuredmedia'] sideload.
//
// Strategy: fetch page 1 (100 events) ordered by modified desc, filter
// client-side for future start_date. Heritage Malta constantly updates
// upcoming events so the most-recently-modified page reliably covers all
// near-future events without paging through all 800+.
//
// Price logic:
//   • ticket_price blank or "FREE"/"Free" → free
//   • ticket_price is a number string       → parse as EUR
//   • Use the lowest non-zero, non-free price across all ticket_groups.

import type { Adapter, ExternalEvent, ImportContext, Occurrence } from '../types'
import { fetchText } from '../http'
import { containsPaidKeyword } from '../ticket-keywords'

const API_BASE = 'https://heritagemalta.mt/wp-json/wp/v2/events'
const SITE_URL = 'https://heritagemalta.mt'

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export const heritagemaltaAdapter: Adapter = {
  name: 'heritagemalta',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    const url =
      `${API_BASE}?per_page=100&status=publish&orderby=modified&order=desc` +
      `&_embed=wp%3Afeaturedmedia`

    ctx.log(`Fetching Heritage Malta API: ${url}`)
    const raw = await fetchText(url)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(
        `Heritage Malta API returned non-array: ${JSON.stringify(parsed).slice(0, 300)}`,
      )
    }
    const items: WPEvent[] = parsed
    ctx.log(`API returned ${items.length} event(s)`)

    const todayStamp = todayYYYYMMDD()
    let yielded = 0

    for (const item of items) {
      if (yielded >= ctx.maxEvents) break

      const acf = item.acf ?? {}
      const startStamp = acf.start_date ?? ''
      if (!startStamp || startStamp < todayStamp) continue // past or undated

      const ev = buildEvent(item, acf)
      if (!ev) continue

      yielded++
      yield ev
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Build an ExternalEvent from a WP REST API item
// ---------------------------------------------------------------------------
function buildEvent(item: WPEvent, acf: ACFFields): ExternalEvent | null {
  // --- Title ---
  const rawTitle = decodeHtmlEntities(item.title?.rendered ?? '')
  const title = rawTitle.replace(/\s*[-–]\s*Heritage Malta\s*$/i, '').trim()
  if (!title) return null

  // --- Dates ---
  const startStamp = acf.start_date ?? ''
  if (!startStamp || startStamp.length < 8) return null

  const startYear  = parseInt(startStamp.slice(0, 4), 10)
  const startMonth = parseInt(startStamp.slice(4, 6), 10) - 1
  const startDay   = parseInt(startStamp.slice(6, 8), 10)

  // ---------------------------------------------------------------------
  // Materialise occurrences from opening_hours.
  //
  // Heritage Malta uses two patterns:
  //   (a) Same-day, multiple sessions: start_date set, end_date empty,
  //       N slots like "Session 1"/"Session 2". → N occurrences on start_date.
  //   (b) Multi-day, one slot per day: start_date < end_date, slot count
  //       matches the day count. → one occurrence per day, with each slot.
  // The `days_of_week` label is free-form text ("Session 1", "Saturday",
  // "Friday 10th", or Maltese "Il-Ħadd") — too unreliable to parse, so we
  // distribute by position when possible.
  // ---------------------------------------------------------------------
  const slots = Array.isArray(acf.opening_hours) ? acf.opening_hours : []
  const occurrences: Occurrence[] = []
  const endStamp = acf.end_date ?? ''
  const sameDay = !endStamp || endStamp === startStamp

  const buildAt = (yy: number, mm: number, dd: number, hh: number, mi: number) =>
    new Date(Date.UTC(yy, mm, dd, hh, mi)).toISOString()

  if (slots.length === 0) {
    // No times at all — one all-day occurrence.
    occurrences.push({
      startsAt: buildAt(startYear, startMonth, startDay, 0, 0),
      hasTime: false,
    })
  } else if (sameDay) {
    // Multiple sessions on the same day.
    for (const slot of slots) {
      const [sh, sm] = parseTime(slot.time_from, 9, 0)
      const [eh, em] = parseTime(slot.time_to, sh, sm)
      const startsAt = buildAt(startYear, startMonth, startDay, sh, sm)
      const endsAt = (slot.time_to ?? '').trim()
        ? buildAt(startYear, startMonth, startDay, eh, em)
        : undefined
      occurrences.push({ startsAt, endsAt, hasTime: !!slot.time_from })
    }
  } else {
    // Multi-day range — one slot per day in order.
    const dayCount = daysBetween(startStamp, endStamp) + 1
    for (let i = 0; i < dayCount; i++) {
      const slot = slots[i] ?? slots[slots.length - 1]!
      const [sh, sm] = parseTime(slot.time_from, 9, 0)
      const [eh, em] = parseTime(slot.time_to, sh, sm)
      const dayDate = new Date(Date.UTC(startYear, startMonth, startDay + i))
      const yy = dayDate.getUTCFullYear()
      const mm = dayDate.getUTCMonth()
      const dd = dayDate.getUTCDate()
      const startsAt = buildAt(yy, mm, dd, sh, sm)
      const endsAt = (slot.time_to ?? '').trim()
        ? buildAt(yy, mm, dd, eh, em)
        : undefined
      occurrences.push({ startsAt, endsAt, hasTime: !!slot.time_from })
    }
  }

  // Denormalised "primary" — the soonest-future occurrence (or first if all
  // past). The pipeline picks its own primary, but ExternalEvent.startsAt
  // is still required by the type, so we provide one here.
  const now = Date.now()
  const primary =
    occurrences.find((o) => Date.parse(o.startsAt) >= now) ?? occurrences[0]!
  const startsAt = primary.startsAt
  const endsAt = primary.endsAt
  const hasTime = primary.hasTime

  // --- Venue ---
  const addr1 = (acf.getting_here_address_line_1 ?? '').trim()
  const addr2 = (acf.getting_here_address_line_2 ?? '').trim()
  const city  = (acf.getting_here_city ?? '').trim()
  const venueName    = addr1 || undefined
  const venueAddress = [addr2, city, 'Malta'].filter(Boolean).join(', ') || undefined

  // --- Image ---
  const mediaArr = item._embedded?.['wp:featuredmedia']
  const imageUrl = (mediaArr?.[0] as { source_url?: string } | undefined)?.source_url

  // --- Price ---
  const groups = Array.isArray(acf.ticket_groups) ? acf.ticket_groups : []
  let priceMin: number | undefined
  for (const g of groups) {
    const priceStr = (g.ticket_price ?? '').trim()
    if (!priceStr || /free/i.test(priceStr) || priceStr === '0') {
      continue
    }
    const num = parseFloat(priceStr)
    if (!isNaN(num) && num > 0) {
      priceMin = priceMin === undefined ? num : Math.min(priceMin, num)
    }
  }
  // If ALL groups are free, mark as free entry
  const allFree = groups.length > 0 && groups.every(
    (g) => { const p = (g.ticket_price ?? '').trim(); return !p || /free/i.test(p) || p === '0' }
  )

  // --- Ticket URL ---
  const bookNow = (acf.book_now_endpoint ?? '').trim()
  const extCta  = typeof acf.external_website_cta === 'object' && acf.external_website_cta
    ? (acf.external_website_cta as { url?: string }).url?.trim()
    : undefined
  const ticketUrl = bookNow || extCta || undefined

  // --- Description ---
  const htmlContent = item.content?.rendered ?? ''
  const description = stripHtml(htmlContent).slice(0, 1000).trim() || undefined

  return {
    externalId: String(item.id),
    url: item.link ?? `${SITE_URL}/whats-on/${item.slug}/`,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    occurrences,
    venueName,
    venueAddress,
    imageUrl,
    ticketUrl: allFree ? undefined : ticketUrl,
    priceMin: allFree ? 0 : priceMin,
    currency: (!allFree && priceMin !== undefined) ? 'EUR' : undefined,
    categoryHint: 'culture',
    hasPaidKeyword: containsPaidKeyword(htmlContent),
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WPEvent {
  id: number
  slug: string
  link?: string
  title?: { rendered: string }
  content?: { rendered: string }
  acf?: ACFFields
  _embedded?: Record<string, unknown[]>
}

interface ACFFields {
  start_date?: string
  end_date?: string
  opening_hours?: Array<{ days_of_week?: string; time_from?: string; time_to?: string }>
  ticket_groups?: Array<{ ticket_name?: string; ticket_price?: string }>
  book_now_endpoint?: string
  external_website_cta?: { title?: string; url?: string; target?: string } | string | null
  getting_here_address_line_1?: string
  getting_here_address_line_2?: string
  getting_here_city?: string
  is_members_only?: boolean | string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Today as "YYYYMMDD" in UTC — used to filter out past events. */
function todayYYYYMMDD(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Parse "13.30" → [13, 30]. Falls back to defaults on empty/invalid. */
function parseTime(raw: string | undefined, defaultH: number, defaultM: number): [number, number] {
  const s = (raw ?? '').trim()
  if (!s) return [defaultH, defaultM]
  const [hStr, mStr] = s.split('.')
  const h = parseInt(hStr ?? '', 10)
  const m = parseInt(mStr ?? '', 10)
  return [Number.isFinite(h) ? h : defaultH, Number.isFinite(m) ? m : defaultM]
}

/** Days between two YYYYMMDD strings (inclusive distance). */
function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))
  const db = Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8))
  return Math.round((db - da) / 86400000)
}

/** Strip HTML tags and collapse whitespace. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Decode common HTML entities in title strings. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8217;/g, '’')
    .replace(/&nbsp;/g, ' ')
}
