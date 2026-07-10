'use client'

import { useEffect, useRef, useState } from 'react'
import { Event } from '@/types'
import EventCard from '@/components/EventCard'

// In-page date filtering for SEO landing pages (location, category, …). The
// server renders the full, crawlable grid (this component's first client render
// matches it — no `?date` is read during SSG, so no hydration mismatch and no
// useSearchParams CSR bailout). After mount we adopt any `?date`/`?from`/`?to`
// from the URL and narrow the already-fetched events in place, so picking
// "Today" on /events/location/valletta stays on Valletta instead of jumping to
// the global /events/today landing.

type DatePreset = 'today' | 'weekend' | 'week' | 'month'

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This Weekend' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
]

function isPreset(v: string | null): v is DatePreset {
  return v === 'today' || v === 'weekend' || v === 'week' || v === 'month'
}

// Malta-local calendar range for a preset, as ISO timestamps. Mirrors the same
// helper in app/events/EventsList.tsx.
function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  const maltaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Malta' }))

  const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
  const endOf = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

  if (preset === 'today') {
    return { from: startOf(new Date(maltaNow)).toISOString(), to: endOf(new Date(maltaNow)).toISOString() }
  }
  if (preset === 'weekend') {
    const day = maltaNow.getDay()
    const toSat = day === 0 ? -1 : (6 - day)
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
  const monthEnd = new Date(maltaNow.getFullYear(), maltaNow.getMonth() + 1, 0)
  return { from: startOf(new Date(maltaNow)).toISOString(), to: endOf(monthEnd).toISOString() }
}

interface Props {
  events: Event[]
  emptyMessage: string
  // Grid columns at the largest breakpoint (matches the landing_events block's
  // `columns` config). Defaults to 3.
  columns?: 2 | 3
}

export default function LandingDateFilter({ events, emptyMessage, columns = 3 }: Props) {
  const [preset, setPreset] = useState<DatePreset | null>(null)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  // Skip the very first server-matching render, then adopt the URL filter.
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    const p = new URLSearchParams(window.location.search)
    const from = p.get('from') ?? ''
    const to = p.get('to') ?? ''
    if (from || to) { setCustomFrom(from); setCustomTo(to); return }
    const d = p.get('date')
    if (isPreset(d)) setPreset(d)
  }, [])

  // Reflect the active filter in the URL (shallow — no navigation, no refetch),
  // so it's shareable and the browser Back button returns to this view.
  const syncUrl = (next: { preset: DatePreset | null; from: string; to: string }) => {
    const p = new URLSearchParams(window.location.search)
    p.delete('date'); p.delete('from'); p.delete('to')
    if (next.from || next.to) {
      if (next.from) p.set('from', next.from)
      if (next.to) p.set('to', next.to)
    } else if (next.preset) {
      p.set('date', next.preset)
    }
    const qs = p.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
  }

  const pickPreset = (key: DatePreset) => {
    const nextPreset = preset === key ? null : key
    setPreset(nextPreset); setCustomFrom(''); setCustomTo('')
    syncUrl({ preset: nextPreset, from: '', to: '' })
  }

  const setFrom = (v: string) => {
    setCustomFrom(v); setPreset(null)
    syncUrl({ preset: null, from: v, to: customTo })
  }
  const setTo = (v: string) => {
    setCustomTo(v); setPreset(null)
    syncUrl({ preset: null, from: customFrom, to: v })
  }
  const clearCustom = () => {
    setCustomFrom(''); setCustomTo('')
    syncUrl({ preset: null, from: '', to: '' })
  }

  const hasCustom = Boolean(customFrom || customTo)
  const fromISO = hasCustom
    ? (customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : null)
    : preset ? getDateRange(preset).from : null
  const toISO = hasCustom
    ? (customTo ? new Date(customTo + 'T23:59:59').toISOString() : null)
    : preset ? getDateRange(preset).to : null

  const filtered = (fromISO || toISO)
    ? events.filter((e) => {
        if (!e.date_start) return false
        if (fromISO && e.date_start < fromISO) return false
        if (toISO && e.date_start > toISO) return false
        return true
      })
    : events

  const active = Boolean(preset || hasCustom)
  const gridCols = columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
  const inputClass =
    'px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => pickPreset(key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              preset === key
                ? 'bg-brand-gold text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-gold hover:bg-brand-gold/10'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 hidden sm:block" />
        {/* From/dash/to stay one unit — full-width row on mobile so the inputs
            never wrap apart from each other or orphan the dash. */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setFrom(e.target.value)}
            className={`${inputClass} flex-1 min-w-0 sm:flex-none sm:w-36`}
            aria-label="From date"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputClass} flex-1 min-w-0 sm:flex-none sm:w-36`}
            aria-label="To date"
          />
          {hasCustom && (
            <button onClick={clearCustom} className="text-gray-400 hover:text-gray-600 text-sm px-2" aria-label="Clear dates">
              ✕
            </button>
          )}
        </div>
      </div>

      {active && (
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} {filtered.length === 1 ? 'event' : 'events'} found
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-gray-500 py-12 text-center">
          {active ? 'No events match this date range — try a different one.' : emptyMessage}
        </p>
      ) : (
        <div className={`grid grid-cols-1 ${gridCols} gap-6`}>
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
