import { cache } from 'react'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import type { BlockInstance } from './types'
import { interpolate, type PlaceholderValues, type LandingType } from './placeholders'

// Resolution + metadata for block-editable landing pages.
//
// A landing URL resolves its blocks in order of specificity:
//   1. per-instance override  → block_pages slug 'landing:<type>:<instance>'
//   2. type template          → block_pages slug 'landing:<type>'
//   3. (caller falls back)    → the hard-coded EventLanding component
//
// The first slug with a non-empty published_blocks wins. If neither exists (or
// the meta columns aren't migrated yet), resolveLandingBlocks returns null and
// the page keeps rendering its original hard-coded layout — a safe rollout.

export interface LandingMeta {
  seo_title?: string
  seo_description?: string
}

export interface LandingPageData {
  blocks: BlockInstance[]
  meta: LandingMeta
}

function slugsFor(type: LandingType, instance?: string): string[] {
  return instance ? [`landing:${type}:${instance}`, `landing:${type}`] : [`landing:${type}`]
}

/**
 * Fetch the published blocks/meta for a landing URL, most-specific first.
 * cache()'d so generateMetadata and the page body share one query per request.
 */
export const resolveLandingBlocks = cache(
  async (type: LandingType, instance?: string): Promise<LandingPageData | null> => {
    const slugs = slugsFor(type, instance)
    const { data, error } = await supabase
      .from('block_pages_public')
      .select('slug, published_blocks, published_meta')
      .in('slug', slugs)
    if (error || !data) return null // includes pre-migration (no published_meta) → safe fallback

    for (const slug of slugs) {
      const row = data.find((r) => r.slug === slug)
      const blocks = (row?.published_blocks as BlockInstance[] | null) ?? []
      if (blocks.length > 0) {
        return { blocks, meta: (row?.published_meta as LandingMeta | null) ?? {} }
      }
    }
    return null
  },
)

/**
 * Build a Metadata object from a landing page's SEO meta template, interpolating
 * {placeholders}. Returns null when there's no usable override so the caller can
 * fall back to its own hard-coded metadata.
 */
export function landingMetadata(
  data: LandingPageData | null,
  placeholders: PlaceholderValues,
  canonical: string,
): Metadata | null {
  if (!data) return null
  const title = data.meta.seo_title ? interpolate(data.meta.seo_title, placeholders) : null
  const description = data.meta.seo_description ? interpolate(data.meta.seo_description, placeholders) : null
  if (!title && !description) return null
  return {
    title: title ?? undefined,
    description: description ?? undefined,
    alternates: { canonical },
    openGraph: {
      title: title ?? undefined,
      description: description ?? undefined,
      type: 'website',
      url: canonical,
    },
  }
}
