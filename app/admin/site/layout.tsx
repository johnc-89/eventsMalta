'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { SiteEditorProvider } from './SiteEditorContext'
import EditorTopbar from './_components/EditorTopbar'
import EditorSidebar from './_components/EditorSidebar'

export default function SiteEditorLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login?next=/admin/site'); return }
    if (profile?.role !== 'super_admin') router.replace('/')
  }, [user, profile, loading, router])

  if (loading || !user) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }
  if (profile?.role !== 'super_admin') return null

  return (
    <SiteEditorProvider>
      <div className="min-h-screen bg-gray-50">
        <EditorTopbar />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row gap-6">
          <EditorSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SiteEditorProvider>
  )
}
