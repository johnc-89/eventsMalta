'use client'

// Per-block editor forms. Reads/writes a BlockInstance.config via onChange.
// Each editor is a small functional component used inside the Config Panel
// of the block builder.

import { Field, inputCls } from '@/app/admin/site/_components/Field'
import ImageUpload from '@/app/admin/site/_components/ImageUpload'
import type {
  BlockInstance, HeroConfig, RichTextConfig, ImageBlockConfig, SpacerConfig,
  CtaBannerConfig, CategoriesStripConfig, FeaturedEventsConfig,
  UpcomingEventsConfig, FaqConfig, BlockMaxWidth, SpacerSize, CtaColor,
} from './types'
import type { Category } from '@/types'

interface EditorProps<T extends BlockInstance> {
  block: T
  onChange: (next: T) => void
  /** Categories list for blocks that filter by category (passed by parent). */
  categories?: Category[]
}

const MAX_WIDTHS: { id: BlockMaxWidth; label: string }[] = [
  { id: 'narrow',   label: 'Narrow' },
  { id: 'standard', label: 'Standard' },
  { id: 'wide',     label: 'Wide' },
  { id: 'full',     label: 'Full bleed' },
]

const SPACER_SIZES: { id: SpacerSize; label: string; px: string }[] = [
  { id: 'sm', label: 'Small',  px: '24 px' },
  { id: 'md', label: 'Medium', px: '48 px' },
  { id: 'lg', label: 'Large',  px: '80 px' },
  { id: 'xl', label: 'X-Large', px: '128 px' },
]

const CTA_COLORS: { id: CtaColor; label: string; preview: string }[] = [
  { id: 'accent',   label: 'Accent',   preview: 'bg-brand-gold' },
  { id: 'gold',     label: 'Gold',     preview: 'bg-brand-gold' },
  { id: 'teal',     label: 'Teal',     preview: 'bg-brand-teal' },
  { id: 'burgundy', label: 'Burgundy', preview: 'bg-brand-burgundy' },
  { id: 'dark',     label: 'Dark',     preview: 'bg-brand-dark' },
]

// ---- Hero ----------------------------------------------------------------
function HeroEd({ block, onChange }: EditorProps<BlockInstance<'hero'>>) {
  const c = block.config as HeroConfig
  const set = (patch: Partial<HeroConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Title — text before highlight">
        <input className={inputCls} value={c.title_pre} onChange={(e) => set({ title_pre: e.target.value })} />
      </Field>
      <Field label="Title — highlighted word">
        <input className={inputCls} value={c.title_highlight} onChange={(e) => set({ title_highlight: e.target.value })} />
      </Field>
      <Field label="Title — text after highlight (optional)" full>
        <input className={inputCls} value={c.title_post} onChange={(e) => set({ title_post: e.target.value })} />
      </Field>
      <Field label="Subtitle" full>
        <textarea className={inputCls} rows={3} value={c.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </Field>
      <Field label="Primary button label">
        <input className={inputCls} value={c.primary_cta.label} onChange={(e) => set({ primary_cta: { ...c.primary_cta, label: e.target.value } })} />
      </Field>
      <Field label="Primary button link">
        <input className={inputCls} value={c.primary_cta.href}  onChange={(e) => set({ primary_cta: { ...c.primary_cta, href: e.target.value } })} />
      </Field>
      <Field label="Secondary button label">
        <input className={inputCls} value={c.secondary_cta.label} onChange={(e) => set({ secondary_cta: { ...c.secondary_cta, label: e.target.value } })} />
      </Field>
      <Field label="Secondary button link">
        <input className={inputCls} value={c.secondary_cta.href}  onChange={(e) => set({ secondary_cta: { ...c.secondary_cta, href: e.target.value } })} />
      </Field>
      <Field label="Show secondary button" full>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.secondary_cta.enabled} onChange={(e) => set({ secondary_cta: { ...c.secondary_cta, enabled: e.target.checked } })} />
          Display the secondary CTA
        </label>
      </Field>
      <Field label="Background image" full hint="Wide landscape image, ~1920×800.">
        <ImageUpload kind="hero" aspect="3/1" value={c.image_url} onChange={(u) => set({ image_url: u })} />
      </Field>
      <Field label="Image overlay darkness" full hint={`${Math.round(c.overlay_opacity * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={c.overlay_opacity}
          onChange={(e) => set({ overlay_opacity: parseFloat(e.target.value) })}
          className="w-full" disabled={!c.image_url} />
      </Field>
    </>
  )
}

// ---- Rich text -----------------------------------------------------------
function RichTextEd({ block, onChange }: EditorProps<BlockInstance<'rich_text'>>) {
  const c = block.config as RichTextConfig
  const set = (patch: Partial<RichTextConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Markdown body" full hint="**bold** *italic* [link](url) - lists, ## headings">
        <textarea className={`${inputCls} font-mono text-xs`} rows={10}
          value={c.content_md} onChange={(e) => set({ content_md: e.target.value })} />
      </Field>
      <Field label="Width">
        <select className={inputCls} value={c.max_width} onChange={(e) => set({ max_width: e.target.value as BlockMaxWidth })}>
          {MAX_WIDTHS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </Field>
      <Field label="Background">
        <select className={inputCls} value={c.background} onChange={(e) => set({ background: e.target.value as RichTextConfig['background'] })}>
          <option value="none">None</option>
          <option value="cream">Cream</option>
          <option value="dark">Dark</option>
        </select>
      </Field>
      <Field label="Alignment" full>
        <div className="flex gap-2">
          {(['left', 'center'] as const).map((a) => (
            <button key={a} type="button" onClick={() => set({ align: a })}
              className={`px-3 py-1.5 rounded-lg text-sm border ${c.align === a ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {a === 'left' ? 'Left' : 'Centered'}
            </button>
          ))}
        </div>
      </Field>
    </>
  )
}

