'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string | null
  onSave: (next: string | null) => unknown
  placeholder?: string
  className?: string
  asLink?: 'mailto' | 'url' | null
}

export default function InlineCell({ value, onSave, placeholder = '—', className = '', asLink = null }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim() === '' ? null : draft
    if (next !== value) await onSave(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className={`w-full px-2 py-1 border border-brand-gold rounded text-sm outline-none focus:ring-2 focus:ring-brand-gold/30 ${className}`}
      />
    )
  }

  const display = value ?? placeholder
  const empty = !value
  const linkable = asLink && value
  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      className={`cursor-text px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-100 truncate ${empty ? 'text-gray-300' : 'text-gray-700'} ${className}`}
      title={value ?? ''}
    >
      {linkable ? (
        <a
          href={asLink === 'mailto' ? `mailto:${value}` : value!}
          target={asLink === 'url' ? '_blank' : undefined}
          rel={asLink === 'url' ? 'noopener noreferrer' : undefined}
          onClick={(e) => e.stopPropagation()}
          className="text-brand-cyan hover:underline truncate block"
        >
          {display}
        </a>
      ) : (
        <span className="truncate block">{display}</span>
      )}
    </div>
  )
}
