'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const GROUPS = [
  {
    label: 'Content',
    items: [
      { href: '/admin/site/blocks',   label: 'Blocks' },
      { href: '/admin/site/featured', label: 'Featured' },
      { href: '/admin/site/faq',      label: 'FAQ' },
      { href: '/admin/site/pages',    label: 'Pages' },
      { href: '/admin/site/banner',   label: 'Banner' },
    ],
  },
  {
    label: 'Design',
    items: [
      { href: '/admin/site/branding', label: 'Branding' },
      { href: '/admin/site/theme',    label: 'Theme' },
      { href: '/admin/site/footer',   label: 'Footer' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/admin/site/seo',       label: 'SEO' },
      { href: '/admin/site/email',     label: 'Email' },
      { href: '/admin/site/importers', label: 'Importers' },
    ],
  },
]

export default function EditorSidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-full md:w-52 flex-shrink-0">
      <div className="flex md:flex-col gap-4 md:gap-6 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex-shrink-0">
            <p className="px-2 md:px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{g.label}</p>
            <div className="flex md:flex-col gap-1">
              {g.items.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active ? 'bg-brand-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-brand-dark'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
