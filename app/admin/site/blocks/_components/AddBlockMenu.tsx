'use client'

import { useEffect, useState } from 'react'
import { BLOCK_REGISTRY, BLOCK_CATEGORIES } from '@/lib/blocks/registry'
import type { BlockType } from '@/lib/blocks/types'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (type: BlockType) => void
  /** Where this menu was opened from — purely for the title. */
  position?: 'end' | 'between'
}

export default function AddBlockMenu({ open, onClose, onPick, position = 'end' }: Props) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const q = search.trim().toLowerCase()
  const filtered = q
    ? BLOCK_REGISTRY.filter((b) => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q))
    : BLOCK_REGISTRY

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-heading font-bold text-brand-dark">Add a block</h2>
            <p className="text-xs text-gray-500">{position === 'between' ? 'Inserts at this position' : 'Adds to the bottom of the page'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-4 sticky top-[60px] bg-white z-10 border-b">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search block types…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm"
          />
        </div>
        <div className="p-4 space-y-5">
          {BLOCK_CATEGORIES.map((cat) => {
            const inCat = filtered.filter((b) => b.category === cat.id)
            if (inCat.length === 0) return null
            return (
              <section key={cat.id}>
                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">{cat.label}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {inCat.map((b) => (
                    <button
                      key={b.type}
                      onClick={() => { onPick(b.type); onClose() }}
                      className="text-left p-3 rounded-lg border border-gray-200 hover:border-brand-gold hover:bg-brand-gold/5 transition-colors flex items-start gap-3"
                    >
                      <span className="text-2xl leading-none">{b.icon}</span>
                      <span>
                        <div className="font-semibold text-brand-dark text-sm">{b.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{b.description}</div>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-8">No block types match "{search}".</p>
          )}
        </div>
      </div>
    </div>
  )
}
