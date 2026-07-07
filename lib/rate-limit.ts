// In-memory per-IP fixed-window rate limiter.
//
// BEST-EFFORT ONLY: state lives in a single serverless instance and resets on
// cold start; it is not shared across instances. It blunts casual abuse
// (email-bombing /api/notify, hammering the unauthenticated /api/referral/track
// redirect + its service-role DB read) but is not a substitute for a shared
// store. For robust protection use Upstash/Vercel KV or Vercel Pro WAF rules —
// see .claude/SESSION_LOG.md (Phase 3 rate-limiting notes).
//
// Each named `bucket` keeps its own key→window Map so different routes never
// share a counter. MAX_KEYS_PER_BUCKET caps memory so a flood of distinct IPs
// can't grow the Map without bound (which would itself be a memory DoS).

type Window = { count: number; reset: number }

const buckets = new Map<string, Map<string, Window>>()
const MAX_KEYS_PER_BUCKET = 10_000

export interface RateLimitResult {
  ok: boolean
  retryAfter: number // seconds until the window resets (0 when ok)
}

export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()

  let b = buckets.get(bucket)
  if (!b) {
    b = new Map()
    buckets.set(bucket, b)
  }

  // Evict expired entries once the bucket grows large; if it's still oversized
  // (many simultaneously-active keys), drop the soonest-to-reset ones.
  if (b.size > MAX_KEYS_PER_BUCKET) {
    for (const [k, w] of b) if (w.reset <= now) b.delete(k)
    if (b.size > MAX_KEYS_PER_BUCKET) {
      const excess = [...b.entries()]
        .sort((a, c) => a[1].reset - c[1].reset)
        .slice(0, b.size - MAX_KEYS_PER_BUCKET)
      for (const [k] of excess) b.delete(k)
    }
  }

  const w = b.get(key)
  if (!w || w.reset <= now) {
    b.set(key, { count: 1, reset: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  if (w.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((w.reset - now) / 1000) }
  }
  w.count++
  return { ok: true, retryAfter: 0 }
}

// Best-effort client IP from the proxy headers Vercel sets.
export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  )
}
