'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

export default function SuperAdminDeleteButton({
  eventId,
  eventTitle,
}: {
  eventId: number
  eventTitle: string
}) {
  const { profile } = useAuth()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  if (profile?.role !== 'super_admin') return null

  async function handleDelete() {
    if (!confirm(`Hide the event "${eventTitle}" from the site?\n\nIt will be soft-deleted (removed from listings, kept in the database) and won't be re-imported by its source.`)) {
      return
    }
    setDeleting(true)
    const { data, error } = await supabase.rpc('super_admin_delete_event', { event_id: eventId })
    if (error) {
      alert('Could not hide: ' + error.message)
      setDeleting(false)
      return
    }
    if (!data) {
      alert('Event not found or already hidden.')
      setDeleting(false)
      return
    }
    router.push('/events')
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-sm font-medium transition-colors disabled:opacity-50"
    >
      <span aria-hidden="true">🙈</span>
      {deleting ? 'Hiding…' : 'Hide event (super admin)'}
    </button>
  )
}
