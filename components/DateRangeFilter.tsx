'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Used on server-rendered pages (homepage, block renderer) to let visitors
// pick a custom date range and navigate to /events?from=YYYY-MM-DD&to=YYYY-MM-DD.
export default function DateRangeFilter() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const router = useRouter()

  const apply = () => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (from || to) router.push(`/events?${params.toString()}`)
  }

  const inputClass =
    'px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none bg-white'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className={inputClass}
      />
      <span className="text-gray-400 text-sm">–</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => setTo(e.target.value)}
        className={inputClass}
      />
      <button
        onClick={apply}
        disabled={!from && !to}
        className="px-4 py-2 rounded-lg bg-brand-gold text-brand-dark text-sm font-medium hover:bg-brand-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Go
      </button>
    </div>
  )
}
