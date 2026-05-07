'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSiteEditor } from '../SiteEditorContext'

const TABS = [
  { href: '/admin/site/blocks',   label: 'Blocks' },
  { href: '/admin/site/branding', label: 'Branding' },
  { href: '/admin/site/featured', label: 'Featured' },
  { href: '/admin/site/faq',      label: 'FAQ' },
  { href: '/admin/site/pages',    label: 'Pages' },
  { href: '/admin/site/banner',   label: 'Banner' },
  { href: '/admin/site/footer',   label: 'Footer' },
  { href: '/admin/site/seo',      label: 'SEO' },
  { href: '/admin/site/email',    label: 'Email' },
  { href: '/admin/site/theme',    label: 'Theme' },
]

export default function EditorTopbar() {
  const pathname = usePathname()
  const { syncState, hasUnpublishedChanges, publish, revertDraft, draftUpdatedBy, draftUpdatedAt } = useSiteEditor()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const onPublish = async () => {
    setBusy(true); setMsg(null)
    const { error } = await publish()
    setBusy(false)
    setMsg(error ? `Error: ${error}` : 'Published ✓')
    setTimeout(() => setMsg(null), 3500)
  }

  const onRevert = async () => {
    if (!confirm('Discard unpublished changes? This restores the draft to the currently published settings.')) return
    setBusy(true); setMsg(null)
    const { error } = await revertDraft()
    setBusy(false)
    setMsg(error ? `Error: ${error}` : 'Draft reverted')
    setTimeout(() => setMsg(null), 3500)
  }

  const stateLabel = {
    loading: { dot: 'bg-gray-400',  text: 'loading…' },
    saved:   { dot: 'bg-green-500', text: 'all changes saved' },
    saving:  { dot: 'bg-amber-400 animate-pulse', text: 'saving…' },
    dirty:   { dot: 'bg-amber-400', text: 'unsaved changes' },
    error:   { dot: 'bg-red-500',   text: 'save failed — check connection' },
  }[syncState]

  return (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/site" className="font-mono font-bold text-brand-dark">
            SITE<span className="theme-accent-text">.EDITOR</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${stateLabel.dot}`} />
            {stateLabel.text}
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 flex-1">
          {TABS.map((t) => {
            const active = pathname === t.href
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active ? 'bg-brand-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-brand-dark'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-500">{msg}</span>}
          <Link href="/admin" className="text-sm text-gray-500 hover:text-brand-dark">← Admin</Link>
          {hasUnpublishedChanges && (
            <button
              onClick={onRevert}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            onClick={onPublish}
            disabled={busy || !hasUnpublishedChanges}
            className="theme-accent-bg px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? 'Publishing…' : hasUnpublishedChanges ? 'Publish' : 'Published'}
          </button>
        </div>
      </div>
      {hasUnpublishedChanges && draftUpdatedAt && (
        <div className="bg-amber-50 border-t border-amber-100 text-amber-800 text-xs px-6 py-1.5 text-center">
          Unpublished draft — last edit {new Date(draftUpdatedAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
          {draftUpdatedBy && ` by ${draftUpdatedBy}`}. Visitors won't see these changes until you publish.
        </div>
      )}
    </div>
  )
}
