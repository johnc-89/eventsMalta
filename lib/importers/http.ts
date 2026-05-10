// HTTP client for the importer.
//
// - Identifies us with a meaningful User-Agent so source operators can
//   block / allow us deliberately (rather than masquerading as a browser).
// - Hard per-request timeout via AbortController.
// - Single retry on 5xx / network error with a fixed delay.
// - Bounded concurrency helper for parallel sitemap entry fetches.

export const USER_AGENT = 'EventsMalta-Importer/1.0 (+https://eventsmalta.org)'

const DEFAULT_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 800

export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status} fetching ${url}`)
    this.name = 'HttpError'
  }
}

interface FetchOptions {
  /** Override the request timeout. */
  timeoutMs?: number
  /** Accept header — defaults to text/html, application/xml. */
  accept?: string
  /** Signal cancellation from caller. */
  signal?: AbortSignal
}

/** Fetch a URL as text. Throws HttpError on non-2xx (after one retry on 5xx). */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const accept = opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    if (opts.signal) {
      // Forward caller cancellations to our internal controller.
      opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: accept,
          'Accept-Language': 'en-GB,en;q=0.8,mt;q=0.5',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.status >= 500 && attempt === 0) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      if (!res.ok) {
        throw new HttpError(res.status, url)
      }
      return await res.text()
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof HttpError) throw err
      // Network error / abort: retry once
      if (attempt === 0) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`fetch failed for ${url}: ${detail}`)
    }
  }
  // Unreachable but keeps tsc happy
  throw new Error(`fetch failed for ${url}: exhausted retries`)
}

/** Sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Run `worker(item)` for each item in `items` with at most `concurrency` in
 *  flight. Returns results in the same order as inputs. Failed items get
 *  their thrown error in the return slot instead of a value. */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<R | Error>> {
  const results: Array<R | Error> = new Array(items.length)
  let next = 0

  async function take(): Promise<void> {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try {
        results[i] = await worker(items[i], i)
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => take())
  await Promise.all(workers)
  return results
}
