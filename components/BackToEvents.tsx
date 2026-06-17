'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

// "← Back to events" on the event detail page.
//
// A plain <Link href="/events"> would drop whatever filters the visitor had
// applied before opening the event. The events list records the URL it was last
// showing (filters live in its query string) as `ev:lastList`; here we navigate
// back to that exact URL so the filtered view — and its cached results/scroll —
// is restored. Falls back to the bare list for visitors who landed on the
// detail page directly (no recorded list). Rendered as an anchor so it still
// works without JS and keeps the link styling.
export default function BackToEvents({ className }: { className?: string }) {
  const router = useRouter()

  return (
    <Link
      href="/events"
      className={className}
      onClick={(e) => {
        let target = ''
        try {
          target = sessionStorage.getItem('ev:lastList') || ''
        } catch {}
        if (target && target !== '/events') {
          e.preventDefault()
          router.push(target)
        }
      }}
    >
      ← Back to events
    </Link>
  )
}
