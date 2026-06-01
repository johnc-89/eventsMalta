'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

interface SaveButtonProps {
  eventId: number
  /** 'card' — small icon overlay on event card image; 'detail' — larger button for detail page */
  variant?: 'card' | 'detail'
}

export default function SaveButton({ eventId, variant = 'card' }: SaveButtonProps) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) { setSaved(false); return }
    supabase
      .from('saved_events')
      .select('event_id')
      .eq('user_id', user.id)
      .eq('event_id', eventId)
      .maybeSingle()
      .then(({ data }) => setSaved(!!data))
  }, [user, eventId])

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { router.push('/login'); return }
    setBusy(true)
    if (saved) {
      await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', eventId)
      setSaved(false)
    } else {
      await supabase.from('saved_events').insert({ user_id: user.id, event_id: eventId })
      setSaved(true)
    }
    setBusy(false)
  }

  if (authLoading) return null

  if (variant === 'detail') {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={saved ? 'Remove from saved' : 'Save event'}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
          saved
            ? 'border-brand-gold bg-brand-gold/10 text-brand-dark'
            : 'border-gray-200 bg-white text-gray-600 hover:border-brand-gold hover:bg-brand-gold/10'
        }`}
      >
        <BookmarkIcon filled={saved} className="w-4 h-4" />
        {saved ? 'Saved' : 'Save'}
      </button>
    )
  }

  // card variant — small floating button on the image
  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? 'Remove from saved' : 'Save event'}
      className={`absolute bottom-3 right-3 p-1.5 rounded-full backdrop-blur-sm transition-colors ${
        saved
          ? 'bg-brand-gold text-brand-dark'
          : 'bg-white/80 text-gray-500 hover:bg-white hover:text-brand-gold'
      }`}
    >
      <BookmarkIcon filled={saved} className="w-4 h-4" />
    </button>
  )
}

function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  )
}
