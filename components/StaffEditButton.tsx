'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

// Quick-access Edit link rendered next to "Back to events" on the public
// event detail page. Visible to admins and super_admins so they can
// correct a live event without having to navigate to /admin → find the
// event → edit. Mirrors SuperAdminDeleteButton's pattern.
export default function StaffEditButton({ slug }: { slug: string }) {
  const { profile } = useAuth()
  const isStaff = profile?.role === 'admin' || profile?.role === 'super_admin'
  if (!isStaff) return null

  return (
    <Link
      href={`/events/${slug}/edit`}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-teal/30 bg-brand-teal/5 text-brand-teal hover:bg-brand-teal/10 text-sm font-medium transition-colors"
    >
      <span aria-hidden="true">✎</span>
      Edit event
    </Link>
  )
}
