'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Category, Tag } from '@/types'
import Link from 'next/link'

// Format a Date to the local datetime-local input format: YYYY-MM-DDTHH:mm
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

export default function CreateEventPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    short_description: '',
    description: '',
    category_id: '',
    date_start: '',
    date_end: '',
    location_name: '',
    location_address: '',
    ticket_type: 'free',
    ticket_url: '',
    price_min: '',
    price_max: '',
    min_age: '',
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
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !profile) return
    setError('')

    // Date validation
    if (!form.date_start) {
      setError('Please pick a start date and time.')
      return
    }
    const startDate = new Date(form.date_start)
    if (startDate.getTime() < Date.now() - 5 * 60 * 1000) {
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

    let imageUrl: string | null = null

    // Upload image if provided
    if (imageFile) {
      const ALLOWED_TYPES: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }
      const ext = ALLOWED_TYPES[imageFile.type]
      if (!ext) {
        setError('Image must be JPEG, PNG, or WebP.')
        setSubmitting(false)
        return
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        setError('Image must be smaller than 5 MB.')
        setSubmitting(false)
        return
      }
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('event-images')
        .upload(path, imageFile, { contentType: imageFile.type })
      if (uploadErr) {
        setError('Image upload failed: ' + uploadErr.message)
        setSubmitting(false)
        return
      }
      const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(path)
      imageUrl = urlData.publicUrl
    }

    const slug = generateSlug(form.title)
    const status = profile.role === 'trusted_uploader' || profile.role === 'admin' || profile.role === 'super_admin'
      ? 'approved'
      : 'pending_review'

    const tags = Array.from(selectedTagSlugs)

    const { error: insertErr } = await supabase.from('events').insert({
      organizer_id: user.id,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      title: form.title,
      slug,
      short_description: form.short_description || null,
      description: form.description || null,
      date_start: form.date_start,
      date_end: form.date_end || null,
      location_name: form.location_name || null,
      location_address: form.location_address || null,
      image_url: imageUrl,
      status,
      ticket_type: form.ticket_type,
      ticket_url: form.ticket_url || null,
      price_min: form.price_min ? parseFloat(form.price_min) : null,
      price_max: form.price_max ? parseFloat(form.price_max) : null,
      min_age: form.min_age ? parseInt(form.min_age) : null,
      tags: tags.length > 0 ? tags : null,
    })

    if (insertErr) {
      setError(insertErr.message)
      setSubmitting(false)
      return
    }

    if (status === 'approved') {
      router.push(`/events/${slug}`)
    } else {
      // Notify admin of new submission (fire and forget)
      const { data: newEvent } = await supabase
        .from('events')
        .select('id')
        .eq('slug', slug)
        .single()
      const { data: { session } } = await supabase.auth.getSession()
      if (newEvent && session) {
        fetch('/api/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ type: 'event_submitted', eventId: newEvent.id }),
        })
      }
      router.push('/profile?submitted=true')
    }
  }

  if (authLoading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }

  if (!user) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Log in to post an event</h1>
        <p className="text-gray-500 mb-6">You need an account to create events on Events Malta.</p>
        <Link href="/login" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium">
          Log In
        </Link>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Post a New Event</h1>
      <p className="text-gray-500 mb-8">
        {profile?.role === 'user'
          ? 'Your event will be reviewed by an admin before going live.'
          : 'Your event will go live immediately.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Title *</label>
          <input
            type="text"
            required
            maxLength={255}
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="e.g. Rooftop Party at Skybar Valletta"
          />
        </div>

        {/* Short Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
          <input
            type="text"
            maxLength={300}
            value={form.short_description}
            onChange={(e) => updateForm('short_description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="One-liner that appears on event cards"
          />
        </div>

        {/* Full Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
          <textarea
            rows={6}
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none resize-y"
            placeholder="Tell people what to expect..."
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={form.category_id}
            onChange={(e) => updateForm('category_id', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time *</label>
            <div className="relative">
              <input
                type="datetime-local"
                required
                value={form.date_start}
                min={toLocalInputValue(new Date())}
                onChange={(e) => {
                  updateForm('date_start', e.target.value)
                  // Auto-clear end if it's now before start
                  if (form.date_end && form.date_end < e.target.value) {
                    updateForm('date_end', '')
                  }
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              />
              {form.date_start && (
                <button
                  type="button"
                  onClick={() => { updateForm('date_start', ''); updateForm('date_end', '') }}
                  aria-label="Clear start date"
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
            <div className="relative">
              <input
                type="datetime-local"
                value={form.date_end}
                min={form.date_start || toLocalInputValue(new Date())}
                disabled={!form.date_start}
                onChange={(e) => updateForm('date_end', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                placeholder={form.date_start ? '' : 'Pick start time first'}
              />
              {form.date_end && (
                <button
                  type="button"
                  onClick={() => updateForm('date_end', '')}
                  aria-label="Clear end date"
                  className="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  Clear
                </button>
              )}
            </div>
            {form.date_start && form.date_end && form.date_end <= form.date_start && (
              <p className="text-xs text-red-600 mt-1">End must be after start.</p>
            )}
          </div>
        </div>

        {/* Location */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue Name</label>
            <input
              type="text"
              value={form.location_name}
              onChange={(e) => updateForm('location_name', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="e.g. Aria Complex"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={form.location_address}
              onChange={(e) => updateForm('location_address', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="e.g. St George's Bay, Paceville"
            />
          </div>
        </div>

        {/* Event Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Flyer / Image</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100"
          />
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="mt-3 h-40 object-cover rounded-lg" />
          )}
        </div>

        {/* Ticket Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ticket Type</label>
          <div className="flex gap-4">
            {(['free', 'paid'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="ticket_type"
                  value={type}
                  checked={form.ticket_type === type}
                  onChange={(e) => updateForm('ticket_type', e.target.value)}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-700">
                  {type === 'free' ? 'Free' : 'Paid'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Price (if paid) */}
        {form.ticket_type === 'paid' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price From (EUR)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price_min}
                onChange={(e) => updateForm('price_min', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price To (EUR)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price_max}
                onChange={(e) => updateForm('price_max', e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              />
            </div>
          </div>
        )}

        {/* Ticket / event link (always available) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticket or Event URL <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={form.ticket_url}
            onChange={(e) => updateForm('ticket_url', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="https://tickets.example.com/..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Where attendees can buy tickets, RSVP, or get more info. Works for both free and paid events.
          </p>
        </div>

        {/* Age Restriction */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Age (leave empty if none)</label>
          <input
            type="number"
            min="0"
            value={form.min_age}
            onChange={(e) => updateForm('min_age', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="e.g. 18"
          />
        </div>

        {/* Tags */}
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
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.slug)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      active
                        ? 'bg-brand-gold border-brand-gold text-brand-dark'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-brand-gold/50 hover:text-brand-dark'
                    }`}
                  >
                    {active && <span className="mr-1">✓</span>}
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
          {selectedTagSlugs.size > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              {selectedTagSlugs.size} selected
            </p>
          )}
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 rounded-lg font-medium transition-colors text-lg"
        >
          {submitting ? 'Posting...' : 'Post Event'}
        </button>
      </form>
    </main>
  )
}
