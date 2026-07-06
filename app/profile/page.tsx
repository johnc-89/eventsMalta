'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Event } from '@/types'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const MALTA_TZ = 'Europe/Malta'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Live',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

function isExpired(event: Event): boolean {
  const expiresAt = event.date_end ? new Date(event.date_end) : new Date(event.date_start)
  return expiresAt.getTime() < Date.now()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: MALTA_TZ,
  })
}

function ProfileContent() {
  const { user, profile, loading: authLoading } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const justSubmitted = searchParams.get('submitted') === 'true'
  const justUpdated   = searchParams.get('updated')   === 'true'

  useEffect(() => {
    if (!user) return
    supabase
      .from('events')
      .select('*')
      .eq('organizer_id', user.id)
      .is('deleted_at', null)
      .order('date_start', { ascending: false })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [user])

  const { upcoming, past } = useMemo(() => {
    const upcoming: Event[] = []
    const past: Event[] = []
    for (const e of events) {
      if (isExpired(e)) past.push(e)
      else upcoming.push(e)
    }
    // upcoming should be soonest first
    upcoming.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())
    return { upcoming, past }
  }, [events])

  if (authLoading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }

  if (!user || !profile) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-heading font-bold text-brand-dark mb-4">Log in to view your profile</h1>
        <Link href="/login" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-medium">Log In</Link>
      </main>
    )
  }

  const renderRow = (event: Event, opts: { editable: boolean }) => {
    const past = isExpired(event)
    return (
      <div key={event.id} className={`bg-white rounded-lg border p-4 flex items-center justify-between gap-4 ${past ? 'opacity-80' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[event.status]}`}>
              {statusLabels[event.status]}
            </span>
            {past && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-700/85 text-white">Past</span>
            )}
            {event.tags && event.tags.length > 0 && (
              <span className="text-xs text-gray-500">{event.tags[0]}</span>
            )}
          </div>
          <h3 className="font-medium text-gray-900 truncate">{event.title}</h3>
          <p className="text-sm text-gray-500">{formatDate(event.date_start)}</p>
          {event.status === 'rejected' && event.rejection_reason && (
            <p className="text-sm text-red-600 mt-1">Reason: {event.rejection_reason}</p>
          )}
        </div>
        <div className="flex gap-3 flex-shrink-0 items-center">
          {event.status === 'approved' && (
            <Link href={`/events/${event.slug}`} className="text-sm text-brand-teal-dark hover:text-brand-teal font-medium">
              View
            </Link>
          )}
          {opts.editable && event.status !== 'cancelled' && (
            <Link
              href={`/events/${event.slug}/edit`}
              className="text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-lg font-medium"
            >
              Edit
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {justSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium">Event submitted! It will appear on the site once approved by an admin.</p>
        </div>
      )}
      {justUpdated && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium">Event updated.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-brand-gold/15 text-brand-gold rounded-full flex items-center justify-center text-2xl font-bold">
            {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-dark">{profile.display_name || 'User'}</h1>
            <p className="text-gray-500">{profile.email}</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              profile.role === 'super_admin' ? 'bg-brand-burgundy/10 text-brand-burgundy'
              : profile.role === 'admin' ? 'bg-brand-gold/20 text-brand-dark'
              : profile.role === 'trusted_uploader' ? 'bg-brand-teal/15 text-brand-teal-dark'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {profile.role === 'super_admin' ? 'Super Admin'
                : profile.role === 'admin' ? 'Admin'
                : profile.role === 'trusted_uploader' ? 'Trusted Uploader'
                : 'Member'}
            </span>
          </div>
        </div>
      </div>

      {/* My Events header + Add */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-heading font-bold text-brand-dark">My Events</h2>
          <p className="text-sm text-gray-500">
            {events.length === 0 ? 'You haven\'t posted any events yet.' :
             `${upcoming.length} upcoming · ${past.length} past`}
          </p>
        </div>
        <Link
          href="/events/create"
          className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + New Event
        </Link>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-lg border h-24" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-4xl mb-4">🎪</p>
          <h3 className="text-lg font-semibold text-brand-dark mb-2">No events yet</h3>
          <p className="text-gray-500 text-sm mb-6">Share what's happening in Malta — post your first event.</p>
          <Link href="/events/create" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
            Post your first event
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Upcoming */}
          <section>
            <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Upcoming &amp; active ({upcoming.length})
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 italic bg-white rounded-lg border p-4">
                Nothing upcoming. <Link href="/events/create" className="text-brand-teal-dark hover:text-brand-teal">Post a new event →</Link>
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((e) => renderRow(e, { editable: true }))}
              </div>
            )}
          </section>

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h3 className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-3">
                Past ({past.length})
              </h3>
              <p className="text-xs text-gray-400 italic mb-3">Past events are read-only and stay in the public archive at <Link href="/events/past" className="text-brand-teal-dark hover:text-brand-teal">/events/past</Link>.</p>
              <div className="space-y-3">
                {past.map((e) => renderRow(e, { editable: false }))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>}>
      <ProfileContent />
    </Suspense>
  )
}
