// Singleton Anthropic SDK client for importer AI calls. Returns null when
// ANTHROPIC_API_KEY is not set so callers can branch on it without throwing
// at module load. Used by rewriter.ts and category-suggester-ai.ts.

import Anthropic from '@anthropic-ai/sdk'

let cached: Anthropic | null | undefined

export function getClaude(): Anthropic | null {
  if (cached !== undefined) return cached
  const apiKey = process.env.ANTHROPIC_API_KEY
  cached = apiKey ? new Anthropic({ apiKey }) : null
  return cached
}

/** Haiku 4.5 — cheap, fast, good enough for paraphrasing and tag picking. */
export const CLAUDE_MODEL = 'claude-haiku-4-5'
