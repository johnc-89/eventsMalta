'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  value: string | null
  /** Logical "kind" — used to namespace the storage path, e.g. 'logo', 'hero', 'favicon'. */
  kind: string
  onChange: (url: string | null) => void
  /** Aspect ratio hint for the preview frame (e.g. '16/9', '1/1', '3/1') */
  aspect?: string
  hint?: string
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export default function ImageUpload({ value, kind, onChange, aspect = '16/9', hint }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setErr(null)
    if (file.size > MAX_BYTES) { setErr('File is over 5 MB. Compress it first.'); return }
    if (!file.type.startsWith('image/')) { setErr('Only image files are allowed.'); return }
    setBusy(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('site-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (upErr) { setErr(upErr.message); setBusy(false); return }
    const { data } = supabase.storage.from('site-assets').getPublicUrl(path)
    onChange(data.publicUrl)
    setBusy(false)
  }

  const remove = () => { onChange(null); setErr(null) }

  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      {value ? (
        <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-full block" style={{ aspectRatio: aspect, objectFit: 'cover' }} />
          <div className="flex justify-between items-center px-3 py-2 bg-white border-t border-gray-100 text-xs">
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand-teal-dark truncate max-w-[60%]">{value.split('/').pop()}</a>
            <div className="flex gap-2">
              <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="text-gray-600 hover:text-brand-dark">Replace</button>
              <button type="button" onClick={remove} disabled={busy} className="text-red-600 hover:text-red-700">Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="w-full flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-gold hover:bg-brand-gold/5 text-sm text-gray-500 hover:text-brand-dark transition-colors py-8"
          style={{ aspectRatio: aspect }}
        >
          {busy ? 'Uploading…' : '+ Upload image'}
        </button>
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      {hint && !err && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
