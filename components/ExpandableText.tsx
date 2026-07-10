'use client'

import { useEffect, useRef, useState } from 'react'

interface ExpandableTextProps {
  intro: string
  // Extra locality/tag copy paragraphs. On mobile these — plus the tail of
  // `intro` — are collapsed behind a "Read more" toggle so the description
  // doesn't push the event grid below the fold. Desktop always shows it all.
  paragraphs?: string[]
}

export default function ExpandableText({ intro, paragraphs }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [introOverflows, setIntroOverflows] = useState(false)
  const introRef = useRef<HTMLParagraphElement>(null)
  const hasMore = !!paragraphs?.length

  // Even a lone intro (no extra paragraphs) can run to 3-4 lines on mobile —
  // measure whether the clamped line actually overflows so the toggle only
  // shows up when there's something to reveal.
  useEffect(() => {
    const el = introRef.current
    if (el) setIntroOverflows(el.scrollHeight > el.clientHeight)
  }, [intro])

  const showToggle = hasMore || introOverflows

  return (
    <div>
      <p
        ref={introRef}
        className={`text-gray-600 max-w-3xl ${hasMore ? 'mb-4' : 'mb-8'} ${expanded ? '' : 'line-clamp-1 sm:line-clamp-none'}`}
      >
        {intro}
      </p>
      {hasMore && (
        <div className={expanded ? 'block' : 'hidden sm:block'}>
          {paragraphs!.map((p, i) => (
            <p key={i} className={`text-gray-600 max-w-3xl ${i === paragraphs!.length - 1 ? 'mb-4 sm:mb-8' : 'mb-4'}`}>
              {p}
            </p>
          ))}
        </div>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="sm:hidden mt-1 mb-8 text-sm font-medium text-brand-teal-dark underline"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  )
}
