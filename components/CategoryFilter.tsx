'use client'

// Data sources from the `tags` DB table (migration 0015 merged categories in);
// the app-facing type is `Category` — see types/index.ts.

import { Category } from '@/types'

interface CategoryFilterProps {
  categories: Category[]
  selected: string[]
  onChange: (slugs: string[]) => void
}

export default function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug])

  return (
    <div className="grid grid-flow-col grid-rows-2 auto-cols-max gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => onChange([])}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          selected.length === 0
            ? 'bg-brand-dark text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All Events
      </button>
      {categories.filter((cat) => cat.slug).map((cat) => (
        <button
          key={cat.id}
          onClick={() => toggle(cat.slug!)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selected.includes(cat.slug!)
              ? 'bg-brand-dark text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {cat.icon && <>{cat.icon} </>}{cat.name}
        </button>
      ))}
    </div>
  )
}
