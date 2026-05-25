'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { newBlockId, type BlockInstance, type BlockType } from '@/lib/blocks/types'
import { BLOCK_DEFAULTS } from '@/lib/blocks/defaults'
import type { Category, Event } from '@/types'

export type BlockSyncState = 'loading' | 'saved' | 'saving' | 'dirty' | 'error'

interface BlockEditorContextType {
  blocks: BlockInstance[]
  publishedBlocks: BlockInstance[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  syncState: BlockSyncState
  hasUnpublishedChanges: boolean
  draftUpdatedAt: string | null
  draftUpdatedBy: string | null

  /** Render-context data used by both renderers and certain editors. */
  upcomingEvents: Event[]
  featuredEvents: Event[]
  categories: Category[]
  faqs: { id: number; question: string; answer: string }[]

  addBlock:     (type: BlockType, atIndex?: number) => string
  updateBlock:  (id: string, next: BlockInstance) => void
  deleteBlock:  (id: string) => void
  duplicateBlock: (id: string) => void
  reorder:      (fromIdx: number, toIdx: number) => void
  publish:      () => Promise<{ error: string | null }>
  revertDraft:  () => Promise<{ error: string | null }>
  /** Replace draft with a starter block list converted from the old fixed-section config. */
  importFromSections: () => Promise<{ count: number; error: string | null }>
}

const BlockEditorContext = createContext<BlockEditorContextType | null>(null)

const AUTOSAVE_MS = 700
const PAGE_SLUG = 'home'

export function BlockEditorProvider({ children }: { children: React.ReactNode }) {
  const [blocks,    setBlocks]    = useState<BlockInstance[]>([])
  const [published, setPublished] = useState<BlockInstance[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<BlockSyncState>('loading')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [draftUpdatedBy, setDraftUpdatedBy] = useState<string | null>(null)

  const [upcomingEvents, setUpcoming] = useState<Event[]>([])
  const [featuredEvents, setFeatured] = useState<Event[]>([])
  const [categories,     setCategories] = useState<Category[]>([])
  const [faqs,           setFaqs] = useState<{ id: number; question: string; answer: string }[]>([])

  const blocksRef = useRef(blocks)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  blocksRef.current = blocks

  // Initial load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [page, evts, feats, cats, faqRes] = await Promise.all([
        supabase.from('block_pages').select('draft_blocks, published_blocks, draft_updated_at, draft_updated_by').eq('slug', PAGE_SLUG).single(),
        supabase.from('events').select('*').eq('status', 'approved').is('deleted_at', null).gte('date_start', new Date().toISOString()).order('date_start').limit(24),
        supabase.from('events').select('*').eq('status', 'approved').eq('is_featured', true).is('deleted_at', null).gte('date_start', new Date().toISOString()).order('featured_order', { ascending: true, nullsFirst: false }).order('date_start').limit(12),
        supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
        supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
      ])
      if (cancelled) return
      if (page.error || !page.data) {
        setSyncState('error')
        return
      }
      setBlocks((page.data.draft_blocks as BlockInstance[]) ?? [])
      setPublished((page.data.published_blocks as BlockInstance[]) ?? [])
      setDraftUpdatedAt(page.data.draft_updated_at as string | null)
      setDraftUpdatedBy(page.data.draft_updated_by as string | null)
      setUpcoming((evts.data as Event[]) ?? [])
      setFeatured((feats.data as Event[]) ?? [])
      setCategories((cats.data as Category[]) ?? [])
      setFaqs((faqRes.data as any) ?? [])
      setSyncState('saved')
    })()
    return () => { cancelled = true }
  }, [])

  // Realtime — pick up edits from another tab (skip local saves we just made)
  useEffect(() => {
    const channel = supabase
      .channel('block-pages-editor')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'block_pages' }, (payload) => {
        const row = payload.new as any
        if (row.slug !== PAGE_SLUG) return
        setSyncState((cur) => {
          if (cur !== 'dirty' && cur !== 'saving') {
            setBlocks((row.draft_blocks as BlockInstance[]) ?? [])
          }
          return cur
        })
        setPublished((row.published_blocks as BlockInstance[]) ?? [])
        setDraftUpdatedAt(row.draft_updated_at)
        setDraftUpdatedBy(row.draft_updated_by)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const persist = useCallback(async (next: BlockInstance[]) => {
    setSyncState('saving')
    const { error } = await supabase
      .from('block_pages')
      .update({ draft_blocks: next as unknown as Record<string, unknown>[] })
      .eq('slug', PAGE_SLUG)
    setSyncState(error ? 'error' : 'saved')
  }, [])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { persist(blocksRef.current) }, AUTOSAVE_MS)
  }, [persist])

  const addBlock = useCallback<BlockEditorContextType['addBlock']>((type, atIndex) => {
    const id = newBlockId()
    const block: BlockInstance = { id, type, config: { ...(BLOCK_DEFAULTS[type] as any) } }
    setBlocks((prev) => {
      const next = [...prev]
      const idx = atIndex ?? next.length
      next.splice(idx, 0, block)
      return next
    })
    setSelectedId(id)
    setSyncState('dirty')
    scheduleSave()
    return id
  }, [scheduleSave])

  const updateBlock = useCallback<BlockEditorContextType['updateBlock']>((id, next) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)))
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const deleteBlock = useCallback<BlockEditorContextType['deleteBlock']>((id) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const duplicateBlock = useCallback<BlockEditorContextType['duplicateBlock']>((id) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return prev
      const copy = { ...prev[idx], id: newBlockId(), config: JSON.parse(JSON.stringify(prev[idx].config)) }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      setSelectedId(copy.id)
      return next
    })
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const reorder = useCallback<BlockEditorContextType['reorder']>((fromIdx, toIdx) => {
    setBlocks((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

  const flushNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    await persist(blocksRef.current)
  }, [persist])

  const publish = useCallback(async () => {
    await flushNow()
    setSyncState('saving')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSyncState('error'); return { error: 'Not authenticated' } }
    const res = await fetch('/api/admin/site/blocks/publish', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setSyncState('error'); return { error: json.error ?? 'Publish failed' } }
    setPublished(blocksRef.current)
    setSyncState('saved')
    return { error: null }
  }, [flushNow])

  const revertDraft = useCallback(async () => {
    setSyncState('saving')
    const { data, error } = await supabase.rpc('block_pages_revert_draft', { p_slug: PAGE_SLUG })
    if (error) { setSyncState('error'); return { error: error.message } }
    setBlocks((data as BlockInstance[]) ?? [])
    setSyncState('saved')
    return { error: null }
  }, [])

  // Read the current published site_settings.sections + hero, build a starter
  // block list. This gets the user from "fixed sections" to "blocks" without
  // them having to recreate everything by hand.
  const importFromSections = useCallback<BlockEditorContextType['importFromSections']>(async () => {
    const { data: settings } = await supabase
      .from('site_settings_public')
      .select('published')
      .single()
    const pub = (settings?.published as any) ?? {}
    const sections: { id: string; enabled: boolean }[] = pub.sections ?? []
    const hero = pub.hero ?? null

    const next: BlockInstance[] = []
    const enabled = (sections.length > 0 ? sections : [
      { id: 'hero', enabled: true }, { id: 'categories', enabled: true },
      { id: 'featured', enabled: true }, { id: 'upcoming', enabled: true },
      { id: 'faq', enabled: true },
    ]).filter((s) => s.enabled)

    for (const s of enabled) {
      switch (s.id) {
        case 'hero':
          next.push({ id: newBlockId(), type: 'hero', config: { ...BLOCK_DEFAULTS.hero, ...(hero ?? {}) } })
          break
        case 'categories':
          next.push({ id: newBlockId(), type: 'categories_strip', config: { ...BLOCK_DEFAULTS.categories_strip } })
          break
        case 'featured':
          next.push({ id: newBlockId(), type: 'featured_events',  config: { ...BLOCK_DEFAULTS.featured_events } })
          break
        case 'upcoming':
          next.push({ id: newBlockId(), type: 'upcoming_events',  config: { ...BLOCK_DEFAULTS.upcoming_events } })
          break
        case 'faq':
          next.push({ id: newBlockId(), type: 'faq',              config: { ...BLOCK_DEFAULTS.faq } })
          break
      }
    }

    setBlocks(next)
    setSyncState('dirty')
    scheduleSave()
    return { count: next.length, error: null }
  }, [scheduleSave])

  const hasUnpublishedChanges = useMemo(
    () => JSON.stringify(blocks) !== JSON.stringify(published),
    [blocks, published],
  )

  const value: BlockEditorContextType = {
    blocks, publishedBlocks: published,
    selectedId, setSelectedId,
    syncState, hasUnpublishedChanges,
    draftUpdatedAt, draftUpdatedBy,
    upcomingEvents, featuredEvents, categories, faqs,
    addBlock, updateBlock, deleteBlock, duplicateBlock, reorder,
    publish, revertDraft, importFromSections,
  }

  return <BlockEditorContext.Provider value={value}>{children}</BlockEditorContext.Provider>
}

export function useBlockEditor() {
  const ctx = useContext(BlockEditorContext)
  if (!ctx) throw new Error('useBlockEditor must be used inside BlockEditorProvider')
  return ctx
}
