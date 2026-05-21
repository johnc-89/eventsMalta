// Teatru Manoel adapter — reference implementation.
//
// Flow:
//   1. Read the WordPress sitemap index → drill into wp-sitemap-posts-event-1.xml
//   2. Sort URLs by lastmod (most-recently-edited first) and take the top N
//      (the pipeline caps to maxEvents).
//   3. For each event URL, fetch the page and extract:
//        • title    — <h1>
//        • date     — "Day DD Mon at HH:MM am/pm" pattern in the Details block
//        • venue    — "Venue: …" label
//        • ticketUrl — first booking.teatrumanoel.mt link
//        • imageUrl — og:image meta (Elementor places the hero there)
//        • description — text between the "Description" heading and the next
//                       structural heading
//   4. Skip events whose date is in the past.
//
// Edge cases this adapter intentionally handles imperfectly:
//   • Events with multiple dates: we use the SOONEST future date. The whole
//     schedule lives in the description; moderator can refine if needed.
//   • Year-less dates ("30 Apr at 1:00 pm"): we assume current year, then
//     next year if that's already past.
//   • Pages without an extractable date: the adapter yields an `errored`
//     event with the URL noted; the pipeline counts it. Moderators can
//     either fix the source page (call Teatru Manoel) or accept the gap.

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'
import { fetchSitemap, sortByLastmodDesc } from '../sitemap'

const SITEMAP_INDEX = 'https://teatrumanoel.mt/wp-sitemap.xml'
const ONLY_EVENT_SITEMAPS = /wp-sitemap-posts-event/i
const FETCH_CONCURRENCY = 4

