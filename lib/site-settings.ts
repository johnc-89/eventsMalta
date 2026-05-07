import { supabase } from '@/lib/supabase'
import { DEFAULT_PALETTE_ID } from './site-palettes'

export type BannerColor = 'gold' | 'teal' | 'burgundy' | 'dark'

export interface SiteSettingsShape {
  brand: {
    name: string
    tagline: string
    palette: string             // palette id (see lib/site-palettes.ts)
    logo_url: string | null
    favicon_url: string | null
  }
  hero: {
    title_pre: string           // "Discover Events in"
    title_highlight: string     // "Malta" — rendered in accent colour
    title_post: string          // optional trailing words after the highlight
    subtitle: string
    primary_cta:   { label: string; href: string }
    secondary_cta: { label: string; href: string; enabled: boolean }
    image_url: string | null    // optional background image
    overlay_opacity: number     // 0..1, only used when image is set
  }
  banner: {
    enabled: boolean
    message: string
    link_label: string
    link_href: string
    color: BannerColor
  }
  footer: {
    tagline: string
    contact_email: string
  }
}

/** Defaults used when the DB row is empty. Keep these matching the current
 *  hardcoded copy on the site so the first deploy looks identical. */
export const DEFAULT_SETTINGS: SiteSettingsShape = {
  brand: {
    name: 'Events Malta',
    tagline: 'Discover what’s happening on the island.',
    palette: DEFAULT_PALETTE_ID,
    logo_url: null,
    favicon_url: null,
  },
  hero: {
    title_pre: 'Discover Events in',
    title_highlight: 'Malta',
    title_post: '',
    subtitle: 'Parties, comedy gigs, concerts, festivals and more — find your next night out or day event across Malta and Gozo.',
    primary_cta:   { label: 'Browse Events',   href: '/events' },
    secondary_cta: { label: 'Post Your Event', href: '/events/create', enabled: true },
    image_url: null,
    overlay_opacity: 0.55,
  },
  banner: {
    enabled: false,
    message: '',
    link_label: '',
    link_href: '',
    color: 'gold',
  },
  footer: {
    tagline: 'Events Malta — Discover what’s happening on the island.',
    contact_email: 'admin@eventsmalta.org',
  },
}

/** Deep-merge user settings on top of defaults so missing keys don't crash. */
function mergeWithDefaults(input: Partial<SiteSettingsShape> | null | undefined): SiteSettingsShape {
  const src = (input ?? {}) as any
  return {
    brand:  { ...DEFAULT_SETTINGS.brand,  ...(src.brand  ?? {}) },
    hero:   {
      ...DEFAULT_SETTINGS.hero,
      ...(src.hero ?? {}),
      primary_cta:   { ...DEFAULT_SETTINGS.hero.primary_cta,   ...(src.hero?.primary_cta   ?? {}) },
      secondary_cta: { ...DEFAULT_SETTINGS.hero.secondary_cta, ...(src.hero?.secondary_cta ?? {}) },
    },
    banner: { ...DEFAULT_SETTINGS.banner, ...(src.banner ?? {}) },
    footer: { ...DEFAULT_SETTINGS.footer, ...(src.footer ?? {}) },
  }
}

/** Server- or client-safe: reads the *published* settings the public sees. */
export async function getPublishedSiteSettings(): Promise<SiteSettingsShape> {
  const { data } = await supabase
    .from('site_settings_public')
    .select('published')
    .single()
  return mergeWithDefaults(data?.published as Partial<SiteSettingsShape> | undefined)
}

/** Super-admin only: read the draft (the page admins are editing). */
export async function getDraftSiteSettings(): Promise<SiteSettingsShape> {
  const { data } = await supabase
    .from('site_settings')
    .select('draft')
    .eq('id', 1)
    .single()
  return mergeWithDefaults(data?.draft as Partial<SiteSettingsShape> | undefined)
}

export { mergeWithDefaults }
