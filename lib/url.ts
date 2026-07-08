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
