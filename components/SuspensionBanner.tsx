'use client'

import { useAuth } from '@/lib/auth-context'

export default function SuspensionBanner() {
  const { profile } = useAuth()
  if (!profile?.suspended_at) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <p className="text-sm flex items-center gap-2 flex-wrap">
          <span aria-hidden="true">⏳</span>
          <strong>Your account is under review.</strong>
          <span>You can still browse events, but posting, saving, and editing are paused while we look into it.</span>
          <a
            href="mailto:admin@eventsmalta.org?subject=Suspended%20account"
            className="underline font-medium hover:no-underline ml-1"
          >
            Contact admin
          </a>
        </p>
      </div>
    </div>
  )
}
