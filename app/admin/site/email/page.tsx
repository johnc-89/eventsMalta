'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'

export default function EmailEditor() {
  const { draft, patch } = useSiteEditor()
  const e = draft.email
  return (
    <div>
      <Section title="Email signature" description="HTML appended to every transactional email (new event submission, approval, rejection). Useful for branding, contact info, or unsubscribe notes.">
        <Field label="Signature (HTML)" full hint="Plain HTML, no scripts. Common patterns: a sign-off line, a small logo, a contact link. Visit a test email to confirm it renders correctly.">
          <textarea
            className={`${inputCls} font-mono text-xs leading-relaxed`}
            rows={6}
            value={e.signature_html}
            onChange={(ev) => patch('email', { signature_html: ev.target.value })}
            placeholder='<p>— The Events Malta team<br><a href="https://eventsmalta.org">eventsmalta.org</a></p>'
          />
        </Field>
        <div className="sm:col-span-2">
          <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mt-2 mb-2">Preview</h4>
          <div
            className="rounded-lg border border-gray-200 bg-white p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: e.signature_html || '<span style="color:#999;font-style:italic">No signature set — emails will go out without one.</span>' }}
          />
        </div>
      </Section>
    </div>
  )
}
