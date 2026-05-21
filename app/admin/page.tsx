'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Event, Tag } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [pendingEvents, setPendingEvents] = useState<Event[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editState, setEditState] = useState<{
    title: string
    description: string
    image_url: string
    tags: string[]
  } | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      router.push('/')
      return
    }
    fetchData()
  }, [user, profile, authLoading])

  async function fetchData() {
    const [eventsRes, tagsRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, category:categories(*), organizer:profiles!events_organizer_id_fkey(display_name)')
        .eq('status', 'pending_review')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('tags').select('*').order('display_order'),
    ])
    setPendingEvents(eventsRes.data || [])
    setAllTags(tagsRes.data || [])
    setLoading(false)
  }

  async function approveEvent(eventId: number) {
    setActionLoading(eventId)
    await supabase.from('events').update({ status: 'approved' }).eq('id', eventId)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: 'event_approved', eventId }),
      })
    }
    setPendingEvents((prev) => prev.filter((e) => e.id !== eventId))
    setActionLoading(null)
  }

  async function rejectEvent(eventId: number) {
    if (!rejectionReason.trim()) return
    setActionLoading(eventId)
    await supabase.from('events').update({ status: 'rejected', rejection_reason: rejectionReason }).eq('id', eventId)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: 'event_rejected', eventId, reason: rejectionReason }),
      })
    }
    setPendingEvents((prev) => prev.filter((e) => e.id !== eventId))
    setRejectingId(null)
    setRejectionReason('')
    setActionLoading(null)
  }

  function startEditing(event: Event) {
    setEditingId(event.id)
    setEditState({
      title: event.title,
      description: event.description || '',
      image_url: event.image_url || '',
      tags: event.tags || [],
    })
  }

  async function saveEdits(eventId: number) {
    if (!editState) return
    setActionLoading(eventId)
    await supabase.from('events').update({
      title: editState.title,
      description: editState.description || null,
      image_url: editState.image_url || null,
      tags: editState.tags.length > 0 ? editState.tags : null,
      manual_edit_at: new Date().toISOString(),
    }).eq('id', eventId)

    setPendingEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, ...editState }
          : e
      )
    )
    setEditingId(null)
    setEditState(null)
    setActionLoading(null)
  }

  function cancelEdits() {
    setEditingId(null)
    setEditState(null)
  }

  function toggleTag(tagName: string) {
    if (!editState) return
    setEditState((prev) => {
      if (!prev) return prev
      const tags = prev.tags.includes(tagName)
        ? prev.tags.filter((t) => t !== tagName)
        : [...prev.tags, tagName]
      return { ...prev, tags }
    })
  }

  if (authLoading || loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/analytics"
            className="bg-white border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Analytics
          </Link>
          <Link
            href="/admin/guide"
            className="bg-white border border-brand-gold/40 text-brand-dark hover:bg-brand-gold/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Cheat Sheet
          </Link>
          <Link
            href="/admin/tags"
            className="bg-white border border-brand-teal/30 text-brand-teal hover:bg-brand-teal/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage Tags
          </Link>
          <Link
            href="/admin/users"
            className="bg-brand-teal hover:bg-brand-teal/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Manage Users
          </Link>
          {profile?.role === 'super_admin' && (
            <>
              <Link
                href="/admin/sources"
                className="bg-white border border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Event Sources
              </Link>
              <Link
                href="/admin/crm"
                className="bg-brand-dark hover:bg-brand-dark/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Open CRM
              </Link>
              <Link
                href="/admin/site"
                className="bg-white border border-brand-dark text-brand-dark hover:bg-brand-dark hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Customise Site
              </Link>
            </>
          )}
        </div>
      </div>
      <p className="text-gray-500 mb-8">Review and manage submitted events.</p>

      <h2 className="text-xl font-heading font-bold text-brand-dark mb-4">
        Pending Review ({pendingEvents.length})
      </h2>

      {pendingEvents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No events waiting for review.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingEvents.map((event) => (
            <div key={event.id} className="bg-white rounded-xl border p-6">
              {editingId === event.id && editState ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                    <input
                      type="text"
                      value={editState.title}
                      onChange={(e) => setEditState((prev) => prev ? { ...prev, title: e.target.value } : null)}
                      className="w-full px-3 py-2 border rounded-lg focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={editState.description}
                      onChange={(e) => setEditState((prev) => prev ? { ...prev, description: e.target.value } : null)}
                      rows={4}
                      className="w-full px-3 py-2 border rounded-lg focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
                    <input
                      type="text"
                      value={editState.image_url}
                      onChange={(e) => setEditState((prev) => prev ? { ...prev, image_url: e.target.value } : null)}
                      className="w-full px-3 py-2 border rounded-lg focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
                    />
                    {editState.image_url && (
                      <img src={editState.image_url} alt="preview" className="mt-3 h-40 object-cover rounded-lg" />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.name)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                            editState.tags.includes(tag.name)
                              ? 'bg-brand-gold text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdits(event.id)}
                      disabled={actionLoading === event.id}
                      className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      {actionLoading === event.id ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={cancelEdits}
                      className="text-gray-600 hover:text-gray-800 px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-brand-dark">{event.title}</h3>
                      <p className="text-sm text-gray-500">
                        by {event.organizer?.display_name || 'Unknown'} · submitted {new Date(event.created_at).toLocaleDateString('en-GB')}
                      </p>
                      {event.category && (
                        <span className="text-xs text-gray-500">{event.category.icon} {event.category.name}</span>
                      )}
                    </div>
                    {event.image_url && (
                      <img src={event.image_url} alt="" className="w-32 h-32 object-cover rounded-lg flex-shrink-0" />
                    )}
                  </div>

                  {event.short_description && (
                    <p className="text-gray-600 text-sm mb-2">{event.short_description}</p>
                  )}
                  {event.description && (
                    <p className="text-gray-500 text-sm mb-4">{event.description}</p>
                  )}

                  {event.tags && event.tags.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {event.tags.map((tag) => (
                        <span key={tag} className="inline-block px-2 py-1 bg-brand-gold/20 text-brand-dark text-xs rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm mb-4 pb-4 border-b">
                    <div>
                      <span className="text-gray-400">When</span>
                      <p className="text-gray-700">
                        {new Date(event.date_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    {event.date_end && (
                      <div>
                        <span className="text-gray-400">End</span>
                        <p className="text-gray-700">
                          {new Date(event.date_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    )}
                    {event.location_name && (
                      <div>
                        <span className="text-gray-400">Venue</span>
                        <p className="text-gray-700 text-xs">{event.location_name}</p>
                      </div>
                    )}
                    {event.location_address && (
                      <div>
                        <span className="text-gray-400">Address</span>
                        <p className="text-gray-700 text-xs">{event.location_address}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400">Type</span>
                      <p className="text-gray-700 capitalize">{event.ticket_type}</p>
                    </div>
                    {event.min_age && (
                      <div>
                        <span className="text-gray-400">Age</span>
                        <p className="text-gray-700">{event.min_age}+</p>
                      </div>
                    )}
                    {event.price_min && (
                      <div>
                        <span className="text-gray-400">Price</span>
                        <p className="text-gray-700">
                          {event.price_min}
                          {event.price_max && event.price_max !== event.price_min && `–${event.price_max}`}
                          {' '}{event.currency}
                        </p>
                      </div>
                    )}
                    {event.ticket_url && (
                      <div>
                        <span className="text-gray-400">Tickets</span>
                        <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" className="text-brand-gold text-xs hover:underline">
                          Link
                        </a>
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
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
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
                    <div className="flex gap-2 flex-wrap">
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
                      <button
                        onClick={() => startEditing(event)}
                        className="bg-white border border-brand-gold text-brand-gold hover:bg-brand-gold/10 px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        Edit
                      </button>
                      <Link
                        href={`/events/${event.slug}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white border border-brand-teal text-brand-teal hover:bg-brand-teal/10 px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        Full Edit →
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
