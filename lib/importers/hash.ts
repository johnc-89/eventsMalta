// Content hash used to detect "did anything actually change?" between import
// runs. The pipeline stores it on events.content_hash. On re-import:
//
//   • Hash unchanged → no DB write, just bump last_seen_at (counts as `skipped`).
//   • Hash changed AND manual_edit_at is NULL → update the row.
//   • Hash changed AND manual_edit_at is NOT NULL → moderator has touched it;
//     don't clobber, count as `skipped`.

import { createHash } from 'crypto'
import type { ExternalEvent } from './types'

/** Stable canonical string for hashing. Order matters — anything that semantically
 *  defines the event goes in. Layout-only fields (image_url) are intentionally
 *  EXCLUDED so a CDN re-encoding the same picture doesn't trigger a no-op
 *  update. */
function canonicalize(e: ExternalEvent): string {
  const parts = [
    e.title.trim(),
    e.startsAt,
    e.endsAt ?? '',
    e.hasTime ? '1' : '0',
    (e.venueName ?? '').trim(),
    (e.venueAddress ?? '').trim(),
    (e.description ?? '').trim().replace(/\s+/g, ' '),
    (e.ticketUrl ?? '').trim(),
    (e.priceMin ?? '').toString(),
    (e.priceMax ?? '').toString(),
    (e.currency ?? '').trim(),
  ]
  return parts.join('') // ASCII unit separator — won't appear in user content
}

export function contentHash(e: ExternalEvent): string {
  return createHash('sha256').update(canonicalize(e), 'utf8').digest('hex')
}
