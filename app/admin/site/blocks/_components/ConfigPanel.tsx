'use client'

import { BlockEditor } from '@/lib/blocks/Editor'
import { BLOCK_META } from '@/lib/blocks/registry'
import { useBlockEditor } from '../BlockEditorContext'

export default function ConfigPanel() {
  const { blocks, selectedId, setSelectedId, updateBlock, deleteBlock, duplicateBlock, categories } = useBlockEditor()
  const block = blocks.find((b) => b.id === selectedId) ?? null

  if (!block) return null

  const meta = BLOCK_META[block.type]

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-3 border-b bg-gray-50 sticky top-0 z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none">{meta?.icon}</span>
          <div className="min-w-0">
            <div className="font-semibold text-brand-dark text-sm">{meta?.name}</div>
            <div className="text-xs text-gray-400 font-mono truncate">{block.id}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
          <button
            onClick={() => setSelectedId(null)}
            className="ml-1 w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 text-lg leading-none"
            title="Close (Esc)"
            aria-label="Close editor"
          >×</button>
        </div>
      </div>
      <div className="p-5 overflow-y-auto flex-1">
        <div className="grid grid-cols-1 gap-4">
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
