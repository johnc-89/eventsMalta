'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Event, Tag } from '@/types'
import EventCard from '@/components/EventCard'
import CategoryFilter from '@/components/CategoryFilter'
import EventDisclaimer from '@/components/EventDisclaimer'
import Link from 'next/link'

type SortOption = 'date_asc' | 'date_desc' | 'newest'
type TicketFilter = 'all' | 'free' | 'paid'
type DatePreset = 'today' | 'weekend' | 'week' | 'month'

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  const maltaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Malta' }))

  const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
  const endOf   = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

  if (preset === 'today') {
    return { from: startOf(maltaNow).toISOString(), to: endOf(new Date(maltaNow)).toISOString() }
  }

  if (preset === 'weekend') {
    const day = maltaNow.getDay() // 0=Sun,6=Sat
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

  // month
  const monthStart = new Date(maltaNow.getFullYear(), maltaNow.getMonth(), 1)
  const monthEnd   = new Date(maltaNow.getFullYear(), maltaNow.getMonth() + 1, 0)
  return { from: startOf(monthStart).toISOString(), to: endOf(monthEnd).toISOString() }
}

export default function EventsPage() {
  return (
    <Suspense fallback={<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div className="h-8" /></main>}>
      <EventsPageInner />
    </Suspense>
  )
}

