import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import EventCard from '@/components/EventCard'
import type { Event } from '@/types'

export const revalidate = 600

export async function generateStaticParams() {
  return []
}

interface Props {
  params: { id: string }
}

interface PublicOrganiser {
  id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_verified: boolean
}

// UUID guard so a junk path doesn't reach Postgres as an invalid uuid cast.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchOrganiser(id: string): Promise<PublicOrganiser | null> {
  if (!UUID_RE.test(id)) return null
  const { data } = await supabase.rpc('get_public_organiser', { p_id: id })
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const organiser = await fetchOrganiser(params.id)
  if (!organiser) return { title: 'Organiser Not Found' }
  const name = organiser.display_name || 'Verified organiser'
  const description = organiser.bio?.slice(0, 160) || `Events on Events Malta claimed by ${name}.`
  return {
    title: `${name} — Organiser`,
    description,
    alternates: { canonical: `/organisers/${organiser.id}` },
  }
}

export default async function OrganiserPage({ params }: Props) {
  const organiser = await fetchOrganiser(params.id)
  if (!organiser) notFound()

  const { data: eventsData } = await supabase
    .from('events')
    .select('*')
    .eq('claimed_by', organiser.id)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('date_start', { ascending: true })

  const events = (eventsData ?? []) as Event[]
  const name = organiser.display_name || 'Verified organiser'

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        {organiser.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organiser.avatar_url}
            alt={name}
            className="w-16 h-16 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-16 h-16 rounded-full bg-brand-teal/15 text-brand-teal-dark flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {name[0].toUpperCase()}
          </span>
        )}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">{name}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-teal/10 text-brand-teal-dark">
              Verified
            </span>
          </div>
          {organiser.bio && (
            <p className="text-gray-600 mt-1 whitespace-pre-wrap">{organiser.bio}</p>
          )}
        </div>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-4">Events</h2>
      {events.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <p className="text-gray-500">
          {name} hasn't claimed any upcoming events yet.{' '}
          <Link href="/events" className="text-brand-teal-dark hover:text-brand-teal underline">
            Browse all events
          </Link>
          .
        </p>
      )}
    </main>
  )
}
