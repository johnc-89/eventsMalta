'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Section } from '../_components/Field'
import type { HomepageSectionId } from '@/lib/site-settings'

const LABELS: Record<HomepageSectionId, { name: string; description: string }> = {
  hero:       { name: 'Hero',           description: 'Top banner with the title, subtitle, and call-to-action buttons.' },
  categories: { name: 'Categories',     description: 'Horizontal strip of category pills below the hero.' },
  featured:   { name: 'Featured Events', description: 'Curated events you\'ve pinned. Pick which ones in the Featured tab.' },
  upcoming:   { name: 'Upcoming Events', description: 'The next 6 approved events in chronological order.' },
  faq:        { name: 'FAQ',             description: 'Frequently asked questions. Edit the questions in the FAQ tab.' },
}

export default function SectionsEditor() {
  const { draft, setDraft } = useSiteEditor()
  const sections = draft.sections

  // Sections is an array, so patch (which merges by spread) won't work — we
  // replace the whole draft with a new sections array.
  const moveFixed = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDraft({ ...draft, sections: next })
  }

  const toggle = (idx: number) => {
    const next = sections.map((s, i) => (i === idx ? { ...s, enabled: !s.enabled } : s))
    setDraft({ ...draft, sections: next })
  }

  return (
    <div>
      <Section title="Homepage sections" description="Drag-style reorder using the arrows. Toggle visibility per section. Changes go live when you Publish.">
        <div className="sm:col-span-2 space-y-2 mt-2">
          {sections.map((s, idx) => {
            const meta = LABELS[s.id]
            if (!meta) return null
            return (
              <div key={s.id} className={`bg-white rounded-lg border p-4 flex items-center gap-3 ${s.enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => moveFixed(idx, -1)}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none"
                  >▲</button>
                  <button
                    type="button"
                    onClick={() => moveFixed(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none"
                  >▼</button>
                </div>
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-mono text-gray-500">{idx + 1}</div>
                <div className="flex-1">
                  <div className="font-semibold text-brand-dark">{meta.name}</div>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => toggle(idx)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-brand-teal transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
                </label>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
