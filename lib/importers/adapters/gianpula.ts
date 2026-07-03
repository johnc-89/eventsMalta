// gianpulavillage.com adapter.
//
// Gianpula Village (a large Malta clubbing complex) is WordPress with a custom
// `upcoming_events` post type. The cleanest source is the public events listing
// at /events/, which renders every upcoming event as a card carrying all the
// fields we need — no per-event page fetch required:
//
//   .event-panel-area > a[href]   — canonical /upcoming_events/<slug>/ URL
//   .event-bottom-img img[src]     — hero image
//   .date-area                     — "Sat 13th Jun" (no year)
//   .frm-area                      — "From 2:00pm" (start time, 12h)
//   h3                             — title
//   p:nth-of-type(1)               — venue ("The Rooftop", "Aria", …)
//   p:nth-of-type(2)               — music genre (→ tag/category hint)
//
// The listed date has no year, so we infer the soonest year for which the
// day+month is today-or-later. Times are Malta-local; we store them as UTC
// (≤2h drift, acceptable for discovery — see the POPP adapter for the same
// trade-off).

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText } from '../http'
import { containsPaidKeyword } from '../ticket-keywords'

const LISTING_URL = 'https://gianpulavillage.com/events/'

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

export const gianpulaAdapter: Adapter = {
  name: 'gianpula',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching listing: ${LISTING_URL}`)
    const html = await fetchText(LISTING_URL)
    const $ = cheerio.load(html)

    const parsed: ExternalEvent[] = []
    $('.event-panel-area').each((_, el) => {
      const ev = parseCard($(el))
      if (ev) parsed.push(ev)
    })
    ctx.log(`Found ${parsed.length} parseable event card(s)`)

    const now = new Date()
    let yielded = 0

    for (const ev of parsed) {
      if (yielded >= ctx.maxEvents) break
      const starts = new Date(ev.startsAt)
      if (starts < now) continue
      if (starts > ctx.cutoffDate) continue
      yielded++
      yield ev
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

function parseCard(card: cheerio.Cheerio<any>): ExternalEvent | null {

  const url = (card.find('a[href]').first().attr('href') || '').trim()
  if (!url || !/\/upcoming_events\//.test(url)) return null

  const title = card.find('h3').first().text().trim()
  if (!title) return null

  const dateText = card.find('.date-area').first().text().trim()
  const timeText = card.find('.frm-area').first().text().trim()
  const startsAt = parseDateTime(dateText, timeText)
  if (!startsAt) return null

  const imageUrl = card.find('.event-bottom-img img').first().attr('src')?.trim() || undefined

  const paras = card.find('.event-panel-des > p')
  const venueName = paras.eq(0).text().trim() || undefined
  const genre = paras.eq(1).text().trim() || undefined

  return {
    externalId: deriveSlug(url),
    url,
    title,
    startsAt,
    hasTime: /\d/.test(timeText),
    venueName: venueName ? `${venueName}, Gianpula Village` : 'Gianpula Village',
    venueAddress: 'Triq il-Mqabba, Rabat, Malta',
    imageUrl,
    categoryHint: 'nightlife',
    // Genre hint helps the tag suggester (constrained to existing tags anyway).
    raw: genre ? { genre } : undefined,
    // Scan only this card's own text — the listing page holds every event.
    hasPaidKeyword: containsPaidKeyword(card.text()),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Sat 13th Jun" + "From 2:00pm" → ISO string (UTC), year inferred. */
function parseDateTime(dateText: string, timeText: string): string | null {
  const dm = dateText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/)
  if (!dm) return null
  const day = parseInt(dm[1], 10)
  const month = MONTHS[dm[2].toLowerCase().slice(0, 3)]
  if (month === undefined) return null

  const { hours, minutes } = parseTime(timeText)

  const now = new Date()
  let year = now.getUTCFullYear()
  // Pick the soonest year for which this day/month is today-or-later.
  let candidate = new Date(Date.UTC(year, month, day, hours, minutes))
  if (candidate.getTime() < now.getTime() - 12 * 3600_000) {
    year += 1
    candidate = new Date(Date.UTC(year, month, day, hours, minutes))
  }
  return candidate.toISOString()
}

/** "From 2:00pm" / "From 10:00pm" → 24h. Defaults to 22:00 if absent. */
function parseTime(timeText: string): { hours: number; minutes: number } {
  const m = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return { hours: 22, minutes: 0 }
  let hours = parseInt(m[1], 10)
  const minutes = m[2] ? parseInt(m[2], 10) : 0
  const ampm = m[3].toLowerCase()
  if (ampm === 'pm' && hours !== 12) hours += 12
  if (ampm === 'am' && hours === 12) hours = 0
  return { hours, minutes }
}

/** /upcoming_events/<slug>/ → <slug> */
function deriveSlug(url: string): string {
  const m = url.match(/\/upcoming_events\/([^/]+)\/?/)
  return m ? m[1] : url
}
