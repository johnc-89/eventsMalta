'use client'

import { useMemo, useState } from 'react'
import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'
import { renderMarkdown } from '@/lib/markdown'
import { DEFAULT_SETTINGS } from '@/lib/site-settings'

const TABS = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms',   label: 'Terms of Service' },
] as const
type PageId = typeof TABS[number]['id']

export default function PagesEditor() {
  const { draft, setDraft } = useSiteEditor()
  const [active, setActive] = useState<PageId>('privacy')
  const page = draft.pages[active]

  const update = (patch: Partial<typeof page>) => {
    setDraft({
      ...draft,
      pages: { ...draft.pages, [active]: { ...page, ...patch } },
    })
  }

  const resetToDefault = () => {
    if (!confirm(`Reset ${TABS.find((t) => t.id === active)?.label} to the original Events Malta template? Your current draft for this page will be lost.`)) return
    setDraft({
      ...draft,
      pages: { ...draft.pages, [active]: DEFAULT_SETTINGS.pages[active] },
    })
  }

  const previewHtml = useMemo(() => renderMarkdown(page.content_md), [page.content_md])

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${active === t.id ? 'bg-brand-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >{t.label}</button>
        ))}
        <button
          onClick={resetToDefault}
          className="ml-auto text-xs text-gray-500 hover:text-red-600"
        >Reset to default</button>
      </div>

      <Section title={page.title || TABS.find((t) => t.id === active)!.label}>
        <Field label="Page title">
          <input className={inputCls} value={page.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Last updated">
          <input className={inputCls} value={page.last_updated} onChange={(e) => update({ last_updated: e.target.value })} placeholder="4 May 2026" />
        </Field>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-semibold text-brand-dark">Markdown</h3>
            <a
              href="https://www.markdownguide.org/cheat-sheet/"
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-brand-cyan"
            >Markdown cheat sheet ↗</a>
          </div>
          <textarea
            value={page.content_md}
            onChange={(e) => update({ content_md: e.target.value })}
            rows={26}
            className={`${inputCls} font-mono text-xs leading-relaxed`}
            placeholder="## Section\n\nText here..."
          />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <h3 className="font-heading font-semibold text-brand-dark mb-2">Live preview</h3>
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>
    </div>
  )
}
