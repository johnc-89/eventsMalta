// AI-powered tag suggester. Picks up to `maxTags` tags from a caller-supplied
// vocabulary — the names of tags that already exist in the DB. The model
// cannot invent new tags; any name it returns that isn't in `availableTags`
// is discarded.
//
// Chain: Claude Haiku 4.5 → Groq llama-3.1-8b-instant → null.
// Returns null on full failure so the caller (pickCategories in pipeline.ts) can
// fall back to the keyword matcher.

import Anthropic from '@anthropic-ai/sdk'
import { getClaude, CLAUDE_MODEL } from './claude'
import { groqFetchWithRetry } from './groq-fetch'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'

const SYSTEM_PROMPT = `You categorize Maltese events.
You will receive an event's title, description, and a list of allowed tag names.
Choose the tags from the allowed list that best describe the event.
Rules:
- Only return tag names that appear exactly in the allowed list (case-sensitive).
- Return between 0 and 5 tags. Prefer fewer, accurate tags over many loose ones.
- If no allowed tag fits, return an empty array.
- Output strict JSON only: {"tags": ["Tag1", "Tag2"]}. No prose.`

const JSON_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['tags'],
  properties: {
    tags: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
  },
}

export async function suggestCategoriesAI(
  title: string,
  description: string | undefined,
  availableTags: string[],
  log: (line: string) => void,
  maxTags = 5,
): Promise<string[] | null> {
  if (availableTags.length === 0) return null

  const userPrompt = [
    `Title: ${title}`,
    description ? `Description: ${description.slice(0, 2000)}` : 'Description: (none)',
    `Allowed tags: ${JSON.stringify(availableTags)}`,
  ].join('\n\n')

  // 1. Try Claude (preferred).
  const claudeTags = await tryClaude(userPrompt, log)
  if (claudeTags !== null) {
    const filtered = filterToVocabulary(claudeTags, availableTags, maxTags)
    log(`  ✓ ai-tags: claude ${formatTags(filtered)}`)
    return filtered
  }

  // 2. Fall back to Groq.
  const groqTags = await tryGroq(userPrompt, log)
  if (groqTags !== null) {
    const filtered = filterToVocabulary(groqTags, availableTags, maxTags)
    log(`  ✓ ai-tags: groq ${formatTags(filtered)}`)
    return filtered
  }

  // 3. Total AI failure — let caller try the keyword matcher.
  return null
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

async function tryClaude(
  userPrompt: string,
  log: (line: string) => void,
): Promise<unknown[] | null> {
  const client = getClaude()
  if (!client) return null

  try {
    // `output_config.format` constrains the model to valid JSON matching our
    // schema. Schema lives in the request, so a vocabulary change doesn't
    // invalidate any compiled-schema cache (the vocab is in the user message).
    const res = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: { type: 'json_schema', schema: JSON_SCHEMA } },
    })

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) {
      log('  ⚠ ai-tags: claude returned empty text — falling back')
      return null
    }
    const parsed = JSON.parse(text) as { tags?: unknown }
    if (!Array.isArray(parsed.tags)) {
      log('  ⚠ ai-tags: claude response missing tags array — falling back')
      return null
    }
    return parsed.tags
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ ai-tags: claude error (${detail.slice(0, 200)}) — falling back`)
    return null
  }
}

async function tryGroq(
  userPrompt: string,
  log: (line: string) => void,
): Promise<unknown[] | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    log('  ⚠ ai-tags: GROQ_API_KEY not set — falling back')
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
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    }, log)

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) throw new Error('empty response')
    const parsed = JSON.parse(raw) as { tags?: unknown }
    if (!Array.isArray(parsed.tags)) throw new Error('missing tags array')
    return parsed.tags
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ ai-tags: groq error (${detail}) — falling back`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterToVocabulary(
  tags: unknown[],
  availableTags: string[],
  maxTags: number,
): string[] {
  const allowed = new Set(availableTags)
  const picked: string[] = []
  const seen = new Set<string>()
  for (const t of tags) {
    if (typeof t !== 'string') continue
    if (!allowed.has(t)) continue
    if (seen.has(t)) continue
    seen.add(t)
    picked.push(t)
    if (picked.length >= maxTags) break
  }
  return picked
}

function formatTags(tags: string[]): string {
  return tags.length > 0 ? `[${tags.join(', ')}]` : '(none)'
}
