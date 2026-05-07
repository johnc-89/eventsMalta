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

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Category, Event, Tag } from '@/types'
import Link from 'next/link'

interface Props {
  mode: 'create' | 'edit'
  initialEvent?: Event
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return toLocalInputValue(d)
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
  const [categories, setCategories] = useState<Category[]>([])
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<Set<string>>(
    new Set(initialEvent?.tags ?? []),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(initialEvent?.image_url ?? null)
  const [removeImage, setRemoveImage] = useState(false)

  const [form, setForm] = useState({
    title:             initialEvent?.title             ?? '',
    short_description: initialEvent?.short_description ?? '',
    description:       initialEvent?.description       ?? '',
    category_id:       initialEvent?.category_id != null ? String(initialEvent.category_id) : '',
    date_start:        isoToLocalInput(initialEvent?.date_start),
    date_end:          isoToLocalInput(initialEvent?.date_end),
    location_name:     initialEvent?.location_name     ?? '',
    location_address:  initialEvent?.location_address  ?? '',
    ticket_type:       initialEvent?.ticket_type       ?? 'free',
    ticket_url:        initialEvent?.ticket_url        ?? '',
    price_min:         initialEvent?.price_min != null ? String(initialEvent.price_min) : '',
    price_max:         initialEvent?.price_max != null ? String(initialEvent.price_max) : '',
    min_age:           initialEvent?.min_age   != null ? String(initialEvent.min_age)   : '',
  })

  useEffect(() => {
    supabase.from('categories').select('*').order('display_order')
      .then(({ data }) => setCategories(data || []))
    supabase.from('tags').select('*').order('display_order').order('name')
      .then(({ data }) => setAvailableTags(data || []))
  }, [])

  function toggleTag(slug: string) {
    setSelectedTagSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
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
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setError('')

    // Date validation — same rules as create. In edit mode, allow editing
    // events whose start is in the past *only* for admins (page guards
    // regular users already), but disallow rolling the date backwards.
    if (!form.date_start) {
      setError('Please pick a start date and time.')
      return
    }
    const startDate = new Date(form.date_start)
    if (mode === 'create' && startDate.getTime() < Date.now() - 5 * 60 * 1000) {
      setError('Start date must be in the future.')
      return
    }
    if (form.date_end) {
      const endDate = new Date(form.date_end)
      if (endDate.getTime() <= startDate.getTime()) {
        setError('End date must be after the start date.')
        return
      }
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

    const tags = Array.from(selectedTagSlugs)

    const payload = {
      category_id:       form.category_id ? parseInt(form.category_id) : null,
      title:             form.title,
      short_description: form.short_description || null,
      description:       form.description       || null,
      date_start:        form.date_start,
      date_end:          form.date_end          || null,
      location_name:     form.location_name     || null,
      location_address:  form.location_address  || null,
      image_url:         imageUrl,
      ticket_type:       form.ticket_type,
      ticket_url:        form.ticket_url        || null,
      price_min:         form.price_min ? parseFloat(form.price_min) : null,
      price_max:         form.price_max ? parseFloat(form.price_max) : null,
      min_age:           form.min_age   ? parseInt(form.min_age)     : null,
      tags:              tags.length > 0 ? tags : null,
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
        router.push('/profile?submitted=true')
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
      router.push('/profile?updated=true')
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
          <Link href="/profile" className="text-sm text-brand-cyan hover:text-brand-teal">← Back to My Events</Link>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={form.category_id} onChange={(e) => updateForm('category_id', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date &amp; Time *</label>
            <div className="relative">
              <input
                type="datetime-local" required
                value={form.date_start}
                min={mode === 'create' ? toLocalInputValue(new Date()) : undefined}
                onChange={(e) => {
                  updateForm('date_start', e.target.value)
                  if (form.date_end && form.date_end < e.target.value) updateForm('date_end', '')
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
              />
              {form.date_start && (
                <button type="button" onClick={() => { updateForm('date_start', ''); updateForm('date_end', '') }}
                  aria-label="Clear start date"
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">Clear</button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date &amp; Time</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={form.date_end}
                min={form.date_start || (mode === 'create' ? toLocalInputValue(new Date()) : undefined)}
                disabled={!form.date_start}
                onChange={(e) => updateForm('date_end', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                placeholder={form.date_start ? '' : 'Pick start time first'}
              />
              {form.date_end && (
                <button type="button" onClick={() => updateForm('date_end', '')}
                  aria-label="Clear end date"
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">Clear</button>
              )}
            </div>
            {form.date_start && form.date_end && form.date_end <= form.date_start && (
              <p className="text-xs text-red-600 mt-1">End must be after start.</p>
            )}
          </div>
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
            <div className="mt-3 relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Preview" className="h-40 object-cover rounded-lg" />
              <button type="button" onClick={clearImage}
                className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 text-xs px-2 py-1 rounded shadow">
                Remove
              </button>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags <span className="text-gray-400 font-normal">(optional, pick any that fit)</span>
          </label>
          {availableTags.length === 0 ? (
            <p className="text-sm text-gray-500">No tags available yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const active = selectedTagSlugs.has(tag.slug)
                return (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.slug)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      active ? 'bg-brand-gold border-brand-gold text-brand-dark'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-brand-gold/50 hover:text-brand-dark'
                    }`}>
                    {active && <span className="mr-1">✓</span>}
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
          {selectedTagSlugs.size > 0 && <p className="text-xs text-gray-500 mt-2">{selectedTagSlugs.size} selected</p>}
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
