'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import EventCard from './EventCard'

interface Props {
  /** Server-rendered first page — keeps the homepage SEO-friendly. */
  initialEvents: Event[]
  /** Upper bound for date_start, frozen at server render so paging stays stable. */
  afterISO: string
  /** Tag names to filter by (events.tags stores names). Empty/undefined = all. */
  tagNames?: string[]
  /** How many to fetch per scroll batch. */
  pageSize?: number
}

export default function InfiniteEvents({ initialEvents, afterISO, tagNames, pageSize = 12 }: Props) {
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialEvents.length > 0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const seenIds = useRef<Set<number>>(new Set(initialEvents.map((e) => e.id)))

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)

    let query = supabase
      .from('events')
      .select('*')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', afterISO)
      .order('date_start')
      .range(events.length, events.length + pageSize - 1)

    if (tagNames && tagNames.length > 0) {
      query = query.overlaps('tags', tagNames)
    }

    const { data, error } = await query

    if (error || !data) {
      setHasMore(false)
      setLoading(false)
      return
    }

    const fresh = data.filter((e) => !seenIds.current.has(e.id))
    fresh.forEach((e) => seenIds.current.add(e.id))
    setEvents((prev) => [...prev, ...fresh])
    if (data.length < pageSize) setHasMore(false)
    setLoading(false)
  }, [loading, hasMore, events.length, afterISO, tagNames, pageSize])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-10">
          {loading && (
            <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
          )}
        </div>
      )}
    </>
  )
}
