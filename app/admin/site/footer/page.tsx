'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'

export default function FooterEditor() {
  const { draft, patch } = useSiteEditor()
  const f = draft.footer
  return (
    <div>
      <div className="rounded-xl border border-gray-200 overflow-hidden mb-4 bg-brand-dark text-gray-400">
        <div className="text-xs uppercase tracking-widest text-white/30 px-4 py-2 border-b border-white/5">Preview</div>
        <div className="px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>{f.tagline || '—'}</p>
          <div className="flex gap-4 text-xs">
            <span>Browse</span><span>Post Event</span><span>Privacy</span><span>Terms</span>
            {f.contact_email && <span>Contact</span>}
          </div>
        </div>
      </div>

      <Section title="Footer" description="Shown at the bottom of every page.">
        <Field label="Tagline" full>
          <input className={inputCls} value={f.tagline} onChange={(e) => patch('footer', { tagline: e.target.value })} />
        </Field>
        <Field label="Contact email" hint="Used in the footer's “Contact” link as a mailto:. Leave blank to hide.">
          <input className={inputCls} value={f.contact_email} onChange={(e) => patch('footer', { contact_email: e.target.value })} placeholder="admin@eventsmalta.org" />
        </Field>
      </Section>
    </div>
  )
}
