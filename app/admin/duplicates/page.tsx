'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Event } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Levenshtein-based similarity ratio (0–1)
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const m = a.length
  const n = b.length
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  const dist = prev[n]
  return 1 - dist / Math.max(m, n)
}

function dayKey(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10)
}

/** Canonical, order-independent key for a pair of event ids. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

type Group = Event[]

export default function DuplicatesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<number>>(new Set())
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set())
  const [dismissingKey, setDismissingKey] = useState<string | null>(null)
  const [strict, setStrict] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      router.push('/')
      return
    }
    fetchData()
  }, [user, profile, authLoading])

  async function fetchData() {
    const nowIso = new Date().toISOString()
    const [{ data }, { data: dismissals }] = await Promise.all([
      supabase
        .from('events')
        .select('*, organizer:profiles!events_organizer_id_fkey(display_name)')
        .in('status', ['approved', 'pending_review'])
        .is('deleted_at', null)
        // Past events don't matter anymore — exclude them from duplicate matching.
        .gte('date_start', nowIso)
        .order('date_start', { ascending: true }),
      supabase.from('event_duplicate_dismissals').select('event_id_a, event_id_b'),
    ])
    setEvents(data || [])
    setDismissedPairs(new Set((dismissals || []).map((d) => pairKey(d.event_id_a, d.event_id_b))))
    setLoading(false)
  }

  const groups = useMemo<Group[]>(() => {
    const live = events.filter((e) => !deletedIds.has(e.id))
    // Threshold: strict requires same day + high title similarity;
    // loose drops the same-day requirement and lowers the title bar.
    const titleThreshold = strict ? 0.82 : 0.7
    const requireSameDay = strict

    // Union-find over events that look like duplicates of one another.
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      let r = x
      while (parent.get(r) !== r) r = parent.get(r)!
      parent.set(x, r)
      return r
    }
    const union = (a: number, b: number) => {
      parent.set(find(a), find(b))
    }
    live.forEach((e) => parent.set(e.id, e.id))

    const norm = new Map<number, string>()
    live.forEach((e) => norm.set(e.id, normalizeTitle(e.title)))

    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]
        const b = live[j]
        if (dismissedPairs.has(pairKey(a.id, b.id))) continue
        if (requireSameDay && dayKey(a.date_start) !== dayKey(b.date_start)) continue
        const sim = similarity(norm.get(a.id)!, norm.get(b.id)!)
        const sameVenue =
          !!a.location_name &&
          !!b.location_name &&
          normalizeTitle(a.location_name) === normalizeTitle(b.location_name)
        // A venue match relaxes the title bar a little.
        const threshold = sameVenue ? titleThreshold - 0.1 : titleThreshold
        if (sim >= threshold) union(a.id, b.id)
      }
    }

    const byRoot = new Map<number, Event[]>()
    live.forEach((e) => {
      const r = find(e.id)
      if (!byRoot.has(r)) byRoot.set(r, [])
      byRoot.get(r)!.push(e)
    })

    return Array.from(byRoot.values())
      .filter((g) => g.length > 1)
      .sort((a, b) => +new Date(a[0].date_start) - +new Date(b[0].date_start))
  }, [events, deletedIds, dismissedPairs, strict])

  async function deleteEvent(eventId: number) {
    if (!confirm('Delete this event? It will be soft-deleted and removed from the site.')) return
    setDeletingId(eventId)
    await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', eventId)
    setDeletedIds((prev) => new Set(prev).add(eventId))
    setDeletingId(null)
  }

  /** Mark every pair within this group as reviewed & not duplicates, so the
   *  matcher stops re-flagging them. Does not touch the events themselves. */
  async function dismissGroup(group: Group) {
    const groupKey = group.map((e) => e.id).join(',')
    if (!confirm('Mark this group as not duplicates? It will stop being flagged.')) return
    setDismissingKey(groupKey)
    const rows: { event_id_a: number; event_id_b: number; dismissed_by?: string }[] = []
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i].id
        const b = group[j].id
        rows.push({ event_id_a: Math.min(a, b), event_id_b: Math.max(a, b), dismissed_by: user?.id })
      }
    }
    const { error } = await supabase.from('event_duplicate_dismissals').upsert(rows)
    if (error) {
      alert('Could not dismiss: ' + error.message)
      setDismissingKey(null)
      return
    }
    setDismissedPairs((prev) => {
      const next = new Set(prev)
      rows.forEach((r) => next.add(pairKey(r.event_id_a, r.event_id_b)))
      return next
    })
    setDismissingKey(null)
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
      </div>
    )
  }

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Find Duplicates</h1>
        <Link
          href="/admin"
          className="bg-white border border-brand-gold/40 text-brand-dark hover:bg-brand-gold/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          ← Dashboard
        </Link>
      </div>
      <p className="text-gray-500 mb-6">
        Groups of approved &amp; pending events that look like duplicates. Delete the copy you
        don&apos;t want to keep.
      </p>

      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setStrict(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            strict ? 'bg-brand-teal text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
        >
          Strict (same day)
        </button>
        <button
          onClick={() => setStrict(false)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !strict ? 'bg-brand-teal text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
        >
          Loose (any date)
        </button>
        <span className="text-sm text-gray-400">{groups.length} potential duplicate group(s)</span>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No duplicate events detected.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group, gi) => {
            const groupKey = group.map((e) => e.id).join(',')
            return (
              <div key={gi} className="bg-white rounded-xl border p-5">
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => dismissGroup(group)}
                    disabled={dismissingKey === groupKey}
                    className="bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-medium"
                  >
                    {dismissingKey === groupKey ? 'Dismissing…' : 'Not duplicates — stop flagging'}
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                {group.map((event) => (
                  <div key={event.id} className="border rounded-lg p-4 flex flex-col">
                    <div className="flex gap-3 mb-3">
                      {event.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-brand-dark leading-snug">
                          {event.title}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(event.date_start).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        {event.location_name && (
                          <p className="text-xs text-gray-500">{event.location_name}</p>
                        )}
                        <span
                          className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            event.status === 'approved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {event.status === 'approved' ? 'Approved' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-gray-400 mb-3 space-y-0.5">
                      <p>ID {event.id} · {event.view_count} views</p>
                      <p>by {event.organizer?.display_name || 'Unknown'}</p>
                      <p>added {new Date(event.created_at).toLocaleDateString('en-GB')}</p>
                    </div>

                    <div className="mt-auto flex gap-2">
                      <Link
                        href={`/events/${event.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center bg-white border border-brand-teal text-brand-teal-dark hover:bg-brand-teal/10 px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => deleteEvent(event.id)}
                        disabled={deletingId === event.id}
                        className="flex-1 bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        {deletingId === event.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
