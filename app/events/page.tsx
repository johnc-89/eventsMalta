'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, Category } from '@/types'
import EventCard from '@/components/EventCard'
import CategoryFilter from '@/components/CategoryFilter'
import Link from 'next/link'

type SortOption = 'date_asc' | 'date_desc' | 'newest'
type TicketFilter = 'all' | 'free' | 'paid'

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all')
  const [sort, setSort] = useState<SortOption>('date_asc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .order('display_order')
      .then(({ data }) => setCategories(data || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase
      .from('events')
      .select('*, category:categories(*)')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', new Date().toISOString())

    if (sort === 'date_asc') query = query.order('date_start', { ascending: true })
    else if (sort === 'date_desc') query = query.order('date_start', { ascending: false })
    else query = query.order('created_at', { ascending: false })

    if (selectedCategory) {
      const cat = categories.find((c) => c.slug === selectedCategory)
      if (cat) query = query.eq('category_id', cat.id)
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
  }, [selectedCategory, searchQuery, ticketFilter, sort, categories])

  const hasFilters = selectedCategory || searchQuery || ticketFilter !== 'all'

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Browse Events</h1>
        {!loading && (
          <p className="text-sm text-gray-500 hidden sm:block">
            {events.length} {events.length === 1 ? 'event' : 'events'} found
          </p>
        )}
      </div>

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

      {/* Category + ticket filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 min-w-0">
          <CategoryFilter categories={categories} selected={selectedCategory} onChange={setSelectedCategory} />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {(['all', 'free', 'paid'] as TicketFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTicketFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors capitalize ${
                ticketFilter === f
                  ? 'bg-brand-gold text-brand-dark'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All prices' : f === 'free' ? 'Free' : 'Paid'}
            </button>
          ))}
        </div>
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
              onClick={() => { setSelectedCategory(null); setSearchQuery(''); setTicketFilter('all') }}
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
