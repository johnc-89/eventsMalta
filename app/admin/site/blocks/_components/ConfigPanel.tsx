'use client'

import { BlockEditor } from '@/lib/blocks/Editor'
import { BLOCK_META } from '@/lib/blocks/registry'
import { useBlockEditor } from '../BlockEditorContext'

export default function ConfigPanel() {
  const { blocks, selectedId, updateBlock, deleteBlock, duplicateBlock, categories } = useBlockEditor()
  const block = blocks.find((b) => b.id === selectedId) ?? null

  if (!block) {
    return (
      <div className="p-6 text-sm text-gray-400 italic h-full flex items-center justify-center text-center">
        <div>
          <div className="text-3xl mb-2">👈</div>
          <p>Click a block on the canvas (or in the list) to edit it.</p>
        </div>
      </div>
    )
  }

  const meta = BLOCK_META[block.type]

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b bg-gray-50 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{meta?.icon}</span>
          <div>
            <div className="font-semibold text-brand-dark text-sm">{meta?.name}</div>
            <div className="text-xs text-gray-400 font-mono">{block.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => duplicateBlock(block.id)}
            className="text-xs px-2 py-1 rounded text-gray-600 hover:bg-gray-100"
            title="Duplicate"
          >Duplicate</button>
          <button
            onClick={() => { if (confirm('Delete this block?')) deleteBlock(block.id) }}
            className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
            title="Delete"
          >Delete</button>
        </div>
      </div>
      <div className="p-5 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BlockEditor
            block={block}
            onChange={(next) => updateBlock(block.id, next)}
            categories={categories}
          />
        </div>
      </div>
    </div>
  )
}
