'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { deriveLocality } from '@/lib/malta-localities'

// Surfaces venues on upcoming events that deriveLocality() can't place to a
// Malta locality — i.e. they won't appear on any /events/location page. Lets
// admins notice new/unmapped venues (the map lives in lib/malta-localities.ts
// and is updated in code). Read-only diagnostic.
export default function UnmappedVenues() {
  const [rows, setRows] = useState<{ venue: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('events')
        .select('location_name')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .gte('date_start', new Date().toISOString())
        .not('location_name', 'is', null)

      const counts = new Map<string, number>()
      for (const e of (data as { location_name: string | null }[]) || []) {
        const name = (e.location_name || '').trim()
        if (!name) continue
        if (deriveLocality(name)) continue // mapped — skip
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
      const list = Array.from(counts.entries())
        .map(([venue, count]) => ({ venue, count }))
        .sort((a, b) => b.count - a.count)
      if (!cancelled) {
        setRows(list)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || rows.length === 0) return null

  const total = rows.reduce((n, r) => n + r.count, 0)

  return (
    <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">⚠️</span>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-amber-900">
            {rows.length} venue{rows.length === 1 ? '' : 's'} not mapped to a locality
          </h2>
          <p className="text-sm text-amber-800 mt-1">
            These {total} upcoming event{total === 1 ? "" : "s"} won&apos;t appear on any{' '}
            <span className="font-medium">/events/location</span> page (they still show everywhere
            else). To add them, map the venue → town in{' '}
            <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">lib/malta-localities.ts</code>.
          </p>
          <ul className="mt-3 space-y-1">
            {rows.map((r) => (
              <li key={r.venue} className="text-sm text-amber-900">
                <span className="font-medium">{r.venue}</span>
                <span className="text-amber-700"> — {r.count} event{r.count === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
