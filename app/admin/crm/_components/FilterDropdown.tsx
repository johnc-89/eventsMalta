'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: string | null
  options: string[]
  onChange: (v: string | null) => void
  searchable?: boolean
}

export default function FilterDropdown({ label, value, options, onChange, searchable = true }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = q.trim()
    ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 min-w-[160px]"
      >
        <span className="truncate">{value ?? label}</span>
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M5 7l5 5 5-5z"/></svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-full min-w-[220px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="px-3 py-2 border-b border-gray-100 outline-none text-sm"
            />
          )}
          <div className="overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setQ('') }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${value === null ? 'text-brand-dark font-medium' : 'text-gray-500'}`}
            >
              {label}
            </button>
            {filtered.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => { onChange(o); setOpen(false); setQ('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate ${value === o ? 'bg-brand-gold/10 text-brand-dark font-medium' : 'text-gray-700'}`}
              >
                {o}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-3 text-sm text-gray-400">No matches</div>}
          </div>
        </div>
      )}
    </div>
  )
}
