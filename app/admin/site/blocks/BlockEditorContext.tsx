'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { newBlockId, type BlockInstance, type BlockType } from '@/lib/blocks/types'
import { BLOCK_DEFAULTS } from '@/lib/blocks/defaults'
import { starterLayout } from '@/lib/blocks/landing-starters'
import type { LandingType } from '@/lib/blocks/placeholders'
import type { Category, Event } from '@/types'

export type BlockSyncState = 'loading' | 'saved' | 'saving' | 'dirty' | 'error'

/** Page-level SEO override (title + meta description templates, {placeholder}-aware). */
export interface PageMeta {
  seo_title?: string
  seo_description?: string
}

interface BlockEditorContextType {
  blocks: BlockInstance[]
  publishedBlocks: BlockInstance[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  syncState: BlockSyncState
  hasUnpublishedChanges: boolean
  draftUpdatedAt: string | null
  draftUpdatedBy: string | null

  /** Whether the "Import from sections" action applies to this page (homepage only). */
  allowImportFromSections: boolean
  /** Set for landing-page editors — drives the placeholder preview + starter layout. */
  landingType: LandingType | null

  /** SEO meta override for this page (title/description templates). */
  meta: PageMeta
  setMeta: (patch: Partial<PageMeta>) => void

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
  /** Landing editors only: replace draft with a starter layout for `landingType`. */
  loadStarterLayout: () => { count: number }
}

const BlockEditorContext = createContext<BlockEditorContextType | null>(null)

const AUTOSAVE_MS = 700

export function BlockEditorProvider({
  children,
  slug = 'home',
  allowImportFromSections = true,
  landingType = null,
}: {
  children: React.ReactNode
  /** Which block_pages row this editor targets. */
  slug?: string
  /** Homepage-only: convert fixed sections into a starter block list. */
  allowImportFromSections?: boolean
  /** Set for landing-page editors (location/tag/venue/…) — enables placeholder
   *  preview + the starter-layout button and switches off section import. */
  landingType?: LandingType | null
}) {
  const [blocks,    setBlocks]    = useState<BlockInstance[]>([])
  const [published, setPublished] = useState<BlockInstance[]>([])
  const [meta,       setMetaState] = useState<PageMeta>({})
  const [publishedMeta, setPublishedMeta] = useState<PageMeta>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<BlockSyncState>('loading')
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [draftUpdatedBy, setDraftUpdatedBy] = useState<string | null>(null)

  const [upcomingEvents, setUpcoming] = useState<Event[]>([])
  const [featuredEvents, setFeatured] = useState<Event[]>([])
  const [categories,     setCategories] = useState<Category[]>([])
  const [faqs,           setFaqs] = useState<{ id: number; question: string; answer: string }[]>([])

  const blocksRef = useRef(blocks)
  const metaRef   = useRef(meta)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  blocksRef.current = blocks
  metaRef.current = meta

  // Initial load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const SELECT = 'draft_blocks, published_blocks, draft_updated_at, draft_updated_by, draft_meta, published_meta'
      const [page, evts, feats, cats, faqRes] = await Promise.all([
        supabase.from('block_pages').select(SELECT).eq('slug', slug).maybeSingle(),
        supabase.from('events').select('*').eq('status', 'approved').is('deleted_at', null).gte('date_start', new Date().toISOString()).order('date_start').limit(24),
        supabase.from('events').select('*').eq('status', 'approved').eq('is_featured', true).is('deleted_at', null).gte('date_start', new Date().toISOString()).order('featured_order', { ascending: true, nullsFirst: false }).order('date_start').limit(12),
        supabase.from('tags').select('*').eq('enabled', true).order('display_order'),
        supabase.from('faq_items').select('id, question, answer').eq('enabled', true).order('display_order'),
      ])
      if (cancelled) return

      let row = page.data as Record<string, any> | null
      if (page.error) {
        setSyncState('error')
        return
      }
      // Landing template/instance rows are created on demand — if this slug has
      // no row yet, insert an empty one (super_admin RLS permits it).
      if (!row) {
        const ins = await supabase.from('block_pages').insert({ slug }).select(SELECT).single()
        if (cancelled) return
        if (ins.error || !ins.data) { setSyncState('error'); return }
        row = ins.data as Record<string, any>
      }

      setBlocks((row.draft_blocks as BlockInstance[]) ?? [])
      setPublished((row.published_blocks as BlockInstance[]) ?? [])
      setMetaState((row.draft_meta as PageMeta) ?? {})
      setPublishedMeta((row.published_meta as PageMeta) ?? {})
      setDraftUpdatedAt(row.draft_updated_at as string | null)
      setDraftUpdatedBy(row.draft_updated_by as string | null)
      setUpcoming((evts.data as Event[]) ?? [])
      setFeatured((feats.data as Event[]) ?? [])
      setCategories((cats.data as Category[]) ?? [])
      setFaqs((faqRes.data as any) ?? [])
      setSyncState('saved')
    })()
    return () => { cancelled = true }
  }, [slug])

  // Realtime — pick up edits from another tab (skip local saves we just made)
  useEffect(() => {
    const channel = supabase
      .channel(`block-pages-editor-${slug}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'block_pages' }, (payload) => {
        const row = payload.new as any
        if (row.slug !== slug) return
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
  }, [slug])

  const persist = useCallback(async (next: BlockInstance[]) => {
    setSyncState('saving')
    const { error } = await supabase
      .from('block_pages')
      .update({
        draft_blocks: next as unknown as Record<string, unknown>[],
        draft_meta: metaRef.current as unknown as Record<string, unknown>,
      })
      .eq('slug', slug)
    setSyncState(error ? 'error' : 'saved')
  }, [slug])

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { persist(blocksRef.current) }, AUTOSAVE_MS)
  }, [persist])

  const setMeta = useCallback((patch: Partial<PageMeta>) => {
    setMetaState((prev) => ({ ...prev, ...patch }))
    setSyncState('dirty')
    scheduleSave()
  }, [scheduleSave])

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
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setSyncState('error'); return { error: json.error ?? 'Publish failed' } }
    setPublished(blocksRef.current)
    setPublishedMeta(metaRef.current)
    setSyncState('saved')
    return { error: null }
  }, [flushNow, slug])

  const revertDraft = useCallback(async () => {
    setSyncState('saving')
    const { data, error } = await supabase.rpc('block_pages_revert_draft', { p_slug: slug })
    if (error) { setSyncState('error'); return { error: error.message } }
    setBlocks((data as BlockInstance[]) ?? [])
    // The RPC also restores draft_meta = published_meta; mirror that locally.
    setMetaState(publishedMeta)
    setSyncState('saved')
    return { error: null }
  }, [slug, publishedMeta])

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

  const loadStarterLayout = useCallback(() => {
    if (!landingType) return { count: 0 }
    const { blocks: starterBlocks, meta: starterMeta } = starterLayout(landingType)
    setBlocks(starterBlocks)
    setMetaState(starterMeta)
    setSelectedId(null)
    setSyncState('dirty')
    scheduleSave()
    return { count: starterBlocks.length }
  }, [landingType, scheduleSave])

  const hasUnpublishedChanges = useMemo(
    () =>
      JSON.stringify(blocks) !== JSON.stringify(published) ||
      JSON.stringify(meta) !== JSON.stringify(publishedMeta),
    [blocks, published, meta, publishedMeta],
  )

  const value: BlockEditorContextType = {
    blocks, publishedBlocks: published,
    selectedId, setSelectedId,
    syncState, hasUnpublishedChanges,
    draftUpdatedAt, draftUpdatedBy,
    allowImportFromSections,
    landingType,
    meta, setMeta,
    upcomingEvents, featuredEvents, categories, faqs,
    addBlock, updateBlock, deleteBlock, duplicateBlock, reorder,
    publish, revertDraft, importFromSections, loadStarterLayout,
  }

  return <BlockEditorContext.Provider value={value}>{children}</BlockEditorContext.Provider>
}

export function useBlockEditor() {
  const ctx = useContext(BlockEditorContext)
  if (!ctx) throw new Error('useBlockEditor must be used inside BlockEditorProvider')
  return ctx
}
