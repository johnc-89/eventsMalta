// Mirror an externally-hosted event image to our own Supabase Storage bucket.
//
// Why: every adapter pulls images from a different third-party host (POPP,
// Heritage Malta, Visit Malta, Wix, …). Each host required adding a matching
// entry to next.config.js `remotePatterns` so Next.js's image optimiser would
// accept it. We've shipped 6+ bugs from those entries being wrong. Mirroring
// at import time makes every image URL `*.supabase.co/...`, so the allowlist
// stays a single line forever.
//
// Path scheme: `imports/<sourceSlug>/<imageSlug>.<ext>`.
// - `imageSlug` is the event's unique DB slug (e.g. `malta-jazz-festival-2026`)
//   so the stored filename is human-readable and SEO-friendly (Google Images
//   and the Storage UI show real words, not an opaque hash). Event slugs are
//   globally unique (see `uniqueSlug` in pipeline.ts), so per-event paths never
//   collide, and a re-import of the same event re-uses the same path (upsert).
// - Falls back to `sha256(sourceUrl, 32)` when no slug is supplied, keeping the
//   old deterministic-per-URL behaviour for any caller without an event slug.
// - Easy to browse by source in the Supabase Storage UI.
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
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { USER_AGENT } from './http'
import { assertPublicHttpUrl } from './url-safety'

// Most CDNs (Cloudflare, Wix) reject non-browser UAs, so we try a plausible
// browser UA first. But some hosts (g7events, unomalta) do the opposite —
// they 403 browser-looking UAs and only serve our plain importer UA. So on a
// bot-block status we retry with the importer UA.
const BROWSER_UA = 'Mozilla/5.0 (compatible; EventsMaltaImporter/1.0)'
const BLOCK_STATUSES = new Set([401, 403, 429])

const BUCKET = 'event-images'
const PREFIX = 'imports'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB hard cap — Wix/CMS originals routinely exceed 10 MB
const DOWNLOAD_TIMEOUT_MS = 15_000

// Some sources (gianpula, unomalta, teatrumanoel, heritagemalta...) hand us
// full-resolution poster PNGs several MB in size. Nothing on the site renders
// an event image wider than ~1080px, but storing the original meant every
// card/detail-page view hit Vercel's on-demand `/_next/image` optimizer with
// a multi-MB source. Under the concurrent load of a events grid (a dozen+
// images optimized at once) some of those requests failed outright — the
// browser then just shows blank space (no onError fallback on the <Image>),
// while the single-image event detail page had much better odds and usually
// succeeded, making the bug look card-only. Downscaling + recompressing at
// mirror time removes the multi-MB source from the equation entirely.
const MAX_DIMENSION = 1600 // px, longest edge — headroom over the largest on-site render size
const JPEG_QUALITY = 82
const WEBP_QUALITY = 82

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
  /**
   * The event's unique DB slug. Used as the SEO-friendly storage filename.
   * Omit (or pass empty) to fall back to a hash of the source URL.
   */
  imageSlug?: string
  supabase: SupabaseClient
  log: (line: string) => void
}

