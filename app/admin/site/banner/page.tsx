'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'
import type { BannerColor } from '@/lib/site-settings'

const COLOR_PREVIEW: Record<BannerColor, string> = {
  gold:     'bg-brand-gold text-brand-dark',
  teal:     'bg-brand-teal text-white',
  burgundy: 'bg-brand-burgundy text-white',
  dark:     'bg-brand-dark text-white',
}

export default function BannerEditor() {
  const { draft, patch } = useSiteEditor()
  const b = draft.banner
  return (
    <div>
      {/* Preview */}
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="text-xs uppercase tracking-widest text-gray-400 px-4 py-2 bg-gray-50 border-b">Preview</div>
        {b.enabled && b.message?.trim() ? (
          <div className={`${COLOR_PREVIEW[b.color]} text-center py-2 px-4 text-sm font-medium`}>
            {b.message}
            {b.link_label && b.link_href && <span className="ml-2 underline underline-offset-2 font-semibold">{b.link_label} →</span>}
          </div>
        ) : (
          <div className="bg-gray-50 text-gray-400 text-center py-3 text-sm italic">Banner disabled — visitors won't see anything.</div>
        )}
      </div>

      <Section title="Announcement banner" description="A thin bar at the very top of every page. Great for one-off announcements (new feature, holiday hours, big event).">
        <Field label="Show banner" full>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={b.enabled} onChange={(e) => patch('banner', { enabled: e.target.checked })} />
            <span>Banner is visible on the public site</span>
          </label>
        </Field>
        <Field label="Message" full>
          <input className={inputCls} value={b.message} onChange={(e) => patch('banner', { message: e.target.value })} placeholder="🎉 New: post events for free!" />
        </Field>
        <Field label="Link label (optional)">
          <input className={inputCls} value={b.link_label} onChange={(e) => patch('banner', { link_label: e.target.value })} placeholder="Find out more" />
        </Field>
        <Field label="Link URL">
          <input className={inputCls} value={b.link_href} onChange={(e) => patch('banner', { link_href: e.target.value })} placeholder="/events" />
        </Field>
        <Field label="Colour" full>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(COLOR_PREVIEW) as BannerColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => patch('banner', { color: c })}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${COLOR_PREVIEW[c]} ${b.color === c ? 'ring-2 ring-offset-2 ring-brand-dark' : 'opacity-70 hover:opacity-100'}`}
              >
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </Field>
      </Section>
    </div>
  )
}
