// Server-safe block renderer. NO 'use client' — this is imported by the
// public homepage (server component) and by the admin canvas preview.
// Renderers must not use hooks (useState, useEffect, etc).

import Link from 'next/link'
import type { BlockInstance, BlockMaxWidth, SpacerSize, CtaColor, ImageBlockConfig, RichTextConfig, HeroConfig, SpacerConfig, CtaBannerConfig, CategoriesStripConfig, FeaturedEventsConfig, UpcomingEventsConfig, FaqConfig } from './types'
import { renderMarkdown } from '@/lib/markdown'
import EventCard from '@/components/EventCard'
import EventDisclaimer from '@/components/EventDisclaimer'
import DateRangeFilter from '@/components/DateRangeFilter'
import type { Category, Event } from '@/types'

interface FaqItem { id: number; question: string; answer: string }

export interface RenderContext {
  /** Full set of upcoming approved events (already date-filtered). */
  upcomingEvents: Event[]
  /** Pinned/featured events ordered by featured_order. */
  featuredEvents: Event[]
  /** All categories. */
  categories: Category[]
  /** Enabled FAQ items. */
  faqs: FaqItem[]
}

const MAX_WIDTH_CLS: Record<BlockMaxWidth, string> = {
  narrow:   'max-w-2xl',
  standard: 'max-w-4xl',
  wide:     'max-w-7xl',
  full:     'max-w-none',
}

const SPACER_CLS: Record<SpacerSize, string> = {
  sm: 'h-6',
  md: 'h-12',
  lg: 'h-20',
  xl: 'h-32',
}

const CTA_COLOR_CLS: Record<CtaColor, { bg: string; btn: string }> = {
  gold:     { bg: 'bg-brand-gold text-brand-dark',     btn: 'bg-brand-dark text-white hover:bg-brand-dark/90' },
  teal:     { bg: 'bg-brand-teal text-white',          btn: 'bg-white text-brand-teal hover:bg-brand-cream' },
  burgundy: { bg: 'bg-brand-burgundy text-white',      btn: 'bg-white text-brand-burgundy hover:bg-brand-cream' },
  dark:     { bg: 'bg-brand-dark text-white',          btn: 'theme-accent-bg' },
  accent:   { bg: 'theme-accent-bg',                   btn: 'bg-brand-dark text-white hover:bg-brand-dark/90' },
}

// ---- Per-type renderers --------------------------------------------------

