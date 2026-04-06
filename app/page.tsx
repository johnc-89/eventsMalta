import { supabase } from '@/lib/supabase'
import EventCard from '@/components/EventCard'
import Link from 'next/link'

export const revalidate = 60 // refresh cached data every 60 seconds

export default async function Home() {
  const { data: featuredEvents } = await supabase
    .from('events')
    .select('*, category:categories(*)')
    .eq('status', 'approved')
    .eq('is_featured', true)
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(3)

  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('*, category:categories(*)')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .limit(6)

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('display_order', { ascending: true })

  return (
    <main>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
            Discover Events in Malta
          </h1>
          <p className="text-lg sm:text-xl text-indigo-200 mb-8 max-w-2xl mx-auto">
            Parties, comedy gigs, concerts, festivals and more — find your next night out or day event across Malta and Gozo.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/events"
              className="bg-white text-indigo-700 px-8 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors"
            >
              Browse Events
            </Link>
            <Link
              href="/events/create"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Post Your Event
            </Link>
          </div>
        </div>
      </section>

      {/* Category Pills */}
      {categories && categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
          <div className="bg-white rounded-xl shadow-sm border p-4 flex gap-3 overflow-x-auto">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/events?category=${cat.slug}`}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 text-sm font-medium text-gray-700 transition-colors"
              >
                <span>{cat.icon}</span>
                {cat.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Events */}
      {featuredEvents && featuredEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Events</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Upcoming Events</h2>
          <Link href="/events" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
            View all →
          </Link>
        </div>
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border">
            <p className="text-gray-500 text-lg mb-4">No upcoming events yet.</p>
            <Link
              href="/events/create"
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Be the first to post!
            </Link>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">Events Malta — Discover what's happening on the island.</p>
            <div className="flex gap-6 text-sm text-gray-500">
              <Link href="/events" className="hover:text-gray-700">Browse</Link>
              <Link href="/events/create" className="hover:text-gray-700">Post Event</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
