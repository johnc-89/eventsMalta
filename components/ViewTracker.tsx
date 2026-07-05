'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Fires the view-count RPC from the browser. The detail page is ISR-cached, so
// a server-side call would count regenerations (every ~10 min), not visitors.
export default function ViewTracker({ eventId }: { eventId: number }) {
  useEffect(() => {
    supabase.rpc('increment_view_count', { event_id: eventId }).then(() => {})
  }, [eventId])

  return null
}
