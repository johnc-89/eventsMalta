'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BlockBuilder from '@/app/admin/site/blocks/_components/BlockBuilder'
import LandingControls from './LandingControls'
import { LANDING_TYPES, type LandingType } from '@/lib/blocks/placeholders'
import { LOCALITIES } from '@/lib/malta-localities'
import { groupByVenue } from '@/lib/venues'
import type { Event } from '@/types'

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

interface Opt { slug: string; label: string }

// The landing-page editor for one type. Switches the underlying block_pages row
// between the type template (`landing:<type>`) and a per-instance override
// (`landing:<type>:<instance>`), remounting the builder on change.
export default function LandingPageEditor({ type }: { type: LandingType }) {
  const meta = LANDING_TYPES[type]
  const [instance, setInstance] = useState('')          // '' = template
  const [options, setOptions] = useState<Opt[]>([])
  const [loadingOpts, setLoadingOpts] = useState(false)

  const slug = instance ? `landing:${type}:${instance}` : `landing:${type}`

  useEffect(() => {
    if (!meta.hasInstances) return
    let cancelled = false
    ;(async () => {
      setLoadingOpts(true)
      let opts: Opt[] = []
      if (type === 'location') {
        opts = LOCALITIES.map((l) => ({ slug: l.slug, label: l.name }))
      } else if (type === 'month') {
        opts = MONTHS.map((m) => ({ slug: m, label: m[0].toUpperCase() + m.slice(1) }))
      } else if (type === 'tag') {
        const { data } = await supabase.from('tags').select('name, slug').eq('enabled', true).order('display_order')
        opts = ((data as { name: string; slug: string | null }[] | null) ?? [])
          .filter((t) => t.slug)
          .map((t) => ({ slug: t.slug as string, label: t.name }))
      } else if (type === 'venue') {
        const { data } = await supabase
          .from('events').select('*')
          .eq('status', 'approved').is('deleted_at', null)
          .gte('date_start', new Date().toISOString()).limit(500)
        const groups = groupByVenue((data as Event[]) ?? [])
        opts = Array.from(groups.entries())
          .map(([s, g]) => ({ slug: s, label: g.displayName }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }
      if (!cancelled) { setOptions(opts); setLoadingOpts(false) }
    })()
    return () => { cancelled = true }
  }, [type, meta.hasInstances])

  const onDeleteOverride = async () => {
    if (!instance) return
    const label = options.find((o) => o.slug === instance)?.label ?? instance
    if (!confirm(`Delete the custom blocks for “${label}” and revert it to the ${meta.label.toLowerCase()} template?`)) return
    const { error } = await supabase.rpc('block_pages_delete', { p_slug: slug })
    if (error) { alert(`Could not delete override: ${error.message}`); return }
    setInstance('')
  }

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <h2 className="font-heading font-semibold text-brand-dark">{meta.label}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {instance
            ? `Editing a custom override for one page — it replaces the template for this page only.`
            : `Editing the template shared by every ${meta.label.toLowerCase()} page. Publish to make it live; individual pages fall back to their built-in design until you do.`}
        </p>

        {meta.hasInstances && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <label className="text-xs font-medium text-gray-600">Editing:</label>
            <select
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
            >
              <option value="">◆ Template (all {meta.label.toLowerCase()})</option>
              {options.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
            </select>
            {loadingOpts && <span className="text-xs text-gray-400">loading…</span>}
            {instance && (
              <button onClick={onDeleteOverride} className="text-xs text-red-600 hover:text-red-700 ml-1">
                Delete override
              </button>
            )}
          </div>
        )}
      </div>

      <BlockBuilder
        key={slug}
        slug={slug}
        landingType={type}
        allowImportFromSections={false}
        headerSlot={<LandingControls type={type} />}
      />
    </div>
  )
}
