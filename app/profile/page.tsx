'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Event } from '@/types'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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

function ProfileContent() {
  const { user, profile, loading: authLoading } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const justSubmitted = searchParams.get('submitted') === 'true'

  useEffect(() => {
    if (!user) return
    supabase
      .from('events')
      .select('*, category:categories(*)')
      .eq('organizer_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEvents(data || [])
        setLoading(false)
      })
  }, [user])

  if (authLoading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
  }

  if (!user || !profile) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Log in to view your profile</h1>
        <Link href="/login" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium">
          Log In
        </Link>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {justSubmitted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800 font-medium">Event submitted! It will appear on the site once approved by an admin.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold">
            {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{profile.display_name || 'User'}</h1>
            <p className="text-gray-500">{profile.email}</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
              profile.role === 'admin' ? 'bg-purple-100 text-purple-700'
              : profile.role === 'trusted_uploader' ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600'
            }`}>
              {profile.role === 'admin' ? 'Admin' : profile.role === 'trusted_uploader' ? 'Trusted Uploader' : 'Member'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">My Events</h2>
        <Link
          href="/events/create"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + New Event
        </Link>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border h-24" />
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="bg-white rounded-lg border p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[event.status]}`}>
                    {statusLabels[event.status]}
                  </span>
                  {event.category && (
                    <span className="text-xs text-gray-500">{event.category.icon} {event.category.name}</span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 truncate">{event.title}</h3>
                <p className="text-sm text-gray-500">
                  {new Date(event.date_start).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </p>
                {event.status === 'rejected' && event.rejection_reason && (
                  <p className="text-sm text-red-600 mt-1">Reason: {event.rejection_reason}</p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {event.status === 'approved' && (
                  <Link href={`/events/${event.slug}`} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                    View
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500 mb-4">You haven't posted any events yet.</p>
          <Link href="/events/create" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Post your first event
          </Link>
        </div>
      )}
    </main>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>}>
      <ProfileContent />
    </Suspense>
  )
}
