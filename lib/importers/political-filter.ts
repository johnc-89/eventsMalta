// Political-content filter for the importer.
//
// Two layers, configured in site_settings.published.importers.political_filter:
//
//   1. HARD-BLOCK — any match means the event is never imported. The pipeline
//      counts it as `excluded` and logs the matching phrase.
//
//   2. SOFT-FLAG — any match imports the event normally but logs the match
//      so the moderator can scan the run log when reviewing the queue.
//
// Match rule: lowercase substring against `{title}\n{description}\n{venue}\n{organiser}`.
// Phrases in the seed list are pre-padded with spaces (' pl ', ' pn ') where a
// false positive on a bare initial is likely.

import type { PoliticalFilterConfig } from './types'

export interface FilterMatch {
  /** The phrase from the config that matched. */
  phrase: string
  /** Which input field it matched in (for the log). */
  field: 'title' | 'description' | 'venue' | 'organiser'
}

export interface FilterResult {
  hard: FilterMatch[]
  soft: FilterMatch[]
}

interface FilterInput {
  title?: string
  description?: string
  venue?: string
  organiser?: string
}

/** Run both layers against the event content. The caller decides what to do
 *  with `hard` (skip) vs `soft` (import but flag). */
export function applyPoliticalFilter(
  input: FilterInput,
  config: PoliticalFilterConfig,
): FilterResult {
  const fields: [FilterMatch['field'], string][] = [
    ['title',       (input.title ?? '').toLowerCase()],
    ['description', (input.description ?? '').toLowerCase()],
    ['venue',       (input.venue ?? '').toLowerCase()],
    ['organiser',   (input.organiser ?? '').toLowerCase()],
  ]
  const hard: FilterMatch[] = []
  const soft: FilterMatch[] = []

  // Pad text with leading/trailing space so ' pl ' / ' pn ' style phrases
  // also match when the initials sit at the very start or end of a string.
  const padded = fields.map(([field, text]) => [field, ` ${text} `] as const)

  for (const phrase of config.hard_keywords) {
    if (!phrase) continue
    const needle = phrase.toLowerCase()
    for (const [field, haystack] of padded) {
      if (haystack.includes(needle)) {
        hard.push({ phrase, field })
        break // one hit per phrase is enough
      }
    }
  }
  for (const phrase of config.soft_keywords) {
    if (!phrase) continue
    const needle = phrase.toLowerCase()
    for (const [field, haystack] of padded) {
      if (haystack.includes(needle)) {
        soft.push({ phrase, field })
        break
      }
    }
  }

  return { hard, soft }
}
