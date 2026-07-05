'use client'

import { useState } from 'react'
import { BlockRenderer, type RenderContext } from '@/lib/blocks/Renderer'
import { BLOCK_META } from '@/lib/blocks/registry'
import type { BlockInstance, BlockType } from '@/lib/blocks/types'
import AddBlockMenu from './AddBlockMenu'

interface Props {
  blocks: BlockInstance[]
  selectedId: string | null
  onSelect: (id: string) => void
  context: RenderContext
  onAddAt: (type: BlockType, atIndex: number) => void
  /** 'mobile' = scale canvas to phone width. */
  device: 'desktop' | 'mobile'
}

export default function Canvas({ blocks, selectedId, onSelect, context, onAddAt, device }: Props) {
  const [addingAt, setAddingAt] = useState<number | null>(null)

  const isMobile = device === 'mobile'

  return (
    <div className="bg-gray-100 rounded-lg p-4 h-full overflow-y-auto">
      <div
        className={`mx-auto bg-white rounded-lg overflow-hidden shadow-sm transition-all duration-200 ${isMobile ? 'max-w-[420px]' : 'max-w-none'}`}
        style={isMobile ? { width: '420px' } : undefined}
      >
        {blocks.length === 0 ? (
          <div className="text-center py-20 px-6">
            <p className="text-gray-400 text-sm mb-6">Your homepage has no blocks yet.</p>
            <button
              onClick={() => setAddingAt(0)}
              className="theme-accent-bg px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90"
            >
              + Add your first block
            </button>
          </div>
        ) : (
          <>
            {/* Insert-at-0 zone */}
            <InsertZone onClick={() => setAddingAt(0)} />

            {blocks.map((b, idx) => (
              <div key={b.id} className="relative group">
                <div
                  onClick={() => onSelect(b.id)}
                  className={`relative cursor-pointer transition-all ${
                    selectedId === b.id
                      ? 'outline outline-2 outline-brand-gold outline-offset-[-2px]'
                      : 'hover:outline hover:outline-2 hover:outline-gray-200 hover:outline-offset-[-2px]'
                  }`}
                >
                  {/* Block label badge in corner when selected */}
                  {selectedId === b.id && (
                    <div className="absolute top-1 left-1 z-10 bg-brand-gold text-brand-dark text-xs font-mono px-2 py-0.5 rounded shadow">
                      {BLOCK_META[b.type]?.icon} {BLOCK_META[b.type]?.name}
                    </div>
                  )}
                  <div className="pointer-events-none">
                    <BlockRenderer block={b} context={{ ...context, preview: true }} />
                  </div>
                </div>
                <InsertZone onClick={() => setAddingAt(idx + 1)} />
              </div>
            ))}
          </>
        )}
      </div>

      <AddBlockMenu
        open={addingAt !== null}
        onClose={() => setAddingAt(null)}
        onPick={(t) => addingAt !== null && onAddAt(t, addingAt)}
        position="between"
      />
    </div>
  )
}

function InsertZone({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative h-3 group/zone">
      <button
        onClick={onClick}
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-full max-w-md flex items-center justify-center gap-2 opacity-0 group-hover/zone:opacity-100 transition-opacity pointer-events-auto"
      >
        <span className="flex-1 h-px bg-brand-gold/40" />
        <span className="text-xs text-brand-dark bg-white border border-brand-gold/30 rounded-full px-2 py-0.5">+ Add block</span>
        <span className="flex-1 h-px bg-brand-gold/40" />
      </button>
    </div>
  )
}
