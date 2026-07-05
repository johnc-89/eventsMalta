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
