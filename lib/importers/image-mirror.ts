// Mirror an externally-hosted event image to our own Supabase Storage bucket.
//
// Why: every adapter pulls images from a different third-party host (POPP,
// Heritage Malta, Visit Malta, Wix, …). Each host required adding a matching
// entry to next.config.js `remotePatterns` so Next.js's image optimiser would
// accept it. We've shipped 6+ bugs from those entries being wrong. Mirroring
// at import time makes every image URL `*.supabase.co/...`, so the allowlist
// stays a single line forever.
//
// Path scheme: `imports/<sourceSlug>/<sha256(sourceUrl, 32)>.<ext>`.
// - Deterministic from the source URL → same URL ever mirrored once.
// - Easy to browse by source in the Supabase Storage UI.
// - Safe across renames: we never re-derive from the event slug.
//
// Failure modes — all return the original `sourceUrl` and log:
//   - SUPABASE_SERVICE_ROLE_KEY missing
//   - Source URL doesn't return 2xx / non-image content-type
//   - Image too large (> 10MB) or download times out (> 15s)
//   - Storage upload fails
// The importer continues with the original URL, which still works as long as
// the host stays in `next.config.js`. If the source goes down or moves later,
// the next successful mirror replaces it.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'event-images'
const PREFIX = 'imports'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB hard cap
const DOWNLOAD_TIMEOUT_MS = 15_000

// Content-Type → file extension. Anything else is rejected.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export interface MirrorOpts {
  /** Source URL (whatever the adapter scraped). */
  sourceUrl: string
  /** A short stable label for the source — used in the storage path. */
  sourceSlug: string
  supabase: SupabaseClient
  log: (line: string) => void
}

/** Returns either the mirrored URL or the original on any failure. */
export async function mirrorImageToStorage(opts: MirrorOpts): Promise<string> {
  const { sourceUrl, sourceSlug, supabase, log } = opts

  if (!sourceUrl) return sourceUrl

  // If the URL is already in our bucket, nothing to do — important for the
  // re-import path: an event whose source content_hash hasn't changed gets
  // touched but not re-mirrored.
  if (isOurBucketUrl(sourceUrl)) return sourceUrl

  try {
    const urlHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32)

    // First, derive what the path *would* be if we knew the extension. We
    // can't know the extension without hitting the URL, so we HEAD first
    // and check Content-Type. Then construct the final path.
    const head = await fetchWithTimeout(sourceUrl, 'HEAD', log)
    if (!head.ok) {
      log(`  ⚠ image-mirror: HEAD ${sourceUrl} → ${head.status} — keeping original URL`)
      return sourceUrl
    }
    const contentType = (head.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = ALLOWED_TYPES[contentType]
    if (!ext) {
      log(`  ⚠ image-mirror: ${sourceUrl} content-type "${contentType}" not in allowlist — keeping original`)
      return sourceUrl
    }
    const sizeHeader = head.headers.get('content-length')
    if (sizeHeader && Number(sizeHeader) > MAX_BYTES) {
      log(`  ⚠ image-mirror: ${sourceUrl} is ${sizeHeader} bytes (> ${MAX_BYTES}) — keeping original`)
      return sourceUrl
    }

    const path = `${PREFIX}/${sourceSlug}/${urlHash}.${ext}`

    // Already mirrored? Skip the download entirely — `upload` would still
    // be cheap (upsert), but the download isn't. Check with a HEAD via the
    // public URL since storage.from(...).list() doesn't return existence
    // cheaply.
    const publicUrl = getPublicUrl(supabase, path)
    const exists = await fetchWithTimeout(publicUrl, 'HEAD', log).catch(() => null)
    if (exists?.ok) return publicUrl

    // Download.
    const get = await fetchWithTimeout(sourceUrl, 'GET', log)
    if (!get.ok) {
      log(`  ⚠ image-mirror: GET ${sourceUrl} → ${get.status} — keeping original URL`)
      return sourceUrl
    }
    const buf = await readBoundedBody(get, MAX_BYTES, log, sourceUrl)
    if (!buf) return sourceUrl

    // Upload.
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: true })
    if (uploadErr) {
      log(`  ⚠ image-mirror: upload ${path} failed (${uploadErr.message}) — keeping original`)
      return sourceUrl
    }

    log(`  📦 image-mirror: ${sourceUrl.slice(0, 60)}… → ${path}`)
    return publicUrl
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ image-mirror: unexpected error (${detail}) — keeping original URL`)
    return sourceUrl
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

export function isOurBucketUrl(url: string): boolean {
  // Public storage URLs look like:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/...
  // Match conservatively.
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/event-images\//.test(url)
}

function getPublicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function fetchWithTimeout(url: string, method: 'GET' | 'HEAD', log: (line: string) => void): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method,
      signal: ctrl.signal,
      // Many CDNs (Cloudflare, Wix) reject default UAs. Use a plausible UA.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EventsMaltaImporter/1.0)' },
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log(`  ⚠ image-mirror: ${method} ${url} timed out after ${DOWNLOAD_TIMEOUT_MS}ms`)
      return new Response(null, { status: 408 })
    }
    throw err
  } finally {
    clearTimeout(t)
  }
}

/** Read a response body but abort if it exceeds `max` bytes. */
async function readBoundedBody(
  res: Response,
  max: number,
  log: (line: string) => void,
  sourceUrl: string,
): Promise<Uint8Array | null> {
  const reader = res.body?.getReader()
  if (!reader) {
    log(`  ⚠ image-mirror: ${sourceUrl} body unreadable`)
    return null
  }
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > max) {
        log(`  ⚠ image-mirror: ${sourceUrl} exceeded ${max} bytes during download — keeping original`)
        try { await reader.cancel() } catch { /* ignore */ }
        return null
      }
      chunks.push(value)
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
