'use client'

import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Event, Category } from '@/types'
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
  const monthEnd = new Date(maltaNow.getFullYear(), maltaNow.getMonth() + 1, 0)
  return { from: startOf(new Date(maltaNow)).toISOString(), to: endOf(monthEnd).toISOString() }
}

// --- List-state restore for back-navigation ---------------------------------
// All filters live in the URL query string (?tag=&date=&from=&to=&q=&price=
// &sort=). That's the source of truth, so returning to the list — by the browser
// Back button, the detail page's "Back to events" link, or a shared link — always
// rebuilds the same filtered view. On top of that we keep the last fetched
// results + scroll position in a module variable keyed by that URL, so the
// restore is instant (no refetch flash, scroll preserved). A visit to a
// different URL (e.g. the bare /events navbar link) doesn't match the key and
// starts clean at the top.
type ListCache = {
  key: string
  events: Event[]
  scrollY: number
}

let listCache: ListCache | null = null

const PRICE_VALUES: TicketFilter[] = ['all', 'free', 'paid']
const SORT_VALUES: SortOption[] = ['date_asc', 'date_desc', 'newest']

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface EventsListProps {
  initialEvents?: Event[]
}

export default function EventsPage({ initialEvents = [] }: EventsListProps) {
  return (
    <Suspense fallback={<StaticEventGrid events={initialEvents} />}>
      <EventsPageInner initialEvents={initialEvents} />
    </Suspense>
  )
}

// Under static/ISR rendering, Next bails out of SSR at this Suspense boundary
// (useSearchParams in EventsPageInner), so this fallback IS the crawler-visible
// HTML — it must carry the real event grid, not a spinner.
function StaticEventGrid({ events }: { events: Event[] }) {
  if (events.length === 0) return <div className="h-8" />
  return (
    <>
      <p className="text-sm text-gray-500 mb-4">
        {events.length} {events.length === 1 ? 'event' : 'events'} found
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </>
  )
}

