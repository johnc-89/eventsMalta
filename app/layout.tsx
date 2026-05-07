import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { SiteSettingsProvider } from '@/lib/site-settings-context'
import { getPublishedSiteSettings } from '@/lib/site-settings'
import { getPalette } from '@/lib/site-palettes'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import SuspensionBanner from '@/components/SuspensionBanner'
import AnnouncementBanner from '@/components/AnnouncementBanner'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublishedSiteSettings().catch(() => null)
  const name = settings?.brand?.name ?? 'Events Malta'
  const tagline = settings?.brand?.tagline ?? 'Discover Events in Malta & Gozo'
  const description = settings?.seo?.default_meta_description
    ?? 'Discover parties, comedy gigs, concerts, festivals and more happening across Malta and Gozo. Browse and post events for free.'
  const ogImage = settings?.seo?.og_image_url ?? '/og-default.png'
  const twitterHandle = settings?.seo?.twitter_handle ?? '@eventsmalta'
  return {
    title: {
      default: `${name} — ${tagline}`,
      template: `%s | ${name}`,
    },
    description,
    metadataBase: new URL('https://eventsmalta.org'),
    icons: settings?.brand?.favicon_url ? { icon: settings.brand.favicon_url } : undefined,
    openGraph: {
      siteName: name,
      type: 'website',
      locale: 'en_MT',
      images: [{ url: ogImage, width: 1200, height: 630, alt: name }],
    },
    twitter: {
      card: 'summary_large_image',
      site: twitterHandle,
    },
    robots: { index: true, follow: true },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Settings are loaded once per request server-side. Failure (e.g. table
  // not yet migrated) falls back to defaults so the site never breaks.
  const settings = await getPublishedSiteSettings().catch(() => null)
  const safe = settings ?? (await import('@/lib/site-settings')).DEFAULT_SETTINGS
  const palette = getPalette(safe.brand.palette)
  const paletteStyle = palette.vars as unknown as React.CSSProperties

  return (
    <html lang="en">
      <body
        className="bg-gray-50 min-h-screen"
        style={paletteStyle}
        data-palette={palette.id}
      >
        <SiteSettingsProvider value={safe}>
          <AuthProvider>
            <AnnouncementBanner banner={safe.banner} />
            <Navbar />
            <SuspensionBanner />
            {children}
            <Footer />
          </AuthProvider>
        </SiteSettingsProvider>
      </body>
    </html>
  )
}
