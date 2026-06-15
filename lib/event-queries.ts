import { supabase } from '@/lib/supabase'
import { Event } from '@/types'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
export const MALTA_TZ = 'Europe/Malta'

export type TimePreset = 'today' | 'weekend' | 'week' | 'month'

// Compute a [from, to] ISO range for a time preset, anchored to the current
// wall-clock day in Malta. Used by the server-rendered landing pages so the
// SEO copy and the listed events agree on "this weekend" etc.
export function getDateRange(preset: TimePreset): { from: string; to: string } {
  const now = new Date()
  const maltaNow = new Date(now.toLocaleString('en-US', { timeZone: MALTA_TZ }))

  const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
  const endOf = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

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
  const monthStart = new Date(maltaNow.getFullYear(), maltaNow.getMonth(), 1)
  const monthEnd = new Date(maltaNow.getFullYear(), maltaNow.getMonth() + 1, 0)
  return { from: startOf(monthStart).toISOString(), to: endOf(monthEnd).toISOString() }
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

export function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}