function EventsPageInner({ initialEvents }: { initialEvents: Event[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Initialise every filter from the URL. Accept `?tag=slug` (single) or
  // `?tag=slug1,slug2` (multi) and legacy `?category=`.
  const initialSelected = (searchParams?.get('tag') ?? searchParams?.get('category') ?? '')
    .split(',').filter(Boolean)
  const initialDate = (searchParams?.get('date') ?? null) as DatePreset | null
  const initialFrom = searchParams?.get('from') ?? ''
  const initialTo   = searchParams?.get('to')   ?? ''
  const initialSearch = searchParams?.get('q') ?? ''
  const initialPrice = (PRICE_VALUES as string[]).includes(searchParams?.get('price') ?? '')
    ? (searchParams!.get('price') as TicketFilter)
    : 'all'
  const initialSort = (SORT_VALUES as string[]).includes(searchParams?.get('sort') ?? '')
    ? (searchParams!.get('sort') as SortOption)
    : 'date_asc'

  // Instant restore of results + scroll when the URL matches the cached list
  // (i.e. we're returning to a list we just left). Decided once per mount.
  const urlKey = searchParams?.toString() ?? ''
  const restoreRef = useRef<boolean | null>(null)
  if (restoreRef.current === null) restoreRef.current = listCache?.key === urlKey
  const cached = restoreRef.current ? listCache : null

  // The server page fetched the default (unfiltered) list; adopt it when the
  // URL carries no filters so we don't refetch what's already on screen.
  const seededFromServer = !cached && urlKey === ''

  const [events, setEvents] = useState<Event[]>(cached?.events ?? (seededFromServer ? initialEvents : []))
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialSelected)
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>(initialPrice)
  const [datePreset, setDatePreset] = useState<DatePreset | null>(initialDate)
  const [customFrom, setCustomFrom] = useState(initialFrom)
  const [customTo,   setCustomTo]   = useState(initialTo)
  const [sort, setSort] = useState<SortOption>(initialSort)
  const [loading, setLoading] = useState(!cached && !seededFromServer)

  // Filter signature the current `events` state was fetched for ('' = the
  // default view the server rendered; null = nothing loaded yet). The fetch
  // effect skips when it already matches — which also absorbs the effect
  // re-run that fires when the async tags query resolves.
  const loadedKeyRef = useRef<string | null>(cached ? cached.key : seededFromServer ? '' : null)

  // Serialise the active filters to a query string (stable insertion order).
  const filterParams = new URLSearchParams()
  if (selectedCategories.length) filterParams.set('tag', selectedCategories.join(','))
  if (datePreset) filterParams.set('date', datePreset)
  if (customFrom) filterParams.set('from', customFrom)
  if (customTo) filterParams.set('to', customTo)
  if (searchQuery.trim()) filterParams.set('q', searchQuery.trim())
  if (ticketFilter !== 'all') filterParams.set('price', ticketFilter)
  if (sort !== 'date_asc') filterParams.set('sort', sort)
  const filterKey = filterParams.toString()

  // Mirror the filters into the URL without a navigation, so the browser Back
  // button and the detail page's "Back to events" link both return to this exact
  // filtered view. Also remember it as the list to return to.
  useEffect(() => {
    const url = filterKey ? `/events?${filterKey}` : '/events'
    router.replace(url, { scroll: false })
    try { sessionStorage.setItem('ev:lastList', url) } catch {}
  }, [filterKey, router])

  // Adopt filter changes that arrive via a real navigation — the navbar link to
  // /events, the browser Back button, or a shared link. When the incoming URL
  // already matches our state (our own replaceState echo above, or steady
  // state) there's nothing to do; that guard is what stops the URL round-trip
  // from reverting live typing.
  useEffect(() => {
    const incoming = searchParams?.toString() ?? ''
    if (incoming === filterKey) return
    setSelectedCategories((searchParams?.get('tag') ?? searchParams?.get('category') ?? '').split(',').filter(Boolean))
    setDatePreset((searchParams?.get('date') ?? null) as DatePreset | null)
    setCustomFrom(searchParams?.get('from') ?? '')
    setCustomTo(searchParams?.get('to') ?? '')
    setSearchQuery(searchParams?.get('q') ?? '')
    setTicketFilter((PRICE_VALUES as string[]).includes(searchParams?.get('price') ?? '') ? (searchParams!.get('price') as TicketFilter) : 'all')
    setSort((SORT_VALUES as string[]).includes(searchParams?.get('sort') ?? '') ? (searchParams!.get('sort') as SortOption) : 'date_asc')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Jump to the saved scroll position once the cached results have painted
  // (useLayoutEffect runs before the browser paints, so there's no visible
  // flash). Fresh visits start at the top as usual.
  useIsoLayoutEffect(() => {
    if (cached) window.scrollTo(0, cached.scrollY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the module cache (results + scroll) in sync, keyed by the filter URL.
  useEffect(() => {
    listCache = {
      key: filterKey,
      events,
      scrollY: listCache?.key === filterKey ? listCache.scrollY : window.scrollY,
    }
  }, [filterKey, events])

  // Track scroll position continuously (rAF-throttled) so Back restores it.
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { if (listCache) listCache.scrollY = window.scrollY })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => {
    supabase
      .from('tags')
      .select('*')
      .eq('enabled', true)
      .order('display_order')
      .then(({ data }) => setCategories(data || []))
  }, [])

  useEffect(() => {
    // Already showing exactly this view (server-seeded, cache-restored, or
    // fetched by a previous run) — nothing to do.
    if (loadedKeyRef.current === filterKey) return

    // A tag filter is selected but the tag list (slug→name map) hasn't loaded
    // yet. Running now would map to an empty name list and fetch ALL events
    // unfiltered (a flash of wrong results). Wait for `categories` to arrive —
    // this effect re-runs when it does.
    if (selectedCategories.length > 0 && categories.length === 0) return

    loadedKeyRef.current = filterKey
    setLoading(true)

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
    <div>
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
          aria-label="Sort events"
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
          aria-label="From date"
        />
        <span className="text-gray-400 text-sm">–</span>
        <input
          type="date"
          value={customTo}
          min={customFrom || undefined}
          onChange={(e) => { setCustomTo(e.target.value); setDatePreset(null) }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white"
          aria-label="To date"
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
      {loading && events.length === 0 ? (
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
          <p className="text-sm text-gray-500 mb-4">
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
          <h2 className="text-lg font-semibold text-brand-dark mb-2">
            {hasFilters ? 'No events match your filters' : 'No upcoming events yet'}
          </h2>
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
    </div>
  )
}
