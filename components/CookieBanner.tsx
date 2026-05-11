'use client'

import { useEffect, useState } from 'react'

export default function CookieBanner() {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent')
    if (!consent) setShown(true)
  }, [])

  const accept = () => {
    localStorage.setItem('cookie_consent', 'accepted')
    setShown(false)
  }

  const dismiss = () => {
    localStorage.setItem('cookie_consent', 'dismissed')
    setShown(false)
  }

  if (!shown) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-brand-dark text-white px-4 py-3 shadow-lg z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm">
          We use Google Analytics to understand how you use our site. No personal data is collected.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={dismiss}
            className="text-xs px-3 py-1 rounded border border-white/30 hover:bg-white/10 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={accept}
            className="text-xs px-3 py-1 rounded bg-brand-gold text-brand-dark hover:bg-brand-gold/90 transition-colors font-medium"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
