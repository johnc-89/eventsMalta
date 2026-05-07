// Reused across event listings, single-event pages, FAQ sections.
// One source of truth so the wording stays consistent everywhere.

const TEXT = 'Event details belong to their respective organisers. Please check official event pages for latest updates.'

interface Props {
  /** 'inline'  — small italic line, fits next to or below content
   *  'card'    — outlined info box, more prominent */
  variant?: 'inline' | 'card'
  className?: string
}

export default function EventDisclaimer({ variant = 'inline', className = '' }: Props) {
  if (variant === 'card') {
    return (
      <aside
        role="note"
        className={`flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 ${className}`}
      >
        <span aria-hidden className="text-gray-400 leading-tight">ⓘ</span>
        <p>{TEXT}</p>
      </aside>
    )
  }
  return (
    <p className={`text-xs italic text-gray-500 ${className}`}>{TEXT}</p>
  )
}

export const EVENT_DISCLAIMER_TEXT = TEXT
