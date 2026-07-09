// Rewrites scraped event descriptions in our own words before storage — and,
// when the source gave us no usable description at all, WRITES one from the
// title (plus any venue/date we scraped).
//
// Chain (both modes): Claude Haiku 4.5 → Groq llama-3.1-8b-instant → fallback.
//   - rewrite mode  → fallback keeps the original scraped text.
//   - generate mode → fallback is a short deterministic sentence from the title,
//     so an imported event is never left with an empty description.
// On any failure at any stage we fall through; imports never break.
//
// Claude is preferred because it follows the instructions ("preserve every
// factual detail, don't copy verbatim, don't invent facts") much more reliably
// than the 8B llama. Groq stays as a free-tier fallback when Anthropic is down,
// missing key, or rate-limited.

import Anthropic from '@anthropic-ai/sdk'
import { getClaude, CLAUDE_MODEL } from './claude'
import { groqFetchWithRetry } from './groq-fetch'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Descriptions shorter than this (after trimming) are treated as effectively
// missing — we generate a fresh one from the title rather than "rewriting" a
// fragment like "TBA" or a bare venue name.
const MIN_USABLE_DESCRIPTION = 40

const REWRITE_SYSTEM_PROMPT = `You are a copy-editor rewriting event descriptions in your own words.
Rules:
- Preserve every factual detail: venue, dates, times, prices, performers, ticket links.
- Change the sentence structure and vocabulary — do not copy phrases verbatim from the source.
- Keep roughly the same length; do not add or invent information.
- Output the rewritten description only — no labels, no preamble, no markdown.`

const GENERATE_SYSTEM_PROMPT = `You are writing a concise description for a public event listing on a Malta events website. Every event takes place in Malta.
You are given the event title and possibly its venue, address and date.
Rules:
- Write 1–2 natural, inviting sentences describing what a visitor can expect.
- Infer only from the title (and venue/address/date if given). Do NOT invent specific facts you cannot support — no made-up prices, performer names, exact times, or claims not implied by the title.
- The venue may be a themed room or brand name (e.g. "Marrakech"). Never infer a country, city or region from the venue name, and never state or imply the event is anywhere other than Malta.
- If the title is vague, keep the description general.
- Output the description text only — no labels, no preamble, no markdown, no surrounding quotation marks.`

export interface RewriteMeta {
  venueName?: string
  /** Street address — grounds the model so it doesn't infer a location from a
   *  themed venue name (e.g. a room called "Marrakech" is still in Malta). */
  venueAddress?: string
  /** ISO-8601 start — only the date portion is used, as a hint. */
  startsAt?: string
}

export interface RewriteResult {
  title: string
  description: string | undefined
  ok: boolean
  /** True when the description was written from scratch (source had none). */
  generated?: boolean
}

export async function rewriteEventText(
  title: string,
  description: string | undefined,
  log: (line: string) => void,
  meta?: RewriteMeta,
): Promise<RewriteResult> {
  const trimmed = description?.trim() ?? ''

  // No usable description → generate one from the title.
  if (trimmed.length < MIN_USABLE_DESCRIPTION) {
    return generateFromTitle(title, trimmed, meta, log)
  }

  // 1. Try Claude (preferred).
  const claudeResult = await tryProvider('claude', REWRITE_SYSTEM_PROMPT, rewriteUserMessage(trimmed), log)
  if (claudeResult !== null) {
    log(`  ✓ rewriter: claude ok (${trimmed.length}→${claudeResult.length} chars)`)
    return { title, description: claudeResult, ok: true }
  }

  // 2. Fall back to Groq.
  const groqResult = await tryProvider('groq', REWRITE_SYSTEM_PROMPT, rewriteUserMessage(trimmed), log)
  if (groqResult !== null) {
    log(`  ✓ rewriter: groq ok (${trimmed.length}→${groqResult.length} chars)`)
    return { title, description: groqResult, ok: true }
  }

  // 3. Last resort: keep the original text.
  return { title, description, ok: false }
}

// ---------------------------------------------------------------------------
// Generation (no source description)
// ---------------------------------------------------------------------------

async function generateFromTitle(
  title: string,
  existingSnippet: string,
  meta: RewriteMeta | undefined,
  log: (line: string) => void,
): Promise<RewriteResult> {
  const userMessage = generateUserMessage(title, existingSnippet, meta)

  const claudeResult = await tryProvider('claude', GENERATE_SYSTEM_PROMPT, userMessage, log)
  if (claudeResult !== null) {
    log(`  ✓ rewriter: claude generated description from title (${claudeResult.length} chars)`)
    return { title, description: claudeResult, ok: true, generated: true }
  }

  const groqResult = await tryProvider('groq', GENERATE_SYSTEM_PROMPT, userMessage, log)
  if (groqResult !== null) {
    log(`  ✓ rewriter: groq generated description from title (${groqResult.length} chars)`)
    return { title, description: groqResult, ok: true, generated: true }
  }

  // Both providers unavailable: emit a minimal deterministic sentence so the
  // event still has *some* description rather than none.
  const fallback = fallbackDescription(title, meta)
  log(`  ⚠ rewriter: no AI available — using deterministic description fallback`)
  return { title, description: fallback, ok: false, generated: true }
}

function rewriteUserMessage(description: string): string {
  return `Rewrite this event description in your own words:\n\n${description}`
}

function generateUserMessage(title: string, existingSnippet: string, meta: RewriteMeta | undefined): string {
  const parts = [`Title: ${title}`]
  if (meta?.venueName?.trim()) parts.push(`Venue: ${meta.venueName.trim()}`)
  if (meta?.venueAddress?.trim()) parts.push(`Address: ${meta.venueAddress.trim()}`)
  const dateHint = meta?.startsAt?.slice(0, 10)
  if (dateHint && /^\d{4}-\d{2}-\d{2}$/.test(dateHint)) parts.push(`Date: ${dateHint}`)
  if (existingSnippet) parts.push(`Partial text from source (expand on this): ${existingSnippet}`)
  return `Write a short listing description for this event:\n\n${parts.join('\n')}`
}

function fallbackDescription(title: string, meta: RewriteMeta | undefined): string {
  const venue = meta?.venueName?.trim()
  const cleanTitle = title.trim().replace(/[.\s]+$/, '')
  return venue ? `${cleanTitle}, taking place at ${venue}.` : `${cleanTitle}.`
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function tryProvider(
  provider: 'claude' | 'groq',
  system: string,
  userMessage: string,
  log: (line: string) => void,
): Promise<string | null> {
  return provider === 'claude'
    ? tryClaude(system, userMessage, log)
    : tryGroq(system, userMessage, log)
}

async function tryClaude(
  system: string,
  userMessage: string,
  log: (line: string) => void,
): Promise<string | null> {
  const client = getClaude()
  if (!client) return null

  try {
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
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
  system: string,
  userMessage: string,
  log: (line: string) => void,
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    log('  ⚠ rewriter: GROQ_API_KEY not set — falling back')
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
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
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
    log(`  ⚠ rewriter: groq error (${detail}) — falling back`)
    return null
  }
}
