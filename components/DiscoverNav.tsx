'use client'

import Link from 'next/link'

const LINKS: { href: string; label: string }[] = [
  { href: '/events/location/valletta', label: 'Valletta' },
  { href: '/events/location/sliema', label: 'Sliema' },
  { href: '/events/location/st-julians', label: "St Julian's" },
  { href: '/events/location/mdina', label: 'Mdina' },
  { href: '/events/location/st-pauls-bay', label: "St Paul's Bay" },
  { href: '/events/location/gozo', label: 'Gozo' },
  { href: '/events/today', label: 'Today' },
  { href: '/events/this-weekend', label: 'This Weekend' },
  { href: '/events/this-month', label: 'This Month' },
  { href: '/events/locations', label: 'All Locations' },
  { href: '/venues', label: 'All Venues' },
  { href: '/events/tags', label: 'Categories' },
]

export default function DiscoverNav() {
  return (
    <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="flex items-center justify-start md:justify-center gap-x-5 md:gap-x-6 py-2.5 pr-8 md:pr-0 overflow-x-auto whitespace-nowrap text-sm text-gray-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="hover:text-brand-gold transition-colors flex-shrink-0">
              {label}
            </Link>
          ))}
        </div>
        {/* The row scrolls with a hidden scrollbar — fade the right edge so a
            clipped label reads as "more this way" instead of broken. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white md:hidden" aria-hidden />
      </div>
    </div>
  )
}