// ---- Image ---------------------------------------------------------------
function ImageEd({ block, onChange }: EditorProps<BlockInstance<'image'>>) {
  const c = block.config as ImageBlockConfig
  const set = (patch: Partial<ImageBlockConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Image" full hint="Max 5 MB.">
        <ImageUpload kind="block-image" aspect="16/9" value={c.image_url} onChange={(u) => set({ image_url: u })} />
      </Field>
      <Field label="Alt text" hint="Describes the image for screen readers and SEO.">
        <input className={inputCls} value={c.alt} onChange={(e) => set({ alt: e.target.value })} />
      </Field>
      <Field label="Caption (optional)">
        <input className={inputCls} value={c.caption} onChange={(e) => set({ caption: e.target.value })} />
      </Field>
      <Field label="Link the image to (optional)" full>
        <input className={inputCls} value={c.link_href} onChange={(e) => set({ link_href: e.target.value })} placeholder="/events or https://…" />
      </Field>
      <Field label="Width">
        <select className={inputCls} value={c.max_width} onChange={(e) => set({ max_width: e.target.value as BlockMaxWidth })}>
          {MAX_WIDTHS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </Field>
      <Field label="Rounded corners">
        <label className="inline-flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" checked={c.rounded} onChange={(e) => set({ rounded: e.target.checked })} />
          Apply rounded corners
        </label>
      </Field>
    </>
  )
}

// ---- Spacer --------------------------------------------------------------
function SpacerEd({ block, onChange }: EditorProps<BlockInstance<'spacer'>>) {
  const c = block.config as SpacerConfig
  return (
    <Field label="Size" full>
      <div className="flex gap-2 flex-wrap">
        {SPACER_SIZES.map((s) => (
          <button key={s.id} type="button"
            onClick={() => onChange({ ...block, config: { size: s.id } })}
            className={`px-3 py-1.5 rounded-lg text-sm border ${c.size === s.id ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            {s.label} <span className="opacity-60 text-xs">{s.px}</span>
          </button>
        ))}
      </div>
    </Field>
  )
}

// ---- CTA banner ----------------------------------------------------------
function CtaBannerEd({ block, onChange }: EditorProps<BlockInstance<'cta_banner'>>) {
  const c = block.config as CtaBannerConfig
  const set = (patch: Partial<CtaBannerConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Title" full>
        <input className={inputCls} value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Body" full>
        <textarea className={inputCls} rows={2} value={c.body} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      <Field label="Button label">
        <input className={inputCls} value={c.button_label} onChange={(e) => set({ button_label: e.target.value })} />
      </Field>
      <Field label="Button link">
        <input className={inputCls} value={c.button_href} onChange={(e) => set({ button_href: e.target.value })} />
      </Field>
      <Field label="Colour" full>
        <div className="flex gap-2 flex-wrap">
          {CTA_COLORS.map((col) => (
            <button key={col.id} type="button" onClick={() => set({ color: col.id })}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${c.color === col.id ? 'border-brand-dark ring-2 ring-brand-dark/10' : 'border-gray-200 hover:bg-gray-50'}`}>
              <span className={`w-3 h-3 rounded-full ${col.preview}`} />
              {col.label}
            </button>
          ))}
        </div>
      </Field>
    </>
  )
}

// ---- Categories strip ----------------------------------------------------
function CategoriesStripEd({ block, onChange, categories = [] }: EditorProps<BlockInstance<'categories_strip'>>) {
  const c = block.config as CategoriesStripConfig
  const set = (patch: Partial<CategoriesStripConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  const toggle = (slug: string) => {
    const next = c.category_slugs.includes(slug)
      ? c.category_slugs.filter((s) => s !== slug)
      : [...c.category_slugs, slug]
    set({ category_slugs: next })
  }
  return (
    <>
      <Field label="Title (optional)" full hint="Leave blank to omit a heading above the strip.">
        <input className={inputCls} value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Categories shown" full hint={c.category_slugs.length === 0 ? 'Showing all categories. Click to limit to specific ones.' : `Showing ${c.category_slugs.length} category${c.category_slugs.length === 1 ? '' : 'ies'}.`}>
        <div className="flex flex-wrap gap-2">
          {categories.filter((cat): cat is typeof cat & { slug: string } => !!cat.slug).map((cat) => {
            const on = c.category_slugs.length === 0 || c.category_slugs.includes(cat.slug)
            return (
              <button key={cat.slug} type="button" onClick={() => toggle(cat.slug)}
                className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 border ${on ? 'bg-brand-cream text-brand-dark border-brand-gold/30' : 'bg-white text-gray-400 border-gray-200'}`}>
                {cat.icon && <span>{cat.icon}</span>}{cat.name}
              </button>
            )
          })}
        </div>
        {c.category_slugs.length > 0 && (
          <button type="button" onClick={() => set({ category_slugs: [] })} className="text-xs text-gray-500 hover:text-brand-dark mt-2">Reset to all</button>
        )}
      </Field>
    </>
  )
}

// ---- Featured events -----------------------------------------------------
function FeaturedEventsEd({ block, onChange }: EditorProps<BlockInstance<'featured_events'>>) {
  const c = block.config as FeaturedEventsConfig
  const set = (patch: Partial<FeaturedEventsConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Title" full>
        <input className={inputCls} value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="How many to show" hint="Pick events in the Featured tab.">
        <input type="number" min={1} max={12} className={inputCls} value={c.count} onChange={(e) => set({ count: Math.max(1, parseInt(e.target.value) || 1) })} />
      </Field>
      <Field label="Show 'View all' link">
        <label className="inline-flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" checked={c.show_view_all_link} onChange={(e) => set({ show_view_all_link: e.target.checked })} />
          Display
        </label>
      </Field>
    </>
  )
}

// ---- Upcoming events -----------------------------------------------------
function UpcomingEventsEd({ block, onChange, categories = [] }: EditorProps<BlockInstance<'upcoming_events'>>) {
  const c = block.config as UpcomingEventsConfig
  const set = (patch: Partial<UpcomingEventsConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  const toggle = (slug: string) => {
    const next = c.category_slugs.includes(slug)
      ? c.category_slugs.filter((s) => s !== slug)
      : [...c.category_slugs, slug]
    set({ category_slugs: next })
  }
  return (
    <>
      <Field label="Title" full>
        <input className={inputCls} value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="How many to show first">
        <input type="number" min={1} max={24} className={inputCls} value={c.count} onChange={(e) => set({ count: Math.max(1, parseInt(e.target.value) || 1) })} />
      </Field>
      <Field label="Max to load on scroll" hint="Lazy-loads up to this many, then links to all events.">
        <input type="number" min={1} max={120} className={inputCls} value={c.max_items ?? 36} onChange={(e) => set({ max_items: Math.max(1, parseInt(e.target.value) || 1) })} />
      </Field>
      <Field label="Show 'View all' link">
        <label className="inline-flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" checked={c.show_view_all_link} onChange={(e) => set({ show_view_all_link: e.target.checked })} />
          Display
        </label>
      </Field>
      <Field label="Filter by category" full hint={c.category_slugs.length === 0 ? 'Showing all categories. Click to filter.' : ''}>
        <div className="flex flex-wrap gap-2">
          {categories.filter((cat): cat is typeof cat & { slug: string } => !!cat.slug).map((cat) => {
            const on = c.category_slugs.length === 0 || c.category_slugs.includes(cat.slug)
            return (
              <button key={cat.slug} type="button" onClick={() => toggle(cat.slug)}
                className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 border ${on ? 'bg-brand-cream text-brand-dark border-brand-gold/30' : 'bg-white text-gray-400 border-gray-200'}`}>
                {cat.icon && <span>{cat.icon}</span>}{cat.name}
              </button>
            )
          })}
        </div>
        {c.category_slugs.length > 0 && (
          <button type="button" onClick={() => set({ category_slugs: [] })} className="text-xs text-gray-500 hover:text-brand-dark mt-2">Reset to all</button>
        )}
      </Field>
    </>
  )
}

// ---- FAQ -----------------------------------------------------------------
function FaqEd({ block, onChange }: EditorProps<BlockInstance<'faq'>>) {
  const c = block.config as FaqConfig
  const set = (patch: Partial<FaqConfig>) => onChange({ ...block, config: { ...c, ...patch } })
  return (
    <>
      <Field label="Title" full>
        <input className={inputCls} value={c.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Intro (optional)" full>
        <textarea className={inputCls} rows={2} value={c.intro} onChange={(e) => set({ intro: e.target.value })} />
      </Field>
      <Field label="Limit (0 = all)">
        <input type="number" min={0} max={50} className={inputCls} value={c.limit} onChange={(e) => set({ limit: Math.max(0, parseInt(e.target.value) || 0) })} />
      </Field>
      <Field label="Edit FAQ items" full>
        <a href="/admin/site/faq" className="text-sm text-brand-cyan hover:text-brand-teal">Manage FAQ items →</a>
      </Field>
    </>
  )
}

// ---- Public dispatcher ---------------------------------------------------

export function BlockEditor({ block, onChange, categories }: { block: BlockInstance; onChange: (next: BlockInstance) => void; categories?: Category[] }) {
  switch (block.type) {
    case 'hero':             return <HeroEd             block={block as any} onChange={onChange as any} />
    case 'rich_text':        return <RichTextEd         block={block as any} onChange={onChange as any} />
    case 'image':            return <ImageEd            block={block as any} onChange={onChange as any} />
    case 'spacer':           return <SpacerEd           block={block as any} onChange={onChange as any} />
    case 'cta_banner':       return <CtaBannerEd        block={block as any} onChange={onChange as any} />
    case 'categories_strip': return <CategoriesStripEd  block={block as any} onChange={onChange as any} categories={categories} />
    case 'featured_events':  return <FeaturedEventsEd   block={block as any} onChange={onChange as any} />
    case 'upcoming_events':  return <UpcomingEventsEd   block={block as any} onChange={onChange as any} categories={categories} />
    case 'faq':              return <FaqEd              block={block as any} onChange={onChange as any} />
    default: return null
  }
}
