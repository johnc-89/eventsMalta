'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getConsent } from './CookieBanner'

export default function Analytics({ gaId }: { gaId: string }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const update = () => setEnabled(!!getConsent()?.analytics)
    update()
    window.addEventListener('cookie-consent-changed', update)
    return () => window.removeEventListener('cookie-consent-changed', update)
  }, [])

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
