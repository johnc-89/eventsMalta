// Rewrites scraped event text in our own words before storage.
// Preserves all factual content (dates, names, venues, prices) — only
// phrasing changes. Falls back to the original strings on any failure.

import { GoogleGenerativeAI } from '@google/generative-ai'

let _genAI: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  return _genAI
}

const SYSTEM_INSTRUCTION = `You are a copy-editor rewriting event descriptions in your own words.
Rules:
- Preserve every factual detail: venue, dates, times, prices, performers, ticket links.
- Change the sentence structure and vocabulary — do not copy phrases verbatim from the source.
- Keep roughly the same length; do not add or invent information.
- Output plain text only — no markdown, no labels, no JSON wrapper.`

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

  const client = getClient()
  if (!client) {
    log('  ⚠ rewriter: GEMINI_API_KEY not set — storing original description')
    return { title, description, ok: false }
  }

  try {
    const model = client.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
    })
    const result = await model.generateContent(
      `Rewrite the following event description in your own words:\n\n${description}`,
    )
    const newDesc = result.response.text().trim() || description
    return { title, description: newDesc, ok: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    log(`  ⚠ rewriter: Gemini error (${detail}) — storing original description`)
    return { title, description, ok: false }
  }
}
