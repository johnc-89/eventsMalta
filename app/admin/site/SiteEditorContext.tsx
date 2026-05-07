'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SETTINGS, mergeWithDefaults, type SiteSettingsShape } from '@/lib/site-settings'

export type EditorSyncState = 'loading' | 'saved' | 'saving' | 'dirty' | 'error'

interface SiteEditorContextType {
  draft: SiteSettingsShape
  published: SiteSettingsShape
  syncState: EditorSyncState
  hasUnpublishedChanges: boolean
  draftUpdatedBy: string | null
  draftUpdatedAt: string | null
  /** Patch the draft. Autosaves after a debounce. */
  patch: <K extends keyof SiteSettingsShape>(key: K, value: Partial<SiteSettingsShape[K]>) => void
  /** Replace the entire draft (used by reset). */
  setDraft: (next: SiteSettingsShape) => void
  publish: () => Promise<{ error: string | null }>
  revertDraft: () => Promise<{ error: string | null }>
  flushNow: () => Promise<void>
}

const SiteEditorContext = createContext<SiteEditorContextType | null>(null)

const AUTOSAVE_MS = 700

export function SiteEditorProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = useState<SiteSettingsShape>(DEFAULT_SETTINGS)
  const [published, setPublished] = useState<SiteSettingsShape>(DEFAULT_SETTINGS)
  const [draftUpdatedBy, setDraftUpdatedBy] = useState<string | null>(null)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<EditorSyncState>('loading')
  const draftRef = useRef(draft)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  draftRef.current = draft

  // Initial load — pull both draft and published
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('draft, published, draft_updated_at, draft_updated_by')
        .eq('id', 1)
        .single()
      if (cancelled) return
      if (error || !data) {
        setSyncState('error')
        return
      }
      const d = mergeWithDefaults(data.draft as any)
      const p = mergeWithDefaults(data.published as any)
      setDraftState(d)
      setPublished(p)
      setDraftUpdatedAt(data.draft_updated_at as string | null)
      setDraftUpdatedBy(data.draft_updated_by as string | null)
      setSyncState('saved')
    })()
    return () => { cancelled = true }
  }, [])

  // Realtime — pick up edits from another tab/user
  useEffect(() => {
    const channel = supabase
      .channel('site-settings-editor')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_settings' }, (payload) => {
        const row = payload.new as any
        // Only adopt remote draft if WE aren't currently dirty
        setSyncState((cur) => {
          if (cur !== 'dirty' && cur !== 'saving') {
            setDraftState(mergeWithDefaults(row.draft))
          }
          return cur
        })
        setPublished(mergeWithDefaults(row.published))
        setDraftUpdatedAt(row.draft_updated_at)
        setDraftUpdatedBy(row.draft_updated_by)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const persist = useCallback(async (next: SiteSettingsShape) => {
    setSyncState('saving')
    const { error } = await supabase
      .from('site_settings')
      .update({ draft: next as unknown as Record<string, unknown> })
      .eq('id', 1)
    setSyncState(error ? 'error' : 'saved')
  }, [])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      persist(draftRef.current)
    }, AUTOSAVE_MS)
  }, [persist])

  const patch = useCallback<SiteEditorContextType['patch']>((key, value) => {
    setDraftState((prev) => ({ ...prev, [key]: { ...(prev[key] as any), ...(value as any) } }))
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const setDraft = useCallback((next: SiteSettingsShape) => {
    setDraftState(next)
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const flushNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    await persist(draftRef.current)
  }, [persist])

  const publish = useCallback(async () => {
    await flushNow()
    setSyncState('saving')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSyncState('error'); return { error: 'Not authenticated' } }
    let res: Response
    try {
      res = await fetch('/api/admin/site/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e)
      setSyncState('error')
      return { error: `Network error: ${detail}` }
    }
    const text = await res.text()
    let json: { error?: string; ok?: boolean; published?: unknown } = {}
    try { json = JSON.parse(text) } catch { /* not JSON — likely an HTML error page */ }
    if (!res.ok) {
      setSyncState('error')
      const detail = json.error ?? text.slice(0, 200) ?? 'Publish failed'
      return { error: `${detail} (HTTP ${res.status})` }
    }
    setPublished(draftRef.current)
    setSyncState('saved')
    return { error: null }
  }, [flushNow])

  const revertDraft = useCallback(async () => {
    setSyncState('saving')
    const { data, error } = await supabase.rpc('site_settings_revert_draft')
    if (error) { setSyncState('error'); return { error: error.message } }
    setDraftState(mergeWithDefaults(data as any))
    setSyncState('saved')
    return { error: null }
  }, [])

  const hasUnpublishedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(published),
    [draft, published],
  )

  const value: SiteEditorContextType = {
    draft, published, syncState, hasUnpublishedChanges,
    draftUpdatedBy, draftUpdatedAt,
    patch, setDraft, publish, revertDraft, flushNow,
  }

  return <SiteEditorContext.Provider value={value}>{children}</SiteEditorContext.Provider>
}

export function useSiteEditor() {
  const ctx = useContext(SiteEditorContext)
  if (!ctx) throw new Error('useSiteEditor must be used inside SiteEditorProvider')
  return ctx
}
