// AI-powered tag suggester. Asks Groq (llama-3.1-8b-instant) to pick up to
// `maxTags` tags from a caller-supplied vocabulary — the names of tags that
// already exist in the DB. The model cannot invent new tags; any name it
// returns that isn't in `availableTags` is discarded.
//
// Mirrors lib/importers/rewriter.ts: returns null on any failure (missing
// API key, network/HTTP error, bad JSON, no usable matches) so the caller
// can fall back to the keyword matcher.

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

const SYSTEM_PROMPT = `You categorize Maltese events.
You will receive an event's title, description, and a list of allowed tag names.
Choose the tags from the allowed list that best describe the event.
Rules:
- Only return tag names that appear exactly in the allowed list (case-sensitive).
- Return between 0 and 5 tags. Prefer fewer, accurate tags over many loose ones.
- If no allowed tag fits, return an empty array.
- Output strict JSON only: {"tags": ["Tag1", "Tag2"]}. No prose.`

export async function suggestTagsAI(
  title: string,
  description: string | undefined,
  availableTags: string[],
  log: (line: string) => void,
  maxTags = 5,
): Promise<string[] | null> {
  if (availableTags.length === 0) return null
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    log('  ⚠ tag-suggester-ai: GROQ_API_KEY not set — falling back')
    return null
  }

  const userPrompt = [
    `Title: ${title}`,
    description ? `Description: ${description.slice(0, 2000)}` : 'Description: (none)',
    `Allowed tags: ${JSON.stringify(availableTags)}`,
  ].join('\n\n')

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) throw new Error('empty response')

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(`non-JSON response: ${raw.slice(0, 120)}`)
    }

    const tags = (parsed as { tags?: unknown })?.tags
    if (!Array.isArray(tags)) throw new Error('missing tags array')

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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ tag-suggester-ai: Groq error (${detail}) — falling back`)
    return null
  }
}
