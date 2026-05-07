'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'
import ImageUpload from '../_components/ImageUpload'

export default function SeoEditor() {
  const { draft, patch } = useSiteEditor()
  const s = draft.seo
  return (
    <div>
      <Section title="Search engine defaults" description="Used as fallbacks for pages that don't specify their own metadata.">
        <Field label="Default meta description" hint={`${s.default_meta_description.length}/160 characters — keep it under 160 for full display in search results.`} full>
          <textarea
            className={inputCls}
            rows={3}
            value={s.default_meta_description}
            onChange={(e) => patch('seo', { default_meta_description: e.target.value })}
          />
        </Field>
        <Field label="Twitter / X handle" hint="Used for X attribution on shared links.">
          <input className={inputCls} value={s.twitter_handle} onChange={(e) => patch('seo', { twitter_handle: e.target.value })} placeholder="@eventsmalta" />
        </Field>
      </Section>

      <Section title="Default share image (OpenGraph)" description="The 1200×630 image shown when someone shares a link to your site on Facebook, X, WhatsApp, Slack, etc.">
        <Field label="OG image" full hint="Recommended: 1200×630 PNG or JPG, max 5 MB.">
          <ImageUpload kind="og" aspect="1200/630" value={s.og_image_url} onChange={(url) => patch('seo', { og_image_url: url })} />
        </Field>
      </Section>
    </div>
  )
}
