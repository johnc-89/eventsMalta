#!/usr/bin/env node
/**
 * Backfill: recompress existing event images already mirrored to Supabase
 * Storage that are larger than they need to be.
 *
 * Why: lib/importers/image-mirror.ts now downsizes/recompresses images at
 * mirror time (see MAX_DIMENSION/JPEG_QUALITY there), but images mirrored
 * before that change can still be multi-MB PNGs. Large source images were
 * intermittently failing Vercel's on-demand `/_next/image` optimizer under
 * the concurrent load of an events grid, showing as blank thumbnails on
 * /events (the single-image event detail page usually succeeded, which made
 * the bug look card-only).
 *
 * For each distinct events.image_url already on our bucket and over
 * --min-bytes, downloads it, runs it through the same recompression logic as
 * the importer, and if that shrinks it re-uploads. When the output extension
 * changes (e.g. an opaque PNG re-encoded to JPEG) the object gets a new path,
 * so every events row using the old URL is repointed and the old object is
 * deleted; same-extension outputs overwrite the existing path in place
 * (upsert), so no DB update is needed there.
 *
 * Run (dry-run — prints what it WOULD do, changes nothing):
 *   node scripts/backfill-image-compress.mjs
 * Apply for real:
 *   node scripts/backfill-image-compress.mjs --apply
 * Options:
 *   --apply          actually write to Storage/DB (default: dry-run)
 *   --limit=N        stop after N images (default: no limit)
 *   --min-bytes=N    only touch images at least this big (default: 400000)
 *
 * Env (process.env, falling back to .env.local for local runs):
 *   NEXT_PUBLIC_SUPABASE_URL     (required)
 *   SUPABASE_SERVICE_ROLE_KEY    (required)
 */
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] != null) continue
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = intArg('--limit', Infinity)
const MIN_BYTES = intArg('--min-bytes', 400_000)

function intArg(name, dflt) {
  const hit = args.find((a) => a.startsWith(`${name}=`))
  if (!hit) return dflt
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : dflt
}

// ---- env -------------------------------------------------------------------
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const supabase = createClient(URL, SERVICE, { auth: { persistSession: false } })

const BUCKET = 'event-images'
// Kept in sync with lib/importers/image-mirror.ts.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 82
const WEBP_QUALITY = 82

function isOurBucketUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/event-images\//.test(url)
}

function pathFromUrl(url) {
  const marker = '/object/public/event-images/'
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

async function optimizeImage(input, contentType) {
  const image = sharp(input, { failOn: 'none' }).rotate()
  const meta = await image.metadata()
  const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
  const resized = longestEdge > MAX_DIMENSION
    ? image.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    : image

  // meta.hasAlpha is a false positive for fully-opaque PNGs exported with an
  // RGBA channel by design tools — check actual pixel opacity, kept in sync
  // with lib/importers/image-mirror.ts.
  const hasVisibleAlpha = meta.hasAlpha ? (await image.stats()).channels.at(-1).min < 255 : false
  if (contentType === 'image/png' && !hasVisibleAlpha) {
    return { buf: await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' }
  }
  if (contentType === 'image/png') {
    return { buf: await resized.png({ compressionLevel: 9 }).toBuffer(), contentType: 'image/png', ext: 'png' }
  }
  if (contentType === 'image/webp') {
    return { buf: await resized.webp({ quality: WEBP_QUALITY }).toBuffer(), contentType: 'image/webp', ext: 'webp' }
  }
  return { buf: await resized.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), contentType: 'image/jpeg', ext: 'jpg' }
}

// ---- collect distinct bucket image_urls, with the event ids using each ----
async function collectImageUrls() {
  const byUrl = new Map()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select('id, image_url')
      .not('image_url', 'is', null)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      if (!row.image_url || !isOurBucketUrl(row.image_url)) continue
      if (!byUrl.has(row.image_url)) byUrl.set(row.image_url, [])
      byUrl.get(row.image_url).push(row.id)
    }
    if (data.length < PAGE) break
  }
  return byUrl
}

// ---- main ------------------------------------------------------------------
console.log(`Backfill image compression → ${URL}`)
console.log(`  mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)
console.log(`  min-bytes: ${MIN_BYTES}  limit: ${LIMIT === Infinity ? '∞' : LIMIT}`)

const byUrl = await collectImageUrls()
console.log(`\n${byUrl.size} distinct mirrored image(s) in use.\n`)

let checked = 0, skippedSmall = 0, shrunk = 0, unchanged = 0, failed = 0, bytesSaved = 0

for (const [url, eventIds] of byUrl) {
  if (checked >= LIMIT) break

  const path = pathFromUrl(url)
  if (!path) { failed++; console.log(`✗ ${url} — couldn't parse storage path`); continue }

  let head
  try {
    head = await fetch(url, { method: 'HEAD' })
  } catch (err) {
    failed++; console.log(`✗ ${path} — HEAD failed: ${err.message}`); continue
  }
  const size = Number(head.headers.get('content-length') ?? 0)
  if (size && size < MIN_BYTES) { skippedSmall++; continue }

  const contentType = (head.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (contentType === 'image/gif' || contentType === 'image/avif') { skippedSmall++; continue }

  checked++

  let res
  try {
    res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    failed++; console.log(`✗ ${path} — download failed: ${err.message}`); continue
  }
  const input = Buffer.from(await res.arrayBuffer())

  let optimized
  try {
    optimized = await optimizeImage(input, contentType)
  } catch (err) {
    failed++; console.log(`✗ ${path} — optimize failed: ${err.message}`); continue
  }

  if (optimized.buf.byteLength >= input.byteLength) {
    unchanged++
    console.log(`= ${path} — already optimal (${input.byteLength}b)`)
    continue
  }

  const oldExt = path.split('.').pop()
  const newPath = optimized.ext === oldExt ? path : `${path.slice(0, -oldExt.length)}${optimized.ext}`
  const saved = input.byteLength - optimized.buf.byteLength
  bytesSaved += saved
  shrunk++
  console.log(`↓ ${path} — ${input.byteLength}b → ${optimized.buf.byteLength}b (-${Math.round((saved / input.byteLength) * 100)}%)${newPath !== path ? ` → ${newPath}` : ''} [events: ${eventIds.join(',')}]`)

  if (!APPLY) continue

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, optimized.buf, { contentType: optimized.contentType, upsert: true })
  if (uploadErr) { failed++; console.log(`   ✗ upload failed: ${uploadErr.message}`); continue }

  if (newPath !== path) {
    const newUrl = supabase.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl
    const { error: updateErr } = await supabase.from('events').update({ image_url: newUrl }).in('id', eventIds)
    if (updateErr) { console.log(`   ✗ DB update failed: ${updateErr.message}`); continue }
    const { error: removeErr } = await supabase.storage.from(BUCKET).remove([path])
    if (removeErr) console.log(`   ⚠ old object cleanup failed: ${removeErr.message}`)
  }
}

console.log(`\n${'—'.repeat(50)}`)
console.log(`checked: ${checked}  shrunk: ${shrunk}  unchanged: ${unchanged}  skipped-small: ${skippedSmall}  failed: ${failed}`)
console.log(`bytes saved: ${bytesSaved.toLocaleString()}`)
if (APPLY) console.log('written — Storage (and DB for extension changes) updated.')
else console.log('DRY-RUN — nothing written. Re-run with --apply to persist.')
process.exit(failed > 0 ? 1 : 0)
