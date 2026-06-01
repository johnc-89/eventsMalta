'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { EventSource, ImportRun } from '@/types'

// Adapters that have been wired up in lib/importers/registry.ts. Keep this in
// sync — adding an entry here is the difference between "Run now" being
// disabled vs functional for a source.
const IMPLEMENTED_ADAPTERS = new Set<string>([
  'teatrumanoel',
  'tsmalta',
  'popp',
  'heritagemalta',
  'esplora',
  'festivals_mt',
  'visitmalta',
  'maltaartisanmarkets',
])

// Super-admin-only management page for external event sources.
//
// Phase 1 surface:
//   • Aggregator-user init banner (one-click) — required before any import can run.
//   • Sources list with enable/disable toggle, last-run badge, error display.
//   • "Run now" button is disabled with an explainer tooltip until adapters ship.
//   • Per-row expansion: notes (editable), config JSON (read-only), recent runs.
//
// Out of scope for Phase 1: adding/removing sources at runtime (sources are
// seeded by migration 0010 and adding a new one requires a code change anyway,
// since each source needs an adapter file).
export default function AdminSourcesPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [sources, setSources] = useState<EventSource[] | null>(null)
  const [runsBySource, setRunsBySource] = useState<Record<number, ImportRun[]>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [openRunId, setOpenRunId] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // ------------------------------------------------------------------------
  // Auth gate
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (authLoading) return
    if (!user) { router.push('/login?next=/admin/sources'); return }
    if (profile?.role !== 'super_admin') { router.push('/'); return }
  }, [user, profile, authLoading, router])

  // ------------------------------------------------------------------------
  // Load sources + aggregator id
  // ------------------------------------------------------------------------
  const load = useCallback(async () => {
    const { data: srcs } = await supabase.from('event_sources').select('*').order('name')
    setSources((srcs ?? []) as EventSource[])
  }, [])

  useEffect(() => {
    if (profile?.role !== 'super_admin') return
    load()
  }, [profile, load])

  // ------------------------------------------------------------------------
  // Realtime: refresh on any change so a running import shows updates live
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (profile?.role !== 'super_admin') return
    const channel = supabase
      .channel('admin-sources')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_sources' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_runs' }, (payload) => {
        const row = payload.new as ImportRun | undefined
        if (!row) return
        setRunsBySource((prev) => {
          const list = prev[row.source_id] ?? []
          const next = [row, ...list.filter((r) => r.id !== row.id)].slice(0, 10)
          return { ...prev, [row.source_id]: next }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, load])

  // ------------------------------------------------------------------------
  // Lazy-load recent runs when a row is expanded
  // ------------------------------------------------------------------------
  const fetchRuns = useCallback(async (sourceId: number) => {
    const { data } = await supabase
      .from('import_runs')
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(10)
    setRunsBySource((prev) => ({ ...prev, [sourceId]: (data ?? []) as ImportRun[] }))
  }, [])

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const isOpen = !prev[id]
      if (isOpen && !runsBySource[id]) fetchRuns(id)
      return { ...prev, [id]: isOpen }
    })
  }

  // ------------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------------
  const setEnabled = async (id: number, enabled: boolean) => {
    setBusyId(id)
    const { error } = await supabase.from('event_sources').update({ enabled }).eq('id', id)
    setBusyId(null)
    if (error) {
      setMsg({ kind: 'error', text: `Could not update source: ${error.message}` })
      return
    }
    setSources((prev) => prev?.map((s) => (s.id === id ? { ...s, enabled } : s)) ?? null)
  }

  const setNotes = async (id: number, notes: string) => {
    const { error } = await supabase.from('event_sources').update({ notes }).eq('id', id)
    if (error) {
      setMsg({ kind: 'error', text: `Could not save notes: ${error.message}` })
      return
    }
    setSources((prev) => prev?.map((s) => (s.id === id ? { ...s, notes } : s)) ?? null)
  }

  const runNow = async (id: number) => {
    setBusyId(id); setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMsg({ kind: 'error', text: 'Not authenticated' })
        return
      }
      const res = await fetch(`/api/admin/sources/${id}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'error', text: body.error ?? `Run failed (HTTP ${res.status})` })
        return
      }
      const s = body.summary as { status: string; fetched: number; inserted: number; updated: number; skipped: number; excluded: number; errored: number; rewrite_errors: number }
      const rewriteWarn = s.rewrite_errors > 0 ? ` · ⚠ ${s.rewrite_errors} stored with original text (Groq rewrite failed — check GROQ_API_KEY)` : ''
      setMsg({
        kind: s.status === 'error' ? 'error' : s.rewrite_errors > 0 ? 'error' : 'success',
        text: `${s.status.toUpperCase()} — +${s.inserted} new · ~${s.updated} updated · ${s.skipped} unchanged · ${s.excluded} excluded · ${s.errored} errored (${s.fetched} fetched)${rewriteWarn}`,
      })
      // Refresh runs for this source
      fetchRuns(id)
      // Refresh source row for last_run_at etc.
      load()
    } catch (e: unknown) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusyId(null)
    }
  }


  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  if (authLoading || (sources === null && profile?.role === 'super_admin')) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full" /></div>
  }
  if (profile?.role !== 'super_admin') return null

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <h1 className="text-3xl font-heading font-bold text-brand-dark">Event Sources</h1>
        <div className="flex gap-2">
          <Link
            href="/admin/site/importers"
            className="bg-white border border-brand-teal/30 text-brand-teal hover:bg-brand-teal/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Importer Settings
          </Link>
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-brand-dark self-center"
          >
            ← Back to admin
          </Link>
        </div>
      </div>
      <p className="text-gray-500 mb-6">
        External websites we pull events from. Imports always land in <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">pending_review</span> and need a human approval before going live.
      </p>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${msg.kind === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      <div className="space-y-3">
        {(sources ?? []).map((s) => {
          const isOpen = !!expanded[s.id]
          const runs = runsBySource[s.id] ?? []
          const hasAdapter = IMPLEMENTED_ADAPTERS.has(s.adapter)
          const canRun = hasAdapter && s.enabled
          const runTooltip = !hasAdapter
            ? 'Adapter not yet built'
            : !s.enabled
              ? 'Enable the source first'
              : ''
          return (
            <div key={s.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-brand-dark text-base">{s.name}</h3>
                      <span className="text-[11px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s.adapter}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-100">pending_review</span>
                    </div>
                    <a
                      href={s.events_url || s.homepage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-teal hover:underline break-all"
                    >
                      {s.events_url || s.homepage_url} ↗
                    </a>
                    <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                      {s.last_success_at ? (
                        <span>Last success: {new Date(s.last_success_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      ) : (
                        <span>Never run</span>
                      )}
                      {s.last_error && <span className="text-red-600 truncate max-w-md" title={s.last_error}>Error: {s.last_error}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEnabled(s.id, !s.enabled)}
                      disabled={busyId === s.id}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        s.enabled
                          ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {s.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => canRun && runNow(s.id)}
                      disabled={!canRun || busyId === s.id}
                      title={runTooltip}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-teal text-white hover:bg-brand-teal/90 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                      {busyId === s.id ? 'Running…' : 'Run now'}
                    </button>
                    <button
                      onClick={() => toggleExpand(s.id)}
                      className="px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100"
                    >
                      {isOpen ? '▴' : '▾'}
                    </button>
                  </div>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 sm:px-5 py-4 space-y-4">
                  <NotesEditor sourceId={s.id} initial={s.notes ?? ''} onSave={setNotes} />

                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                      Recent runs ({runs.length})
                    </h4>
                    {runs.length === 0 ? (
                      <p className="text-xs text-gray-500">No runs yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {runs.map((r) => {
                          const isOpenRun = openRunId === r.id
                          return (
                            <div key={r.id} className="bg-white border border-gray-200 rounded">
                              <button
                                type="button"
                                onClick={() => setOpenRunId(isOpenRun ? null : r.id)}
                                className="text-xs w-full flex items-center gap-3 px-2 py-1 hover:bg-gray-50 text-left"
                              >
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  r.status === 'ok' ? 'bg-green-500'
                                  : r.status === 'running' ? 'bg-amber-400 animate-pulse'
                                  : r.status === 'partial' ? 'bg-amber-500'
                                  : 'bg-red-500'
                                }`} />
                                <span className="text-gray-600 w-32 flex-shrink-0">
                                  {new Date(r.started_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                </span>
                                <span className="text-gray-500">via {r.triggered_by}</span>
                                <span className="ml-auto text-gray-700 font-mono">
                                  +{r.inserted} ~{r.updated} skip:{r.skipped} excl:{r.excluded} err:{r.errored}
                                </span>
                                <span className="text-gray-400 ml-2">{isOpenRun ? '▾' : '▸'}</span>
                              </button>
                              {isOpenRun && (
                                <pre className="text-[11px] leading-snug font-mono whitespace-pre-wrap break-words bg-gray-900 text-gray-100 p-3 rounded-b max-h-96 overflow-auto">
{r.log?.trim() ? r.log : '(no log)'}
                                </pre>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

    </main>
  )
}

// ---------------------------------------------------------------------------
// Editable notes — debounced save
// ---------------------------------------------------------------------------
function NotesEditor({
  sourceId, initial, onSave,
}: { sourceId: number; initial: string; onSave: (id: number, value: string) => Promise<void> }) {
  const [value, setValue] = useState(initial)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (value === initial) return
    const t = setTimeout(async () => {
      await onSave(sourceId, value)
      setSavedAt(Date.now())
    }, 700)
    return () => clearTimeout(t)
  }, [value, initial, sourceId, onSave])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Notes</h4>
        {savedAt && <span className="text-[11px] text-gray-400">saved</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Internal notes — adapter caveats, partnership status, robots.txt quirks…"
        className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs bg-white focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 outline-none"
      />
    </div>
  )
}
