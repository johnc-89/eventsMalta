'use client'

import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'
import ImageUpload from '../_components/ImageUpload'

export default function HeroEditor() {
  const { draft, patch } = useSiteEditor()
  const h = draft.hero
  return (
    <div>
      {/* Live preview */}
      <div
        className="relative bg-brand-dark text-white rounded-xl overflow-hidden border border-gray-200 mb-4"
        style={h.image_url ? {
          backgroundImage: `linear-gradient(rgba(26,31,54,${h.overlay_opacity}), rgba(26,31,54,${h.overlay_opacity})), url(${h.image_url})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        } : undefined}
      >
        <div className="px-6 py-12 text-center">
          <div className="text-xs uppercase tracking-widest text-white/40 mb-3">Preview</div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold">
            {h.title_pre}{h.title_pre && ' '}
            <span className="theme-accent-text">{h.title_highlight}</span>
            {h.title_post && ' '}{h.title_post}
          </h1>
          <p className="text-base text-gray-300 mt-3 max-w-2xl mx-auto">{h.subtitle}</p>
          <div className="flex gap-3 justify-center mt-5">
            <span className="theme-accent-bg px-5 py-2 rounded-lg text-sm font-semibold">{h.primary_cta.label || 'Primary CTA'}</span>
            {h.secondary_cta.enabled && <span className="border-2 border-white text-white px-5 py-2 rounded-lg text-sm font-semibold">{h.secondary_cta.label || 'Secondary CTA'}</span>}
          </div>
        </div>
      </div>

      <Section title="Hero text" description="The headline rendered with the highlighted word in your accent colour.">
        <Field label="Title — text before highlight">
          <input className={inputCls} value={h.title_pre} onChange={(e) => patch('hero', { title_pre: e.target.value })} placeholder="Discover Events in" />
        </Field>
        <Field label="Title — highlighted word">
          <input className={inputCls} value={h.title_highlight} onChange={(e) => patch('hero', { title_highlight: e.target.value })} placeholder="Malta" />
        </Field>
        <Field label="Title — text after highlight (optional)" full>
          <input className={inputCls} value={h.title_post} onChange={(e) => patch('hero', { title_post: e.target.value })} placeholder="" />
        </Field>
        <Field label="Subtitle" full>
          <textarea className={inputCls} rows={3} value={h.subtitle} onChange={(e) => patch('hero', { subtitle: e.target.value })} />
        </Field>
      </Section>

      <Section title="Call-to-action buttons" description="The primary button is always shown. The secondary button is optional.">
        <Field label="Primary button label">
          <input className={inputCls} value={h.primary_cta.label} onChange={(e) => patch('hero', { primary_cta: { ...h.primary_cta, label: e.target.value } })} />
        </Field>
        <Field label="Primary button link">
          <input className={inputCls} value={h.primary_cta.href} onChange={(e) => patch('hero', { primary_cta: { ...h.primary_cta, href: e.target.value } })} placeholder="/events" />
        </Field>
        <Field label="Secondary button label">
          <input className={inputCls} value={h.secondary_cta.label} onChange={(e) => patch('hero', { secondary_cta: { ...h.secondary_cta, label: e.target.value } })} />
        </Field>
        <Field label="Secondary button link">
          <input className={inputCls} value={h.secondary_cta.href} onChange={(e) => patch('hero', { secondary_cta: { ...h.secondary_cta, href: e.target.value } })} placeholder="/events/create" />
        </Field>
        <Field label="Show secondary button" full>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={h.secondary_cta.enabled} onChange={(e) => patch('hero', { secondary_cta: { ...h.secondary_cta, enabled: e.target.checked } })} />
            <span>Display the secondary CTA</span>
          </label>
        </Field>
      </Section>

      <Section title="Background image (optional)" description="If left empty, the hero uses the dark brand colour as its background.">
        <Field label="Hero background" full hint="Wide landscape image, ~1920×800, max 5 MB.">
          <ImageUpload kind="hero" aspect="3/1" value={h.image_url} onChange={(url) => patch('hero', { image_url: url })} />
        </Field>
        <Field label="Image overlay darkness" full hint={`${Math.round(h.overlay_opacity * 100)}% — higher = darker, makes text easier to read.`}>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={h.overlay_opacity}
            onChange={(e) => patch('hero', { overlay_opacity: parseFloat(e.target.value) })}
            className="w-full"
            disabled={!h.image_url}
          />
        </Field>
      </Section>
    </div>
  )
}
