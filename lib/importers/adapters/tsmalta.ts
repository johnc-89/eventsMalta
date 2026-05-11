// tsmalta.com (Teatru Salesjan) adapter.
//
// Flow:
//   1. Fetch /events/ listing page → extract all /events/<slug>/ URLs.
//   2. For each URL, fetch and parse:
//        • title    — og:title (strip "– Teatru Salesjan" suffix)
//        • image    — og:image meta
//        • date     — first <strong>/<b> in the .uncode_text_column.text-lead block
//        • time     — text after the date tag in the same <p>
//        • end date — second date in a range like "24 April – 14 May"
//        • desc     — subsequent <p> elements in the date block, or the first
//                     stand-alone .uncode_text_column without text-lead
//        • ticket   — first .btn-accent link href
//        • free     — "entrance to this event is free" in body text
//   3. Skip past events.
//
// Note: tsmalta.com has no per-event sitemap; all events live on one archive
// page (/events/) which never paginates (typically < 20 upcoming events).

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'

const LISTING_URL = 'https://tsmalta.com/events/'
const EVENT_URL_RE = /^https?:\/\/tsmalta\.com\/events\/([^/]+)\//
const FETCH_CONCURRENCY = 4

// Full month names + abbreviations
const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

// "29 May" / "29 May 2026" / "29 May 2026"
const SINGLE_DATE_RE =
  /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s*(\d{4})?/i

