'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead, LeadHistory } from '@/types'
import { LEAD_QUALITIES, LEAD_STATUSES } from '@/types'
import { useCrm } from '../CrmContext'

interface Props {
  mode: 'create' | 'edit'
  lead?: Lead
  onClose: () => void
}

const FIELD_GROUPS: Array<{ title: string; fields: Array<{ key: keyof Lead; label: string; type?: 'text' | 'textarea' | 'date' | 'email' | 'url' | 'tel'; full?: boolean }> }> = [
  {
    title: 'Identity',
    fields: [
      { key: 'name',     label: 'Name', full: true },
      { key: 'category', label: 'Category' },
      { key: 'subtype',  label: 'Subtype' },
      { key: 'quality',  label: 'Quality' },
      { key: 'status',   label: 'Status' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'contact_channel', label: 'Suggested channel' },
      { key: 'email',           label: 'Email', type: 'email' },
      { key: 'phone',           label: 'Phone', type: 'tel' },
      { key: 'website_url',     label: 'Website',  type: 'url' },
      { key: 'instagram_url',   label: 'Instagram', type: 'url' },
      { key: 'facebook_url',    label: 'Facebook',  type: 'url' },
      { key: 'best_contact_url',label: 'Best contact link', type: 'url' },
      { key: 'google_search_url',label:'Google search', type: 'url' },
      { key: 'ig_search_url',   label: 'IG search', type: 'url' },
    ],
  },
  {
    title: 'Notes',
    fields: [
      { key: 'pitch', label: 'Pitch (short)', type: 'textarea', full: true },
      { key: 'notes', label: 'Notes',         type: 'textarea', full: true },
    ],
  },
  {
    title: 'Dates',
    fields: [
      { key: 'last_interaction_at', label: 'Last interaction', type: 'date' },
      { key: 'follow_up_at',        label: 'Follow-up',        type: 'date' },
    ],
  },
]

const HUMAN_FIELD: Record<string, string> = {
  name: 'Name', category: 'Category', subtype: 'Subtype', quality: 'Quality', status: 'Status',
  contact_channel: 'Channel', website_url: 'Website', instagram_url: 'Instagram', facebook_url: 'Facebook',
  email: 'Email', phone: 'Phone', pitch: 'Pitch', notes: 'Notes',
  google_search_url: 'Google search', ig_search_url: 'IG search', best_contact_url: 'Best contact',
  last_interaction_at: 'Last interaction', follow_up_at: 'Follow-up',
  converted_user_id: 'Linked user', __created__: 'Created', __deleted__: 'Deleted',
}

export default function LeadModal({ mode, lead, onClose }: Props) {
  const { createLead, updateLead, deleteLead } = useCrm()
  const [form, setForm] = useState<Partial<Lead>>(() => lead ?? { status: 'Not Contacted' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<LeadHistory[] | null>(null)

  useEffect(() => {
    if (mode === 'edit' && lead?.id) {
      supabase
        .from('lead_history')
        .select('*')
        .eq('lead_id', lead.id)
        .order('changed_at', { ascending: false })
        .limit(5)
        .then(({ data }) => setHistory(data || []))
    }
  }, [mode, lead?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k: keyof Lead, v: any) => setForm((f) => ({ ...f, [k]: v === '' ? null : v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name?.trim()) { setError('Name is required'); return }
    setSaving(true)
    if (mode === 'create') {
      const { error } = await createLead(form as Partial<Lead> & { name: string })
      if (error) { setError(error); setSaving(false); return }
    } else if (lead) {
      const patch: Partial<Lead> = {}
      for (const k of Object.keys(form) as (keyof Lead)[]) {
        if ((form as any)[k] !== (lead as any)[k]) (patch as any)[k] = (form as any)[k]
      }
      // Auto-stamp last_interaction_at when status moves off Not Contacted
      if (patch.status && patch.status !== 'Not Contacted' && !form.last_interaction_at) {
        patch.last_interaction_at = new Date().toISOString().slice(0, 10)
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await updateLead(lead.id, patch)
        if (error) { setError(error); setSaving(false); return }
      }
    }
    setSaving(false)
    onClose()
  }

  const onDelete = async () => {
    if (!lead) return
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    const { error } = await deleteLead(lead.id)
    if (error) setError(error)
    else onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-heading font-bold text-brand-dark">
            {mode === 'create' ? 'Add Lead' : `Edit · ${lead?.name}`}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {FIELD_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">{group.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.fields.map((f) => {
                  const value = (form as any)[f.key] ?? ''
                  const cls = 'w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm'
                  return (
                    <div key={f.key as string} className={f.full ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                      {f.key === 'quality' ? (
                        <select className={cls} value={value} onChange={(e) => set(f.key, e.target.value || null)}>
                          <option value="">—</option>
                          {LEAD_QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                        </select>
                      ) : f.key === 'status' ? (
                        <select className={cls} value={value || 'Not Contacted'} onChange={(e) => set(f.key, e.target.value)}>
                          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea className={cls} rows={3} value={value} onChange={(e) => set(f.key, e.target.value)} />
                      ) : f.type === 'date' ? (
                        <input type="date" className={cls} value={value ? String(value).slice(0, 10) : ''} onChange={(e) => set(f.key, e.target.value)} />
                      ) : (
                        <input type={f.type ?? 'text'} className={cls} value={value} onChange={(e) => set(f.key, e.target.value)} />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {mode === 'edit' && history && history.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">History · last 5 changes</h3>
              <ul className="text-xs space-y-2 bg-gray-50 rounded-lg p-3 border">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-x-2 gap-y-1 text-gray-700">
                    <span className="text-gray-400 font-mono">{new Date(h.changed_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                    <span className="font-medium">{HUMAN_FIELD[h.field_name] ?? h.field_name}</span>
                    {h.field_name !== '__created__' && h.field_name !== '__deleted__' && (
                      <span className="text-gray-500">
                        <span className="line-through">{h.old_value ?? '—'}</span>
                        {' → '}
                        <span className="text-brand-dark">{h.new_value ?? '—'}</span>
                      </span>
                    )}
                    <span className="text-gray-400 ml-auto">{h.changed_by}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          {mode === 'edit' ? (
            <button type="button" onClick={onDelete} className="text-red-600 hover:text-red-700 text-sm font-medium">Delete lead</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/40 text-brand-dark px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create lead' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
