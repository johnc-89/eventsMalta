'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Lead } from '@/types'

export type SyncState = 'connected' | 'saving' | 'offline'

interface CrmContextType {
  leads: Lead[]
  loading: boolean
  syncState: SyncState
  reload: () => Promise<void>
  updateLead: (id: number, patch: Partial<Lead>) => Promise<{ error: string | null }>
  createLead: (input: Partial<Lead> & { name: string }) => Promise<{ error: string | null; lead?: Lead }>
  deleteLead: (id: number) => Promise<{ error: string | null }>
  bulkUpsert: (rows: Array<Partial<Lead> & { name: string }>) => Promise<{ inserted: number; updated: number; error: string | null }>
}

const CrmContext = createContext<CrmContextType | null>(null)

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<SyncState>('offline')
  const savingCountRef = useRef(0)
  const channelConnectedRef = useRef(false)

  const setIdle = useCallback(() => {
    if (savingCountRef.current === 0) {
      setSyncState(channelConnectedRef.current ? 'connected' : 'offline')
    }
  }, [])

  const beginSave = useCallback(() => {
    savingCountRef.current += 1
    setSyncState('saving')
  }, [])

  const endSave = useCallback(() => {
    savingCountRef.current = Math.max(0, savingCountRef.current - 1)
    setIdle()
  }, [setIdle])

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false })
    if (!error) setLeads(data || [])
    setLoading(false)
  }, [])

  // Initial load + realtime subscription
  useEffect(() => {
    let cancelled = false
    reload()

    const channel = supabase
      .channel('crm-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        if (cancelled) return
        setLeads((prev) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Lead
            if (prev.some((l) => l.id === row.id)) return prev
            return [row, ...prev]
          }
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as Lead
            return prev.map((l) => (l.id === row.id ? row : l))
          }
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Lead
            return prev.filter((l) => l.id !== old.id)
          }
          return prev
        })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelConnectedRef.current = true
          setIdle()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelConnectedRef.current = false
          setIdle()
        }
      })

    const onOnline  = () => { channelConnectedRef.current && setIdle() }
    const onOffline = () => { channelConnectedRef.current = false; setSyncState('offline') }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    if (!navigator.onLine) setSyncState('offline')

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [reload, setIdle])

  const updateLead = useCallback<CrmContextType['updateLead']>(async (id, patch) => {
    beginSave()
    // Optimistic
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select().single()
    if (error) {
      // Revert by reload
      reload()
      endSave()
      return { error: error.message }
    }
    setLeads((prev) => prev.map((l) => (l.id === id ? (data as Lead) : l)))
    endSave()
    return { error: null }
  }, [beginSave, endSave, reload])

  const createLead = useCallback<CrmContextType['createLead']>(async (input) => {
    beginSave()
    const { data, error } = await supabase.from('leads').insert(input).select().single()
    endSave()
    if (error) return { error: error.message }
    setLeads((prev) => [data as Lead, ...prev.filter((l) => l.id !== (data as Lead).id)])
    return { error: null, lead: data as Lead }
  }, [beginSave, endSave])

  const deleteLead = useCallback<CrmContextType['deleteLead']>(async (id) => {
    beginSave()
    setLeads((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase.from('leads').delete().eq('id', id)
    endSave()
    if (error) {
      reload()
      return { error: error.message }
    }
    return { error: null }
  }, [beginSave, endSave, reload])

  const bulkUpsert = useCallback<CrmContextType['bulkUpsert']>(async (rows) => {
    if (rows.length === 0) return { inserted: 0, updated: 0, error: null }
    beginSave()
    const { data, error } = await supabase.rpc('leads_bulk_upsert', { payload: rows as any })
    endSave()
    if (error) return { inserted: 0, updated: 0, error: error.message }
    const result = Array.isArray(data) && data[0] ? data[0] : { inserted: 0, updated: 0 }
    await reload()
    return { inserted: result.inserted ?? 0, updated: result.updated ?? 0, error: null }
  }, [beginSave, endSave, reload])

  const value = useMemo<CrmContextType>(() => ({
    leads, loading, syncState, reload, updateLead, createLead, deleteLead, bulkUpsert,
  }), [leads, loading, syncState, reload, updateLead, createLead, deleteLead, bulkUpsert])

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>
}

export function useCrm() {
  const ctx = useContext(CrmContext)
  if (!ctx) throw new Error('useCrm must be used inside CrmProvider')
  return ctx
}
