#!/usr/bin/env node
/**
 * Live-site smoke test: crawl eventsmalta.org and report broken images and
 * broken internal links.
 *
 * Born from the 2026-07-14 incident where Vercel's image-optimization quota
 * ran out and every `/_next/image` request on the site returned
 * 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED — blank images site-wide with
 * no error anywhere in our own code. This script exists to catch that class
 * of failure (and ordinary broken images/links) within a day instead of
 * waiting for a visitor to notice.
 *
 * What it does:
 *   1. Fetches a fixed set of key pages + a sample of event/landing pages
 *      from sitemap.xml.
 *   2. Extracts every <img src> and every same-origin <a href>.
 *   3. Checks each unique image URL (expects HTTP 200 + image/* content-type;
 *      a 402 is called out explicitly as the Vercel quota failure) and each
 *      unique internal link (expects a non-4xx/5xx final status).
 *   4. Prints a report and exits non-zero when anything is broken.
 *
 * External links are deliberately NOT checked — third-party ticket sites
 * routinely bot-block server-side fetches and would make the report cry wolf.
 *
 * Usage:
 *   node scripts/smoke-site.mjs                  # defaults to https://eventsmalta.org
 *   node scripts/smoke-site.mjs --base=https://preview-url.vercel.app
 * Options:
 *   --base=URL        site to crawl (default https://eventsmalta.org)
 *   --max-pages=N     cap on sitemap-sampled pages (default 40)
 *   --timeout=MS      per-request timeout (default 15000)
 *   --verbose         also list every URL checked, not just failures
 *
 * Exit codes: 0 = all good, 1 = broken images/links found, 2 = crawl itself
 * failed (site unreachable / sitemap missing).
 */

const args = process.argv.slice(2)
const BASE = strArg('--base', 'https://eventsmalta.org').replace(/\/+$/, '')
const MAX_PAGES = intArg('--max-pages', 40)
const TIMEOUT_MS = intArg('--timeout', 15_000)
const VERBOSE = args.includes('--verbose')
const UA = 'EventsMaltaSmokeTest/1.0 (+https://eventsmalta.org)'

function strArg(name, dflt) {
  const hit = args.find((a) => a.startsWith(`${name}=`))
  return hit ? hit.split('=').slice(1).join('=') : dflt
}
function intArg(name, dflt) {
  const n = Number(strArg(name, ''))
  return Number.isFinite(n) && n > 0 ? n : dflt
}

const baseHost = new URL(BASE).host

// Pages we always check, independent of the sitemap.
const KEY_PAGES = [
  '/',
  '/events',
  '/events/today',
  '/events/this-weekend',
  '/events/this-month',
  '/events/locations',
  '/events/tags',
  '/venues',
  '/contact',
]

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, method = 'GET') {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { method, signal: ctrl.signal, headers: { 'User-Agent': UA }, redirect: 'follow' })
  } finally {
    clearTimeout(t)
  }
}

/** Status + content-type without downloading the body. */
async function probe(url) {
  try {
    const res = await fetchWithTimeout(url, 'HEAD')
    // Some servers reject HEAD — fall through to GET below.
    if (res.status !== 405 && res.status !== 501) {
      return { status: res.status, contentType: (res.headers.get('content-type') ?? '').split(';')[0].trim() }
    }
  } catch { /* retry as GET */ }
  try {
    const res = await fetchWithTimeout(url, 'GET')
    const out = { status: res.status, contentType: (res.headers.get('content-type') ?? '').split(';')[0].trim() }
    try { await res.body?.cancel() } catch { /* ignore */ }
    return out
  } catch (err) {
    return { status: 0, contentType: '', error: err.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : err.message }
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }))
  return out
}

// ---------------------------------------------------------------------------
// crawl
// ---------------------------------------------------------------------------

