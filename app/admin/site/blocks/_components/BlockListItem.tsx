'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BLOCK_META } from '@/lib/blocks/registry'
import type { BlockInstance } from '@/lib/blocks/types'

interface Props {
  block: BlockInstance
  selected: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export default function BlockListItem({ block, selected, onSelect, onDuplicate, onDelete }: Props) {
  const meta = BLOCK_META[block.type]
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors ${
        selected ? 'bg-brand-gold/15 ring-1 ring-brand-gold' : 'hover:bg-gray-100'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="text-gray-400 hover:text-brand-dark cursor-grab active:cursor-grabbing leading-none px-1"
        title="Drag to reorder"
      >⋮⋮</button>
      <span className="text-base leading-none">{meta?.icon ?? '▢'}</span>
      <span className={`flex-1 truncate ${selected ? 'text-brand-dark font-medium' : 'text-gray-700'}`}>
        {meta?.name ?? block.type}
      </span>
      <div className="hidden group-hover:flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          className="text-xs text-gray-400 hover:text-brand-dark px-1"
          title="Duplicate"
        >⎘</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-xs text-gray-400 hover:text-red-600 px-1"
          title="Delete"
        >×</button>
      </div>
    </div>
  )
}
