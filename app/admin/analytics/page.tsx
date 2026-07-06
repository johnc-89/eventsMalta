'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface EventViewStat {
  id: number
  title: string
  view_count: number
  slug: string
}

interface Stats {
  totalViews: number
  approvedEvents: number
  topEvents: EventViewStat[]
}

export default function AnalyticsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      router.push('/')
      return
    }
    fetchStats()
  }, [user, profile, authLoading])

  async function fetchStats() {
    const { data: events } = await supabase
      .from('events')
      .select('id, title, view_count, slug')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('view_count', { ascending: false })

    const totalViews = events?.reduce((sum, e) => sum + (e.view_count || 0), 0) ?? 0
    const topEvents = (events || []).slice(0, 10)

    setStats({
      totalViews,
      approvedEvents: events?.length ?? 0,
      topEvents,
    })
    setLoading(false)
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
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-brand-dark mb-2">Analytics</h1>
        <p className="text-gray-500">Event views and traffic insights</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-6">
          <p className="text-gray-500 text-sm mb-1">Total Event Views</p>
          <p className="text-3xl font-bold text-brand-dark">{stats?.totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <p className="text-gray-500 text-sm mb-1">Approved Events</p>
          <p className="text-3xl font-bold text-brand-dark">{stats?.approvedEvents}</p>
        </div>
        <div className="bg-white rounded-xl border p-6 sm:col-span-1 col-span-2">
          <p className="text-gray-500 text-sm mb-2">More insights</p>
          <a
            href={`https://analytics.google.com/analytics/web/#/p/${process.env.NEXT_PUBLIC_GA_ID}/reports/dashboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal-dark hover:underline text-sm font-medium"
          >
            Open Google Analytics →
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border">
        <div className="p-6 border-b">
          <h2 className="text-xl font-heading font-bold text-brand-dark">Top Events</h2>
        </div>
        {stats?.topEvents && stats.topEvents.length > 0 ? (
          <div className="divide-y">
            {stats.topEvents.map((event) => (
              <div key={event.id} className="p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50">
                <Link href={`/events/${event.slug}`} className="text-brand-teal-dark hover:underline font-medium">
                  {event.title}
                </Link>
                <span className="text-gray-600 text-sm font-mono">{event.view_count.toLocaleString()} views</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">No approved events yet.</div>
        )}
      </div>
    </main>
  )
}
