// cafedelmar.com.mt adapter.
//
// Café del Mar Malta is WordPress with a custom `event` post type exposed via
// the REST API at /wp-json/wp/v2/event. The REST payload gives us title,
// description and the featured image (via _embed), but NOT the event date —
// the date is only rendered on the detail page, inside the "Book Sofa" CTA:
//
//   https://sofas.cafedelmar.com.mt/select/?date=YYYY-MM-DD
//
// So we list via REST (recent-first) and fetch each detail page to recover the
// date. Events without a Book-Sofa date link are skipped. The venue is fixed
// (single waterfront venue in St Paul's Bay). No reliable start time is
// published, so events are stored date-only (hasTime = false); moderators can
// add a time on review.

import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText, mapConcurrent } from '../http'
import { containsPaidKeyword } from '../ticket-keywords'

const API_BASE = 'https://cafedelmar.com.mt/wp-json/wp/v2/event'
const SOFA_DATE_RE = /sofas\.cafedelmar\.com\.mt\/select\/\?date=(\d{4}-\d{2}-\d{2})/
const FETCH_CONCURRENCY = 4
const LIST_SIZE = 60

export const cafedelmarAdapter: Adapter = {
  name: 'cafedelmar',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    const listUrl =
      `${API_BASE}?per_page=${LIST_SIZE}&status=publish&orderby=date&order=desc` +
      `&_embed=wp%3Afeaturedmedia`
    ctx.log(`Fetching Café del Mar API: ${listUrl}`)

    const items: WPEvent[] = JSON.parse(await fetchText(listUrl))
    ctx.log(`API returned ${items.length} event(s); fetching detail pages for dates`)

    const now = new Date()
    let yielded = 0

    for (let offset = 0; offset < items.length && yielded < ctx.maxEvents; offset += FETCH_CONCURRENCY) {
      const batch = items.slice(offset, offset + FETCH_CONCURRENCY)
      const results = await mapConcurrent(batch, FETCH_CONCURRENCY, async (item) => {
        const html = await fetchText(item.link)
        return buildEvent(item, html)
      })

      for (let i = 0; i < batch.length; i++) {
        const r = results[i]
        if (r instanceof Error) {
          ctx.log(`  ? ${batch[i].link} — ${r.message}`)
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

function buildEvent(item: WPEvent, html: string): ExternalEvent | null {
  const title = decodeEntities(item.title?.rendered ?? '').trim()
  if (!title) return null

  const dm = html.match(SOFA_DATE_RE)
  if (!dm) return null // no published date — skip
  const [y, mo, d] = dm[1].split('-').map(Number)
  const startsAt = new Date(Date.UTC(y, mo - 1, d, 0, 0)).toISOString()

  const mediaArr = item._embedded?.['wp:featuredmedia']
  const imageUrl = (mediaArr?.[0] as { source_url?: string } | undefined)?.source_url

  const description = stripHtml(item.content?.rendered ?? '').slice(0, 1000).trim() || undefined

  return {
    externalId: String(item.id),
    url: item.link,
    title,
    description,
    startsAt,
    hasTime: false,
    venueName: 'Café del Mar',
    venueAddress: "Triq it-Trunciera, St Paul's Bay, Malta",
    imageUrl,
    categoryHint: 'nightlife',
    hasPaidKeyword: containsPaidKeyword(html),
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WPEvent {
  id: number
  slug: string
  link: string
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
