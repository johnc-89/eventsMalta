import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import SuspensionBanner from '@/components/SuspensionBanner'

export const metadata: Metadata = {
  title: {
    default: 'Events Malta — Discover Events in Malta & Gozo',
    template: '%s | Events Malta',
  },
  description: 'Discover parties, comedy gigs, concerts, festivals and more happening across Malta and Gozo. Browse and post events for free.',
  metadataBase: new URL('https://eventsmalta.org'),
  openGraph: {
    siteName: 'Events Malta',
    type: 'website',
    locale: 'en_MT',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Events Malta' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@eventsmalta',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <AuthProvider>
          <Navbar />
          <SuspensionBanner />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}