// "24 April – 14 May" — en-dash, em-dash, or hyphen between two dates
const DATE_RANGE_RE =
  /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s*(\d{4})?\s*[–—-]\s*(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s*(\d{4})?/i

// "7PM" / "7:30PM" / "19:30" — for 24h we only accept if ≥ 13 (unambiguous)
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i

function monthIndex(s: string): number {
  return MONTHS[s.toLowerCase().slice(0, 3)] ?? -1
}

function resolveYear(month: number, day: number, yearStr?: string): number {
  if (yearStr) return parseInt(yearStr, 10)
  const now = new Date()
  const candidate = new Date(now.getFullYear(), month, day)
  return candidate < now ? now.getFullYear() + 1 : now.getFullYear()
}

function buildDate(
  dayStr: string,
  monthStr: string,
  yearStr: string | undefined,
  timeStr?: string,
): Date {
  const day = parseInt(dayStr, 10)
  const month = monthIndex(monthStr)
  const year = resolveYear(month, day, yearStr)
  let hours = 19, minutes = 0 // sensible default if no time

  if (timeStr) {
    const m = timeStr.match(TIME_RE)
    if (m) {
      hours = parseInt(m[1], 10)
      minutes = m[2] ? parseInt(m[2], 10) : 0
      const mer = m[3]?.toLowerCase()
      if (mer === 'pm' && hours < 12) hours += 12
      if (mer === 'am' && hours === 12) hours = 0
    }
  }
  return new Date(year, month, day, hours, minutes, 0)
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export const tsmaltaAdapter: Adapter = {
  name: 'tsmalta',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching events listing: ${LISTING_URL}`)
    const listHtml = await fetchText(LISTING_URL)
    const eventUrls = extractEventUrls(listHtml)
    ctx.log(`Found ${eventUrls.length} event URL(s)`)

    if (eventUrls.length === 0) return

    const pool = eventUrls.slice(0, ctx.maxEvents * 3)
    ctx.log(`Fetching ${pool.length} event page(s) at concurrency ${FETCH_CONCURRENCY}`)

    const results = await mapConcurrent(pool, FETCH_CONCURRENCY, async (url) => {
      const html = await fetchText(url)
      return parseEventPage(url, html)
    })

    let yielded = 0
    for (let i = 0; i < pool.length; i++) {
      const url = pool[i]
      const r = results[i]
      if (r instanceof Error) {
        ctx.log(`  ? ${url} — parse error: ${r.message}`)
        continue
      }
      if (!r) continue
      if (new Date(r.startsAt) < new Date()) {
        // Past — silently skip
        continue
      }
      yielded++
      yield r
      if (yielded >= ctx.maxEvents) break
    }
  },
}

// ---------------------------------------------------------------------------
// Listing page — extract individual event URLs
// ---------------------------------------------------------------------------
function extractEventUrls(html: string): string[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').replace(/^http:/, 'https:')
    const m = href.match(EVENT_URL_RE)
    if (!m || !m[1]) return
    if (href.includes('/feed/')) return
    seen.add(href)
  })
  return Array.from(seen)
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------
function parseEventPage(url: string, html: string): ExternalEvent | null {
  const $ = cheerio.load(html)

  // --- Title ---
  const ogTitle = $('meta[property="og:title"]').attr('content') || ''
  const title = ogTitle.replace(/\s*[–—-]\s*Teatru Salesjan\s*$/i, '').trim()
  if (!title) return null

  // --- Image ---
  const imageUrl = $('meta[property="og:image"]').attr('content') || undefined

  // --- Date / Time ---
  // The date is in <strong> or <b> inside the first .uncode_text_column.text-lead
  const dateBlock = $('.uncode_text_column.text-lead').first()
  if (!dateBlock.length) return null

  const firstPara = dateBlock.find('p').first()
  const dateNode = firstPara.find('strong, b').first()
  const rawDate = dateNode.text()
    .replace(/–|—/g, '-') // normalise en/em-dash to hyphen
    .replace(/\s+/g, ' ')
    .trim()

  if (!rawDate) return null

  // Time: text in the first <p> after removing the date-node text
  const paraRaw = firstPara.text().replace(/\s+/g, ' ').trim()
  const afterDate = paraRaw.slice(dateNode.text().length).trim()
  const timeMatch = afterDate.match(TIME_RE)
  const timeStr = timeMatch ? timeMatch[0] : undefined

  // Parse date range vs single date
  let startsAt: string
  let endsAt: string | undefined
  let hasTime: boolean

  const rangeMatch = rawDate.match(DATE_RANGE_RE)
  if (rangeMatch) {
    const start = buildDate(rangeMatch[1], rangeMatch[2], rangeMatch[3])
    const end = buildDate(rangeMatch[4], rangeMatch[5], rangeMatch[6])
    startsAt = start.toISOString()
    endsAt = end.toISOString()
    hasTime = false
  } else {
    const singleMatch = rawDate.match(SINGLE_DATE_RE)
    if (!singleMatch) return null
    const d = buildDate(singleMatch[1], singleMatch[2], singleMatch[3], timeStr)
    startsAt = d.toISOString()
    endsAt = undefined
    hasTime = !!timeStr
  }

  // --- Description ---
  // Priority 1: paragraphs in the date block after the date <p> (JazzKlabb-style)
  // Priority 2: first standalone .uncode_text_column without text-lead (Puccini-style)
  // Priority 3: og:description fallback
  const BOILERPLATE_RE =
    /wheelchair|accessible|ramp|café.*hour|opening hour|find us|get in touch|follow us|v\/o\s*\d{4}/i

  const descParts: string[] = []

  // Priority 1 — extra paragraphs in the date block
  firstPara.siblings('p').each((_, el) => {
    const t = $(el).text().trim()
    if (t.length > 20 && !BOILERPLATE_RE.test(t)) descParts.push(t)
  })

  // Priority 2 — standalone text column (if we didn't get anything above)
  if (descParts.length === 0) {
    // Find .uncode_text_column elements that do NOT have text-lead
    $('[class*="uncode_text_column"]').each((_, el) => {
      const cls = $(el).attr('class') || ''
      if (/text-lead/.test(cls)) return // skip the date block
      const text = $(el).text().replace(/\s+/g, ' ').trim()
      if (text.length > 80 && !BOILERPLATE_RE.test(text)) {
        // Collect paragraph texts
        $(el).find('p').each((_, p) => {
          const pt = $(p).text().trim()
          if (pt.length > 20 && !BOILERPLATE_RE.test(pt)) descParts.push(pt)
        })
        return false // stop after first match
      }
    })
  }

  // Priority 3 — og:description
  const description = descParts.length > 0
    ? descParts.join('\n\n')
    : ($('meta[property="og:description"]').attr('content') || undefined)

  // --- Ticket URL ---
  const ticketUrl = $('a.btn-accent[href]').not('[href="#"]').first().attr('href') || undefined

  // --- Free entry check ---
  const bodyText = $('body').text()
  const isFree = /entrance\s+to\s+this\s+event\s+is\s+free|free\s+entry|admission\s+is\s+free/i.test(bodyText)

  return {
    externalId: deriveExternalId(url),
    url,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    venueName: 'Teatru Salesjan',
    venueAddress: '45, Ġużè Howard Street, Tas-Sliema, Malta',
    imageUrl,
    ticketUrl: isFree ? undefined : ticketUrl,
    priceMin: isFree ? 0 : undefined,
    currency: !isFree && ticketUrl ? 'EUR' : undefined,
    categoryHint: 'theatre',
  }
}

/** /events/<slug>/  →  <slug> */
function deriveExternalId(url: string): string {
  const m = url.match(/\/events\/([^/]+)\/?$/)
  return m ? m[1] : url
}
