'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export interface ConsentState {
  necessary: true
  analytics: boolean
  timestamp: string
}

const CONSENT_KEY = 'cookie_consent'
const CONSENT_VALID_DAYS = 365
const CONSENT_CHANGED_EVENT = 'cookie-consent-changed'

export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ConsentState
    const ageDays = (Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays > CONSENT_VALID_DAYS) return null
    return parsed
  } catch {
    return null
  }
}

function saveConsent(analytics: boolean) {
  const state: ConsentState = {
    necessary: true,
    analytics,
    timestamp: new Date().toISOString(),
  }
  localStorage.setItem(CONSENT_KEY, JSON.stringify(state))
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: state }))
}

export function clearConsent() {
  localStorage.removeItem(CONSENT_KEY)
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: null }))
}

export default function CookieBanner() {
  const [shown, setShown] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analyticsChoice, setAnalyticsChoice] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)

  useEffect(() => {
    if (!getConsent()) setShown(true)
    const handler = () => {
      if (!getConsent()) setShown(true)
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler)
  }, [])

  if (!shown) return null

  const acceptAll = () => { saveConsent(true); setShown(false) }
  const rejectAll = () => { saveConsent(false); setShown(false) }
  const savePrefs = () => { saveConsent(analyticsChoice); setShown(false) }

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-50 max-h-[80vh] overflow-y-auto"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col gap-4">
          <div>
            <h2 id="cookie-title" className="text-base font-semibold text-brand-dark mb-1">
              We value your privacy
            </h2>
            <p
              id="cookie-desc"
              className={`text-sm text-gray-600 leading-relaxed ${descExpanded ? '' : 'line-clamp-1 sm:line-clamp-none'}`}
            >
              We use cookies to make the site work and, with your consent, to understand
              how visitors use it via Google Analytics. You can accept all, reject non-essential
              cookies, or customise your preferences. Read our{' '}
              <Link href="/privacy" className="text-brand-teal-dark underline hover:no-underline">
                Privacy Policy
              </Link>{' '}
              for details. You can change your choice at any time from the footer.
            </p>
            <button
              type="button"
              onClick={() => setDescExpanded((e) => !e)}
              aria-expanded={descExpanded}
              className="sm:hidden text-xs font-medium text-brand-teal-dark underline mt-1"
            >
              {descExpanded ? 'Show less' : 'Read more'}
            </button>
          </div>

          {showDetails && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <div className="flex items-start justify-between gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-dark">Strictly necessary</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Required for the site to work (login session, security). Cannot be disabled.
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-400 px-3 py-1 bg-gray-200 rounded">
                  Always on
                </span>
              </div>

              <label className="flex items-start justify-between gap-4 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-dark">Analytics</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Google Analytics (GA4) — anonymous data about page views, traffic sources,
                    and device type to help us improve the site.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={analyticsChoice}
                  onChange={(e) => setAnalyticsChoice(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-brand-gold cursor-pointer flex-shrink-0"
                  aria-label="Enable analytics cookies"
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {!showDetails && (
              <button
                onClick={() => setShowDetails(true)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-brand-dark hover:bg-gray-50 transition-colors"
              >
                Customise
              </button>
            )}
            {showDetails && (
              <button
                onClick={savePrefs}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-brand-dark hover:bg-gray-50 transition-colors"
              >
                Save preferences
              </button>
            )}
            <button
              onClick={rejectAll}
              className="text-sm px-4 py-2 rounded-lg border border-brand-dark text-brand-dark hover:bg-brand-dark hover:text-white transition-colors font-medium"
            >
              Reject all
            </button>
            <button
              onClick={acceptAll}
              className="text-sm px-4 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold/90 text-brand-dark font-medium transition-colors"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
