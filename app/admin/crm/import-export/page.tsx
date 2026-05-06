'use client'

import { useRef, useState } from 'react'
import { useCrm } from '../CrmContext'
import { downloadCsv, leadsToCsv, parseLeadsBlob } from '@/lib/crm-csv'

type ImportResult = { inserted: number; updated: number; error: string | null } | null

export default function ImportExportPage() {
  const { leads, bulkUpsert } = useCrm()
  const [pasted, setPasted]     = useState('')
  const [pasteResult, setPaste] = useState<ImportResult>(null)
  const [pasting, setPasting]   = useState(false)
  const [uploading, setUpload]  = useState(false)
  const [uploadResult, setUpRes]= useState<ImportResult>(null)
  const [seeding, setSeeding]   = useState(false)
  const [seedResult, setSeed]   = useState<ImportResult>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '').slice(0, 32)

  const handleExport = () => {
    const csv = leadsToCsv(leads)
    downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  const handlePaste = async () => {
    setPaste(null)
    if (!pasted.trim()) return
    setPasting(true)
    const rows = parseLeadsBlob(pasted)
    const res = await bulkUpsert(rows as any)
    setPaste(res)
    if (!res.error) setPasted('')
    setPasting(false)
  }

  const handleUpload = async (file: File) => {
    setUpRes(null)
    setUpload(true)
    const text = await file.text()
    const rows = parseLeadsBlob(text)
    const res = await bulkUpsert(rows as any)
    setUpRes(res)
    if (fileRef.current) fileRef.current.value = ''
    setUpload(false)
  }

  const handleSeed = async () => {
    setSeed(null)
    setSeeding(true)
    try {
      const res = await fetch('/seed/leads.csv', { cache: 'no-store' })
      if (!res.ok) throw new Error('Seed file not found')
      const text = await res.text()
      const rows = parseLeadsBlob(text)
      const result = await bulkUpsert(rows as any)
      setSeed(result)
    } catch (err: any) {
      setSeed({ inserted: 0, updated: 0, error: err.message ?? 'Seed failed' })
    } finally {
      setSeeding(false)
    }
  }

  const ResultPill = ({ r }: { r: ImportResult }) => {
    if (!r) return null
    if (r.error) return <p className="text-sm text-red-600 mt-2">Error: {r.error}</p>
    return <p className="text-sm text-green-700 mt-2">{r.inserted} new · {r.updated} updated.</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Export */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-heading font-semibold text-brand-dark">Export to CSV</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">Download all leads as a CSV — open in Excel or Google Sheets.</p>
        <button
          onClick={handleExport}
          disabled={leads.length === 0}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          ↓ Download CSV
        </button>
      </div>

      {/* Upload CSV */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-heading font-semibold text-brand-dark">Import from CSV file</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Upload a CSV with columns: Name, Category, Quality, Platform, Contact, Status, Last Interaction, Notes, Link. Merges by name.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {uploading ? 'Importing…' : '↑ Upload CSV'}
        </button>
        <ResultPill r={uploadResult} />
      </div>

      {/* Paste */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
        <h3 className="font-heading font-semibold text-brand-dark">Paste from spreadsheet or AI</h3>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Copy rows directly from Google Sheets / Excel (Ctrl+C), or paste a list from AI. Columns:
          {' '}<code className="text-xs text-gray-400">Name · Category · Quality · Platform · Contact · Status · Date · Notes · Link</code>.
          {' '}Header row auto-detected.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={6}
          placeholder="Paste tab-separated rows from a spreadsheet, or comma-separated rows from AI…"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 outline-none text-sm font-mono"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handlePaste}
            disabled={pasting || !pasted.trim()}
            className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/40 text-brand-dark px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {pasting ? 'Importing…' : 'Import pasted data'}
          </button>
          <ResultPill r={pasteResult} />
        </div>
      </div>

      {/* Seed defaults */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-heading font-semibold text-brand-dark">Seed default leads</h3>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Load the original 185 Malta outreach leads into the database. Only adds leads not already present (matched by name).
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {seeding ? 'Seeding…' : 'Seed default leads'}
        </button>
        <ResultPill r={seedResult} />
      </div>

      {/* DB info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-heading font-semibold text-brand-dark">Database info</h3>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Connected to Supabase. All changes sync in real time across everyone who has this page open.
        </p>
        <div className="text-xs font-mono text-gray-500">
          {leads.length} leads · {supabaseHost || 'no project URL'}…
        </div>
      </div>
    </div>
  )
}
