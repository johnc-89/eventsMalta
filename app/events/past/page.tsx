import { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import EventCard from '@/components/EventCard'
import EventDisclaimer from '@/components/EventDisclaimer'
import type { Event } from '@/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Past Events',
  description: 'Browse the archive of events that took place across Malta and Gozo.',
}

const PAGE_SIZE = 30

export default async function PastEventsPage({ searchParams }: { searchParams?: { page?: string } }) {
  const pageNum  = Math.max(1, parseInt(searchParams?.page ?? '1') || 1)
  const from     = (pageNum - 1) * PAGE_SIZE
  const to       = from + PAGE_SIZE - 1
  const nowIso   = new Date().toISOString()

  const { data, count } = await supabase
    .from('events')
    .select('*, category:categories(*)', { count: 'exact' })
    .eq('status', 'approved')
    .is('deleted_at', null)
    .lt('date_start', nowIso)
    .order('date_start', { ascending: false })
    .range(from, to)

  const events = (data as Event[] | null) ?? []
  const total  = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-heading font-bold text-brand-dark">Past Events</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total > 0
              ? `${total} event${total === 1 ? '' : 's'} that have already taken place.`
              : 'Nothing here yet — once events finish, they\'ll appear here.'}
          </p>
        </div>
        <Link href="/events" className="text-sm text-brand-cyan hover:text-brand-teal font-medium">
          ← Back to upcoming events
        </Link>
      </div>

      <EventDisclaimer variant="card" className="mb-6" />

      {events.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-90">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <span className="absolute top-3 left-3 z-10 bg-gray-700/85 text-white text-xs font-medium px-2 py-1 rounded">
                  Past
                </span>
                <EventCard event={event} />
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 mt-10" aria-label="Pagination">
              {pageNum > 1 && (
                <Link
                  href={`/events/past?page=${pageNum - 1}`}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                >← Newer</Link>
              )}
              <span className="text-sm text-gray-500 px-2">Page {pageNum} of {totalPages}</span>
              {pageNum < totalPages && (
                <Link
                  href={`/events/past?page=${pageNum + 1}`}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                >Older →</Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border">
          <p className="text-4xl mb-4">📅</p>
          <h3 className="text-lg font-semibold text-brand-dark mb-2">No past events yet</h3>
          <p className="text-gray-500 text-sm">As soon as events finish, they'll start appearing in this archive.</p>
          <Link
            href="/events"
            className="inline-block mt-6 theme-accent-bg px-6 py-2.5 rounded-lg font-medium text-sm hover:opacity-90"
          >
            Browse upcoming events
          </Link>
        </div>
      )}
    </main>
  )
}
