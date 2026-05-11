'use client'

import { useState } from 'react'
import { useSiteEditor } from '../SiteEditorContext'
import { Field, Section, inputCls } from '../_components/Field'

// Importer settings — lives inside the Site Editor so it gets draft/publish
// for free. Two concerns:
//   1. Attribution copy shown on imported event cards (toggle + template).
//   2. Political-content filter — hard-block + soft-flag keyword lists.
//
// Both lists are persisted as JSON arrays in
// `site_settings.published.importers.political_filter.*`. The scraper
// pipeline (Phase 2) reads them from the public view at run time.
export default function ImporterSettings() {
  const { draft, patch } = useSiteEditor()
  const i = draft.importers
  const { attribution, political_filter } = i

  return (
    <div>
      <Section
        title="Run limits"
        description="Applied to every import run across all sources. Publish to make changes live."
      >
        <Field label="Max events per run" hint="Hard cap on how many events each source imports per run. Default: 20.">
          <input
            type="number"
            min={1}
            max={500}
            className={inputCls}
            value={i.max_events}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              patch('importers', { max_events: isNaN(v) || v < 1 ? 20 : v })
            }}
          />
        </Field>
        <Field label="Days ahead" hint="Skip events starting more than this many days from today. Default: 180 (≈ 6 months).">
          <input
            type="number"
            min={1}
            max={730}
            className={inputCls}
            value={i.days_ahead}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              patch('importers', { days_ahead: isNaN(v) || v < 1 ? 180 : v })
            }}
          />
        </Field>
      </Section>

      <Section
        title="Attribution"
        description="Shown on every event imported from an external source. The placeholder {source} is replaced with the source's display name (e.g. ‘Festivals Malta’)."
      >
        <Field label="Show attribution line">
          <label className="inline-flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={attribution.enabled}
              onChange={(e) =>
                patch('importers', { attribution: { ...attribution, enabled: e.target.checked } })
              }
              className="w-4 h-4 accent-brand-teal"
            />
            <span className="text-sm text-gray-700">
              {attribution.enabled ? 'Visible to visitors' : 'Hidden (imports look like normal events)'}
            </span>
          </label>
        </Field>
        <Field label="Template" hint="Use {source} as a placeholder for the source name. Keep it short — it shows on cards." full>
          <input
            className={inputCls}
            value={attribution.template}
            onChange={(e) =>
              patch('importers', { attribution: { ...attribution, template: e.target.value } })
            }
            placeholder="Imported from {source}"
          />
          <p className="text-xs text-gray-500 mt-1">
            Preview: <span className="font-medium text-gray-700">{attribution.template.replace('{source}', 'Festivals Malta')}</span>
          </p>
        </Field>
      </Section>

      <Section
        title="Political content filter — hard block"
        description="Events whose title, description, venue or organiser contains ANY of these phrases are never imported. The match is case-insensitive substring. Pad bare initials with spaces (‘ pl ’ rather than ‘pl’) to avoid matching inside other words."
      >
        <KeywordEditor
          full
          value={political_filter.hard_keywords}
          onChange={(next) =>
            patch('importers', { political_filter: { ...political_filter, hard_keywords: next } })
          }
          placeholder="add a phrase and press Enter"
          accent="red"
          countLabel="Block phrases"
        />
      </Section>

      <Section
        title="Political content filter — soft flag"
        description="Events matching these still import (so you don't lose legitimate coverage), but they land in pending_review with a visible ‘possible political content’ flag for the moderator. Use this for ambiguous words like ‘minister’ or ‘parliament’."
      >
        <KeywordEditor
          full
          value={political_filter.soft_keywords}
          onChange={(next) =>
            patch('importers', { political_filter: { ...political_filter, soft_keywords: next } })
          }
          placeholder="add a phrase and press Enter"
          accent="amber"
          countLabel="Flag phrases"
        />
      </Section>

      <div className="text-xs text-gray-500 mt-4 mb-2 px-1">
        Changes save automatically to the draft. Click <strong>Publish</strong> in the top bar to apply them to live imports.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tag-style keyword list — add/remove chips
// ---------------------------------------------------------------------------
function KeywordEditor({
  value, onChange, placeholder, accent, countLabel, full,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  accent: 'red' | 'amber'
  countLabel: string
  full?: boolean
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const t = draft.trim().toLowerCase()
    if (!t) return
    if (value.some((v) => v.toLowerCase() === t)) { setDraft(''); return }
    onChange([...value, t])
    setDraft('')
  }

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))

  const accentCls =
    accent === 'red'
      ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'

  return (
    <Field label={`${countLabel} (${value.length})`} full={full}>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px]">
        {value.length === 0 && (
          <span className="text-xs text-gray-400 italic self-center">No phrases — filter inactive.</span>
        )}
        {value.map((kw, idx) => (
          <span
            key={`${kw}-${idx}`}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${accentCls}`}
          >
            <span className="font-mono">{kw}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              aria-label={`Remove "${kw}"`}
              className="opacity-60 hover:opacity-100 -mr-1"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-dark text-white hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </Field>
  )
}
