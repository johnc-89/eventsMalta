'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href?: string
  label: string
  children?: NavItem[]
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Content',
    items: [
      { href: '/admin/site/blocks',   label: 'Homepage' },
      { href: '/admin/site/featured', label: 'Featured' },
      {
        label: 'Pages',
        children: [
          { href: '/admin/site/pages/events',  label: 'Events Page' },
          { href: '/admin/site/faq',          label: 'FAQ' },
          { href: '/admin/site/pages/privacy', label: 'Privacy Policy' },
          { href: '/admin/site/pages/terms',   label: 'Terms of Service' },
        ],
      },
      {
        label: 'Landing pages',
        children: [
          { href: '/admin/site/pages/landing/location',     label: 'Location pages' },
          { href: '/admin/site/pages/landing/tag',          label: 'Tag pages' },
          { href: '/admin/site/pages/landing/venue',        label: 'Venue pages' },
          { href: '/admin/site/pages/landing/today',        label: 'Today' },
          { href: '/admin/site/pages/landing/this-weekend', label: 'This weekend' },
          { href: '/admin/site/pages/landing/this-month',   label: 'This month' },
          { href: '/admin/site/pages/landing/month',        label: 'Months (Jan–Dec)' },
        ],
      },
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

function NavLink({ href, label, pathname, indent }: { href: string; label: string; pathname: string; indent?: boolean }) {
  const active = pathname === href
  return (
    <Link
      href={href}
      className={`whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${indent ? 'md:ml-3 md:text-[13px]' : ''} ${
        active ? 'bg-brand-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-brand-dark'
      }`}
    >
      {label}
    </Link>
  )
}

export default function EditorSidebar() {
  const pathname = usePathname()
  return (
    <nav className="w-full md:w-52 flex-shrink-0">
      <div className="flex md:flex-col gap-4 md:gap-6 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex-shrink-0">
            <p className="px-2 md:px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{g.label}</p>
            <div className="flex md:flex-col gap-1">
              {g.items.map((item) => (
                <div key={item.label} className="flex md:flex-col gap-1">
                  {item.href ? (
                    <NavLink href={item.href} label={item.label} pathname={pathname} />
                  ) : (
                    <span className="whitespace-nowrap px-3 py-1.5 text-sm font-medium text-gray-400">{item.label}</span>
                  )}
                  {item.children?.map((child) => (
                    <NavLink key={child.href} href={child.href!} label={child.label} pathname={pathname} indent />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
