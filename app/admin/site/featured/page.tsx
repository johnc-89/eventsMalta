'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Section } from '../_components/Field'

interface EventRow {
  id: number
  title: string
  slug: string
  date_start: string
  is_featured: boolean
  featured_order: number | null
  tags: string[] | null
}

export default function FeaturedEditor() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const reload = async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, slug, date_start, is_featured, featured_order, tags')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .gte('date_start', new Date().toISOString())
      .order('date_start', { ascending: true })
      .limit(200)
    setEvents((data as unknown as EventRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const toggle = async (e: EventRow) => {
    const next = !e.is_featured
    const featuredCount = events.filter((x) => x.is_featured).length
    const nextOrder = next ? (featuredCount + 1) * 10 : null
    setEvents((prev) => prev.map((x) => x.id === e.id ? { ...x, is_featured: next, featured_order: nextOrder } : x))
    await supabase.from('events').update({ is_featured: next, featured_order: nextOrder }).eq('id', e.id)
  }

  const move = async (id: number, dir: -1 | 1) => {
    const featured = [...events].filter((e) => e.is_featured)
      .sort((a, b) => (a.featured_order ?? 0) - (b.featured_order ?? 0))
    const idx = featured.findIndex((e) => e.id === id)
    const swap = featured[idx + dir]
    if (!swap) return
    const a = featured[idx], b = swap
    setEvents((prev) => prev.map((e) => {
      if (e.id === a.id) return { ...e, featured_order: b.featured_order ?? 0 }
      if (e.id === b.id) return { ...e, featured_order: a.featured_order ?? 0 }
      return e
    }))
    await Promise.all([
      supabase.from('events').update({ featured_order: b.featured_order ?? 0 }).eq('id', a.id),
      supabase.from('events').update({ featured_order: a.featured_order ?? 0 }).eq('id', b.id),
    ])
  }

  if (loading) return <div className="py-20 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-brand-gold border-t-transparent rounded-full" /></div>

  const featured = [...events].filter((e) => e.is_featured)
    .sort((a, b) => (a.featured_order ?? 0) - (b.featured_order ?? 0))
  const others = events.filter((e) => !e.is_featured)
  const filteredOthers = search.trim()
    ? others.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()))
    : others

  const dateLabel = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

  return (
    <div>
      <Section title="Featured events" description="Pin specific events to the homepage carousel. Up to 6 will display. Use the arrows to reorder them.">
        {featured.length === 0 ? (
          <p className="sm:col-span-2 text-sm text-gray-400 italic mt-2">No events featured yet — toggle one below to add it here.</p>
        ) : (
          <div className="sm:col-span-2 space-y-2 mt-2">
            {featured.map((e, idx) => (
              <div key={e.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <button onClick={() => move(e.id, -1)} disabled={idx === 0}                    className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none">▲</button>
                  <button onClick={() => move(e.id, 1)}  disabled={idx === featured.length - 1} className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none">▼</button>
                </div>
                <div className="w-9 h-9 rounded-lg bg-brand-gold/15 text-brand-gold flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-brand-dark truncate">{e.title}</div>
                  <div className="text-xs text-gray-500">{e.tags?.[0] ?? '—'} · {dateLabel(e.date_start)}</div>
                </div>
                <button
                  onClick={() => toggle(e)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600"
                >Unfeature</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="All upcoming events" description="Click ★ to feature an event. Search to find a specific one quickly.">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm"
            />
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600"
            >{showAll ? `Show top 20 (${filteredOthers.length} total)` : `Show all (${filteredOthers.length})`}</button>
          </div>
          <div className="space-y-1">
            {(showAll ? filteredOthers : filteredOthers.slice(0, 20)).map((e) => (
              <div key={e.id} className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3">
                <button
                  onClick={() => toggle(e)}
                  className="text-gray-300 hover:text-brand-gold text-lg leading-none"
                  title="Feature this event"
                >☆</button>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-brand-dark truncate">{e.title}</div>
                  <div className="text-xs text-gray-500">{e.tags?.[0] ?? '—'} · {dateLabel(e.date_start)}</div>
                </div>
              </div>
            ))}
            {filteredOthers.length === 0 && (
              <p className="text-sm text-gray-400 italic px-1">No matching events.</p>
            )}
          </div>
        </div>
      </Section>
    </div>
  )
}
