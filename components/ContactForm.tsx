'use client'

import { useRef, useState } from 'react'
import { useSiteSettings } from '@/lib/site-settings-context'
import { CONTACT_TOPICS, type ContactTopic } from '@/types'

const inputCls =
  'w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-teal focus:border-transparent text-brand-dark bg-white'

export default function ContactForm({
  showEmail = true,
  preview = false,
}: {
  showEmail?: boolean
  /** Admin canvas mode — render disabled so preview clicks can't submit. */
  preview?: boolean
}) {
  const settings = useSiteSettings()
  const contactEmail = settings.footer.contact_email

  const mountedAt = useRef(Date.now())
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState<ContactTopic>('general')
  const [message, setMessage] = useState('')
  const [eventUrl, setEventUrl] = useState('')
  const [website, setWebsite] = useState('')  // honeypot
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (preview || status === 'sending') return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          topic,
          message,
          event_url: topic === 'listing_issue' ? eventUrl : '',
          website,
          elapsed_ms: Date.now() - mountedAt.current,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong — please try again.')
      }
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong — please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <p className="text-2xl mb-2">✉️</p>
        <h2 className="text-xl font-heading font-bold text-brand-dark mb-2">Message sent</h2>
        <p className="text-gray-600">
          Thanks for getting in touch — we&apos;ll reply to <strong>{email}</strong> as soon as we can.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-6 sm:p-8 space-y-5" noValidate={preview}>
      <fieldset disabled={preview || status === 'sending'} className="space-y-5 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-brand-dark mb-1.5">
              Your name
            </label>
            <input
              id="contact-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-brand-dark mb-1.5">
              Email address
            </label>
            <input
              id="contact-email"
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={200}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-topic" className="block text-sm font-medium text-brand-dark mb-1.5">
            What is this about?
          </label>
          <select
            id="contact-topic"
            className={inputCls}
            value={topic}
            onChange={(e) => setTopic(e.target.value as ContactTopic)}
          >
            {CONTACT_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {topic === 'listing_issue' && (
          <div>
            <label htmlFor="contact-event-url" className="block text-sm font-medium text-brand-dark mb-1.5">
              Link to the listing (optional)
            </label>
            <input
              id="contact-event-url"
              type="url"
              className={inputCls}
              value={eventUrl}
              onChange={(e) => setEventUrl(e.target.value)}
              placeholder="https://eventsmalta.org/events/…"
              maxLength={500}
            />
          </div>
        )}

        <div>
          <label htmlFor="contact-message" className="block text-sm font-medium text-brand-dark mb-1.5">
            Message
          </label>
          <textarea
            id="contact-message"
            className={inputCls}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={5000}
          />
        </div>

        {/* Honeypot — hidden from real users, tempting to bots. */}
        <div className="absolute -left-[9999px] top-auto h-0 overflow-hidden" aria-hidden="true">
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {status === 'error' && (
          <p className="text-sm text-red-600" role="alert">{errorMsg}</p>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            type="submit"
            className="theme-accent-bg px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
          {showEmail && contactEmail && (
            <p className="text-sm text-gray-500">
              Prefer email?{' '}
              <a href={`mailto:${contactEmail}`} className="text-brand-teal-dark hover:underline font-medium">
                {contactEmail}
              </a>
            </p>
          )}
        </div>
      </fieldset>
    </form>
  )
}
