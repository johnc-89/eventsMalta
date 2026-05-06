'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { canReadLeads } from '@/lib/crm-access'
import { CrmProvider } from './CrmContext'
import CrmTopbar from './_components/CrmTopbar'

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login?next=/admin/crm')
      return
    }
    if (!canReadLeads(profile)) {
      router.replace('/')
    }
  }, [user, profile, loading, router])

  if (loading || !user) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!canReadLeads(profile)) return null

  return (
    <CrmProvider>
      <div className="min-h-screen bg-gray-50">
        <CrmTopbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
      </div>
    </CrmProvider>
  )
}
