'use client'

import { useEffect, useRef, useState } from 'react'

interface ExpandableHtmlProps {
  html: string
  className?: string
}

// Collapses long admin-authored landing-page copy (rendered markdown) to a
// short peek on mobile with a "Read more" toggle, so it doesn't push the
// event grid below the fold. Desktop always shows the full content. The
// toggle only renders when the collapsed content actually overflows.
export default function ExpandableHtml({ html, className = '' }: ExpandableHtmlProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) setOverflows(el.scrollHeight > el.clientHeight)
  }, [html])

  return (
    <div>
      <div
        ref={ref}
        className={`${expanded ? '' : 'max-h-28 overflow-hidden sm:max-h-none sm:overflow-visible'} ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="sm:hidden mt-2 text-sm font-medium text-brand-teal-dark underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
