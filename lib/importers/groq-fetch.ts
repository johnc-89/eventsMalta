// Thin fetch wrapper for Groq's OpenAI-compatible endpoint that retries
// once on HTTP 429 (rate-limit). Honors the `Retry-After` header when
// present; otherwise waits 10s. Caps the wait at 30s so a long retry-after
// can't stall the whole import.
//
// Used by both rewriter.ts and tag-suggester-ai.ts. Callers still handle
// non-429 errors and final fallback themselves — this wrapper only smooths
// out the rolling-TPM bucket.

const RETRY_DEFAULT_MS = 10_000
const RETRY_CAP_MS = 30_000

function parseRetryAfterMs(header: string | null): number {
  if (!header) return RETRY_DEFAULT_MS
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, RETRY_CAP_MS)
  }
  return RETRY_DEFAULT_MS
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function groqFetchWithRetry(
  url: string,
  init: RequestInit,
  log: (line: string) => void,
): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 429) return res

  const waitMs = parseRetryAfterMs(res.headers.get('retry-after'))
  log(`  ⏳ Groq 429 — waiting ${Math.round(waitMs / 1000)}s then retrying once`)
  await sleep(waitMs)
  return fetch(url, init)
}
