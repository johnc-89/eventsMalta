'use client'

import Link from 'next/link'
import { useSiteSettings } from '@/lib/site-settings-context'
import { clearConsent } from './CookieBanner'

export default function Footer() {
  const settings = useSiteSettings()
  const tagline = settings.footer.tagline
  const email = settings.footer.contact_email

  return (
    <footer className="bg-brand-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Discover — site-wide internal links so the SEO landing pages sit one
            click from every page (crawl depth 1). */}
        <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2 text-sm text-gray-400 pb-6 mb-6 border-b border-white/10">
          <Link href="/events/location/valletta" className="hover:text-brand-gold transition-colors">Valletta</Link>
          <Link href="/events/location/sliema" className="hover:text-brand-gold transition-colors">Sliema</Link>
          <Link href="/events/location/st-julians" className="hover:text-brand-gold transition-colors">St Julian&apos;s</Link>
          <Link href="/events/location/mdina" className="hover:text-brand-gold transition-colors">Mdina</Link>
          <Link href="/events/location/st-pauls-bay" className="hover:text-brand-gold transition-colors">St Paul&apos;s Bay</Link>
          <Link href="/events/location/gozo" className="hover:text-brand-gold transition-colors">Gozo</Link>
          <Link href="/events/today" className="hover:text-brand-gold transition-colors">Today</Link>
          <Link href="/events/this-weekend" className="hover:text-brand-gold transition-colors">This Weekend</Link>
          <Link href="/events/this-month" className="hover:text-brand-gold transition-colors">This Month</Link>
          <Link href="/events/locations" className="hover:text-brand-gold transition-colors">All Locations</Link>
          <Link href="/venues" className="hover:text-brand-gold transition-colors">All Venues</Link>
          <Link href="/events/tags" className="hover:text-brand-gold transition-colors">Categories</Link>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-400 font-body">{tagline}</p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <Link href="/events" className="hover:text-brand-gold transition-colors">Browse</Link>
            <Link href="/events/create" className="hover:text-brand-gold transition-colors">Post Event</Link>
            <Link href="/privacy" className="hover:text-brand-gold transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-brand-gold transition-colors">Terms</Link>
            <button
              onClick={clearConsent}
              className="hover:text-brand-gold transition-colors text-left"
            >
              Cookie settings
            </button>
            {email && (
              <a href={`mailto:${email}`} className="hover:text-brand-gold transition-colors">Contact</a>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
