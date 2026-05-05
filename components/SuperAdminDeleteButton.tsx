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
    if (!confirm(`Permanently delete the event "${eventTitle}"?\n\nThis can only be undone via the database.`)) {
      return
    }
    setDeleting(true)
    const { data, error } = await supabase.rpc('super_admin_delete_event', { event_id: eventId })
    if (error) {
      alert('Could not delete: ' + error.message)
      setDeleting(false)
      return
    }
    if (!data) {
      alert('Event not found or already deleted.')
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
      <span aria-hidden="true">🗑</span>
      {deleting ? 'Deleting…' : 'Delete event (super admin)'}
    </button>
  )
}