function HeroR({ c }: { c: HeroConfig }) {
  return (
    <section
      className="relative bg-brand-dark text-white overflow-hidden"
      style={c.image_url ? {
        backgroundImage: `linear-gradient(rgba(26,31,54,${c.overlay_opacity}), rgba(26,31,54,${c.overlay_opacity})), url(${c.image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center relative">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold mb-4">
          {c.title_pre}{c.title_pre && ' '}
          <span className="theme-accent-text">{c.title_highlight}</span>
          {c.title_post && ' '}{c.title_post}
        </h1>
        <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto font-body">{c.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href={c.primary_cta.href} className="theme-accent-bg px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">
            {c.primary_cta.label}
          </Link>
          {c.secondary_cta.enabled && (
            <Link href={c.secondary_cta.href} className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors">
              {c.secondary_cta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

function RichTextR({ c }: { c: RichTextConfig }) {
  const html = renderMarkdown(c.content_md)
  const bg = c.background === 'cream' ? 'bg-brand-cream' : c.background === 'dark' ? 'bg-brand-dark text-white' : ''
  return (
    <section className={`${bg} py-12`}>
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 ${MAX_WIDTH_CLS[c.max_width]} ${c.align === 'center' ? 'text-center' : ''}`}>
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  )
}

function ImageR({ c }: { c: ImageBlockConfig }) {
  if (!c.image_url) return null
  /* eslint-disable @next/next/no-img-element */
  const img = (
    <img
      src={c.image_url}
      alt={c.alt}
      className={`w-full ${c.rounded ? 'rounded-xl' : ''}`}
    />
  )
  return (
    <section className="py-8">
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 ${MAX_WIDTH_CLS[c.max_width]}`}>
        {c.link_href ? <Link href={c.link_href}>{img}</Link> : img}
        {c.caption && <p className="mt-2 text-sm text-gray-500 text-center">{c.caption}</p>}
      </div>
    </section>
  )
}

function SpacerR({ c }: { c: SpacerConfig }) {
  return <div className={SPACER_CLS[c.size]} aria-hidden />
}

function CtaBannerR({ c }: { c: CtaBannerConfig }) {
  const cls = CTA_COLOR_CLS[c.color]
  return (
    <section className={`${cls.bg}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        {c.title && <h2 className="text-2xl sm:text-3xl font-heading font-bold mb-2">{c.title}</h2>}
        {c.body && <p className="opacity-90 mb-6 max-w-2xl mx-auto">{c.body}</p>}
        {c.button_label && c.button_href && (
          <Link href={c.button_href} className={`inline-block px-6 py-3 rounded-lg font-semibold transition-colors ${cls.btn}`}>
            {c.button_label}
          </Link>
        )}
      </div>
    </section>
  )
}

function CategoriesStripR({ c, ctx }: { c: CategoriesStripConfig; ctx: RenderContext }) {
  // ctx.categories now sources from the `tags` table (migration 0015 merged
  // categories into tags). The block-config field `category_slugs` is kept
  // for backwards compatibility with already-persisted block configs — it
  // just matches against tag slugs now.
  const cats = c.category_slugs.length === 0
    ? ctx.categories.filter((t) => t.slug)
    : ctx.categories.filter((t) => t.slug && c.category_slugs.includes(t.slug))
  const DATE_CHIPS = [
    { date: 'today',   label: 'Today' },
    { date: 'weekend', label: 'This Weekend' },
    { date: 'week',    label: 'This Week' },
    { date: 'month',   label: 'This Month' },
  ]

  if (cats.length === 0) return null
  return (
    <>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {c.title && <h2 className="text-xl font-heading font-bold text-brand-dark mb-3">{c.title}</h2>}
        {/* Tag pills — 2-row grid, scrolls horizontally if too many to fit */}
        <div className="bg-white rounded-xl shadow-sm border p-4 grid grid-flow-col grid-rows-2 auto-cols-max gap-3 overflow-x-auto pb-1">
          {cats.map((cat) => (
            <Link
              key={cat.id}
              href={`/events?tag=${cat.slug}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-cream hover:bg-brand-gold/15 hover:text-brand-dark text-sm font-medium text-brand-dark transition-colors whitespace-nowrap"
            >
              {cat.icon && <span>{cat.icon}</span>}
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Date quick-filters — separate strip below categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-3 pb-6">
        <div className="flex flex-wrap justify-center items-center gap-3">
          {DATE_CHIPS.map(({ date, label }) => (
            <Link
              key={date}
              href={`/events?date=${date}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 hover:border-brand-gold hover:bg-brand-gold/10 text-brand-dark text-sm font-medium transition-colors whitespace-nowrap shadow-sm"
            >
              {label}
            </Link>
          ))}
          <div className="w-px h-6 bg-gray-200 hidden sm:block" />
          <DateRangeFilter />
        </div>
      </section>
    </>
  )
}

function FeaturedEventsR({ c, ctx }: { c: FeaturedEventsConfig; ctx: RenderContext }) {
  const list = ctx.featuredEvents.slice(0, c.count)
  if (list.length === 0) return null
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-6">
        {c.title && <h2 className="text-2xl font-heading font-bold text-brand-dark">{c.title}</h2>}
        {c.show_view_all_link && (
          <Link href="/events" className="text-brand-cyan hover:text-brand-teal font-medium text-sm">View all →</Link>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((e) => <EventCard key={e.id} event={e} />)}
      </div>
    </section>
  )
}

function UpcomingEventsR({ c, ctx }: { c: UpcomingEventsConfig; ctx: RenderContext }) {
  let list = ctx.upcomingEvents
  if (c.category_slugs.length > 0) {
    // Look up the names of the selected tag slugs, then match against
    // events.tags[] (which stores names, not slugs).
    const selectedNames = new Set(
      ctx.categories.filter((t) => t.slug && c.category_slugs.includes(t.slug)).map((t) => t.name)
    )
    list = list.filter((e) => e.tags?.some((tag) => selectedNames.has(tag)))
  }
  list = list.slice(0, c.count)
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-6">
        {c.title && <h2 className="text-2xl font-heading font-bold text-brand-dark">{c.title}</h2>}
        {c.show_view_all_link && (
          <Link href="/events" className="text-brand-cyan hover:text-brand-teal font-medium text-sm">View all →</Link>
        )}
      </div>
      {list.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map((e) => <EventCard key={e.id} event={e} />)}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500 text-lg mb-4">No upcoming events match this filter.</p>
          <Link href="/events/create" className="inline-block theme-accent-bg px-6 py-3 rounded-lg font-semibold hover:opacity-90">
            Be the first to post!
          </Link>
        </div>
      )}
    </section>
  )
}

function FaqR({ c, ctx }: { c: FaqConfig; ctx: RenderContext }) {
  const list = c.limit > 0 ? ctx.faqs.slice(0, c.limit) : ctx.faqs
  if (list.length === 0) return null
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {c.title && <h2 className="text-2xl font-heading font-bold text-brand-dark mb-2 text-center">{c.title}</h2>}
      {c.intro && <p className="text-gray-600 text-center mb-6">{c.intro}</p>}
      <div className="space-y-4">
        {list.map((faq) => (
          <details key={faq.id} className="bg-white rounded-xl border p-5 group">
            <summary className="font-semibold text-brand-dark cursor-pointer list-none flex justify-between items-center">
              <span>{faq.question}</span>
              <span className="theme-accent-text text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-gray-600 mt-3 text-sm leading-relaxed whitespace-pre-line">{faq.answer}</p>
          </details>
        ))}
      </div>
      <EventDisclaimer variant="inline" className="mt-6 text-center" />
    </section>
  )
}

// ---- Public dispatcher ---------------------------------------------------

export function BlockRenderer({ block, context }: { block: BlockInstance; context: RenderContext }) {
  switch (block.type) {
    case 'hero':             return <HeroR             c={block.config as HeroConfig} />
    case 'rich_text':        return <RichTextR         c={block.config as RichTextConfig} />
    case 'image':            return <ImageR            c={block.config as ImageBlockConfig} />
    case 'spacer':           return <SpacerR           c={block.config as SpacerConfig} />
    case 'cta_banner':       return <CtaBannerR        c={block.config as CtaBannerConfig} />
    case 'categories_strip': return <CategoriesStripR  c={block.config as CategoriesStripConfig}  ctx={context} />
    case 'featured_events':  return <FeaturedEventsR   c={block.config as FeaturedEventsConfig}   ctx={context} />
    case 'upcoming_events':  return <UpcomingEventsR   c={block.config as UpcomingEventsConfig}   ctx={context} />
    case 'faq':              return <FaqR              c={block.config as FaqConfig}              ctx={context} />
    default:
      return null
  }
}
