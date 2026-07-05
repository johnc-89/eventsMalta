'use client'

import { useMemo } from 'react'
import { useSiteEditor } from '../../SiteEditorContext'
import { Field, Section, inputCls } from '../../_components/Field'
import { renderMarkdown } from '@/lib/markdown'
import { DEFAULT_SETTINGS } from '@/lib/site-settings'

type PageId = 'privacy' | 'terms'

const LABELS: Record<PageId, string> = {
  privacy: 'Privacy Policy',
  terms:   'Terms of Service',
}

export default function PageContentEditor({ pageId }: { pageId: PageId }) {
  const { draft, setDraft } = useSiteEditor()
  const page = draft.pages[pageId]

  const update = (patch: Partial<typeof page>) => {
    setDraft({
      ...draft,
      pages: { ...draft.pages, [pageId]: { ...page, ...patch } },
    })
  }

  const resetToDefault = () => {
    if (!confirm(`Reset ${LABELS[pageId]} to the original Events Malta template? Your current draft for this page will be lost.`)) return
    setDraft({
      ...draft,
      pages: { ...draft.pages, [pageId]: DEFAULT_SETTINGS.pages[pageId] },
    })
  }

  const previewHtml = useMemo(() => renderMarkdown(page.content_md), [page.content_md])

  return (
    <div>
      <Section title={page.title || LABELS[pageId]}>
        <Field label="Page title">
          <input className={inputCls} value={page.title} onChange={(e) => update({ title: e.target.value })} />
        </Field>
        <Field label="Last updated">
          <input className={inputCls} value={page.last_updated} onChange={(e) => update({ last_updated: e.target.value })} placeholder="4 May 2026" />
        </Field>
        <div className="sm:col-span-2 flex justify-end -mt-2">
          <button
            onClick={resetToDefault}
            className="text-xs text-gray-500 hover:text-red-600"
          >Reset to default</button>
        </div>
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
