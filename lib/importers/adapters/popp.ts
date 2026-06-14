// popp.mt adapter.
//
// Flow:
//   1. Fetch https://popp.mt/events-sitemap.xml — dedicated events sitemap,
//      sort by lastmod desc and skip the archive URL (/events/).
//   2. For each event page, parse:
//        • title    — og:title (strip "- POPP" suffix)
//        • image    — og:image
//        • date/time — extracted from the "Add to Calendar" iCal block embedded
//                      in every event page as JavaScript string literals:
//                        'DTSTART:20260509T120000'
//                        'DTEND:20260509T230000'
//                      When the iCal block is absent (rare older events), falls
//                      back to the jet-listing-dynamic-field__content date field
//                      ("Saturday 9. May 2026") plus the first
//                      elementor-icon-list-text time value.
//        • venue    — LOCATION: from the iCal block, or the icon-list item
//                      inside the "Location" section
//        • desc     — first substantial <p> elements that aren't the emoji-info
//                      block (which repeats date/time/venue as plain text)
//        • ticket   — any external links in the "Links" section, excluding
//                      social profiles and Google Maps
//        • price    — €N in body text; "free entry" → priceMin = 0
//   3. Skip past events.
//
// Date note: POPP's iCal DTSTART is Malta local time (floating, no TZID).
// We treat it as UTC for consistency with other adapters; it's at most 2h off
// which is acceptable for discovery. Moderators can correct if needed.

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'
import { fetchSitemap, sortByLastmodDesc } from '../sitemap'

const SITEMAP_URL = 'https://popp.mt/events-sitemap.xml'
const ARCHIVE_URL = 'https://popp.mt/events/'
const FETCH_CONCURRENCY = 4

// iCal date stamp: "20260509T120000" → [year, month(0-based), day, hour, min]
const DTSTART_RE = /'DTSTART:(\d{8}T\d{6})'/
const DTEND_RE   = /'DTEND:(\d{8}T\d{6})'/
const DTLOC_RE   = /'LOCATION:([^']+)'/

