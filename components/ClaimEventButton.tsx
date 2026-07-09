'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface ClaimEventButtonProps {
  eventId: number
  claimedBy: string | null
}

export default function ClaimEventButton({ eventId, claimedBy }: ClaimEventButtonProps) {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (authLoading) return null

  // Claimed by someone else — the server-rendered marker already covers this.
  if (claimedBy && claimedBy !== user?.id) return null

  const claim = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('claim_event', { p_event_id: eventId })
    setBusy(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  const unclaim = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('unclaim_event', { p_event_id: eventId })
    setBusy(false)
    if (error) { setError(error.message); return }
    router.refresh()
  }

  // The current user has claimed this event — offer to release it.
  if (claimedBy && claimedBy === user?.id) {
    return (
      <div>
        <p className="text-sm text-brand-teal-dark font-medium">You've claimed this event.</p>
        <button
          onClick={unclaim}
          disabled={busy}
          className="mt-1 text-sm text-gray-500 hover:text-red-600 underline disabled:opacity-50"
        >
          {busy ? 'Releasing…' : 'Release claim'}
        </button>
        {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
      </div>
    )
  }

  // Event is unclaimed below this point.
  if (!user) {
    return (
      <Link
        href="/login"
        className="block w-full text-center border border-gray-200 bg-white text-gray-600 hover:border-brand-teal hover:text-brand-teal-dark py-3 rounded-lg text-sm font-medium transition-colors"
      >
        Log in to claim this event
      </Link>
    )
  }

  if (!profile?.is_verified) {
    return (
      <p className="text-sm text-gray-500">
        Are you the organiser?{' '}
        <Link href="/contact" className="text-brand-teal-dark hover:text-brand-teal underline">
          Get verified
        </Link>{' '}
        to claim this event.
      </p>
    )
  }

  return (
    <div>
      <button
        onClick={claim}
        disabled={busy}
        className="block w-full text-center border border-brand-teal/30 bg-brand-teal/10 text-brand-teal-dark hover:bg-brand-teal/15 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {busy ? 'Claiming…' : 'Claim this event'}
      </button>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  )
}
