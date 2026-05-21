// visitmalta.com adapter.
//
// The public events page at /en/events-in-malta-and-gozo/ is a thin shell —
// the actual events are loaded by JS from a Drupal-backed API:
//
//   1. POST/GET https://api.visitmaltaplus.com/api/v1/authentication/guest-access-token
//      ?deviceId=<id>           → { access_token, expires_in }
//   2. GET  https://api.visitmaltaplus.com/api/v2/LoadAllEvents
//      ?limit=500&lang=en       → { rows: { <id>: <event> } }
//
// Each event is a Drupal entity exposed in its rawest form: every field is an
// array of objects wrapping a `value` or `target_id`. We extract the fields
// we care about and yield ExternalEvent.
//
// Recurrence: `recur_type` is custom|daily|weekly|monthly. We only handle
// `custom` (single occurrence — uses custom_date[0].value/end_value, ISO).
// For recurring types we fall back to the formatted `start_date` string
// (e.g. "21 June 2026") with hasTime=false.

import type { Adapter, ExternalEvent, ImportContext } from '../types'
import { fetchText } from '../http'

const AUTH_URL = 'https://api.visitmaltaplus.com/api/v1/authentication/guest-access-token'
const EVENTS_URL = 'https://api.visitmaltaplus.com/api/v2/LoadAllEvents'
const IMG_BASE = 'https://api.visitmaltaplus.com/api/v2/images/1'
const SITE_URL = 'https://www.visitmalta.com'

