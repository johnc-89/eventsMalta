'use client'

import { LEAD_STATUSES, type LeadStatus } from '@/types'

const COLOR: Record<LeadStatus, string> = {
  'Not Contacted': 'bg-gray-100 text-gray-600',
  'Contacted':     'bg-cyan-100 text-cyan-700',
  'Responded':     'bg-purple-100 text-purple-700',
  'Converted':     'bg-green-100 text-green-700',
  'Rejected':      'bg-red-100 text-red-700',
}

interface Props { value: LeadStatus; onChange: (s: LeadStatus) => void; disabled?: boolean }

export default function StatusPill({ value, onChange, disabled }: Props) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LeadStatus)}
        onClick={(e) => e.stopPropagation()}
        className={`appearance-none pl-6 pr-7 py-1 rounded-full text-xs font-medium cursor-pointer disabled:cursor-default ${COLOR[value]} border-0 outline-none focus:ring-2 focus:ring-brand-gold/30`}
      >
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span className={`absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${value === 'Not Contacted' ? 'bg-gray-400' : value === 'Contacted' ? 'bg-cyan-500' : value === 'Responded' ? 'bg-purple-500' : value === 'Converted' ? 'bg-green-500' : 'bg-red-500'}`} />
      <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-current opacity-60 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 5 5-5z"/></svg>
    </div>
  )
}
