// Detects "this event isn't free" language in scraped source text: the
// English word "tickets" or its Maltese equivalent "biljetti". Presence of
// either overrides any free-by-default assumption elsewhere in an adapter.
const PAID_KEYWORD_RE = /\btickets?\b|\bbiljett\w*\b/i

export function containsPaidKeyword(...texts: Array<string | undefined | null>): boolean {
  return PAID_KEYWORD_RE.test(texts.filter(Boolean).join(' '))
}
