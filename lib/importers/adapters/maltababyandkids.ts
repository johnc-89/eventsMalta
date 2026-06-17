// maltababyandkids.com adapter.
//
// Malta Baby & Kids is a children's/family events directory on WordPress. It
// has NO events REST route (the `event` post type isn't exposed in wp/v2), but
// the public /events/ page renders every upcoming event server-side as a
// `stm-event` card carrying all the listing fields we need:
//
//   .stm-event__title a   — title + canonical /event/<slug>/ URL
//   .stm-event__left img   — featured image (alt = title)
//   .stm-event__date       — "June 2, 2026"  (Month D, YYYY)
//   .stm-event__time       — "9:30am", "16.30", "10am - 12pm", "9:30 AM – 11:30 AM" (optional)
//   .stm-event__venue      — free-text venue (optional)
//
// The listing has no description, so for each upcoming event we fetch its
// detail page and lift the og:description (best-effort — a failed detail fetch
// just yields the event without a description rather than dropping it).
//
// Times are Malta-local; we convert to UTC with the same DST-aware logic as the
// maltaforkids / visitmalta adapters. Events with no parseable time are stored
// date-only (hasTime=false).

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'

const LISTING_URL = 'https://www.maltababyandkids.com/events/'

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

interface ParsedCard {
  slug: string
  url: string
  title: string
  image?: string
  venue?: string
  startsAt: string
  hasTime: boolean
}

export const maltababyandkidsAdapter: Adapter = {
  name: 'maltababyandkids',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching listing: ${LISTING_URL}`)
    const html = await fetchText(LISTING_URL)
    const $ = cheerio.load(html)

    const cards: ParsedCard[] = []
    $('.stm-event__title').each((_, el) => {
      const card = $(el).closest('.stm-event')
      const parsed = parseCard(card)
      if (parsed) cards.push(parsed)
    })
    ctx.log(`Found ${cards.length} event card(s)`)

    const now = Date.now()
    const cutoff = ctx.cutoffDate.getTime()
    const upcoming = cards
      .filter((c) => {
        const start = Date.parse(c.startsAt)
        // For date-only events, keep until the end of that day.
        const ends = c.hasTime ? start : start + 24 * 3600_000
        return ends >= now && start <= cutoff
      })
      .slice(0, ctx.maxEvents)
    ctx.log(`${upcoming.length} upcoming within window`)

    // Enrich each with a description from its detail page (best-effort).
    const metas = await mapConcurrent(upcoming, 4, async (c) => {
      const detail = await fetchText(c.url)
      return extractMeta(detail)
    })

    let yielded = 0
    for (let i = 0; i < upcoming.length; i++) {
      const c = upcoming[i]!
      const meta = metas[i] instanceof Error ? {} : (metas[i] as DetailMeta)

      yielded++
      yield {
        externalId: c.slug,
        url: c.url,
        title: c.title,
        description: meta.description,
        startsAt: c.startsAt,
        hasTime: c.hasTime,
        venueName: c.venue,
        imageUrl: c.image || meta.image,
        categoryHint: 'children',
      }
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Card parsing
// ---------------------------------------------------------------------------
function parseCard(card: cheerio.Cheerio<any>): ParsedCard | null {
  const link = card.find('.stm-event__title a').first()
  const url = (link.attr('href') || '').trim()
  if (!url || !/\/event\//.test(url)) return null

  const title = decodeHtml(
    link.text().trim() || card.find('.stm-event__left img').first().attr('alt') || '',
  )
  if (!title) return null

  const dateText = card.find('.stm-event__date').first().text().trim()
  const timeText = card.find('.stm-event__time').first().text().trim()
  const startsAt = parseDateTime(dateText, timeText)
  if (!startsAt) return null

  const image = card.find('.stm-event__left img').first().attr('src')?.trim() || undefined
  const venue = decodeHtml(card.find('.stm-event__venue').first().text().trim()) || undefined

  return {
    slug: deriveSlug(url),
    url,
    title,
    image,
    venue,
    startsAt,
    hasTime: parseTime(timeText) !== null,
  }
}

// ---------------------------------------------------------------------------
// Date / time parsing
// ---------------------------------------------------------------------------

/** "June 2, 2026" + an optional time → UTC ISO. null if the date is unparseable. */
function parseDateTime(dateText: string, timeText: string): string | null {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(dateText)
  if (!m) return null
  const month = MONTHS[m[1]!.toLowerCase()]
  if (month === undefined) return null
  const day = parseInt(m[2]!, 10)
  const year = parseInt(m[3]!, 10)

  const time = parseTime(timeText)
  const hours = time ? time.hours : 0
  const minutes = time ? time.minutes : 0

  const offset = isMaltaDst(year, month + 1, day) ? 2 : 1
  return new Date(Date.UTC(year, month, day, hours - offset, minutes)).toISOString()
}

/** Parse the first time in strings like "9:30am", "16.30", "10am - 12pm",
 *  "9:30 AM – 11:30 AM", "9:30am OR 11:30am". null if no time present. */
function parseTime(t: string): { hours: number; minutes: number } | null {
  if (!t) return null
  // H:MM (or H.MM) with am/pm
  let m = /(\d{1,2})[:.](\d{2})\s*([ap])\.?m\.?/i.exec(t)
  if (m) return applyMeridiem(parseInt(m[1]!, 10), parseInt(m[2]!, 10), m[3]!)
  // H with am/pm (no minutes), e.g. "10am"
  m = /(\d{1,2})\s*([ap])\.?m\.?/i.exec(t)
  if (m) return applyMeridiem(parseInt(m[1]!, 10), 0, m[2]!)
  // 24-hour H:MM or H.MM with no meridiem, e.g. "16.30"
  m = /(\d{1,2})[:.](\d{2})/.exec(t)
  if (m) return { hours: parseInt(m[1]!, 10), minutes: parseInt(m[2]!, 10) }
  return null
}

function applyMeridiem(hours: number, minutes: number, mer: string): { hours: number; minutes: number } {
  const pm = mer.toLowerCase() === 'p'
  if (pm && hours !== 12) hours += 12
  if (!pm && hours === 12) hours = 0
  return { hours, minutes }
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
// Detail page
// ---------------------------------------------------------------------------
interface DetailMeta {
  description?: string
  image?: string
}

function extractMeta(html: string): DetailMeta {
  const desc = /<meta\s+property="og:description"\s+content="([^"]*)"/i.exec(html)?.[1]
  const image = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html)?.[1]
  return {
    description: desc ? decodeHtml(desc).trim() || undefined : undefined,
    image: image?.trim() || undefined,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** /event/<slug>/ → <slug> */
function deriveSlug(url: string): string {
  const m = /\/event\/([^/]+)\/?/.exec(url)
  return m ? m[1]! : url
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}
