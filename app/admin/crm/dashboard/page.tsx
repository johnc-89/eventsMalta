'use client'

import { useMemo } from 'react'
import { useCrm } from '../CrmContext'
import { LEAD_STATUSES, LEAD_QUALITIES, type LeadStatus, type LeadQuality } from '@/types'

const STATUS_COLOR: Record<LeadStatus, string> = {
  'Not Contacted': 'bg-gray-400',
  'Contacted':     'bg-brand-cyan',
  'Responded':     'bg-purple-500',
  'Converted':     'bg-green-500',
  'Rejected':      'bg-red-500',
}

const QUALITY_COLOR: Record<LeadQuality, string> = {
  High:   'bg-green-500',
  Medium: 'bg-brand-gold',
  Low:    'bg-gray-400',
}

interface BarRow { label: string; value: number; colorClass: string }

function BarChart({ rows, total }: { rows: BarRow[]; total: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 italic">No data yet.</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = total > 0 ? (r.value / total) * 100 : 0
        return (
          <div key={r.label} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-gray-700">{r.label}</span>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${r.colorClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-gray-500 tabular-nums w-8 text-right">{r.value}</span>
          </div>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 p-5 overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent}`} />
      <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className="text-3xl font-bold text-brand-dark mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { leads, loading } = useCrm()

  const stats = useMemo(() => {
    const total = leads.length
    const byStatus = LEAD_STATUSES.map((s) => ({ label: s, value: leads.filter((l) => l.status === s).length, colorClass: STATUS_COLOR[s] }))
    const byQuality = LEAD_QUALITIES.map((q) => ({ label: q, value: leads.filter((l) => l.quality === q).length, colorClass: QUALITY_COLOR[q] }))
    const categoryMap: Record<string, number> = {}
    const platformMap: Record<string, number> = {}
    for (const l of leads) {
      const cat = l.category?.trim() || 'Uncategorised'
      categoryMap[cat] = (categoryMap[cat] ?? 0) + 1
      const ch = l.contact_channel?.trim() || 'Unknown'
      platformMap[ch] = (platformMap[ch] ?? 0) + 1
    }
    const byCategory = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, value]) => ({ label, value, colorClass: 'bg-brand-teal' }))
    const byPlatform = Object.entries(platformMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, colorClass: 'bg-brand-cyan' }))

    const notContacted = byStatus.find((b) => b.label === 'Not Contacted')!.value
    const contacted    = byStatus.find((b) => b.label === 'Contacted')!.value
    const responded    = byStatus.find((b) => b.label === 'Responded')!.value
    const converted    = byStatus.find((b) => b.label === 'Converted')!.value
    const high         = byQuality.find((b) => b.label === 'High')!.value
    const pct = (n: number) => total === 0 ? '0%' : `${Math.round((n / total) * 100)}% of total`

    return { total, notContacted, contacted, responded, converted, high, byStatus, byQuality, byCategory, byPlatform, pct }
  }, [leads])

  if (loading) return <div className="py-20 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-brand-gold border-t-transparent rounded-full" /></div>

  return (
    <div className="space-y-6">
      <h2 className="text-xs uppercase tracking-widest text-gray-500 font-semibold">Overview</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Leads"    value={stats.total}        accent="bg-gradient-to-r from-brand-cyan to-brand-teal" />
        <MetricCard label="Not Contacted"  value={stats.notContacted} sub={stats.pct(stats.notContacted)} accent="bg-gray-400" />
        <MetricCard label="Contacted"      value={stats.contacted}    sub={stats.pct(stats.contacted)}    accent="bg-brand-cyan" />
        <MetricCard label="Responded"      value={stats.responded}    sub={stats.pct(stats.responded)}    accent="bg-purple-500" />
        <MetricCard label="Converted"      value={stats.converted}    sub={stats.pct(stats.converted)}    accent="bg-green-500" />
        <MetricCard label="High Quality"   value={stats.high}         sub={stats.pct(stats.high)}         accent="bg-brand-gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-heading font-semibold text-brand-dark mb-4">By status</h3>
          <BarChart rows={stats.byStatus} total={stats.total} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-heading font-semibold text-brand-dark mb-4">By category</h3>
          <BarChart rows={stats.byCategory} total={stats.total} />
        </div>
      </div>

      <h2 className="text-xs uppercase tracking-widest text-gray-500 font-semibold pt-2">Quality &amp; platforms</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-heading font-semibold text-brand-dark mb-4">Quality distribution</h3>
          <BarChart rows={stats.byQuality} total={stats.total} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-heading font-semibold text-brand-dark mb-4">Contact platform mix</h3>
          <BarChart rows={stats.byPlatform} total={stats.total} />
        </div>
      </div>
    </div>
  )
}
