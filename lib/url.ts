// Synchronous format validation for externally-supplied URLs (ticket links,
// etc.). Returns the trimmed URL only if it parses as an absolute http(s) URL,
// otherwise null — so a bare domain, relative path, mailto:/tel:, whitespace,
// or junk string never reaches JSON-LD (Google's structured-data validator
// rejects `offers.url` that isn't a valid absolute URL) or an outbound redirect.
//
// This is format-only. For server-side *fetches* of user URLs use the
// SSRF-aware assertPublicHttpUrl() in lib/importers/url-safety.ts instead.
export function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return trimmed
}

// next/image only renders hosts allowlisted in next.config.js — which is
// deliberately just the Supabase Storage bucket (`*.supabase.co/storage/v1/
// object/public/**`), because every image is meant to be mirrored there at
// import time (see lib/importers/image-mirror.ts). An event whose image_url
// still points at an un-mirrored external host (the mirror failed and kept the
// original URL) would throw "Invalid src prop … hostname is not configured" and
// 500 the whole page. Return the URL only when it's a renderable Supabase
// storage URL, else null so callers fall back to their placeholder.
export function renderableImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (!u.hostname.endsWith('.supabase.co')) return null
  if (!u.pathname.startsWith('/storage/v1/object/public/')) return null
  return raw
}