// Fallback date in jet-listing field: "9. May 2026" / "Saturday 9. May 2026"
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
}
const FALLBACK_DATE_RE =
  /(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(\d{1,2})\.\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i

// Price: "€30" or "€ 30" in body
const PRICE_RE = /€\s*(\d+(?:\.\d{2})?)/

// Links we don't want as ticket URLs
const SKIP_LINK_RE = /facebook\.com\/(dothepopp|popp\.mt)|instagram\.com|google\.com\/maps|popp\.mt\/(privacy|accessibility|about|contact)/i

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export const poppAdapter: Adapter = {
  name: 'popp',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching sitemap: ${SITEMAP_URL}`)
    const allEntries = await fetchSitemap(SITEMAP_URL)
    const entries = sortByLastmodDesc(allEntries).filter((e) => e.loc !== ARCHIVE_URL)
    ctx.log(`Sitemap: ${entries.length} event URL(s)`)

    if (entries.length === 0) return

    const pool = entries
    ctx.log(`Fetching pages in batches (concurrency ${FETCH_CONCURRENCY}) until ${ctx.maxEvents} future events found`)

    let yielded = 0
    const now = new Date()
    for (let offset = 0; offset < pool.length && yielded < ctx.maxEvents; offset += FETCH_CONCURRENCY) {
      const batch = pool.slice(offset, offset + FETCH_CONCURRENCY)
      const results = await mapConcurrent(batch, FETCH_CONCURRENCY, async (entry) => {
        const html = await fetchText(entry.loc)
        return parseEventPage(entry.loc, html)
      })

      for (let i = 0; i < batch.length; i++) {
        const r = results[i]
        if (r instanceof Error) {
          ctx.log(`  ? ${batch[i].loc} — parse error: ${r.message}`)
          continue
        }
        if (!r) continue
        if (new Date(r.startsAt) < now) continue // past
        yield r
        yielded++
        if (yielded >= ctx.maxEvents) break
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Detail page parser
// ---------------------------------------------------------------------------
function parseEventPage(url: string, html: string): ExternalEvent | null {
  const $ = cheerio.load(html)

  // --- Title ---
  const ogTitle = $('meta[property="og:title"]').attr('content') || ''
  const title = ogTitle.replace(/\s*[-–]\s*POPP\s*$/i, '').trim()
  if (!title) return null

  // --- Image ---
  const imageUrl = $('meta[property="og:image"]').attr('content') || undefined

  // --- Date / Time / Venue from iCal block ---
  let startsAt: string | null = null
  let endsAt: string | undefined
  let hasTime = false
  let venueName: string | undefined

  const startMatch = html.match(DTSTART_RE)
  const endMatch   = html.match(DTEND_RE)
  const locMatch   = html.match(DTLOC_RE)

  if (startMatch) {
    const dt = parseDtStamp(startMatch[1])
    if (!dt) return null
    startsAt = dt.toISOString()
    hasTime = true
    if (endMatch) {
      const dte = parseDtStamp(endMatch[1])
      if (dte) endsAt = dte.toISOString()
    }
  }

  if (locMatch) {
    venueName = locMatch[1].replace(/\\'/g, "'").trim()
  }

  // --- Fallback date (no iCal block) ---
  if (!startsAt) {
    // jet-listing-dynamic-field__content often has two divs:
    // short ("9. May 2026") and long ("Saturday 9. May 2026").
    // Either works — take the first match.
    let fallbackDateText = ''
    $('.jet-listing-dynamic-field__content').each((_, el) => {
      const t = $(el).text().trim()
      if (FALLBACK_DATE_RE.test(t)) { fallbackDateText = t; return false }
    })

    const dm = fallbackDateText.match(FALLBACK_DATE_RE)
    if (!dm) return null

    const day   = parseInt(dm[1], 10)
    const month = MONTHS[dm[2].toLowerCase().slice(0, 3)] ?? -1
    const year  = parseInt(dm[3], 10)
    if (month === -1) return null

    // Time from first HH:MM icon-list item
    let hours = 19, minutes = 0
    const timeText = $('.elementor-icon-list-text').filter((_, el) =>
      /^\d{1,2}:\d{2}$/.test($(el).text().trim())
    ).first().text().trim()
    if (timeText) {
      const [h, m] = timeText.split(':').map(Number)
      hours = h; minutes = m
      hasTime = true
    }

    startsAt = new Date(Date.UTC(year, month, day, hours, minutes)).toISOString()
  }

  // --- Venue fallback from icon list (next to Google Maps link) ---
  if (!venueName) {
    $('li.elementor-icon-list-item').each((_, el) => {
      const link = $(el).find('a[href*="google.com/maps"]')
      if (link.length) {
        const t = $(el).find('.elementor-icon-list-text').text().trim()
        if (t) { venueName = t; return false }
      }
    })
  }

  // Default venue to POPP's Gżira address if nothing found
  if (!venueName) venueName = 'POPP'

  // --- Description ---
  // Skip the emoji-info <p> (contains 🎟️/📅/📍/⏰ alt text or matching patterns)
  const EMOJI_INFO_RE = /Free entry|📅|📍|⏰|🎟|(?:\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})/
  const SKIP_DESC_RE  = /Get Updates|Don't Miss|Newsletter|subscribe|©\s*20/i
  const descParts: string[] = []

  $('p').each((_, el) => {
    const text = $(el).text().trim()
    if (!text || text.length < 30) return
    if (EMOJI_INFO_RE.test(text)) return
    if (SKIP_DESC_RE.test(text)) return
    descParts.push(text)
    if (descParts.length >= 4) return false // cap at 4 paragraphs
  })

  const description = descParts.length > 0 ? descParts.join('\n\n') : undefined

  // --- Price ---
  const bodyText = $('body').text()
  const isFree = /free\s*entry|entrance.*free|admission.*free/i.test(bodyText)
  let priceMin: number | undefined
  let currency: string | undefined
  let ticketUrl: string | undefined

  if (!isFree) {
    const priceMatch = bodyText.match(PRICE_RE)
    if (priceMatch) {
      priceMin = parseFloat(priceMatch[1])
      currency = 'EUR'
    }
  }

  // --- Ticket / event URL ---
  // Look at the "Links" section (elementor-heading contains "Links") then the
  // icon-list items after it; fall back to any external link not matching social.
  let foundLinksSection = false
  $('[class*="elementor-widget"]').each((_, widget) => {
    const heading = $(widget).find('.elementor-heading-title').text().trim()
    if (/^links$/i.test(heading)) {
      foundLinksSection = true
      $(widget).nextAll().slice(0, 3).find('a[href]').each((_, a) => {
        const href = ($(a).attr('href') || '').trim()
        if (!href || href.startsWith('#') || SKIP_LINK_RE.test(href)) return
        ticketUrl = href
        return false
      })
    }
    if (foundLinksSection && ticketUrl) return false
  })

  // Fallback: any external link in the body (not social, not maps, not own domain)
  if (!ticketUrl) {
    $('a[href]').each((_, a) => {
      const href = ($(a).attr('href') || '').trim()
      if (!href.startsWith('http')) return
      if (/popp\.mt|facebook\.com|instagram\.com|google\.com|apple\.com/i.test(href)) return
      ticketUrl = href
      return false
    })
  }

  return {
    externalId: deriveExternalId(url),
    url,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    venueName,
    venueAddress: venueName === 'POPP' ? '47, Triq Nazju Ellul, Gżira, Malta' : undefined,
    imageUrl,
    ticketUrl: isFree ? undefined : ticketUrl,
    priceMin: isFree ? 0 : priceMin,
    currency,
    categoryHint: 'community',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse iCal datestamp "20260509T120000" → Date (treated as UTC). */
function parseDtStamp(dt: string): Date | null {
  const m = dt.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)
  if (!m) return null
  return new Date(Date.UTC(
    parseInt(m[1]),
    parseInt(m[2]) - 1,
    parseInt(m[3]),
    parseInt(m[4]),
    parseInt(m[5]),
  ))
}

/** /events/<slug>/ → <slug> */
function deriveExternalId(url: string): string {
  const m = url.match(/\/events\/([^/]+)\/?$/)
  return m ? m[1] : url
}
