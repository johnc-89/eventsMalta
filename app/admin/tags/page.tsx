'use client'

// Admin → Tags. After migration 0015 this is the single taxonomy editor
// (the old `categories` table was merged in). User-facing copy still says
// "Categories" on the public site, but internally everything is tags.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Tag } from '@/types'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function AdminTagsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [newTag, setNewTag] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user || profile?.role !== 'admin' && profile?.role !== 'super_admin') {
      router.push('/')
      return
    }
    fetchTags()
  }, [user, profile, authLoading])

  async function fetchTags() {
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    setTags(data || [])
    setLoading(false)
  }

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    if (!newTag.trim()) return
    setError('')
    setSubmitting(true)
    const name = newTag.trim()
    const slug = slugify(name)
    if (!slug) {
      setError('Tag name must contain at least one letter or number.')
      setSubmitting(false)
      return
    }
    const icon = newIcon.trim() || null
    const { error: insertErr } = await supabase
      .from('tags')
      .insert({ name, slug, icon, display_order: 999, enabled: true })
    if (insertErr) {
      setError(insertErr.message.includes('duplicate') ? 'That tag already exists.' : insertErr.message)
    } else {
      setNewTag('')
      setNewIcon('')
      await fetchTags()
    }
    setSubmitting(false)
  }

  async function updateTag(id: number, patch: Partial<Tag>) {
    setSavingId(id)
    // Optimistic local update.
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    const { error: updateErr } = await supabase.from('tags').update(patch).eq('id', id)
    if (updateErr) {
      alert('Save failed: ' + updateErr.message)
      await fetchTags() // resync
    }
    setSavingId(null)
  }

  async function deleteTag(tag: Tag) {
    if (!confirm(`Delete "${tag.name}"? Existing events that use this tag will keep the text label, but it won't be selectable for new events.`)) return
    const { error: delErr } = await supabase.from('tags').delete().eq('id', tag.id)
    if (delErr) {
      alert('Could not delete: ' + delErr.message)
      return
    }
    setTags((prev) => prev.filter((t) => t.id !== tag.id))
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" />
      </div>
    )
  }
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return null

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Manage Categories</h1>
        <Link href="/admin" className="text-brand-cyan hover:text-brand-teal text-sm font-medium">
          ← Back to Admin
        </Link>
      </div>
      <p className="text-gray-500 mb-8">
        These are shown as chips on the homepage and as filters on the events page. Disable ones you don't want public without deleting them.
      </p>

      {/* Add new */}
      <form onSubmit={addTag} className="bg-white rounded-xl border p-5 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Add a new category</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newIcon}
            onChange={(e) => setNewIcon(e.target.value)}
            placeholder="🎭"
            maxLength={4}
            className="w-16 px-3 py-2 rounded-lg border focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-center"
            title="Emoji icon (optional)"
          />
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="e.g. Live Music"
            maxLength={40}
            className="flex-1 px-3 py-2 rounded-lg border focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !newTag.trim()}
            className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/40 text-brand-dark px-5 py-2 rounded-lg font-semibold transition-colors"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </form>

      {/* List */}
      <h2 className="text-xl font-heading font-bold text-brand-dark mb-3">
        {tags.length} categor{tags.length === 1 ? 'y' : 'ies'}
      </h2>

      {tags.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No categories yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-3 w-16">Icon</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 w-20">Order</th>
                <th className="px-4 py-3 w-20">Enabled</th>
                <th className="px-4 py-3 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tags.map((t) => (
                <tr key={t.id} className={savingId === t.id ? 'opacity-50' : ''}>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      defaultValue={t.icon ?? ''}
                      maxLength={4}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null
                        if (v !== t.icon) updateTag(t.id, { icon: v })
                      }}
                      placeholder="—"
                      className="w-12 px-2 py-1 rounded border text-center text-base"
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-brand-dark">{t.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-500 font-mono">{t.slug ?? '—'}</td>
                  <td className="px-4 py-2">
                    <textarea
                      defaultValue={t.description ?? ''}
                      rows={2}
                      maxLength={600}
                      placeholder="Landing-page intro (used for SEO)"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null
                        if (v !== t.description) updateTag(t.id, { description: v })
                      }}
                      className="w-56 px-2 py-1 rounded border text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      defaultValue={t.display_order}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (Number.isFinite(v) && v !== t.display_order) updateTag(t.id, { display_order: v })
                      }}
                      className="w-16 px-2 py-1 rounded border text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={(e) => updateTag(t.id, { enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteTag(t)}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
