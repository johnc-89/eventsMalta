'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { Category } from '@/types'
import Link from 'next/link'

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
    tags: '',
  })

  useEffect(() => {
    supabase.from('categories').select('*').order('display_order')
      .then(({ data }) => setCategories(data || []))
  }, [])

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
    const status = profile.role === 'trusted_uploader' || profile.role === 'admin'
      ? 'approved'
      : 'pending_review'

    const tags = form.tags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean)

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
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time *</label>
            <input
              type="datetime-local"
              required
              value={form.date_start}
              onChange={(e) => updateForm('date_start', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
            <input
              type="datetime-local"
              value={form.date_end}
              onChange={(e) => updateForm('date_end', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            />
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
            {(['free', 'paid', 'external_link'] as const).map((type) => (
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
                  {type === 'free' ? 'Free' : type === 'paid' ? 'Paid' : 'External Link'}
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

        {/* External ticket link */}
        {form.ticket_type === 'external_link' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticket URL</label>
            <input
              type="url"
              value={form.ticket_url}
              onChange={(e) => updateForm('ticket_url', e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="https://tickets.example.com/..."
            />
          </div>
        )}

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
          <input
            type="text"
            value={form.tags}
            onChange={(e) => updateForm('tags', e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="e.g. live-music, rooftop, outdoor"
          />
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
