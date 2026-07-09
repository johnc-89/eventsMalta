// Server-only module: the cache() wrappers below rely on React's request-scoped
// memoization, which only exists during server rendering.
import { cache } from 'react'
import { supabase } from '@/lib/supabase'
import { Event } from '@/types'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
export const MALTA_TZ = 'Europe/Malta'

export type TimePreset = 'today' | 'weekend' | 'week' | 'month'

const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
const endOf = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

// Compute a [from, to] ISO range for a time preset, anchored to the current
// wall-clock day in Malta. Used by the server-rendered landing pages so the
// SEO copy and the listed events agree on "this weekend" etc.
export function getDateRange(preset: TimePreset): { from: string; to: string } {
  const now = new Date()
  const maltaNow = new Date(now.toLocaleString('en-US', { timeZone: MALTA_TZ }))

  if (preset === 'today') {
    return { from: startOf(new Date(maltaNow)).toISOString(), to: endOf(new Date(maltaNow)).toISOString() }
  }

  if (preset === 'weekend') {
    const day = maltaNow.getDay() // 0=Sun,6=Sat
    const toSat = day === 0 ? -1 : 6 - day
    const sat = new Date(maltaNow); sat.setDate(maltaNow.getDate() + toSat)
    const sun = new Date(sat); sun.setDate(sat.getDate() + (day === 0 ? 0 : 1))
    return { from: startOf(sat).toISOString(), to: endOf(sun).toISOString() }
  }

  if (preset === 'week') {
    const day = maltaNow.getDay()
    const toMon = day === 0 ? -6 : 1 - day
    const mon = new Date(maltaNow); mon.setDate(maltaNow.getDate() + toMon)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: startOf(mon).toISOString(), to: endOf(sun).toISOString() }
  }

  // month
  const monthEnd = new Date(maltaNow.getFullYear(), maltaNow.getMonth() + 1, 0)
  return { from: startOf(new Date(maltaNow)).toISOString(), to: endOf(monthEnd).toISOString() }
}

// Range for the NEXT occurrence of a calendar month (0–11) in Malta wall-clock
// time: in July, October → Oct this year, March → Mar next year. The current
// month starts today (not the 1st) so every listed event is still upcoming.
// Used by the evergreen /events/<month> landing pages.
export function getMonthRange(monthIndex: number): { from: string; to: string; year: number; isCurrentMonth: boolean } {
  const maltaNow = new Date(new Date().toLocaleString('en-US', { timeZone: MALTA_TZ }))
  const isCurrentMonth = monthIndex === maltaNow.getMonth()
  const year = monthIndex >= maltaNow.getMonth() ? maltaNow.getFullYear() : maltaNow.getFullYear() + 1
  const start = isCurrentMonth ? new Date(maltaNow) : new Date(year, monthIndex, 1)
  const end = new Date(year, monthIndex + 1, 0)
  return { from: startOf(start).toISOString(), to: endOf(end).toISOString(), year, isCurrentMonth }
}

interface FetchOpts {
  tagNames?: string[]
  from?: string
  to?: string
  limit?: number
}

// Approved, non-deleted, upcoming events. Shared by all landing pages.
export async function fetchLandingEvents({ tagNames, from, to, limit = 60 }: FetchOpts = {}): Promise<Event[]> {
  let query = supabase
    .from('events')
    .select('*')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('date_start', from ?? new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(limit)

  if (to) query = query.lte('date_start', to)
  if (tagNames && tagNames.length > 0) query = query.overlaps('tags', tagNames)

  const { data } = await query
  return (data as Event[]) || []
}

// Upcoming events related to a given one — prefers shared tags, then tops up
// with any upcoming events so the module is never empty. Excludes the event
// itself. Used to keep expired event pages from becoming dead ends.
export async function fetchRelatedEvents(opts: {
  excludeId: number
  tagNames?: string[] | null
  limit?: number
}): Promise<Event[]> {
  const { excludeId, tagNames, limit = 6 } = opts
  const nowIso = new Date().toISOString()
  const collected = new Map<number, Event>()

  if (tagNames && tagNames.length > 0) {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', nowIso)
      .overlaps('tags', tagNames)
      .neq('id', excludeId)
      .order('date_start', { ascending: true })
      .limit(limit)
    for (const e of (data as Event[]) || []) collected.set(e.id, e)
  }

  if (collected.size < limit) {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', nowIso)
      .neq('id', excludeId)
      .order('date_start', { ascending: true })
      .limit(limit)
    for (const e of (data as Event[]) || []) {
      if (collected.size >= limit) break
      if (!collected.has(e.id)) collected.set(e.id, e)
    }
  }

  return Array.from(collected.values()).slice(0, limit)
}

// All upcoming approved events (for locality grouping / filtering). Higher
// limit than the paginated list since we partition these in memory.
export async function fetchAllUpcoming(limit = 500): Promise<Event[]> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(limit)
  return (data as Event[]) || []
}

// "July 2026" in Malta time — injected into landing-page titles so they match
// dated queries ("events in valletta july 2026") and read fresh in the SERP.
export function currentMonthYearLabel(): string {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: MALTA_TZ })
}

// Request-scoped memoization so generateMetadata and the page body share one
// fetch (both need the events: counts go in the <title>, cards in the body).
// Next's built-in fetch dedupe can't help — the query URLs embed
// new Date().toISOString(), so the two calls never match. Args are primitives
// because cache() keys by argument identity.
export const getAllUpcomingCached = cache(() => fetchAllUpcoming())
export const getLandingEventsCached = cache((from?: string, to?: string, tagName?: string) =>
  fetchLandingEvents({ from, to, tagNames: tagName ? [tagName] : undefined })
)

// ItemList structured data so Google can render the listing as a rich result.
export function itemListJsonLd(events: Event[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: events.slice(0, 30).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/events/${e.slug}`,
      name: e.title,
    })),
  }
}

// BreadcrumbList structured data for a landing page. `leaf.path` is the page's
// canonical path (e.g. '/events/tag/music'); the trail is Home > Events > leaf,
// mirroring the visible breadcrumb on EventLanding.
export function landingBreadcrumbJsonLd(leaf: { name: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Events', item: `${SITE_URL}/events` },
      { '@type': 'ListItem', position: 3, name: leaf.name, item: `${SITE_URL}${leaf.path}` },
    ],
  }
}

export function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
