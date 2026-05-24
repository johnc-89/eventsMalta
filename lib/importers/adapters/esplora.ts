// esplora.org.mt (Esplora Interactive Science Centre) adapter.
//
// Esplora uses WordPress with a standard blog post structure. Events are
// tagged with category ID 71 ("Upcoming Events"). There is no custom post
// type or structured date/venue field — all event details are in prose.
//
// Strategy:
//   1. Fetch /wp-json/wp/v2/posts?categories=71 with a Chrome User-Agent
//      (Esplora's mod_security blocks our default importer UA).
//   2. Parse the content.rendered HTML for date patterns and extract the
//      FIRST FUTURE date found as startsAt.
//   3. If no future date found, skip the post (it's already past).
//   4. Image from the _embedded featured media.
//   5. Description from stripped content (capped to 600 chars).
//
// Venue: Esplora Interactive Science Centre is always in Kalkara, Malta.
// Individual events may mention a specific hall (Planetarium Hall, etc.)
// but we use the top-level venue for consistency.
//
// Note: Esplora runs seasonal/holiday programmes (Easter, Carnival, etc.)
// and occasional one-off events. Expect 1–4 upcoming events at a time.

import type { Adapter, ExternalEvent, ImportContext, Occurrence } from '../types'
import { fetchText } from '../http'

const API_URL =
  'https://esplora.org.mt/wp-json/wp/v2/posts' +
  '?categories=71&per_page=20&orderby=date&order=desc&_embed=wp%3Afeaturedmedia'

// mod_security blocks the default importer UA; Chrome UA passes.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
}

// Matches: "12 April 2026", "Thursday 7 May", "Saturday, 6 February 2026",
//          "7th May 2026", "Sunday, 8 February"
const DATE_RE =
  /(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*,?\s*)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?/gi

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export const esploraAdapter: Adapter = {
  name: 'esplora',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching Esplora API (Chrome UA required): ${API_URL}`)
    const raw = await fetchText(API_URL, { userAgent: CHROME_UA, accept: 'application/json' })
    const posts: WPPost[] = JSON.parse(raw)
    ctx.log(`API returned ${posts.length} post(s)`)

    const now = new Date()
    let yielded = 0

    for (const post of posts) {
      if (yielded >= ctx.maxEvents) break

      const ev = buildEvent(post, now)
      if (!ev) continue

      yielded++
      yield ev
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Build ExternalEvent from a WP post
// ---------------------------------------------------------------------------
function buildEvent(post: WPPost, now: Date): ExternalEvent | null {
  const rawTitle = decodeHtml(post.title?.rendered ?? '')
  const title = rawTitle.replace(/\s*[-–]\s*Esplora\s*$/i, '').trim()
  if (!title) return null

  const html = post.content?.rendered ?? ''
  const text = stripHtml(html)

  // Find all date mentions in the content and pick the earliest future one
  const futureDates = extractFutureDates(text, now)
  if (futureDates.length === 0) return null // all dates are past

  const startsAt = futureDates[0].toISOString()

  // If there are multiple future dates, use the last as a soft end indicator
  // (only if it's on a different day — avoids marking single-day as multi-day)
  let endsAt: string | undefined
  const occurrences: Occurrence[] = []
  if (futureDates.length > 1) {
    const last = futureDates[futureDates.length - 1]
    const firstDay = futureDates[0].toISOString().slice(0, 10)
    const lastDay  = last.toISOString().slice(0, 10)
    if (lastDay !== firstDay) endsAt = last.toISOString()
    // Emit all future dates as individual occurrences for recurring events
    occurrences.push(...futureDates.map(d => ({ startsAt: d.toISOString(), hasTime: false })))
  }

  // Image from _embedded featured media
  const mediaArr = post._embedded?.['wp:featuredmedia']
  const imageUrl = (mediaArr?.[0] as { source_url?: string } | undefined)?.source_url

  // Description: first 600 chars of stripped content
  const description = text.slice(0, 600).trim() || undefined

  return {
    externalId: String(post.id),
    url: post.link ?? `https://esplora.org.mt/${post.slug}/`,
    title,
    description,
    startsAt,
    endsAt,
    hasTime: false, // times not reliably present in prose
    venueName: 'Esplora Interactive Science Centre',
    venueAddress: 'Triq Dawret il-Gżejjer, Kalkara, Malta',
    imageUrl,
    ticketUrl: undefined, // Esplora uses general entry ticket pricing, not per-event URLs
    priceMin: undefined,  // included in general admission
    categoryHint: 'science',
    occurrences: occurrences.length > 0 ? occurrences : undefined,
  }
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------
function extractFutureDates(text: string, now: Date): Date[] {
  const found: Date[] = []
  const thisYear = now.getFullYear()

  let m: RegExpExecArray | null
  DATE_RE.lastIndex = 0
  while ((m = DATE_RE.exec(text)) !== null) {
    const day   = parseInt(m[1], 10)
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)]
    if (month === undefined || day < 1 || day > 31) continue

    let year = m[3] ? parseInt(m[3], 10) : thisYear
    // If no year given and the date has already passed this year, try next year
    let dt = new Date(year, month, day, 10, 0, 0) // default 10am
    if (!m[3] && dt < now) {
      year = thisYear + 1
      dt = new Date(year, month, day, 10, 0, 0)
    }

    if (dt >= now) found.push(dt)
  }

  // Deduplicate and sort ascending
  const seen = new Set<number>()
  return found
    .filter((d) => { const k = d.getTime(); if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.getTime() - b.getTime())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WPPost {
  id: number
  slug: string
  link?: string
  title?: { rendered: string }
  content?: { rendered: string }
  _embedded?: Record<string, unknown[]>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
}
