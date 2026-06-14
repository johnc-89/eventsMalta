'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { getConsent } from './CookieBanner'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export default function Analytics({ gaId }: { gaId: string }) {
  const [enabled, setEnabled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const update = () => setEnabled(!!getConsent()?.analytics)
    update()
    window.addEventListener('cookie-consent-changed', update)
    return () => window.removeEventListener('cookie-consent-changed', update)
  }, [])

  // Next.js App Router does client-side navigation, so gtag's initial
  // config page_view only fires once. Send an explicit page_view on each
  // route change so internal navigations are counted reliably.
  useEffect(() => {
    if (!enabled || typeof window.gtag !== 'function') return
    window.gtag('event', 'page_view', { page_path: pathname })
  }, [enabled, pathname])

  if (!enabled) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${gaId}', { anonymize_ip: true });
      `}</Script>
    </>
  )
}