export const visitmaltaAdapter: Adapter = {
  name: 'visitmalta',

  async *fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent> {
    const deviceId = `eventsmalta-importer-${ctx.runId}`
    ctx.log(`Fetching guest token (deviceId=${deviceId})`)
    const tokenRaw = await fetchText(`${AUTH_URL}?deviceId=${encodeURIComponent(deviceId)}`)
    const tokenJson = JSON.parse(tokenRaw) as { access_token?: string }
    const token = tokenJson.access_token
    if (!token) throw new Error('Visit Malta: no access_token in auth response')

    // fetchText() doesn't support Authorization headers, so call fetch directly.
    const url = `${EVENTS_URL}?limit=500&lang=en`
    ctx.log(`Fetching ${url}`)
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json,*/*',
        'User-Agent': 'EventsMalta-Importer/1.0 (+https://eventsmalta.org)',
      },
    })
    if (!res.ok) throw new Error(`Visit Malta: LoadAllEvents HTTP ${res.status}`)
    const payload = (await res.json()) as { rows?: Record<string, RawEvent> }
    const rows = payload.rows ?? {}
    const events = Object.values(rows)
    ctx.log(`API returned ${events.length} event(s)`)

    const now = Date.now()
    let yielded = 0

    for (const ev of events) {
      if (yielded >= ctx.maxEvents) break

      const status = first(ev.field_event_status)?.value
      if (status && status !== 'Published') continue

      const out = buildEvent(ev)
      if (!out) continue

      // Skip events already finished.
      const endTs = out.endsAt ? Date.parse(out.endsAt) : Date.parse(out.startsAt)
      if (!Number.isFinite(endTs) || endTs < now) continue

      yielded++
      yield out
    }

    ctx.log(`Yielded ${yielded} upcoming event(s)`)
  },
}

// ---------------------------------------------------------------------------
// Build an ExternalEvent from a raw Drupal event row
// ---------------------------------------------------------------------------
function buildEvent(ev: RawEvent): ExternalEvent | null {
  const title = first(ev.title)?.value?.trim()
  if (!title) return null

  const slug = (ev.url_alias ?? '').trim()
  const uuid = first(ev.uuid)?.value?.trim()
  const externalId = slug || uuid
  if (!externalId) return null

  const url = slug
    ? `${SITE_URL}/en/events-in-malta-and-gozo/event/${slug}`
    : `${SITE_URL}/en/events-in-malta-and-gozo/`

  // --- Dates ---
  let startsAt: string | undefined
  let endsAt: string | undefined
  let hasTime = false
  const customDate = first(ev.custom_date)
  if (customDate?.value) {
    const s = toIsoUtc(customDate.value)
    if (!s) return null   // unparseable → skip rather than stamp with today
    startsAt = s
    hasTime = true
    if (customDate.end_value) {
      const e = toIsoUtc(customDate.end_value)
      if (e) endsAt = e
    }
  } else {
    // Fallback to formatted date strings (no time) for recurring events.
    const sd = parseFormattedDate(ev.start_date)
    if (sd) startsAt = sd
    const ed = parseFormattedDate(ev.end_date)
    if (ed) endsAt = ed
    hasTime = false
  }
  if (!startsAt) return null

  // --- Description (prefer field_summary; fallback to body, strip HTML) ---
  const summary = first(ev.field_summary)?.value?.trim()
  const bodyHtml = first(ev.body)?.value ?? ''
  const description = (summary || stripHtml(bodyHtml).slice(0, 1500)).trim() || undefined

  // --- Image ---
  const imgId = first(ev.field_dtp_event_image)?.target_id
  const imageUrl = imgId
    ? `${IMG_BASE}?media_id=${encodeURIComponent(imgId)}&height=600`
    : undefined

  // --- Ticket URL ---
  const ticketUrl =
    first(ev.field_booking_link)?.value?.trim() ||
    first(ev.field_event_website)?.value?.trim() ||
    undefined

  // --- Category hint from numeric taxonomy id ---
  const catId = first(ev.field_event_category)?.target_id
  const categoryHint = catId ? CATEGORY_MAP[catId] ?? 'event' : 'event'

  return {
    externalId,
    url,
    title,
    description,
    startsAt,
    endsAt,
    hasTime,
    imageUrl,
    ticketUrl,
    categoryHint,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drupal fields are always arrays; pull the first element if any. */
function first<T>(arr: T[] | undefined | null): T | undefined {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : undefined
}

/** Convert "2026-06-21T10:00:00" (naive, Europe/Malta) to UTC ISO. Returns
 *  null on unparseable input — caller MUST skip the event in that case.
 *  Previously this fell back to `new Date().toISOString()` which silently
 *  stamped events with today's date. */
function toIsoUtc(naive: string): string | null {
  // The API gives naive times in Malta local. Append timezone offset based on
  // a simple DST check (EU summer-time = last Sun in Mar → last Sun in Oct).
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/.exec(naive)
  if (m) {
    const [, yy, mo, da, hh, mi, ss] = m
    const offsetHours = isMaltaDst(Number(yy), Number(mo), Number(da)) ? 2 : 1
    const ms = Date.UTC(+yy!, +mo! - 1, +da!, +hh! - offsetHours, +mi!, +ss!)
    return new Date(ms).toISOString()
  }
  // Last resort: try built-in parsing. Reject if invalid.
  const d = new Date(naive)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

/** True if the given Malta-local date is in CEST (UTC+2). */
function isMaltaDst(y: number, m: number, d: number): boolean {
  if (m < 3 || m > 10) return false
  if (m > 3 && m < 10) return true
  // March: DST starts last Sunday. October: DST ends last Sunday.
  const lastSun = lastSundayOf(y, m)
  return m === 3 ? d >= lastSun : d < lastSun
}

function lastSundayOf(year: number, month1to12: number): number {
  // Day-of-month of the last Sunday.
  const lastDay = new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(year, month1to12 - 1, lastDay)).getUTCDay()
  return lastDay - lastDow
}

/** Parse "21 June 2026" → "2026-06-21T00:00:00.000Z". Returns undefined on fail. */
function parseFormattedDate(s: string | undefined | null): string | undefined {
  if (!s) return undefined
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s.trim())
  if (!m) return undefined
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december']
  const mi = months.indexOf((m[2] ?? '').toLowerCase())
  if (mi < 0) return undefined
  return new Date(Date.UTC(+m[3]!, mi, +m[1]!)).toISOString()
}

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

// taxonomy_id (Drupal term id) → free-form category hint.
// Source: /api/v2/taxonomyInfo?vid=event_category — see SESSION_LOG entry.
const CATEGORY_MAP: Record<string, string> = {
  '323': 'festival',
  '327': 'comedy',
  '328': 'concert',
  '357': 'art',
  '358': 'clubbing',
  '359': 'conference',
  '360': 'culture',
  '361': 'esports',
  '362': 'family',
  '363': 'fundraising',
  '364': 'gastronomy',
  '365': 'pageantry',
  '366': 'performing-arts',
  '367': 'religious',
  '595': 'holiday',
}

// ---------------------------------------------------------------------------
// Types — narrow shape we read from the Drupal payload
// ---------------------------------------------------------------------------
interface DrupalValue { value?: string; end_value?: string }
interface DrupalTarget { target_id?: string }
interface RawEvent {
  title?: DrupalValue[]
  body?: DrupalValue[]
  field_summary?: DrupalValue[]
  uuid?: DrupalValue[]
  url_alias?: string
  start_date?: string
  end_date?: string
  custom_date?: DrupalValue[]
  recur_type?: DrupalValue[]
  field_event_status?: DrupalValue[]
  field_event_category?: DrupalTarget[]
  field_dtp_event_image?: DrupalTarget[]
  field_booking_link?: DrupalValue[]
  field_event_website?: DrupalValue[]
}
