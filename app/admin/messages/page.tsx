'use client'

// Admin → Messages. Inbox for /contact form submissions (contact_messages).
// Rows are inserted by POST /api/contact via the service role; admins triage
// here: new → read → archived. Organiser-interest messages link to their CRM lead.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { CONTACT_TOPICS, type ContactMessage, type ContactMessageStatus } from '@/types'

const TOPIC_LABELS = Object.fromEntries(CONTACT_TOPICS.map((t) => [t.id, t.label]))

const STATUS_TABS: { id: ContactMessageStatus; label: string }[] = [
  { id: 'new',      label: 'New' },
  { id: 'read',     label: 'Read' },
  { id: 'archived', label: 'Archived' },
]

export default function AdminMessagesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ContactMessageStatus>('new')

  useEffect(() => {
    if (authLoading) return
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'super_admin')) {
      router.push('/')
      return
    }
    fetchMessages()
  }, [user, profile, authLoading])

  async function fetchMessages() {
    const { data } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setMessages((data as ContactMessage[] | null) ?? [])
    setLoading(false)
  }

  async function setStatus(id: number, status: ContactMessageStatus) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)))
    const { error } = await supabase.from('contact_messages').update({ status }).eq('id', id)
    if (error) {
      alert('Save failed: ' + error.message)
      await fetchMessages()
    }
  }

  const counts = messages.reduce(
    (acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }),
    {} as Record<ContactMessageStatus, number>,
  )
  const visible = messages.filter((m) => m.status === tab)

  if (authLoading || loading) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-gray-500">Loading…</div>
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/admin" className="text-brand-teal-dark hover:text-brand-teal text-sm mb-4 inline-block">
        ← Back to admin
      </Link>
      <h1 className="text-3xl font-heading font-bold text-brand-dark mb-1">Messages</h1>
      <p className="text-gray-600 mb-6">
        Submissions from the <Link href="/contact" className="text-brand-teal-dark hover:underline">contact page</Link>.
        Reply by email — the sender&apos;s address is set as reply-to on the notification too.
      </p>

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              tab === t.id
                ? 'bg-brand-dark text-white border-brand-dark'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t.label}
            {(counts[t.id] ?? 0) > 0 && (
              <span className={`ml-1.5 ${tab === t.id ? 'text-gray-300' : 'text-gray-400'}`}>
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500">No {tab} messages.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-semibold text-brand-dark">{m.name}</span>
                  <a href={`mailto:${m.email}`} className="text-sm text-brand-teal-dark hover:underline">
                    {m.email}
                  </a>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-cream text-brand-dark">
                    {TOPIC_LABELS[m.topic] ?? m.topic}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(m.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Malta',
                  })}
                </span>
              </div>

              {m.event_url && (
                <p className="text-sm mb-2">
                  <span className="text-gray-500">Listing:</span>{' '}
                  <a href={m.event_url} target="_blank" rel="noopener noreferrer" className="text-brand-teal-dark hover:underline break-all">
                    {m.event_url}
                  </a>
                </p>
              )}

              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{m.message}</p>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <a
                  href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to Events Malta')}`}
                  className="text-brand-teal-dark hover:underline font-medium"
                >
                  Reply
                </a>
                {m.lead_id && profile?.role === 'super_admin' && (
                  <Link href="/admin/crm" className="text-brand-teal-dark hover:underline font-medium">
                    View in CRM →
                  </Link>
                )}
                <span className="flex-1" />
                {m.status === 'new' && (
                  <button onClick={() => setStatus(m.id, 'read')} className="text-gray-500 hover:text-brand-dark">
                    Mark read
                  </button>
                )}
                {m.status !== 'archived' ? (
                  <button onClick={() => setStatus(m.id, 'archived')} className="text-gray-500 hover:text-brand-dark">
                    Archive
                  </button>
                ) : (
                  <button onClick={() => setStatus(m.id, 'read')} className="text-gray-500 hover:text-brand-dark">
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
