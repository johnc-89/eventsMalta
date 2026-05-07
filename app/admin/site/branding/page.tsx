'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'
import ImageUpload from '../_components/ImageUpload'

export default function BrandingEditor() {
  const { draft, patch } = useSiteEditor()
  const b = draft.brand
  return (
    <div>
      <Section title="Site identity" description="Shown in the browser tab, share previews, and emails.">
        <Field label="Site name" full>
          <input className={inputCls} value={b.name} onChange={(e) => patch('brand', { name: e.target.value })} />
        </Field>
        <Field label="Tagline" hint="One line, used in the browser title and OpenGraph metadata." full>
          <input className={inputCls} value={b.tagline} onChange={(e) => patch('brand', { tagline: e.target.value })} />
        </Field>
      </Section>

      <Section title="Logo &amp; favicon" description="Logo appears in the navbar; favicon is the small browser-tab icon.">
        <Field label="Logo" hint="Recommended: PNG with transparent background, ~480×96, max 5 MB.">
          <ImageUpload kind="logo" aspect="5/1" value={b.logo_url} onChange={(url) => patch('brand', { logo_url: url })} />
        </Field>
        <Field label="Favicon" hint="Square PNG or ICO, 32×32 or 64×64.">
          <ImageUpload kind="favicon" aspect="1/1" value={b.favicon_url} onChange={(url) => patch('brand', { favicon_url: url })} />
        </Field>
      </Section>
    </div>
  )
}
