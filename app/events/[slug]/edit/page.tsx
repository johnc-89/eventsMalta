'use client'

// Edit page: visible only to the event's organiser, admins, or super_admins.
// Past events (date_start in the past) are not editable — we show a notice
// directing the user to the public event page.

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import EventForm from '@/components/EventForm'
import type { Event } from '@/types'

export default function EditEventPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [notFoundFlag, setNotFound] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace(`/login?next=/events/${slug}/edit`)
      return
    }
    if (!slug) return
    supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()
      .then(({ data }) => {
        if (!data) { setNotFound(true); setLoading(false); return }
        const isOwner = data.organizer_id === user.id
        const isStaff = profile?.role === 'admin' || profile?.role === 'super_admin'
        if (!isOwner && !isStaff) { setForbidden(true); setLoading(false); return }
        setEvent(data as Event)
        setLoading(false)
      })
  }, [authLoading, user, profile, slug, router])

  if (authLoading || loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }

  if (notFoundFlag) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-dark mb-3">Event not found</h1>
        <p className="text-gray-500 mb-6">It may have been deleted or the link is wrong.</p>
        <Link href="/my-events" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-semibold">Back to My Events</Link>
      </main>
    )
  }

  if (forbidden) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-dark mb-3">You can't edit this event</h1>
        <p className="text-gray-500 mb-6">Only the organiser, an admin, or a super-admin can edit it.</p>
        <Link href={`/events/${slug}`} className="text-brand-teal-dark hover:text-brand-teal">View the event →</Link>
      </main>
    )
  }

  if (!event) return null

  // Past-event guard. Admins/super-admins are still allowed to edit because
  // they may need to correct historical records.
  const startsAt = new Date(event.date_start)
  const endsAt   = event.date_end ? new Date(event.date_end) : null
  const expiresAt = endsAt ?? startsAt
  const isExpired = expiresAt.getTime() < Date.now()
  const isStaff = profile?.role === 'admin' || profile?.role === 'super_admin'

  if (isExpired && !isStaff) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">📅</div>
        <h1 className="text-2xl font-bold text-brand-dark mb-3">This event has already finished</h1>
        <p className="text-gray-500 mb-2">Past events can't be edited.</p>
        <p className="text-gray-500 mb-6">If something's wrong with the listing, contact us at admin@eventsmalta.org.</p>
        <Link href={`/events/${event.slug}`} className="bg-white border border-brand-dark text-brand-dark hover:bg-brand-dark hover:text-white px-5 py-2.5 rounded-lg font-medium mr-2">View event</Link>
        <Link href="/profile" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-5 py-2.5 rounded-lg font-semibold">Back to My Events</Link>
      </main>
    )
  }

  if (event.status === 'cancelled') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-dark mb-3">This event is cancelled</h1>
        <p className="text-gray-500 mb-6">Cancelled events can't be edited.</p>
        <Link href="/my-events" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-semibold">Back to My Events</Link>
      </main>
    )
  }

  return <EventForm mode="edit" initialEvent={event} />
}
