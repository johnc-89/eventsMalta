'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Section, inputCls } from '../_components/Field'

interface Faq { id: number; question: string; answer: string; display_order: number; enabled: boolean }

export default function FaqEditor() {
  const [items, setItems] = useState<Faq[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    const { data } = await supabase.from('faq_items').select('*').order('display_order')
    setItems((data as Faq[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('faq-editor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faq_items' }, () => reload())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const updateField = async (id: number, patch: Partial<Faq>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
    await supabase.from('faq_items').update(patch).eq('id', id)
  }

  const addItem = async () => {
    setBusy(true)
    const nextOrder = (items[items.length - 1]?.display_order ?? 0) + 10
    await supabase.from('faq_items').insert({
      question: 'New question',
      answer:   'New answer',
      display_order: nextOrder,
      enabled: true,
    })
    setBusy(false)
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this FAQ item?')) return
    setItems((prev) => prev.filter((i) => i.id !== id))
    await supabase.from('faq_items').delete().eq('id', id)
  }

  const move = async (id: number, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id)
    const swap = items[idx + dir]
    if (!swap) return
    const a = items[idx], b = swap
    setItems((prev) => {
      const next = [...prev]
      next[idx]      = { ...a, display_order: b.display_order }
      next[idx + dir] = { ...b, display_order: a.display_order }
      return [...next].sort((x, y) => x.display_order - y.display_order)
    })
    await Promise.all([
      supabase.from('faq_items').update({ display_order: b.display_order }).eq('id', a.id),
      supabase.from('faq_items').update({ display_order: a.display_order }).eq('id', b.id),
    ])
  }

  if (loading) return <div className="py-20 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-brand-gold border-t-transparent rounded-full" /></div>

  return (
    <div>
      <Section title="FAQ items" description="Shown in the FAQ section of the homepage and surfaced to search engines as JSON-LD. Disabled items are hidden but kept for later.">
        <div className="sm:col-span-2 space-y-3 mt-2">
          {items.map((it, idx) => (
            <div key={it.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 mt-1">
                  <button
                    type="button"
                    onClick={() => move(it.id, -1)}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none"
                  >▲</button>
                  <button
                    type="button"
                    onClick={() => move(it.id, 1)}
                    disabled={idx === items.length - 1}
                    className="text-gray-400 hover:text-brand-dark disabled:opacity-20 text-xs leading-none"
                  >▼</button>
                </div>
                <div className="flex-1 grid grid-cols-1 gap-2">
                  <input
                    className={inputCls + ' font-medium'}
                    value={it.question}
                    onChange={(e) => updateField(it.id, { question: e.target.value })}
                    placeholder="Question"
                  />
                  <textarea
                    className={inputCls}
                    rows={2}
                    value={it.answer}
                    onChange={(e) => updateField(it.id, { answer: e.target.value })}
                    placeholder="Answer (plain text — line breaks preserved)"
                  />
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <label className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={it.enabled}
                      onChange={(e) => updateField(it.id, { enabled: e.target.checked })}
                    />
                    visible
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            disabled={busy}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-gold hover:bg-brand-gold/5 py-3 text-sm text-gray-500 hover:text-brand-dark transition-colors"
          >+ Add FAQ item</button>
        </div>
      </Section>

      <Section title="Where this shows up" description="FAQ items render on the homepage and are surfaced to AI / search engines as structured data (FAQPage schema).">
        <p className="sm:col-span-2 text-sm text-gray-600">FAQ edits go live immediately — they are stored in their own table, separate from the site draft/publish workflow.</p>
      </Section>
    </div>
  )
}
