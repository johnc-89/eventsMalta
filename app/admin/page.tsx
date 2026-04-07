'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Event } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [pendingEvents, setPendingEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectingId, setRejectingId] = useState<number | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || profile?.role !== 'admin') {
      router.push('/')
      return
    }
    fetchPending()
  }, [user, profile, authLoading])

  async function fetchPending() {
    const { data, error } = await supabase
      .from('events')
      .select('*, category:categories(*), organizer:profiles!events_organizer_id_fkey(display_name, email)')
      .eq('status', 'pending_review')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    setPendingEvents(data || [])
    setLoading(false)
  }

  async function approveEvent(eventId: number) {
    setActionLoading(eventId)
    await supabase
      .from('events')
      .update({ status: 'approved' })
      .eq('id', eventId)
    setPendingEvents((prev) => prev.filter((e) => e.id !== eventId))
    setActionLoading(null)
  }

  async function rejectEvent(eventId: number) {
    if (!rejectionReason.trim()) return
    setActionLoading(eventId)
    await supabase
      .from('events')
      .update({ status: 'rejected', rejection_reason: rejectionReason })
      .eq('id', eventId)
    setPendingEvents((prev) => prev.filter((e) => e.id !== eventId))
    setRejectingId(null)
    setRejectionReason('')
    setActionLoading(null)
  }

  if (authLoading || loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" /></div>
  }

  if (profile?.role !== 'admin') return null

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        <Link
          href="/admin/users"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Manage Users
        </Link>
      </div>
      <p className="text-gray-500 mb-8">Review and manage submitted events.</p>

      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Pending Review ({pendingEvents.length})
      </h2>

      {pendingEvents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No events waiting for review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingEvents.map((event) => (
            <div key={event.id} className="bg-white rounded-xl border p-6">
              <div className="flex justify-between items-start gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{event.title}</h3>
                  <p className="text-sm text-gray-500">
                    by {event.organizer?.display_name || event.organizer?.email || 'Unknown'} — {new Date(event.created_at).toLocaleDateString('en-GB')}
                  </p>
                  {event.category && (
                    <span className="text-xs text-gray-500">{event.category.icon} {event.category.name}</span>
                  )}
                </div>
                {event.image_url && (
                  <img src={event.image_url} alt="" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
                )}
              </div>

              {event.short_description && (
                <p className="text-gray-600 text-sm mb-2">{event.short_description}</p>
              )}
              {event.description && (
                <p className="text-gray-500 text-sm mb-4 line-clamp-3">{event.description}</p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                <div>
                  <span className="text-gray-400">When</span>
                  <p className="text-gray-700">
                    {new Date(event.date_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                {event.location_name && (
                  <div>
                    <span className="text-gray-400">Where</span>
                    <p className="text-gray-700">{event.location_name}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-400">Ticket</span>
                  <p className="text-gray-700">{event.ticket_type}</p>
                </div>
                {event.min_age && (
                  <div>
                    <span className="text-gray-400">Age</span>
                    <p className="text-gray-700">{event.min_age}+</p>
                  </div>
                )}
              </div>

              {rejectingId === event.id ? (
                <div className="space-y-3">
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Reason for rejection (visible to organiser)..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => rejectEvent(event.id)}
                      disabled={!rejectionReason.trim() || actionLoading === event.id}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectionReason('') }}
                      className="text-gray-600 hover:text-gray-800 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => approveEvent(event.id)}
                    disabled={actionLoading === event.id}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    {actionLoading === event.id ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setRejectingId(event.id)}
                    className="bg-white border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