function EventsPageInner() {
  const searchParams = useSearchParams()
  // Accept `?tag=slug` (single) or `?tag=slug1,slug2` (multi) and legacy `?category=`.
  const initialSelected = (searchParams?.get('tag') ?? searchParams?.get('category') ?? '')
    .split(',').filter(Boolean)
  const initialDate = (searchParams?.get('date') ?? null) as DatePreset | null
  const initialFrom = searchParams?.get('from') ?? ''
  const initialTo   = searchParams?.get('to')   ?? ''

  const [events, setEvents] = useState<Event[]>([])
  const [categories, setCategories] = useState<Tag[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialSelected)
  const [searchQuery, setSearchQuery] = useState('')
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all')
  const [datePreset, setDatePreset] = useState<DatePreset | null>(initialDate)
  const [customFrom, setCustomFrom] = useState(initialFrom)
  const [customTo,   setCustomTo]   = useState(initialTo)
  const [sort, setSort] = useState<SortOption>('date_asc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tags')
      .select('*')
      .eq('enabled', true)
      .order('display_order')
      .then(({ data }) => setCategories(data || []))
  }, [])

  useEffect(() => {
    setLoading(true)

    // A tag filter is selected but the tag list (slug→name map) hasn't loaded
    // yet. Running now would map to an empty name list and fetch ALL events
    // unfiltered (a flash of wrong results). Wait for `categories` to arrive —
    // this effect re-runs when it does.
    if (selectedCategories.length > 0 && categories.length === 0) return

    // Custom range takes priority over preset; both are optional.
    const hasCustom = customFrom || customTo
    const presetRange = !hasCustom && datePreset ? getDateRange(datePreset) : null
    const fromISO = hasCustom && customFrom
      ? new Date(customFrom + 'T00:00:00').toISOString()
      : presetRange ? presetRange.from : new Date().toISOString()
    const toISO = hasCustom && customTo
      ? new Date(customTo + 'T23:59:59').toISOString()
      : presetRange ? presetRange.to : null

    let query = supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', fromISO)

    if (toISO) query = query.lte('date_start', toISO)

    if (sort === 'date_asc') query = query.order('date_start', { ascending: true })
    else if (sort === 'date_desc') query = query.order('date_start', { ascending: false })
    else query = query.order('created_at', { ascending: false })

    if (selectedCategories.length > 0) {
      // Map slugs → names (tags stored on events as an array of names).
      // overlaps = event has ANY of the selected tags.
      const tagNames = selectedCategories
        .map((slug) => categories.find((c) => c.slug === slug)?.name)
        .filter((n): n is string => !!n)
      if (tagNames.length > 0) query = query.overlaps('tags', tagNames)
    }

    if (ticketFilter === 'free') query = query.eq('ticket_type', 'free')
    else if (ticketFilter === 'paid') query = query.neq('ticket_type', 'free')

    if (searchQuery.trim()) {
      query = query.or(`title.ilike.%${searchQuery.trim()}%,short_description.ilike.%${searchQuery.trim()}%`)
    }

    query.then(({ data }) => {
      setEvents(data || [])
      setLoading(false)
    })
  }, [selectedCategories, searchQuery, ticketFilter, datePreset, customFrom, customTo, sort, categories])

  const hasFilters = selectedCategories.length > 0 || searchQuery || ticketFilter !== 'all' || datePreset || customFrom || customTo

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Browse Events</h1>
        <div className="flex items-center gap-4">
          {!loading && (
            <p className="text-sm text-gray-500 hidden sm:block">
              {events.length} {events.length === 1 ? 'event' : 'events'} found
            </p>
          )}
          <Link href="/events/past" className="text-sm text-brand-cyan hover:text-brand-teal font-medium">
            View past events →
          </Link>
        </div>
      </div>
      <EventDisclaimer variant="card" className="mb-6" />

      {/* Search + Sort row */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none transition-all"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="px-3 py-3 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white"
        >
          <option value="date_asc">Soonest first</option>
          <option value="date_desc">Latest first</option>
          <option value="newest">Newly added</option>
        </select>
      </div>

      {/* Category filter — full width */}
      <div className="mb-4">
        <CategoryFilter categories={categories} selected={selectedCategories} onChange={setSelectedCategories} />
      </div>

      {/* Date chips · date range · ticket filter — all on one row */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {([
          { key: 'today',   label: 'Today' },
          { key: 'weekend', label: 'This Weekend' },
          { key: 'week',    label: 'This Week' },
          { key: 'month',   label: 'This Month' },
        ] as { key: DatePreset; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setDatePreset(datePreset === key ? null : key); setCustomFrom(''); setCustomTo('') }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              datePreset === key
                ? 'bg-brand-gold text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-gold hover:bg-brand-gold/10'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 hidden sm:block" />
        <input
          type="date"
          value={customFrom}
          onChange={(e) => { setCustomFrom(e.target.value); setDatePreset(null) }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white"
        />
        <span className="text-gray-400 text-sm">–</span>
        <input
          type="date"
          value={customTo}
          min={customFrom || undefined}
          onChange={(e) => { setCustomTo(e.target.value); setDatePreset(null) }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white"
        />
        {(customFrom || customTo) && (
          <button
            onClick={() => { setCustomFrom(''); setCustomTo('') }}
            className="text-gray-400 hover:text-gray-600 text-sm px-2"
          >
            ✕
          </button>
        )}
        <div className="w-px h-6 bg-gray-200 hidden sm:block" />
        {(['all', 'free', 'paid'] as TicketFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTicketFilter(f)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              ticketFilter === f
                ? 'bg-brand-gold text-brand-dark'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-gold hover:bg-brand-gold/10'
            }`}
          >
            {f === 'all' ? 'All prices' : f === 'free' ? 'Free' : 'Paid'}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl border h-80 animate-pulse">
              <div className="h-48 bg-gray-200 rounded-t-xl" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length > 0 ? (
        <>
          <p className="text-sm text-gray-500 mb-4 sm:hidden">
            {events.length} {events.length === 1 ? 'event' : 'events'} found
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border">
          <p className="text-4xl mb-4">🔍</p>
          <h3 className="text-lg font-semibold text-brand-dark mb-2">
            {hasFilters ? 'No events match your filters' : 'No upcoming events yet'}
          </h3>
          <p className="text-gray-500 text-sm mb-6">
            {hasFilters
              ? 'Try adjusting your search or clearing the filters below.'
              : 'Be the first to post an event in Malta!'}
          </p>
          {hasFilters ? (
            <button
              onClick={() => { setSelectedCategories([]); setSearchQuery(''); setTicketFilter('all'); setDatePreset(null); setCustomFrom(''); setCustomTo('') }}
              className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-medium text-sm transition-colors"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/events/create"
              className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-medium text-sm transition-colors inline-block"
            >
              Post an Event
            </Link>
          )}
        </div>
      )}
    </main>
  )
}
