// Rewrites scraped event descriptions in our own words before storage.
//
// Chain: Claude Haiku 4.5 → Groq llama-3.1-8b-instant → original text.
// On any failure at any stage we just fall through; imports never break.
//
// Claude is preferred because it follows the "preserve every factual detail,
// don't copy phrases verbatim, keep similar length" instructions much more
// reliably than the 8B llama. Groq stays as a free-tier fallback when
// Anthropic is down, missing key, or rate-limited.

import Anthropic from '@anthropic-ai/sdk'
import { getClaude, CLAUDE_MODEL } from './claude'
import { groqFetchWithRetry } from './groq-fetch'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are a copy-editor rewriting event descriptions in your own words.
Rules:
- Preserve every factual detail: venue, dates, times, prices, performers, ticket links.
- Change the sentence structure and vocabulary — do not copy phrases verbatim from the source.
- Keep roughly the same length; do not add or invent information.
- Output the rewritten description only — no labels, no preamble, no markdown.`

export interface RewriteResult {
  title: string
  description: string | undefined
  ok: boolean
}

export async function rewriteEventText(
  title: string,
  description: string | undefined,
  log: (line: string) => void,
): Promise<RewriteResult> {
  if (!description?.trim()) return { title, description, ok: true }

  // 1. Try Claude (preferred).
  const claudeResult = await tryClaude(description, log)
  if (claudeResult !== null) {
    log(`  ✓ rewriter: claude ok (${description.length}→${claudeResult.length} chars)`)
    return { title, description: claudeResult, ok: true }
  }

  // 2. Fall back to Groq.
  const groqResult = await tryGroq(description, log)
  if (groqResult !== null) {
    log(`  ✓ rewriter: groq ok (${description.length}→${groqResult.length} chars)`)
    return { title, description: groqResult, ok: true }
  }

  // 3. Last resort: keep the original text.
  return { title, description, ok: false }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function tryClaude(
  description: string,
  log: (line: string) => void,
): Promise<string | null> {
  const client = getClaude()
  if (!client) return null

  try {
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Rewrite this event description in your own words:\n\n${description}` },
      ],
    })
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) {
      log('  ⚠ rewriter: claude returned empty text — falling back')
      return null
    }
    return text
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ rewriter: claude error (${detail.slice(0, 200)}) — falling back`)
    return null
  }
}

async function tryGroq(
  description: string,
  log: (line: string) => void,
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    log('  ⚠ rewriter: GROQ_API_KEY not set — storing original description')
    return null
  }

  try {
    const res = await groqFetchWithRetry(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Rewrite this event description in your own words:\n\n${description}` },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    }, log)

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const newDesc = data.choices?.[0]?.message?.content?.trim()
    if (!newDesc) return null
    return newDesc
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ rewriter: groq error (${detail}) — storing original description`)
    return null
  }
}
