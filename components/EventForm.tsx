'use client'

// Shared form for creating + editing events. Used by:
//   /events/create        → mode="create"
//   /events/[slug]/edit   → mode="edit", initialEvent={...}
//
// Behaviour
// - In create mode: submits an INSERT, redirects to the event (if auto-approved)
//   or to /profile?submitted=true (if pending review).
// - In edit mode: submits an UPDATE keyed on the event id. Status handling:
//     - draft / pending_review / approved → status preserved (typo fixes allowed)
//     - rejected → bumped back to pending_review (resubmit flow)
//     - cancelled → editing is blocked at the page level so we never get here
//   Image: keep the existing image_url unless a new file is uploaded.
//   Slug: not regenerated on edit, so existing URLs / shares stay valid.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Event, Category } from '@/types'
import { sanitizeHttpUrl } from '@/lib/url'
import Link from 'next/link'

interface Props {
  mode: 'create' | 'edit'
  initialEvent?: Event
}

const MALTA_TZ = 'Europe/Malta'

/** Split a UTC ISO string into Malta-local date ("YYYY-MM-DD") + time ("HH:MM") parts. */
function isoToMaltaParts(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '' }
  const s = d.toLocaleString('sv', { timeZone: MALTA_TZ }) // "2026-05-21 02:01:00"
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}

/** Today's date in Malta timezone for the min attribute of date inputs. */
function todayMaltaDate(): string {
  return new Date().toLocaleString('sv', { timeZone: MALTA_TZ }).slice(0, 10)
}

/**
 * Convert a Malta-local date + time back to a UTC ISO string.
 * Uses noon as a placeholder time when no time is specified so the stored
 * date is unambiguous across DST boundaries.
 * DST-aware: samples Malta's offset at noon on the given date.
 */
function maltaPartsToISO(date: string, time: string): string {
  if (!date) return ''
  const t = time || '12:00'
  const localStr = `${date}T${t}`
  const noonUTC = new Date(date + 'T12:00:00.000Z')
  const maltaNoon = noonUTC.toLocaleString('sv', { timeZone: MALTA_TZ })
  const offsetHours = parseInt(maltaNoon.slice(11, 13), 10) - 12
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = localStr.split('T')[1].split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h - offsetHours, mi)).toISOString()
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    + '-' + Date.now().toString(36)
}

