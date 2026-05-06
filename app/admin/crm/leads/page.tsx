'use client'

import { useMemo, useState } from 'react'
import { useCrm } from '../CrmContext'
import { LEAD_QUALITIES, LEAD_STATUSES, type Lead, type LeadQuality, type LeadStatus } from '@/types'
import FilterDropdown from '../_components/FilterDropdown'
import StatusPill from '../_components/StatusPill'
import QualityPill from '../_components/QualityPill'
import InlineCell from '../_components/InlineCell'
import LeadModal from '../_components/LeadModal'

type SortKey = keyof Lead
type SortDir = 'asc' | 'desc'

const COLUMNS: Array<{ key: SortKey; label: string; cls?: string }> = [
  { key: 'name',                label: 'Name',             cls: 'min-w-[180px]' },
  { key: 'category',            label: 'Category',         cls: 'min-w-[140px]' },
  { key: 'quality',             label: 'Quality' },
  { key: 'status',              label: 'Status' },
  { key: 'contact_channel',     label: 'Platform',         cls: 'min-w-[120px]' },
  { key: 'email',               label: 'Contact',          cls: 'min-w-[160px]' },
  { key: 'last_interaction_at', label: 'Last Interaction' },
  { key: 'notes',               label: 'Notes',            cls: 'min-w-[200px]' },
  { key: 'website_url',         label: 'Link',             cls: 'min-w-[160px]' },
]

function formatDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s.slice(0, 10)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function LeadsPage() {
  const { leads, loading, updateLead, deleteLead } = useCrm()
  const [search, setSearch] = useState('')
  const [statusFilter,  setStatusFilter]  = useState<string | null>(null)
  const [qualityFilter, setQualityFilter] = useState<string | null>(null)
  const [categoryFilter,setCategoryFilter]= useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const l of leads) if (l.category?.trim()) set.add(l.category.trim())
    return Array.from(set).sort()
  }, [leads])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = leads.filter((l) => {
      if (statusFilter   && l.status   !== statusFilter)   return false
      if (qualityFilter  && l.quality  !== qualityFilter)  return false
      if (categoryFilter && l.category !== categoryFilter) return false
      if (!q) return true
      const blob = [
        l.name, l.category, l.subtype, l.contact_channel,
        l.email, l.phone, l.pitch, l.notes,
        l.website_url, l.instagram_url, l.facebook_url, l.best_contact_url,
      ].filter(Boolean).join(' ').toLowerCase()
      return blob.includes(q)
    })
    out = [...out].sort((a, b) => {
      const av = (a[sortKey] ?? '') as any
      const bv = (b[sortKey] ?? '') as any
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return out
  }, [leads, search, statusFilter, qualityFilter, categoryFilter, sortKey, sortDir])

  const clearFilters = () => {
    setSearch(''); setStatusFilter(null); setQualityFilter(null); setCategoryFilter(null)
  }

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const onDelete = async (lead: Lead) => {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return
    await deleteLead(lead.id)
  }

  if (loading) return <div className="py-20 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-brand-gold border-t-transparent rounded-full" /></div>

  const filtersActive = !!(search || statusFilter || qualityFilter || categoryFilter)

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm"
          />
        </div>
        <FilterDropdown label="All statuses"   value={statusFilter}   options={[...LEAD_STATUSES]}   onChange={setStatusFilter} />
        <FilterDropdown label="All quality"    value={qualityFilter}  options={[...LEAD_QUALITIES]}  onChange={setQualityFilter} />
        <FilterDropdown label="All categories" value={categoryFilter} options={categories}           onChange={setCategoryFilter} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 tabular-nums">{filtered.length} / {leads.length} leads</span>
          {filtersActive && (
            <button onClick={clearFilters} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-600">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-semibold">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key as string} className={`text-left px-4 py-3 cursor-pointer select-none ${c.cls ?? ''}`} onClick={() => onSort(c.key)}>
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && <span className="text-brand-gold">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </span>
                </th>
              ))}
              <th className="text-right px-4 py-3 w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.name} onSave={(v) => v && updateLead(l.id, { name: v })} className="font-medium text-brand-dark" />
                </td>
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.category} onSave={(v) => updateLead(l.id, { category: v })} />
                </td>
                <td className="px-4 py-2 align-middle">
                  <QualityPill
                    value={l.quality}
                    onChange={(q) => updateLead(l.id, { quality: q as LeadQuality })}
                  />
                </td>
                <td className="px-4 py-2 align-middle">
                  <StatusPill
                    value={l.status}
                    onChange={(s) => {
                      const patch: Partial<Lead> = { status: s as LeadStatus }
                      if (s !== 'Not Contacted' && !l.last_interaction_at) {
                        patch.last_interaction_at = new Date().toISOString().slice(0, 10)
                      }
                      updateLead(l.id, patch)
                    }}
                  />
                </td>
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.contact_channel} onSave={(v) => updateLead(l.id, { contact_channel: v })} />
                </td>
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.email} onSave={(v) => updateLead(l.id, { email: v })} asLink="mailto" />
                </td>
                <td className="px-4 py-2 align-middle text-gray-500 whitespace-nowrap">
                  <InlineCell value={l.last_interaction_at ? formatDate(l.last_interaction_at) : null}
                    onSave={() => {/* date edits via modal — ignore inline */}}
                  />
                </td>
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.notes} onSave={(v) => updateLead(l.id, { notes: v })} />
                </td>
                <td className="px-4 py-2 align-middle">
                  <InlineCell value={l.website_url} onSave={(v) => updateLead(l.id, { website_url: v })} asLink="url" />
                </td>
                <td className="px-4 py-2 align-middle text-right whitespace-nowrap">
                  <button onClick={() => setEditingLead(l)} className="text-xs px-2 py-1 rounded bg-gray-50 hover:bg-gray-100 text-gray-700 mr-1">Edit</button>
                  <button onClick={() => onDelete(l)} className="text-xs px-2 py-1 rounded bg-white hover:bg-red-50 text-red-600 border border-red-100">Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-12 text-center text-gray-400 text-sm">
                  {leads.length === 0 ? 'No leads yet — add your first lead or seed defaults from Import / Export.' : 'No leads match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingLead && <LeadModal mode="edit" lead={editingLead} onClose={() => setEditingLead(null)} />}
    </div>
  )
}
