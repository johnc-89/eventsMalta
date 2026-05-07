'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { PALETTES, getPalette } from '@/lib/site-palettes'
import { Section } from '../_components/Field'

export default function ThemeEditor() {
  const { draft, patch } = useSiteEditor()
  const current = getPalette(draft.brand.palette)

  return (
    <div>
      <Section title="Theme palette" description="Pick from curated colour pairings. Changes the accent colour used in the hero highlight, primary buttons, links, and other accent spots across the site.">
        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {PALETTES.map((p) => {
            const active = p.id === current.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => patch('brand', { palette: p.id })}
                className={`text-left rounded-xl border-2 transition-all overflow-hidden ${active ? 'border-brand-dark ring-2 ring-brand-dark/10' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex h-16">
                  <div style={{ background: p.preview.primary }}   className="flex-1" />
                  <div style={{ background: p.preview.secondary }} className="flex-1" />
                  <div style={{ background: p.preview.bg }}        className="flex-1" />
                </div>
                <div className="p-3">
                  <div className="font-semibold text-brand-dark text-sm flex items-center justify-between">
                    {p.name}
                    {active && <span className="text-xs theme-accent-text">selected</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{p.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Where the palette shows up" description="A quick reference so you know what changes when you switch palettes.">
        <ul className="sm:col-span-2 list-disc pl-5 text-sm text-gray-600 space-y-1">
          <li>Highlighted word in the hero title</li>
          <li>Primary call-to-action button background</li>
          <li>Active filter chips and links across the site</li>
          <li>Default colour of the announcement banner (overridable per banner)</li>
        </ul>
      </Section>
    </div>
  )
}