export const teatrumanoelAdapter: Adapter = {
  name: 'teatrumanoel',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Reading sitemap index: ${SITEMAP_INDEX}`)
    const all = await fetchSitemap(SITEMAP_INDEX, { onlyMatching: ONLY_EVENT_SITEMAPS })
    ctx.log(`Sitemap returned ${all.length} event URL(s)`)

    if (all.length === 0) return

    // Most-recently-updated first; the pipeline only consumes the first
    // `maxEvents` so this prioritises change-detection.
    const sorted = sortByLastmodDesc(all)
    const pool = sorted.slice(0, ctx.maxEvents * 3) // small over-fetch buffer because some URLs may turn out to be past events
    ctx.log(`Fetching detail pages for ${pool.length} URL(s) at concurrency ${FETCH_CONCURRENCY}`)

    const detailResults = await mapConcurrent(pool, FETCH_CONCURRENCY, async (entry) => {
      const html = await fetchText(entry.loc)
      return parseEventPage(entry.loc, html)
    })

    let yielded = 0
    for (let i = 0; i < pool.length; i++) {
      const url = pool[i].loc
      const r = detailResults[i]
      if (r instanceof Error) {
        ctx.log(`  ? ${url} — parse failed: ${r.message}`)
        continue
      }
      if (!r) continue // unparseable (no date)
      if (r.startsAt && new Date(r.startsAt) < new Date()) {
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
// Page parser
// ---------------------------------------------------------------------------
function parseEventPage(url: string, html: string): ExternalEvent | null {
  const $ = cheerio.load(html)

  const title = ($('h1').first().text() || $('title').text()).trim()
  if (!title) return null

  // Strip "– Teatru Manoel" suffix that WordPress adds to <title>.
  const cleanTitle = title.replace(/\s*[–-]\s*Teatru Manoel\s*$/i, '').trim()

  // Hero image — try in order:
  //   1. og:image meta (most reliable on Elementor sites)
  //   2. twitter:image meta
  //   3. first <img> in the page body whose src points at /wp-content/uploads/
  //      and isn't an obvious logo/icon (filtered by size hints in the URL).
  const imageUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    findHeroImage($) ||
    undefined

  // Description: WordPress wraps body content in an Elementor section.
  // We take everything between a "Description" heading and the next h2/h3.
  // Fallback: og:description meta.
  let description: string | undefined
  const descHeading = $('h2, h3').filter((_, el) => /description/i.test($(el).text())).first()
  if (descHeading.length > 0) {
    const chunks: string[] = []
    descHeading.nextAll().each((_, el) => {
      const tag = (el as { tagName?: string }).tagName?.toLowerCase()
      if (tag === 'h2' || tag === 'h3') return false // stop at next heading
      const text = $(el).text().trim()
      if (text) chunks.push(text)
    })
    if (chunks.length > 0) description = chunks.join('\n\n')
  }
  if (!description) {
    description = $('meta[property="og:description"]').attr('content') || undefined
  }

  // Venue: "Venue:" label.
  const venueText = findLabelValue($, /^venue/i)
  const venueName = venueText || 'Teatru Manoel'

  // Dates: extract from the event's own block ONLY — NOT the whole body.
  // The page has a "What's On" widget showing other upcoming events at the
  // venue; if we scan the whole body we'd pick up some other event's date.
  //
  // Preference order:
  //   1. .se-eventformat-time (per-show times like "28 Jun at 8:00 pm")
  //   2. .hew-date (header date range "28 June 2026 - 28 June 2026")
  //   3. The .single-event-container text (with sibling widgets removed)
  //   4. og:description meta as last resort
  let dateScope = ''
  $('.se-eventformat-time').each((_, el) => { dateScope += ' ' + $(el).text() })
  if (!dateScope.trim()) {
    dateScope = $('.hew-date').first().text() || ''
  }
  if (!dateScope.trim()) {
    const container = $('.single-event-container').first().clone()
    container.find('.se-whats-on, .events-grid-container').remove()
    dateScope = container.text()
  }
  if (!dateScope.trim()) {
    dateScope = $('meta[property="og:description"]').attr('content') || ''
  }
  // Also seed with .hew-date so .se-eventformat-time entries (which lack
  // a year) can borrow it via the year-bias fallback in extractDates.
  const headerYearText = $('.hew-date').first().text() || ''
  const dates = extractDates(`${headerYearText} ${dateScope}`.replace(/\s+/g, ' '))
  if (dates.length === 0) return null
  const firstFuture = dates.find((d) => d >= new Date())
  if (!firstFuture) return null

  // Ticket / book link.
  const ticketUrl =
    $('a[href*="booking.teatrumanoel.mt"]').first().attr('href') || undefined

  const externalId = deriveExternalId(url)

  return {
    externalId,
    url,
    title: cleanTitle,
    description,
    startsAt: firstFuture.toISOString(),
    hasTime: true,
    venueName,
    venueAddress: 'Old Theatre Street, Valletta, Malta',
    imageUrl,
    ticketUrl,
    currency: ticketUrl ? 'EUR' : undefined,
    categoryHint: 'theatre',
  }
}

/** Find the text after a "<strong>Label:</strong>X" or "<b>Label:</b>X" pair. */
function findLabelValue($: cheerio.CheerioAPI, labelRe: RegExp): string | undefined {
  let found: string | undefined
  $('strong, b').each((_, el) => {
    const labelText = $(el).text().trim().replace(/:$/, '')
    if (!labelRe.test(labelText)) return
    // Take the immediate text following the label, until the next element/break.
    const next = (el.nextSibling as { type: string; data?: string } | null)
    if (next && next.type === 'text' && typeof next.data === 'string') {
      found = next.data.trim()
      return false
    }
    // Otherwise take the parent's text minus the label itself.
    const parentText = $(el).parent().text().trim()
    found = parentText.replace(new RegExp(`^${labelText}:?\\s*`, 'i'), '').trim()
    return false
  })
  return found
}

/** Parse 1+ event dates from a flattened page text. Tolerant — picks up
 *  things like "Thursday 30 Apr at 1:00 pm" or "Sat 7 Jun 2026 7:30 pm". */
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}
const DATE_RE =
  /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?(?:\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/gi

function extractDates(text: string): Date[] {
  const out: Date[] = []
  const now = new Date()
  const thisYear = now.getFullYear()
  let m: RegExpExecArray | null
  while ((m = DATE_RE.exec(text)) !== null) {
    const day = Number(m[1])
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (month === undefined || day < 1 || day > 31) continue
    let year = m[3] ? Number(m[3]) : thisYear
    let hours = m[4] ? Number(m[4]) : 19   // default 7pm if no time given
    const minutes = m[5] ? Number(m[5]) : 0
    const meridiem = m[6]?.toLowerCase()
    if (meridiem === 'pm' && hours < 12) hours += 12
    if (meridiem === 'am' && hours === 12) hours = 0

    let dt = new Date(year, month, day, hours, minutes, 0)
    // Year-less dates that have already passed → assume next year.
    if (!m[3] && dt < now) {
      year = thisYear + 1
      dt = new Date(year, month, day, hours, minutes, 0)
    }
    out.push(dt)
  }
  // Deduplicate (the same date appears in multiple sections of the page).
  const seen = new Set<number>()
  return out.filter((d) => {
    const k = d.getTime()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a, b) => a.getTime() - b.getTime())
}

/** /event/<slug>/  →  <slug> */
function deriveExternalId(url: string): string {
  const m = url.match(/\/event\/([^/]+)\/?$/)
  return m ? m[1] : url
}

/** Fallback hero image — scan <img> tags for the first WordPress uploads
 *  image that's plausibly content (not a logo/avatar/icon).  Excludes:
 *    • images with width/height ≤ 100 (favicons, share buttons)
 *    • URLs containing "logo", "icon", "favicon", "avatar"
 *    • the 1x1 lazy-load placeholder GIF Elementor sometimes uses */
function findHeroImage($: cheerio.CheerioAPI): string | undefined {
  let found: string | undefined
  $('img').each((_, el) => {
    const $el = $(el)
    // Elementor lazy-loads via `data-src`; prefer that, fall back to src.
    const src = ($el.attr('data-src') || $el.attr('src') || '').trim()
    if (!src) return
    if (!/\/wp-content\/uploads\//i.test(src)) return
    if (/(logo|favicon|icon|avatar|placeholder)/i.test(src)) return
    if (src.startsWith('data:')) return
    const w = Number($el.attr('width') ?? 0)
    const h = Number($el.attr('height') ?? 0)
    if (w > 0 && w <= 100) return
    if (h > 0 && h <= 100) return
    found = src
    return false // stop iterating
  })
  return found
}
