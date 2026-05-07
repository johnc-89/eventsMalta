'use client'

// Client-side mirror of the published site settings, hydrated by the root
// server layout. Lets client components (Navbar, Footer, etc.) read brand
// values without each one re-fetching.

import { createContext, useContext } from 'react'
import type { SiteSettingsShape } from './site-settings'
import { DEFAULT_SETTINGS } from './site-settings'

const SiteSettingsContext = createContext<SiteSettingsShape>(DEFAULT_SETTINGS)

export function SiteSettingsProvider({
  value,
  children,
}: {
  value: SiteSettingsShape
  children: React.ReactNode
}) {
  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  )
}

export const useSiteSettings = () => useContext(SiteSettingsContext)