/** Returns either the mirrored URL or the original on any failure. */
export async function mirrorImageToStorage(opts: MirrorOpts): Promise<string> {
  const { sourceUrl, sourceSlug, imageSlug, supabase, log } = opts

  if (!sourceUrl) return sourceUrl

  // If the URL is already in our bucket, nothing to do — important for the
  // re-import path: an event whose source content_hash hasn't changed gets
  // touched but not re-mirrored.
  if (isOurBucketUrl(sourceUrl)) return sourceUrl

  // SSRF guard: `sourceUrl` may originate from a user-submitted event, so
  // refuse to fetch private/loopback/link-local hosts or non-http(s) schemes.
  try {
    await assertPublicHttpUrl(sourceUrl)
  } catch (err) {
    log(`  ⚠ image-mirror: refusing to fetch ${sourceUrl} — ${err instanceof Error ? err.message : String(err)}`)
    return sourceUrl
  }

  try {
    const urlHash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32)

    // Single GET — formerly we did HEAD source → HEAD public-URL → GET
    // source (three roundtrips), but at ~15s timeout each that put a typical
    // 28-event import near the 300s Vercel ceiling. We now do one GET, read
    // the content-type from the response, and always upsert. Upsert is
    // idempotent and cheap; re-uploading the same bytes on a re-import is
    // ~1 storage roundtrip per event vs the 2 HEADs we were paying before.
    let get = await fetchWithTimeout(sourceUrl, 'GET', log, BROWSER_UA)
    if (BLOCK_STATUSES.has(get.status)) {
      // Browser UA blocked — retry with our plain importer UA.
      try { await get.body?.cancel() } catch { /* ignore */ }
      log(`  ↻ image-mirror: GET ${sourceUrl} → ${get.status} with browser UA, retrying with importer UA`)
      get = await fetchWithTimeout(sourceUrl, 'GET', log, USER_AGENT)
    }
    if (!get.ok) {
      log(`  ⚠ image-mirror: GET ${sourceUrl} → ${get.status} — keeping original URL`)
      return sourceUrl
    }
    const contentType = (get.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = ALLOWED_TYPES[contentType]
    if (!ext) {
      log(`  ⚠ image-mirror: ${sourceUrl} content-type "${contentType}" not in allowlist — keeping original`)
      try { await get.body?.cancel() } catch { /* ignore */ }
      return sourceUrl
    }
    const sizeHeader = get.headers.get('content-length')
    if (sizeHeader && Number(sizeHeader) > MAX_BYTES) {
      log(`  ⚠ image-mirror: ${sourceUrl} is ${sizeHeader} bytes (> ${MAX_BYTES}) — keeping original`)
      try { await get.body?.cancel() } catch { /* ignore */ }
      return sourceUrl
    }

    const buf = await readBoundedBody(get, MAX_BYTES, log, sourceUrl)
    if (!buf) return sourceUrl

    const optimized = await optimizeImage(buf, contentType, ext, log, sourceUrl)

    const fileName = slugifyFileName(imageSlug) || urlHash
    const path = `${PREFIX}/${sourceSlug}/${fileName}.${optimized.ext}`
    const publicUrl = getPublicUrl(supabase, path)

    // Upload (upsert: same path → same bytes, idempotent).
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized.buf, { contentType: optimized.contentType, upsert: true })
    if (uploadErr) {
      log(`  ⚠ image-mirror: upload ${path} failed (${uploadErr.message}) — keeping original`)
      return sourceUrl
    }

    log(`  📦 image-mirror: ${sourceUrl.slice(0, 60)}… → ${path} (${buf.byteLength}b → ${optimized.buf.byteLength}b)`)
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

export interface OptimizedImage {
  buf: Buffer
  contentType: string
  ext: string
}

// Downscale + recompress a downloaded image so the stored copy is never
// bigger than it needs to be. GIF is left untouched (resizing would drop
// animation and sharp only touches the first frame). Any failure — corrupt
// bytes, unsupported subformat — falls back to the original bytes so a mirror
// never fails outright because of this step.
export async function optimizeImage(
  input: Uint8Array,
  contentType: string,
  originalExt: string,
  log: (line: string) => void,
  sourceUrl: string,
): Promise<OptimizedImage> {
  const fallback: OptimizedImage = { buf: Buffer.from(input), contentType, ext: originalExt }
  if (contentType === 'image/gif') return fallback

  try {
    const image = sharp(input, { failOn: 'none' }).rotate()
    const meta = await image.metadata()
    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
    const resized = longestEdge > MAX_DIMENSION
      ? image.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      : image

    // A PNG with no transparency is almost always a photo/poster screenshot —
    // re-encoding it as JPEG cuts file size far more than PNG recompression
    // can. A PNG that actually uses alpha (logos, graphics) stays PNG.
    if (contentType === 'image/png' && !meta.hasAlpha) {
      const buf = await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
      return { buf, contentType: 'image/jpeg', ext: 'jpg' }
    }
    if (contentType === 'image/png') {
      const buf = await resized.png({ compressionLevel: 9 }).toBuffer()
      return { buf, contentType: 'image/png', ext: 'png' }
    }
    if (contentType === 'image/webp') {
      const buf = await resized.webp({ quality: WEBP_QUALITY }).toBuffer()
      return { buf, contentType: 'image/webp', ext: 'webp' }
    }
    // jpeg/jpg/avif — normalise to JPEG output for jpeg input; leave avif as-is
    // (already efficient, and sharp's avif encoder is comparatively slow).
    if (contentType === 'image/avif') return fallback
    const buf = await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
    return { buf, contentType: 'image/jpeg', ext: 'jpg' }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ image-mirror: optimize failed for ${sourceUrl.slice(0, 60)}… (${detail}) — using original bytes`)
    return fallback
  }
}

// Normalise an event slug into a safe storage filename. Event slugs are
// already lower-kebab-case, but this defends against anything unexpected being
// passed (stray casing, diacritics, punctuation) so the storage path stays a
// clean `[a-z0-9-]+`. Returns '' when nothing usable survives (→ hash fallback).
function slugifyFileName(s: string | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function isOurBucketUrl(url: string): boolean {
  // Public storage URLs look like:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/...
  // Match conservatively.
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/event-images\//.test(url)
}

function getPublicUrl(supabase: SupabaseClient, path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function fetchWithTimeout(url: string, method: 'GET' | 'HEAD', log: (line: string) => void, userAgent: string): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { 'User-Agent': userAgent },
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
