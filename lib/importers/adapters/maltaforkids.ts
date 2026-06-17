// maltaforkids.com adapter.
//
// Malta for Kids is a curated children's/family events directory running
// WordPress with the "My Calendar" plugin (Joe Dolson). It exposes a clean,
// public JSON endpoint:
//
//   GET /wp-json/my-calendar/v1/events?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The response is an OBJECT keyed by date string, each mapping to an array of
// occurrence objects. A single multi-day event appears under every date it
// spans (same occur_id); a recurring event appears as a different occur_id per
// date. We therefore:
//   1. Flatten all occurrences across all date keys.
//   2. Dedupe occurrences by occur_id.
//   3. Group by event_id → one ExternalEvent per event, with its occurrences.
//
// Times are Malta-local ("YYYY-MM-DD HH:MM:SS"); we convert to UTC with the
// same DST-aware logic used by the visitmalta adapter. all-day events use
// 00:00:00 → we treat those as date-only (hasTime=false).
//
// This source is the site's primary fix for the thin coverage of kids/family
// events. Imported events still pass through the normal review queue; the
// admin confirms the Children / Family Friendly tag on approval.

import type { Adapter, ExternalEvent, ImportContext, Occurrence } from '../types'
import { fetchText } from '../http'

const API_BASE = 'https://maltaforkids.com/wp-json/my-calendar/v1/events'
const SITE_URL = 'https://maltaforkids.com'

export const maltaforkidsAdapter: Adapter = {
  name: 'maltaforkids',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    const from = new Date().toISOString().slice(0, 10)
    const to = ctx.cutoffDate.toISOString().slice(0, 10)
    const url = `${API_BASE}?from=${from}&to=${to}`

    ctx.log(`Fetching My Calendar API: ${url}`)
    const raw = await fetchText(url, { accept: 'application/json' })
    const payload = JSON.parse(raw) as unknown

    // Flatten the date-keyed structure into one list of occurrence rows.
    const rows: MCRow[] = []
    if (Array.isArray(payload)) {
      rows.push(...(payload as MCRow[]))
    } else if (payload && typeof payload === 'object') {
      for (const value of Object.values(payload as Record<string, unknown>)) {
        if (Array.isArray(value)) rows.push(...(value as MCRow[]))
      }
    }
    ctx.log(`API returned ${rows.length} occurrence row(s)`)

    // Group by event_id, deduping occurrences by occur_id.
    const groups = new Map<string, { first: MCRow; occ: Map<string, MCRow> }>()
    for (const row of rows) {
      if (!row || row.event_id == null) continue
      // My Calendar: event_approved 1=published, 0=draft, 2=trash.
      if (row.event_approved != null && String(row.event_approved) !== '1') continue
      const eid = String(row.event_id)
      const oid = String(row.occur_id ?? `${eid}-${row.occur_begin ?? ''}`)
      let g = groups.get(eid)
      if (!g) { g = { first: row, occ: new Map() }; groups.set(eid, g) }
      if (!g.occ.has(oid)) g.occ.set(oid, row)
    }
    ctx.log(`Grouped into ${groups.size} distinct event(s)`)

    const now = Date.now()
    let yielded = 0

    for (const { first, occ } of groups.values()) {
      if (yielded >= ctx.maxEvents) break

      const ev = buildEvent(first, [...occ.values()], now)
      if (!ev) continue

      yielded++
      yield ev
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Build an ExternalEvent from a group of My Calendar occurrence rows
// ---------------------------------------------------------------------------
function buildEvent(row: MCRow, rawOccs: MCRow[], now: number): ExternalEvent | null {
  const title = decodeHtml((row.event_title ?? '').trim())
  if (!title) return null

  // Map every occurrence row to an Occurrence, keep only those not yet ended.
  const occurrences: Occurrence[] = []
  for (const r of rawOccs) {
    const startsAt = maltaToUtc(r.occur_begin ?? r.event_begin)
    if (!startsAt) continue
    const endRaw = r.occur_end ?? undefined
    const endsAt = endRaw ? maltaToUtc(endRaw) : undefined
    const hasTime = !isAllDay(r)
    const endTs = endsAt ? Date.parse(endsAt) : Date.parse(startsAt)
    if (Number.isFinite(endTs) && endTs < now) continue // already finished
    occurrences.push({ startsAt, endsAt: endsAt ?? undefined, hasTime })
  }
  if (occurrences.length === 0) return null

  occurrences.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const soonest = occurrences[0]!

  // Venue: prefer the nested location object, fall back to the flat fields.
  const loc = row.location
  const venueName = (loc?.location_label || row.event_label || '').trim() || undefined
  const venueAddress = [
    loc?.location_street || row.event_street,
    loc?.location_city || row.event_city,
  ].map((s) => (s || '').trim()).filter(Boolean).join(', ') || undefined

  // Description: strip the HTML body, fall back to the short summary.
  const description =
    (stripHtml(row.event_desc ?? '').slice(0, 1500).trim() ||
      decodeHtml((row.event_short ?? '').trim())) || undefined

  const imageUrl = httpUrl(row.event_image)
  const ticketUrl = httpUrl(row.event_tickets) || httpUrl(row.event_link)
  const url = httpUrl(row.event_link) || `${SITE_URL}/`

  return {
    externalId: String(row.event_id),
    url,
    title,
    description,
    startsAt: soonest.startsAt,
    endsAt: soonest.endsAt,
    hasTime: soonest.hasTime,
    venueName,
    venueAddress,
    imageUrl,
    ticketUrl,
    categoryHint: decodeHtml(row.category_name || 'children').toLowerCase(),
    occurrences: occurrences.length > 1 ? occurrences : undefined,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** My Calendar all-day events are stored with a 00:00:00 start time. */
function isAllDay(r: MCRow): boolean {
  const t = (r.event_time ?? '').slice(0, 5)
  return t === '' || t === '00:00'
}

/** Convert a Malta-local "YYYY-MM-DD HH:MM:SS" (or with 'T') to UTC ISO.
 *  Returns null on unparseable input so the caller can skip the occurrence. */
function maltaToUtc(naive: string | undefined | null): string | null {
  if (!naive) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(naive.trim())
  if (!m) {
    const d = new Date(naive)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  const [, yy, mo, da, hh, mi, ss] = m
  const offsetHours = isMaltaDst(Number(yy), Number(mo), Number(da)) ? 2 : 1
  const ms = Date.UTC(+yy!, +mo! - 1, +da!, +hh! - offsetHours, +mi!, +(ss ?? '0'))
  return new Date(ms).toISOString()
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

/** Return the string only if it is an absolute http(s) URL, else undefined. */
function httpUrl(s: string | undefined | null): string | undefined {
  const v = (s || '').trim()
  return /^https?:\/\//i.test(v) ? v : undefined
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
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
}

// ---------------------------------------------------------------------------
// Types — narrow shape we read from the My Calendar payload
// ---------------------------------------------------------------------------
interface MCLocation {
  location_label?: string
  location_street?: string
  location_city?: string
}

interface MCRow {
  event_id?: number | string
  occur_id?: number | string
  occur_begin?: string
  occur_end?: string
  event_begin?: string
  event_title?: string
  event_desc?: string
  event_short?: string
  event_time?: string
  event_endtime?: string
  event_link?: string
  event_tickets?: string
  event_image?: string
  event_label?: string
  event_street?: string
  event_city?: string
  event_approved?: number | string
  category_name?: string
  location?: MCLocation
}