export default function EventForm({ mode, initialEvent }: Props) {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [availableTags, setAvailableTags] = useState<Category[]>([])
  // events.tags TEXT[] stores tag *names* (consistent with what the AI
  // tagger writes and what the events-page filter compares against).
  const [selectedTagNames, setSelectedTagNames] = useState<Set<string>>(
    new Set(initialEvent?.tags ?? []),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(initialEvent?.image_url ?? null)
  const [removeImage, setRemoveImage] = useState(false)
  const [focalX, setFocalX] = useState(initialEvent?.image_focal_x ?? 50)
  const [focalY, setFocalY] = useState(initialEvent?.image_focal_y ?? 50)
  const [focalDragging, setFocalDragging] = useState(false)
  const focalRef = useRef<HTMLDivElement>(null)
  const [showOrganizer, setShowOrganizer] = useState<boolean>(initialEvent?.show_organizer ?? false)
  const [hasTime, setHasTime] = useState<boolean>(initialEvent?.has_time ?? true)

  const startParts = isoToMaltaParts(initialEvent?.date_start)
  const endParts   = isoToMaltaParts(initialEvent?.date_end)

  const [form, setForm] = useState({
    title:             initialEvent?.title             ?? '',
    short_description: initialEvent?.short_description ?? '',
    description:       initialEvent?.description       ?? '',
    date_start:        startParts.date,
    time_start:        startParts.time,
    date_end:          endParts.date,
    time_end:          endParts.time,
    location_name:     initialEvent?.location_name     ?? '',
    location_address:  initialEvent?.location_address  ?? '',
    ticket_type:       initialEvent?.ticket_type       ?? 'free',
    ticket_url:        initialEvent?.ticket_url        ?? '',
    price_min:         initialEvent?.price_min != null ? String(initialEvent.price_min) : '',
    price_max:         initialEvent?.price_max != null ? String(initialEvent.price_max) : '',
    min_age:           initialEvent?.min_age   != null ? String(initialEvent.min_age)   : '',
  })

  useEffect(() => {
    supabase.from('tags').select('*').eq('enabled', true).order('display_order').order('name')
      .then(({ data }) => setAvailableTags(data || []))
  }, [])

  function toggleTag(name: string) {
    setSelectedTagNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setRemoveImage(false)
  }

  function clearImage() {
    setImageFile(null)
    setImagePreview(null)
    setRemoveImage(true)
    setFocalX(50)
    setFocalY(50)
  }

  function focalCoords(clientX: number, clientY: number) {
    if (!focalRef.current) return
    const rect = focalRef.current.getBoundingClientRect()
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)))
    setFocalX(x)
    setFocalY(y)
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setError('')

    if (!form.date_start) {
      setError('Please pick a start date.')
      return
    }
    const startISO = maltaPartsToISO(form.date_start, hasTime ? form.time_start : '')
    const startUTC = new Date(startISO)
    if (mode === 'create' && startUTC.getTime() < Date.now() - 5 * 60 * 1000) {
      setError('Start date must be in the future.')
      return
    }
    if (form.date_end) {
      const endISO = maltaPartsToISO(form.date_end, hasTime ? form.time_end : '')
      if (new Date(endISO).getTime() <= startUTC.getTime()) {
        setError('End date must be after the start.')
        return
      }
    }

    if (form.ticket_url.trim() && !sanitizeHttpUrl(form.ticket_url)) {
      setError('Ticket link must be a full URL starting with http:// or https://')
      return
    }

    setSubmitting(true)

    let imageUrl: string | null = initialEvent?.image_url ?? null

    if (imageFile) {
      const ALLOWED_TYPES: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png':  'png',
        'image/webp': 'webp',
      }
      const ext = ALLOWED_TYPES[imageFile.type]
      if (!ext) { setError('Image must be JPEG, PNG, or WebP.'); setSubmitting(false); return }
      if (imageFile.size > 5 * 1024 * 1024) { setError('Image must be smaller than 5 MB.'); setSubmitting(false); return }
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('event-images')
        .upload(path, imageFile, { contentType: imageFile.type })
      if (uploadErr) { setError('Image upload failed: ' + uploadErr.message); setSubmitting(false); return }
      const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path)
      imageUrl = urlData.publicUrl
    } else if (removeImage) {
      imageUrl = null
    }

    const tags = Array.from(selectedTagNames)

    const payload = {
      title:             form.title,
      short_description: form.short_description || null,
      description:       form.description       || null,
      date_start:        maltaPartsToISO(form.date_start, hasTime ? form.time_start : ''),
      date_end:          form.date_end ? maltaPartsToISO(form.date_end, hasTime ? form.time_end : '') : null,
      has_time:          hasTime,
      location_name:     form.location_name     || null,
      location_address:  form.location_address  || null,
      image_url:         imageUrl,
      ticket_type:       form.ticket_type,
      ticket_url:        sanitizeHttpUrl(form.ticket_url),
      price_min:         form.price_min ? parseFloat(form.price_min) : null,
      price_max:         form.price_max ? parseFloat(form.price_max) : null,
      min_age:           form.min_age   ? parseInt(form.min_age)     : null,
      tags:              tags.length > 0 ? tags : null,
      show_organizer:    showOrganizer,
      image_focal_x:     focalX,
      image_focal_y:     focalY,
    }

    if (mode === 'create') {
      const slug = generateSlug(form.title)
      const status = profile.role === 'trusted_uploader' || profile.role === 'admin' || profile.role === 'super_admin'
        ? 'approved'
        : 'pending_review'

      const { error: insertErr } = await supabase.from('events').insert({
        ...payload,
        organizer_id: user.id,
        slug,
        status,
      })
      if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

      if (status === 'approved') {
        router.push(`/events/${slug}`)
      } else {
        const { data: newEvent } = await supabase.from('events').select('id').eq('slug', slug).single()
        const { data: { session } } = await supabase.auth.getSession()
        if (newEvent && session) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ type: 'event_submitted', eventId: newEvent.id }),
          })
        }
        router.push('/my-events?submitted=true')
      }
      return
    }

    // EDIT mode
    if (!initialEvent) { setError('Missing event data.'); setSubmitting(false); return }

    // Rejected → resubmit goes back to pending review. Otherwise keep status.
    const nextStatus = initialEvent.status === 'rejected' ? 'pending_review' : initialEvent.status

    const { error: updateErr } = await supabase
      .from('events')
      .update({ ...payload, status: nextStatus })
      .eq('id', initialEvent.id)

    if (updateErr) { setError(updateErr.message); setSubmitting(false); return }

    if (nextStatus === 'approved') {
      router.push(`/events/${initialEvent.slug}`)
    } else {
      router.push('/my-events?updated=true')
    }
  }

  if (authLoading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }

  if (!user) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Log in to {mode === 'create' ? 'post' : 'edit'} an event</h1>
        <Link href="/login" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-medium">Log In</Link>
      </main>
    )
  }

  if (profile?.suspended_at && mode === 'create') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">⏳</div>
        <h1 className="text-2xl font-bold text-brand-dark mb-3">Posting paused</h1>
        <p className="text-gray-600 mb-6">Your account is under review. You can&rsquo;t post new events while we look into it.</p>
        <Link href="/events" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-dark px-6 py-3 rounded-lg font-semibold">Browse events</Link>
      </main>
    )
  }

  const heading = mode === 'create' ? 'Post a New Event' : `Edit Event`
  const submitLabel = submitting
    ? (mode === 'create' ? 'Posting…' : 'Saving…')
    : (mode === 'create' ? 'Post Event' : 'Save Changes')
  const intro = mode === 'create'
    ? (profile?.role === 'user'
        ? 'Your event will be reviewed by an admin before going live.'
        : 'Your event will go live immediately.')
    : (initialEvent?.status === 'rejected'
        ? 'Resubmitting will put your event back in the review queue.'
        : 'Changes save immediately. Major edits may need re-approval by an admin.')

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-900">{heading}</h1>
        {mode === 'edit' && initialEvent && (
          <Link href="/my-events" className="text-sm text-brand-teal-dark hover:text-brand-teal">← Back to My Events</Link>
        )}
      </div>
      <p className="text-gray-500 mb-8">{intro}</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
          <input
            type="text" required maxLength={255}
            value={form.title} onChange={(e) => updateForm('title', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
            placeholder="e.g. Rooftop Party at Skybar Valletta"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
          <input
            type="text" maxLength={300}
            value={form.short_description} onChange={(e) => updateForm('short_description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
            placeholder="One-liner that appears on event cards"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
          <textarea
            rows={6}
            value={form.description} onChange={(e) => updateForm('description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none resize-y"
            placeholder="Tell people what to expect..."
          />
        </div>

        {/* Include times toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={hasTime}
            onClick={() => setHasTime(v => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 ${hasTime ? 'bg-brand-gold' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${hasTime ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {hasTime ? 'Specific times included' : 'No specific time (all-day / multi-day)'}
          </span>
        </div>

        {/* Start date + optional time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input
              type="date" required
              value={form.date_start}
              min={mode === 'create' ? todayMaltaDate() : undefined}
              onChange={(e) => {
                updateForm('date_start', e.target.value)
                // Clear end date if it precedes new start
                if (form.date_end && form.date_end < e.target.value) updateForm('date_end', '')
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
            />
          </div>
          {hasTime && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={form.time_start}
                onChange={(e) => updateForm('time_start', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
              />
            </div>
          )}
        </div>

        {/* End date + optional time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
            <div className="relative">
              <input
                type="date"
                value={form.date_end}
                min={form.date_start || (mode === 'create' ? todayMaltaDate() : undefined)}
                disabled={!form.date_start}
                onChange={(e) => updateForm('date_end', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              />
              {form.date_end && (
                <button type="button" onClick={() => { updateForm('date_end', ''); updateForm('time_end', '') }}
                  aria-label="Clear end date"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">Clear</button>
              )}
            </div>
          </div>
          {hasTime && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="time"
                value={form.time_end}
                disabled={!form.date_end}
                onChange={(e) => updateForm('time_end', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
            <input type="text" value={form.location_name} onChange={(e) => updateForm('location_name', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
              placeholder="e.g. Aria Complex" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input type="text" value={form.location_address} onChange={(e) => updateForm('location_address', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
              placeholder="e.g. St George's Bay, Paceville" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Flyer / Image</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-gold/15 file:text-brand-dark hover:file:bg-brand-gold/25" />
          {imagePreview && (
            <div className="mt-3 space-y-1.5">
              {/* Drag-to-reposition picker */}
              <div
                ref={focalRef}
                className="relative h-52 rounded-lg overflow-hidden cursor-crosshair select-none bg-gray-100"
                onMouseDown={(e) => { setFocalDragging(true); focalCoords(e.clientX, e.clientY) }}
                onMouseMove={(e) => { if (focalDragging) focalCoords(e.clientX, e.clientY) }}
                onMouseUp={() => setFocalDragging(false)}
                onMouseLeave={() => setFocalDragging(false)}
                onTouchStart={(e) => { setFocalDragging(true); focalCoords(e.touches[0].clientX, e.touches[0].clientY) }}
                onTouchMove={(e) => { e.preventDefault(); focalCoords(e.touches[0].clientX, e.touches[0].clientY) }}
                onTouchEnd={() => setFocalDragging(false)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Preview"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                  style={{ objectPosition: `${focalX}% ${focalY}%` }}
                />
                {/* Focal point crosshair */}
                <div
                  className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${focalX}%`, top: `${focalY}%` }}
                >
                  <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg bg-black/20 ring-1 ring-black/30" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/70 -translate-x-1/2" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-white/70 -translate-y-1/2" />
                </div>
                <span className="absolute bottom-2 left-2 text-xs text-white bg-black/40 px-2 py-0.5 rounded pointer-events-none">
                  {focalDragging ? '📍 Repositioning…' : 'Drag to reposition'}
                </span>
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFocalX(50); setFocalY(50) }}
                    className="bg-white/90 hover:bg-white text-gray-700 text-xs px-2 py-1 rounded shadow"
                    title="Reset to centre"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearImage() }}
                    className="bg-white/90 hover:bg-white text-gray-700 text-xs px-2 py-1 rounded shadow"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Drag on the image to choose which part shows in the banner crop.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ticket Type</label>
          <div className="flex gap-4">
            {(['free', 'paid'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ticket_type" value={type}
                  checked={form.ticket_type === type}
                  onChange={(e) => updateForm('ticket_type', e.target.value)}
                  className="text-brand-gold" />
                <span className="text-sm text-gray-700">{type === 'free' ? 'Free' : 'Paid'}</span>
              </label>
            ))}
          </div>
        </div>

        {form.ticket_type === 'paid' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price From (EUR)</label>
              <input type="number" step="0.01" min="0"
                value={form.price_min} onChange={(e) => updateForm('price_min', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price To (EUR)</label>
              <input type="number" step="0.01" min="0"
                value={form.price_max} onChange={(e) => updateForm('price_max', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none" />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticket or Event URL <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input type="url" value={form.ticket_url} onChange={(e) => updateForm('ticket_url', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
            placeholder="https://tickets.example.com/..." />
          <p className="text-xs text-gray-500 mt-1">Where attendees can buy tickets, RSVP, or get more info.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Age (leave empty if none)</label>
          <input type="number" min="0" value={form.min_age} onChange={(e) => updateForm('min_age', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
            placeholder="e.g. 18" />
        </div>

        {/* Organiser visibility */}
        <div className="flex items-start gap-3 bg-gray-50 rounded-lg border border-gray-200 p-4">
          <button
            type="button"
            role="switch"
            aria-checked={showOrganizer}
            onClick={() => setShowOrganizer((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 mt-0.5 ${
              showOrganizer ? 'bg-brand-gold' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                showOrganizer ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-gray-700">Show my name on this event</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {showOrganizer
                ? `Your display name will appear publicly on the event page.`
                : `Your name will not be shown. Only event details will be displayed.`}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Categories <span className="text-gray-400 font-normal">(pick any that fit)</span>
          </label>
          {availableTags.length === 0 ? (
            <p className="text-sm text-gray-500">No categories available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = selectedTagNames.has(tag.name)
                return (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      active ? 'bg-brand-gold border-brand-gold text-brand-dark'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-brand-gold/50 hover:text-brand-dark'
                    }`}>
                    {active && <span className="mr-1">✓</span>}
                    {tag.icon && <span className="mr-1">{tag.icon}</span>}
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
          {selectedTagNames.size > 0 && <p className="text-xs text-gray-500 mt-2">{selectedTagNames.size} selected</p>}
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

        <button type="submit" disabled={submitting}
          className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/40 text-brand-dark py-3 rounded-lg font-semibold transition-colors text-lg">
          {submitLabel}
        </button>
      </form>
    </main>
  )
}
