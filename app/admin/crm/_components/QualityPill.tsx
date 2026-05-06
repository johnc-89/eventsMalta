'use client'

import { LEAD_QUALITIES, type LeadQuality } from '@/types'

const COLOR: Record<LeadQuality, string> = {
  High:   'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-gray-100 text-gray-600',
}

interface Props { value: LeadQuality | null; onChange: (q: LeadQuality | null) => void }

export default function QualityPill({ value, onChange }: Props) {
  const cls = value ? COLOR[value] : 'bg-gray-50 text-gray-400'
  return (
    <div className="relative inline-block">
      <select
        value={value ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange((e.target.value || null) as LeadQuality | null)}
        className={`appearance-none pl-3 pr-7 py-1 rounded-full text-xs font-medium cursor-pointer ${cls} border-0 outline-none focus:ring-2 focus:ring-brand-gold/30`}
      >
        <option value="">—</option>
        {LEAD_QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
      </select>
      <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-current opacity-60 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 5 5-5z"/></svg>
    </div>
  )
}
