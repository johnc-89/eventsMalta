'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SyncIndicator from './SyncIndicator'
import AddLeadButton from './AddLeadButton'

const TABS = [
  { href: '/admin/crm/dashboard',     label: 'Dashboard' },
  { href: '/admin/crm/leads',         label: 'Leads' },
  { href: '/admin/crm/import-export', label: 'Import / Export' },
]

export default function CrmTopbar() {
  const pathname = usePathname()
  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/crm" className="font-mono font-bold text-brand-dark tracking-tight">
            MALTA<span className="text-brand-gold">.CRM</span>
          </Link>
          <SyncIndicator />
        </div>
        <nav className="flex items-center gap-1 flex-1">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname?.startsWith(t.href + '/')
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-dark text-white'
                    : 'text-gray-600 hover:text-brand-dark hover:bg-gray-100'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-brand-dark"
          >
            ← Admin
          </Link>
          <AddLeadButton />
        </div>
      </div>
    </div>
  )
}
