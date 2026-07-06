'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

// Admin handbook page. Visible to roles `admin` and `super_admin`.
// The HTML body comes from /api/admin/guide (server-gated). We render it
// inside an iframe via `srcDoc` so the doc's inline <style> doesn't leak
// into the rest of the app and links keep working.
export default function AdminGuidePage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (authLoading) return
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      router.push('/')
      return
    }
    if (fetchedRef.current) return
    fetchedRef.current = true

    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      try {
        const res = await fetch('/api/admin/guide', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        })
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 403 ? 'You do not have permission to view this page.' : 'Could not load the guide.')
          }
          return
        }
        const text = await res.text()
        if (!cancelled) setHtml(text)
      } catch {
        if (!cancelled) setError('Could not load the guide.')
      }
    })()

    return () => { cancelled = true }
  }, [user, profile, authLoading, router])

  if (authLoading || (!html && !error)) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
      </div>
    )
  }

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null

  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-2xl font-heading font-bold text-brand-dark mb-2">Admin guide</h1>
        <p className="text-red-600">{error}</p>
        <Link href="/admin" className="text-brand-teal-dark hover:underline mt-4 inline-block">← Back to admin</Link>
      </main>
    )
  }

  return (
    <main className="px-0 py-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-2">
        <Link href="/admin" className="text-sm text-brand-teal-dark hover:underline">← Back to admin</Link>
      </div>
      <iframe
        title="Admin cheat sheet"
        srcDoc={html ?? ''}
        className="w-full border-0"
        style={{ height: 'calc(100vh - 96px)' }}
      />
    </main>
  )
}
