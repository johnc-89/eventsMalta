'use client'

import { useBlockEditor } from '@/app/admin/site/blocks/BlockEditorContext'
import { inputCls } from '@/app/admin/site/_components/Field'
import { LANDING_TYPES, type LandingType } from '@/lib/blocks/placeholders'

// Rendered inside the block editor provider (via BlockBuilder's headerSlot) so
// it can read/write the page's SEO meta + trigger the starter layout.
export default function LandingControls({ type }: { type: LandingType }) {
  const { meta, setMeta, blocks, loadStarterLayout } = useBlockEditor()
  const placeholders = LANDING_TYPES[type].placeholders

  const onStarter = () => {
    if (blocks.length > 0 && !confirm('Replace the current draft with a starter layout? The current blocks and SEO for this page will be overwritten.')) return
    loadStarterLayout()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Placeholders</h3>
          <button
            onClick={onStarter}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            title="Fill this page with a ready-made layout you can then tweak"
          >Load starter layout</button>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          Use these tokens in any text block or the SEO fields below — each is filled in per page.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {placeholders.map((p) => (
            <span
              key={p.token}
              title={`${p.description} · e.g. ${p.sample}`}
              className="text-xs font-mono px-2 py-1 rounded bg-brand-cream text-brand-dark border border-brand-gold/30"
            >{`{${p.token}}`}</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">SEO title</span>
          <input
            className={inputCls}
            value={meta.seo_title ?? ''}
            onChange={(e) => setMeta({ seo_title: e.target.value })}
            placeholder="e.g. Events in {location} – {month_year} ({count} Upcoming)"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Meta description</span>
          <input
            className={inputCls}
            value={meta.seo_description ?? ''}
            onChange={(e) => setMeta({ seo_description: e.target.value })}
            placeholder="Shown under the title in search results…"
          />
        </label>
      </div>
      <p className="text-xs text-gray-400 -mt-1">Leave both SEO fields blank to keep the page&rsquo;s automatic title &amp; description.</p>
    </div>
  )
}
