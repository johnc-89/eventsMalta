// Rewrites scraped event descriptions in our own words before storage.
// Uses Groq (free tier) with llama-3.1-8b-instant via the OpenAI-compatible API.
// Falls back to the original text on any failure so imports never break.

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

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    log('  ⚠ rewriter: GROQ_API_KEY not set — storing original description')
    return { title, description, ok: false }
  }

  try {
    const res = await fetch(GROQ_API_URL, {
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
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const newDesc = data.choices?.[0]?.message?.content?.trim() || description
    return { title, description: newDesc, ok: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ rewriter: Groq error (${detail}) — storing original description`)
    return { title, description, ok: false }
  }
}
