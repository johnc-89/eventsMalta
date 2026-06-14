// g7events.com adapter.
//
// G7 Events is a Malta promoter (WordPress). The site blocks generic browser
// User-Agents with a 403 but serves our importer UA fine, so fetchText's
// default works without an override.
//
// There's no usable sitemap or events REST route, but the homepage lists every
// upcoming event as a /events/<slug>/ card. We harvest those links, then parse
// each detail page, which carries the structured fields:
//
//   .event_title h1        — title
//   .detail.calendar       — "22/07/2026" (DD/MM/YYYY start date)
//   .detail.clock          — "17:00 - 00:00" (start - end, Malta local)
//   .detail.location a      — venue ("Fosos, Floriana"), href = Google Maps
//   og:image               — hero image
//
// Times are Malta-local stored as UTC (≤2h drift — same trade-off as POPP).

import * as cheerio from 'cheerio'
import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'

const HOME_URL = 'https://www.g7events.com/'
const EVENT_LINK_RE = /https?:\/\/(?:www\.)?g7events\.com\/events\/[a-z0-9-]+\/?/gi
const FETCH_CONCURRENCY = 4

export const g7eventsAdapter: Adapter = {
  name: 'g7events',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    ctx.log(`Fetching homepage: ${HOME_URL}`)
    const home = await fetchText(HOME_URL)

    const urls = Array.from(
      new Set((home.match(EVENT_LINK_RE) ?? []).map((u) => u.replace(/\/?$/, '/'))),
    )
    ctx.log(`Found ${urls.length} event link(s)`)
    if (urls.length === 0) return

    const now = new Date()
    let yielded = 0

    for (let offset = 0; offset < urls.length && yielded < ctx.maxEvents; offset += FETCH_CONCURRENCY) {
      const batch = urls.slice(offset, offset + FETCH_CONCURRENCY)
      const results = await mapConcurrent(batch, FETCH_CONCURRENCY, async (url) => {
        const html = await fetchText(url)
        return parseDetail(url, html)
      })

      for (let i = 0; i < batch.length; i++) {
        const r = results[i]
        if (r instanceof Error) {
          ctx.log(`  ? ${batch[i]} — ${r.message}`)
          continue
        }
        if (!r) continue
        const starts = new Date(r.startsAt)
        if (starts < now) continue
        if (starts > ctx.cutoffDate) continue
        yield r
        yielded++
        if (yielded >= ctx.maxEvents) break
      }
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

function parseDetail(url: string, html: string): ExternalEvent | null {
  const $ = cheerio.load(html)

  const title = $('.event_title h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')?.replace(/\s*[-–]\s*G7 Events\s*$/i, '').trim()
    || ''
  if (!title) return null

  const dateText = $('.detail.calendar').first().text().trim()
  const dm = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!dm) return null
  const day = parseInt(dm[1], 10)
  const month = parseInt(dm[2], 10) - 1
  const year = parseInt(dm[3], 10)

  const clockText = $('.detail.clock').first().text().trim()
  const tm = clockText.match(/(\d{1,2}):(\d{2})/)
  const hasTime = !!tm
  const hours = tm ? parseInt(tm[1], 10) : 22
  const minutes = tm ? parseInt(tm[2], 10) : 0
  const startsAt = new Date(Date.UTC(year, month, day, hours, minutes)).toISOString()

  const venueName = $('.detail.location a').first().text().trim()
    || $('.detail.location').first().text().trim()
    || undefined

  const imageUrl = $('meta[property="og:image"]').attr('content')?.trim() || undefined

  return {
    externalId: deriveSlug(url),
    url,
    title,
    startsAt,
    hasTime,
    venueName,
    imageUrl,
    categoryHint: 'nightlife',
  }
}

/** /events/<slug>/ → <slug> */
function deriveSlug(url: string): string {
  const m = url.match(/\/events\/([^/]+)\/?/)
  return m ? m[1] : url
}
