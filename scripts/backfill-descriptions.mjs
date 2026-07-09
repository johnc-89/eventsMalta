#!/usr/bin/env node
/**
 * Backfill missing event descriptions.
 *
 * Finds approved/pending events that have no usable description and writes one
 * from the title (+ venue/date) using the same LLM chain the importer uses:
 *   Claude Haiku 4.5 → Groq llama-3.1-8b-instant → deterministic sentence.
 *
 * The GENERATE prompt below is intentionally kept in sync with
 * lib/importers/rewriter.ts (generate mode). If you change one, change both.
 *
 * Run (dry-run — prints what it WOULD write, changes nothing):
 *   node scripts/backfill-descriptions.mjs
 * Apply for real:
 *   node scripts/backfill-descriptions.mjs --apply
 * Options:
 *   --apply           actually write to the DB (default: dry-run)
 *   --limit=N         stop after N events (default: no limit)
 *   --min=N           treat descriptions shorter than N chars as missing
 *                     (default: 1 → only truly empty/null)
 *   --ids=1,2,3       regenerate exactly these event ids, ignoring the
 *                     missing/thin filter (use to redo bad descriptions)
 *   --include-manual  also backfill rows a moderator has edited (manual_edit_at)
 *
 * Env (process.env, falling back to .env.local for local runs):
 *   NEXT_PUBLIC_SUPABASE_URL     (required)
 *   SUPABASE_SERVICE_ROLE_KEY    (required)
 *   ANTHROPIC_API_KEY            (preferred generator)
 *   GROQ_API_KEY                 (fallback generator)
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] != null) continue
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

// ---- args ----------------------------------------------------------------
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const INCLUDE_MANUAL = args.includes('--include-manual')
const LIMIT = intArg('--limit', Infinity)
const MIN_CHARS = intArg('--min', 1)
const IDS = idsArg('--ids')

function intArg(name, dflt) {
  const hit = args.find((a) => a.startsWith(`${name}=`))
  if (!hit) return dflt
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : dflt
}

function idsArg(name) {
  const hit = args.find((a) => a.startsWith(`${name}=`))
  if (!hit) return null
  const ids = hit.split('=')[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite)
  return ids.length ? ids : null
}

// ---- env -----------------------------------------------------------------
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const supabase = createClient(URL, SERVICE, { auth: { persistSession: false } })

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null
const CLAUDE_MODEL = 'claude-haiku-4-5'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// ---- prompt (keep in sync with lib/importers/rewriter.ts) ----------------
const GENERATE_SYSTEM_PROMPT = `You are writing a concise description for a public event listing on a Malta events website. Every event takes place in Malta.
You are given the event title and possibly its venue, address and date.
Rules:
- Write 1–2 natural, inviting sentences describing what a visitor can expect.
- Infer only from the title (and venue/address/date if given). Do NOT invent specific facts you cannot support — no made-up prices, performer names, exact times, or claims not implied by the title.
- The venue may be a themed room or brand name (e.g. "Marrakech"). Never infer a country, city or region from the venue name, and never state or imply the event is anywhere other than Malta.
- If the title is vague, keep the description general.
- Output the description text only — no labels, no preamble, no markdown, no surrounding quotation marks.`

// ---- generators ----------------------------------------------------------
function buildUserMessage(title, venue, address, startsAt) {
  const parts = [`Title: ${title}`]
  if (venue && venue.trim()) parts.push(`Venue: ${venue.trim()}`)
  if (address && address.trim()) parts.push(`Address: ${address.trim()}`)
  const dateHint = typeof startsAt === 'string' ? startsAt.slice(0, 10) : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateHint)) parts.push(`Date: ${dateHint}`)
  return `Write a short listing description for this event:\n\n${parts.join('\n')}`
}

async function genClaude(userMessage) {
  if (!anthropic) return null
  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    return text || null
  } catch (err) {
    console.error(`   ⚠ claude error: ${String(err?.message ?? err).slice(0, 160)}`)
    return null
  }
}

async function genGroq(userMessage) {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: GENERATE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error(`   ⚠ groq error: ${String(err?.message ?? err).slice(0, 160)}`)
    return null
  }
}

function fallbackDescription(title, venue) {
  const cleanTitle = String(title).trim().replace(/[.\s]+$/, '')
  return venue && venue.trim() ? `${cleanTitle}, taking place at ${venue.trim()}.` : `${cleanTitle}.`
}

function shortenDescription(desc) {
  if (!desc) return null
  const flat = desc.replace(/\s+/g, ' ').trim()
  return flat.length <= 300 ? flat : flat.slice(0, 297) + '…'
}

const SELECT_COLS = 'id, title, description, location_name, location_address, date_start, manual_edit_at, status'

// ---- fetch candidates ----------------------------------------------------
async function fetchCandidates() {
  // Explicit id list: regenerate exactly these, bypassing the missing/thin
  // filter (used to redo bad descriptions).
  if (IDS) {
    const { data, error } = await supabase.from('events').select(SELECT_COLS).in('id', IDS)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    return (data ?? []).slice(0, LIMIT)
  }

  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_COLS)
      .is('deleted_at', null)
      .in('status', ['approved', 'pending_review'])
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`fetch failed: ${error.message}`)
    if (!data || data.length === 0) break
    for (const row of data) {
      const len = (row.description ?? '').trim().length
      if (len >= MIN_CHARS) continue
      if (row.manual_edit_at && !INCLUDE_MANUAL) continue
      out.push(row)
      if (out.length >= LIMIT) return out
    }
    if (data.length < PAGE) break
  }
  return out
}

// ---- main ----------------------------------------------------------------
console.log(`Backfill descriptions → ${URL}`)
console.log(`  mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)
console.log(`  ${IDS ? `ids: ${IDS.join(',')}` : `min-chars: ${MIN_CHARS}`}  limit: ${LIMIT === Infinity ? '∞' : LIMIT}  include-manual: ${INCLUDE_MANUAL}`)
console.log(`  generators: claude=${anthropic ? 'on' : 'off'} groq=${process.env.GROQ_API_KEY ? 'on' : 'off'}`)

const candidates = await fetchCandidates()
console.log(`\nFound ${candidates.length} event(s) to ${IDS ? 'regenerate' : 'backfill'}.\n`)

let updated = 0
let aiCount = 0
let fallbackCount = 0
let failed = 0

for (const row of candidates) {
  const userMessage = buildUserMessage(row.title, row.location_name, row.location_address, row.date_start)
  let desc = await genClaude(userMessage)
  if (desc) aiCount++
  if (!desc) { desc = await genGroq(userMessage); if (desc) aiCount++ }
  let usedFallback = false
  if (!desc) { desc = fallbackDescription(row.title, row.location_name); usedFallback = true; fallbackCount++ }

  const shortDesc = shortenDescription(desc)
  const tag = usedFallback ? '(fallback)' : '(ai)'
  console.log(`#${row.id} "${row.title}" ${tag}\n   → ${desc}`)

  if (APPLY) {
    const { error } = await supabase
      .from('events')
      .update({ description: desc, short_description: shortDesc })
      .eq('id', row.id)
    if (error) { failed++; console.error(`   ✗ update failed: ${error.message}`) }
    else updated++
  }
}

console.log(`\n${'—'.repeat(50)}`)
console.log(`candidates: ${candidates.length}  ai: ${aiCount}  fallback: ${fallbackCount}`)
if (APPLY) console.log(`written: ${updated}  failed: ${failed}`)
else console.log(`DRY-RUN — nothing written. Re-run with --apply to persist.`)
process.exit(failed > 0 ? 1 : 0)
