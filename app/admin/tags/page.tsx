'use client'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    const { error: insertErr } = await supabase
      .from('tags')
      .insert({ name, slug, display_order: 0 })
    if (insertErr) {
      setError(insertErr.message.includes('duplicate') ? 'That tag already exists.' : insertErr.message)
    } else {
      setNewTag('')
      await fetchTags()
    }
    setSubmitting(false)
  }

  async function deleteTag(tag: Tag) {
    if (!confirm(`Delete the tag "${tag.name}"? Existing events that use it will keep the tag string but it won't be selectable for new events.`)) return
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
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Manage Tags</h1>
        <Link href="/admin" className="text-brand-cyan hover:text-brand-teal text-sm font-medium">
          ← Back to Admin
        </Link>
      </div>
      <p className="text-gray-500 mb-8">
        Tags shown here are the only ones organisers can pick when posting an event.
      </p>

      {/* Add new */}
      <form onSubmit={addTag} className="bg-white rounded-xl border p-5 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Add a new tag</label>
        <div className="flex gap-2">
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
        {tags.length} tag{tags.length === 1 ? '' : 's'}
      </h2>

      {tags.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No tags yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tags.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-brand-dark">{t.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">{t.slug}</td>
                  <td className="px-4 py-3 text-right">
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
