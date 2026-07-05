import { Metadata } from 'next'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Tag } from '@/types'
import { getAllUpcomingCached, SITE_URL } from '@/lib/event-queries'

export const revalidate = 600

const title = 'Browse Events by Category in Malta'
const description =
  'All event categories in Malta and Gozo — music, nightlife, festivals, theatre, family, culture and more. Pick a category to see upcoming events.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/events/tags` },
  openGraph: { title, description, type: 'website', url: '/events/tags' },
}

// Directory hub: internal crawl path into every tag landing page.
export default async function TagsHubPage() {
  const [{ data: tagRows }, events] = await Promise.all([
    supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
    getAllUpcomingCached(),
  ])
  const tags = ((tagRows as Tag[]) || []).filter((t) => t.slug)

  // events.tags stores tag NAMES; count matches in memory.
  const counts = new Map<string, number>()
  for (const e of events) {
    for (const name of e.tags || []) counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand-teal">Home</Link>
        {' / '}
        <Link href="/events" className="hover:text-brand-teal">Events</Link>
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Events by Category</h1>
      <p className="text-gray-600 max-w-3xl mb-8">
        Browse upcoming events in Malta and Gozo by category. You can also browse by{' '}
        <Link href="/events/locations" className="text-brand-teal hover:underline">locality</Link> and{' '}
        <Link href="/venues" className="text-brand-teal hover:underline">venue</Link>.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {tags.map((t) => {
          const count = counts.get(t.name) ?? 0
          return (
            <Link
              key={t.slug}
              href={`/events/tag/${t.slug}`}
              className="bg-white rounded-xl border p-5 hover:border-brand-gold transition-colors"
            >
              <p className="font-semibold text-gray-900">{t.icon ? `${t.icon} ` : ''}{t.name}</p>
              <p className="text-sm text-gray-500">
                {count > 0 ? `${count} ${count === 1 ? 'event' : 'events'}` : 'Browse events'}
              </p>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
