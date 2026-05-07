// Curated palette presets. Adding a new one here makes it instantly available
// in the admin /admin/site/theme picker — no other code changes needed.
//
// Each palette exposes CSS custom properties that override --accent-* on
// :root via the layout. Keep entries small and high-contrast.

export interface Palette {
  id: string
  name: string
  description: string
  /** What's printed in the swatches in the picker */
  preview: { primary: string; secondary: string; bg: string }
  /** CSS variables applied to <body data-palette={id}> */
  vars: {
    '--accent':           string  // primary CTA bg, hero highlight
    '--accent-fg':        string  // text on top of accent
    '--accent-soft':      string  // hover / soft tint
    '--accent-2':         string  // links, secondary highlights
    '--banner-bg':        string  // announcement banner default
  }
}

export const PALETTES: Palette[] = [
  {
    id: 'gold-teal',
    name: 'Gold & Teal',
    description: 'The original Events Malta look — warm gold accent with cool teal highlights.',
    preview: { primary: '#f5a623', secondary: '#0d9488', bg: '#1a1f36' },
    vars: {
      '--accent':       '#f5a623',
      '--accent-fg':    '#1a1f36',
      '--accent-soft':  'rgba(245, 166, 35, 0.15)',
      '--accent-2':     '#22d3ee',
      '--banner-bg':    '#f5a623',
    },
  },
  {
    id: 'cyan-burgundy',
    name: 'Cyan & Burgundy',
    description: 'Bolder, theatrical. Cyan primary, burgundy depth.',
    preview: { primary: '#22d3ee', secondary: '#9b1c1c', bg: '#1a1f36' },
    vars: {
      '--accent':       '#22d3ee',
      '--accent-fg':    '#1a1f36',
      '--accent-soft':  'rgba(34, 211, 238, 0.15)',
      '--accent-2':     '#9b1c1c',
      '--banner-bg':    '#0d9488',
    },
  },
  {
    id: 'cream-burgundy',
    name: 'Cream & Burgundy',
    description: 'Warm, editorial. Cream backgrounds, burgundy primary.',
    preview: { primary: '#9b1c1c', secondary: '#f5a623', bg: '#fdf8f0' },
    vars: {
      '--accent':       '#9b1c1c',
      '--accent-fg':    '#ffffff',
      '--accent-soft':  'rgba(155, 28, 28, 0.10)',
      '--accent-2':     '#f5a623',
      '--banner-bg':    '#9b1c1c',
    },
  },
]

export const DEFAULT_PALETTE_ID = 'gold-teal'

export function getPalette(id: string | undefined | null): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}
