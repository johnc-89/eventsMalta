'use client'

import { useEffect, useMemo, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { BlockEditorProvider, useBlockEditor } from '../BlockEditorContext'
import BlockListItem from './BlockListItem'
import Canvas from './Canvas'
import ConfigPanel from './ConfigPanel'
import AddBlockMenu from './AddBlockMenu'
import type { BlockType } from '@/lib/blocks/types'
import type { RenderContext } from '@/lib/blocks/Renderer'
import { samplePlaceholders, type LandingType } from '@/lib/blocks/placeholders'
import { useSiteEditor } from '../../SiteEditorContext'

function BlockBuilderInner({ headerSlot }: { headerSlot?: React.ReactNode }) {
  // We deliberately render this page OUTSIDE the parent SiteEditorProvider's
  // topbar (the parent layout still wraps us), so re-use Publish from the
  // block context only. The site-settings topbar's Publish covers other tabs.
  const {
    blocks, selectedId, setSelectedId,
    syncState, hasUnpublishedChanges,
    draftUpdatedAt, draftUpdatedBy,
    allowImportFromSections, landingType,
    upcomingEvents, featuredEvents, categories, faqs,
    addBlock, deleteBlock, duplicateBlock, reorder,
    publish, revertDraft, importFromSections,
  } = useBlockEditor()

  // Hide the parent SiteEditorProvider's footer-style site-settings "dirty" banner
  // because we've got our own Publish flow for blocks.
  const siteCtx = useSiteEditor()
  void siteCtx

  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [railOpen, setRailOpen] = useState(true)

  // Close the edit drawer with Esc.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, setSelectedId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const fromIdx = blocks.findIndex((b) => b.id === active.id)
    const toIdx   = blocks.findIndex((b) => b.id === over.id)
    if (fromIdx === -1 || toIdx === -1) return
    reorder(fromIdx, toIdx)
  }

  const onPublish = async () => {
    setBusy(true); setMsg(null)
    const { error } = await publish()
    setBusy(false)
    setMsg(error ? `Error: ${error}` : 'Published ✓')
    setTimeout(() => setMsg(null), 4000)
  }

  const onRevert = async () => {
    if (!confirm('Discard unpublished changes? This restores the draft to the published version.')) return
    await revertDraft()
  }

  const onImport = async () => {
    if (blocks.length > 0 && !confirm('Replace your current draft with a starter block list converted from your fixed-section settings? Your current draft will be overwritten.')) return
    const { count } = await importFromSections()
    setMsg(`Imported ${count} block${count === 1 ? '' : 's'} from your sections.`)
    setTimeout(() => setMsg(null), 4000)
  }

  const ctx = useMemo<RenderContext>(() => ({
    upcomingEvents, featuredEvents, categories, faqs, afterISO: new Date().toISOString(),
    // Landing editors: feed the canvas sample placeholder values + a sample
    // scoped list so {location}/{count}/… and the landing_events grid preview.
    ...(landingType
      ? { placeholders: samplePlaceholders(landingType), landingEvents: upcomingEvents.slice(0, 6) }
      : {}),
  }), [upcomingEvents, featuredEvents, categories, faqs, landingType])

  const stateLabel = {
    loading: { dot: 'bg-gray-400',  text: 'loading…' },
    saved:   { dot: 'bg-green-500', text: 'all changes saved' },
    saving:  { dot: 'bg-amber-400 animate-pulse', text: 'saving…' },
    dirty:   { dot: 'bg-amber-400', text: 'unsaved changes' },
    error:   { dot: 'bg-red-500',   text: 'save failed' },
  }[syncState]

  return (
    <div>
      {/* Block-builder action bar — local, separate from the site-settings topbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stateLabel.dot}`} />
          <span className="text-xs text-gray-500">{stateLabel.text}</span>
        </div>
        {hasUnpublishedChanges && draftUpdatedAt && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-0.5">
            Unpublished draft · {new Date(draftUpdatedAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
            {draftUpdatedBy && ` · ${draftUpdatedBy}`}
          </span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <div className="flex items-center gap-1 mr-2 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setDevice('desktop')} className={`px-2 py-1 rounded text-xs ${device === 'desktop' ? 'bg-white shadow' : 'text-gray-500'}`}>🖥️ Desktop</button>
            <button onClick={() => setDevice('mobile')}  className={`px-2 py-1 rounded text-xs ${device === 'mobile'  ? 'bg-white shadow' : 'text-gray-500'}`}>📱 Mobile</button>
          </div>
          {msg && <span className="text-xs text-gray-500 mr-2">{msg}</span>}
          {allowImportFromSections && (
            <button
              onClick={onImport}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              title="Convert your current fixed-section homepage into starter blocks"
            >Import from sections</button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
          >+ Add block</button>
          {hasUnpublishedChanges && (
            <button
              onClick={onRevert}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >Discard</button>
          )}
          <button
            onClick={onPublish}
            disabled={busy || !hasUnpublishedChanges}
            className="theme-accent-bg px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40"
          >{busy ? 'Publishing…' : hasUnpublishedChanges ? 'Publish' : 'Published'}</button>
        </div>
      </div>

      {/* Landing-page controls (SEO meta, placeholder help, instance picker) */}
      {headerSlot}

      {/* 2-pane layout: collapsible block rail + full-width canvas. The block
          config opens as a slide-over drawer (below), not a fixed 3rd column. */}
      <div className="flex gap-3" style={{ minHeight: '70vh' }}>
        {/* Block rail — slim, collapsible */}
        {railOpen ? (
          <div className="w-[190px] flex-shrink-0 bg-white rounded-xl border border-gray-200 p-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Blocks ({blocks.length})</h3>
              <button
                onClick={() => setRailOpen(false)}
                className="text-gray-400 hover:text-brand-dark text-sm leading-none px-1"
                title="Collapse block list"
                aria-label="Collapse block list"
              >«</button>
            </div>
            {blocks.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-1 mt-2">No blocks yet. Use "+ Add block" above.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {blocks.map((b) => (
                      <BlockListItem
                        key={b.id}
                        block={b}
                        selected={selectedId === b.id}
                        onSelect={() => setSelectedId(b.id)}
                        onDuplicate={() => duplicateBlock(b.id)}
                        onDelete={() => { if (confirm('Delete this block?')) deleteBlock(b.id) }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <button
              onClick={() => setAdding(true)}
              className="w-full mt-2 px-2 py-2 rounded-lg border-2 border-dashed border-gray-200 hover:border-brand-gold hover:bg-brand-gold/5 text-xs text-gray-500 hover:text-brand-dark"
            >+ Add block</button>
          </div>
        ) : (
          <button
            onClick={() => setRailOpen(true)}
            className="flex-shrink-0 w-9 bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-start pt-3 gap-2 text-gray-500 hover:text-brand-dark hover:border-brand-gold"
            title="Show block list"
            aria-label="Show block list"
          >
            <span className="text-sm leading-none">»</span>
            <span className="text-[10px] uppercase tracking-wider [writing-mode:vertical-rl]">Blocks ({blocks.length})</span>
          </button>
        )}

        {/* Canvas — takes the full remaining width */}
        <div className="flex-1 min-w-0">
          <Canvas
            blocks={blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            context={ctx}
            onAddAt={(t, idx) => addBlock(t, idx)}
            device={device}
          />
        </div>
      </div>

      {/* Slide-over edit drawer — appears only when a block is selected */}
      {selectedId && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedId(null)}
            aria-hidden
          />
          <div
            className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col"
            role="dialog"
            aria-label="Edit block"
          >
            <ConfigPanel />
          </div>
        </>
      )}

      <AddBlockMenu
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(t: BlockType) => addBlock(t)}
      />
    </div>
  )
}

// Reusable builder — used by the Homepage editor (app/admin/site/blocks), the
// Events Page editor (app/admin/site/pages/events) and the Landing page editors
// (app/admin/site/pages/landing/[type]), which target different block_pages rows
// via `slug`. `landingType` enables placeholder preview + starter layout;
// `headerSlot` injects landing-only controls inside the editor provider.
export default function BlockBuilder({
  slug = 'home',
  allowImportFromSections = true,
  landingType = null,
  headerSlot,
}: {
  slug?: string
  allowImportFromSections?: boolean
  landingType?: LandingType | null
  headerSlot?: React.ReactNode
}) {
  return (
    <BlockEditorProvider slug={slug} allowImportFromSections={allowImportFromSections} landingType={landingType}>
      <BlockBuilderInner headerSlot={headerSlot} />
    </BlockEditorProvider>
  )
}