function absolutize(raw, pageUrl) {
  try {
    const u = new URL(raw, pageUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

function extract(html, pageUrl) {
  const images = new Set()
  const links = new Set()
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const u = absolutize(m[1].replace(/&amp;/g, '&'), pageUrl)
    if (u) images.add(u)
  }
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const u = absolutize(m[1].replace(/&amp;/g, '&'), pageUrl)
    if (!u) continue
    const parsed = new URL(u)
    // Same-origin pages only. /api/* is excluded on purpose: those are
    // side-effecting endpoints (e.g. /api/referral/track fires a tracking
    // write and rate-limits rapid hits with 429s) — probing them would both
    // pollute analytics and cry wolf in the report.
    if (parsed.host === baseHost && !parsed.pathname.startsWith('/api/')) links.add(u.split('?_rsc=')[0])
  }
  return { images, links }
}

async function sitemapSample() {
  try {
    const res = await fetchWithTimeout(`${BASE}/sitemap.xml`)
    if (!res.ok) return { urls: [], warning: `sitemap.xml → HTTP ${res.status}` }
    const xml = await res.text()
    const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
    // Prefer event detail pages (the image-heavy ones), newest last in the
    // sitemap, then everything else. Dedup against KEY_PAGES.
    const key = new Set(KEY_PAGES.map((p) => `${BASE}${p === '/' ? '' : p}`).concat(`${BASE}/`))
    const events = all.filter((u) => u.includes('/events/') && !key.has(u))
    const rest = all.filter((u) => !u.includes('/events/') && !key.has(u))
    const take = (arr, n) => arr.slice(-n)
    return { urls: [...take(events, Math.ceil(MAX_PAGES * 0.75)), ...take(rest, Math.floor(MAX_PAGES * 0.25))] }
  } catch (err) {
    return { urls: [], warning: `sitemap.xml unreachable: ${err.message}` }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

console.log(`Site smoke test → ${BASE}`)
console.log(`  pages: ${KEY_PAGES.length} key + up to ${MAX_PAGES} from sitemap  timeout: ${TIMEOUT_MS}ms\n`)

const warnings = []
const { urls: sampled, warning } = await sitemapSample()
if (warning) warnings.push(warning)

const pageUrls = [...new Set([...KEY_PAGES.map((p) => `${BASE}${p === '/' ? '' : p}` || BASE), ...sampled])]

const allImages = new Set()
const allLinks = new Set()
const brokenPages = []

const pageResults = await mapPool(pageUrls, 6, async (url) => {
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) {
      try { await res.body?.cancel() } catch { /* ignore */ }
      return { url, status: res.status }
    }
    const html = await res.text()
    const { images, links } = extract(html, url)
    return { url, status: res.status, images, links }
  } catch (err) {
    return { url, status: 0, error: err.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : err.message }
  }
})

for (const r of pageResults) {
  if (r.status !== 200) brokenPages.push(r)
  for (const u of r.images ?? []) allImages.add(u)
  for (const u of r.links ?? []) allLinks.add(u)
}

// Don't re-check pages we already fetched.
const fetchedPages = new Set(pageUrls)
const linksToCheck = [...allLinks].filter((u) => !fetchedPages.has(u))

console.log(`Crawled ${pageUrls.length} page(s) → ${allImages.size} unique image(s), ${linksToCheck.length} additional internal link(s) to verify.\n`)

const imageResults = await mapPool([...allImages], 8, async (url) => ({ url, ...(await probe(url)) }))
const linkResults = await mapPool(linksToCheck, 8, async (url) => ({ url, ...(await probe(url)) }))

const brokenImages = imageResults.filter((r) => r.status !== 200 || (r.contentType && !r.contentType.startsWith('image/')))
const brokenLinks = linkResults.filter((r) => r.status === 0 || r.status >= 400)
const quotaHit = brokenImages.filter((r) => r.status === 402)

// For failed /_next/image requests, also probe the underlying source URL so
// the report separates "optimizer is unhappy" from "the source object is
// gone" (e.g. a stale ISR page still referencing a storage path that was
// deleted/renamed — self-heals on the next revalidate; a missing source on a
// FRESH page means real data loss).
await mapPool(brokenImages, 8, async (r) => {
  try {
    const inner = new URL(r.url).searchParams.get('url')
    if (inner) r.upstream = { url: inner, ...(await probe(inner)) }
  } catch { /* not a /_next/image URL */ }
})

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

if (VERBOSE) {
  for (const r of imageResults) console.log(`  [img ${r.status}] ${r.url}`)
  for (const r of linkResults) console.log(`  [lnk ${r.status}] ${r.url}`)
  console.log('')
}

let failed = false

if (quotaHit.length > 0) {
  failed = true
  console.log(`🚨 VERCEL IMAGE QUOTA EXHAUSTED — ${quotaHit.length}/${imageResults.length} image request(s) returned HTTP 402`)
  console.log(`   (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED). Images are broken SITE-WIDE until the`)
  console.log(`   Vercel plan is upgraded or the usage window resets. Check the Vercel dashboard → Usage.\n`)
}

const otherBrokenImages = brokenImages.filter((r) => r.status !== 402)
if (otherBrokenImages.length > 0) {
  failed = true
  console.log(`✗ ${otherBrokenImages.length} broken image(s):`)
  for (const r of otherBrokenImages) {
    console.log(`    [${r.status || r.error}] ${r.url}`)
    if (r.upstream) console.log(`      └ source: [${r.upstream.status || r.upstream.error}] ${r.upstream.url}`)
  }
  console.log('')
}

if (brokenLinks.length > 0) {
  failed = true
  console.log(`✗ ${brokenLinks.length} broken internal link(s):`)
  for (const r of brokenLinks) console.log(`    [${r.status || r.error}] ${r.url}`)
  console.log('')
}

if (brokenPages.length > 0) {
  failed = true
  console.log(`✗ ${brokenPages.length} crawled page(s) not returning 200:`)
  for (const r of brokenPages) console.log(`    [${r.status || r.error}] ${r.url}`)
  console.log('')
}

for (const w of warnings) console.log(`⚠ ${w}`)

console.log('—'.repeat(50))
console.log(`pages: ${pageUrls.length}  images: ${imageResults.length} (${brokenImages.length} broken)  links: ${linkResults.length} (${brokenLinks.length} broken)`)

if (!failed) {
  console.log('✅ smoke test passed — no broken images or links found.')
  process.exit(0)
}
console.log('❌ smoke test FAILED — see above.')
process.exit(1)
