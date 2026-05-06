import type { Lead, LeadQuality, LeadStatus } from '@/types'
import { LEAD_QUALITIES, LEAD_STATUSES } from '@/types'

export type LeadInput = Partial<Omit<Lead, 'id' | 'created_at' | 'updated_at' | 'converted_user_id'>> & {
  name: string
}

// Header → DB field mapping (case + punctuation insensitive).
// Both the original CSV's header labels (often misaligned with data) AND
// clean header names are accepted, since the user wants "smart" mapping.
const HEADER_MAP: Record<string, keyof LeadInput> = {
  // canonical clean names
  'name': 'name',
  'leadname': 'name',
  'lead': 'name',
  'category': 'category',
  'subtype': 'subtype',
  'subcategory': 'subtype',
  'type': 'subtype',
  'quality': 'quality',
  'priority': 'quality',
  'status': 'status',
  'platform': 'contact_channel',
  'contactchannel': 'contact_channel',
  'suggestedcontactchannel': 'contact_channel',
  'channel': 'contact_channel',
  'website': 'website_url',
  'websiteurl': 'website_url',
  'websitelink': 'website_url',
  'site': 'website_url',
  'url': 'website_url',
  'link': 'website_url',
  'websitecontactpage': 'website_url',
  'instagram': 'instagram_url',
  'instagramurl': 'instagram_url',
  'instagramlink': 'instagram_url',
  'ig': 'instagram_url',
  'facebook': 'facebook_url',
  'facebookurl': 'facebook_url',
  'facebooklink': 'facebook_url',
  'fb': 'facebook_url',
  'email': 'email',
  'emailaddress': 'email',
  'contact': 'email',
  'phone': 'phone',
  'telephone': 'phone',
  'mobile': 'phone',
  'pitch': 'pitch',
  'shortpitch': 'pitch',
  'value': 'pitch',
  'notes': 'notes',
  'note': 'notes',
  'description': 'notes',
  'comments': 'notes',
  'googlesearchlink': 'google_search_url',
  'googlesearch': 'google_search_url',
  'igsearchlink': 'ig_search_url',
  'igsearch': 'ig_search_url',
  'bestcontactlink': 'best_contact_url',
  'bestcontact': 'best_contact_url',
  'lastinteraction': 'last_interaction_at',
  'lastinteractionat': 'last_interaction_at',
  'lastcontactdate': 'last_interaction_at',
  'lastcontact': 'last_interaction_at',
  'date': 'last_interaction_at',
  'followup': 'follow_up_at',
  'followupdate': 'follow_up_at',
  'followupat': 'follow_up_at',
  'nextcontact': 'follow_up_at',
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const looksLikeUrl   = (s: string) => /^https?:\/\//i.test(s)
const looksLikeEmail = (s: string) => /@/.test(s) && !/\s/.test(s)
const looksLikePhone = (s: string) => /^\+?[\d\s\-().]{7,}$/.test(s)

// Parse a single CSV/TSV row, respecting "quoted, fields"
function parseRow(line: string, delimiter: ',' | '\t'): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === delimiter) { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function detectDelimiter(text: string): ',' | '\t' {
  const sample = text.split('\n').slice(0, 5).join('\n')
  return (sample.match(/\t/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? '\t' : ','
}

function detectHeaderRow(rows: string[][]): boolean {
  if (rows.length === 0) return false
  const first = rows[0]
  // Heuristic: header has no URLs/emails/phones, and at least one cell maps to a known field
  const hasData = first.some((c) => looksLikeUrl(c) || looksLikeEmail(c) || looksLikePhone(c))
  if (hasData) return false
  return first.some((c) => HEADER_MAP[normalize(c)] !== undefined)
}

function coerceQuality(v: string): LeadQuality | undefined {
  const t = v.trim().toLowerCase()
  if (!t) return undefined
  return LEAD_QUALITIES.find((q) => q.toLowerCase() === t)
}

function coerceStatus(v: string): LeadStatus | undefined {
  const t = v.trim().toLowerCase()
  if (!t) return undefined
  return LEAD_STATUSES.find((s) => s.toLowerCase() === t)
}

function coerceDate(v: string): string | undefined {
  if (!v) return undefined
  const t = v.trim()
  if (!t) return undefined
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const d = new Date(t)
  if (isNaN(d.getTime())) return undefined
  return d.toISOString().slice(0, 10)
}

// When headers don't match cleanly, classify each cell by its content.
function inferFromContent(cells: string[]): Partial<LeadInput> {
  const out: Partial<LeadInput> = {}
  for (const raw of cells) {
    const c = raw.trim()
    if (!c) continue
    if (looksLikeUrl(c)) {
      const lc = c.toLowerCase()
      if (lc.includes('instagram.com') && !out.instagram_url) out.instagram_url = c
      else if (lc.includes('facebook.com') && !out.facebook_url) out.facebook_url = c
      else if (lc.includes('google.com/search') && !out.google_search_url) out.google_search_url = c
      else if (!out.website_url) out.website_url = c
      else if (!out.best_contact_url) out.best_contact_url = c
    } else if (looksLikeEmail(c) && !out.email) {
      out.email = c
    } else if (looksLikePhone(c) && !out.phone) {
      out.phone = c
    } else if (coerceQuality(c) && !out.quality) {
      out.quality = coerceQuality(c)
    } else if (coerceStatus(c) && !out.status) {
      out.status = coerceStatus(c)
    }
  }
  return out
}

// Public: parse a CSV/TSV/paste blob into normalized LeadInput rows.
// Rules:
//   - auto-detect delimiter (tab or comma)
//   - auto-detect & skip header row
//   - map known headers to fields; for unknown / misaligned headers, fall back
//     to content classification (URLs, emails, phones, quality/status keywords)
//   - first non-empty cell is treated as `name` if not otherwise mapped
export function parseLeadsBlob(text: string): LeadInput[] {
  if (!text.trim()) return []
  const delimiter = detectDelimiter(text)
  const rawLines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0)
  const rows = rawLines.map((l) => parseRow(l, delimiter))
  const hasHeader = detectHeaderRow(rows)
  const headers = hasHeader ? rows[0].map((h) => HEADER_MAP[normalize(h)]) : []
  const dataRows = hasHeader ? rows.slice(1) : rows

  const result: LeadInput[] = []
  for (const cells of dataRows) {
    const row: Partial<LeadInput> = {}
    if (hasHeader) {
      cells.forEach((cell, i) => {
        const field = headers[i]
        if (!field || !cell) return
        if (field === 'quality') row.quality = coerceQuality(cell)
        else if (field === 'status') row.status = coerceStatus(cell)
        else if (field === 'last_interaction_at' || field === 'follow_up_at') {
          const d = coerceDate(cell)
          if (d) (row as any)[field] = d
        } else (row as any)[field] = cell
      })
    }

    // Always also do content inference — fills any gaps the headers missed
    const inferred = inferFromContent(cells)
    for (const [k, v] of Object.entries(inferred)) {
      if ((row as any)[k] == null && v) (row as any)[k] = v
    }

    // First non-empty cell becomes the name if still unset
    if (!row.name) {
      const first = cells.find((c) => c && !looksLikeUrl(c) && !looksLikeEmail(c) && !looksLikePhone(c) && !coerceQuality(c) && !coerceStatus(c))
      if (first) row.name = first
    }

    if (row.name) result.push(row as LeadInput)
  }
  return result
}

// Serialize leads → CSV (RFC-4180-ish). All editable fields included.
export function leadsToCsv(rows: Lead[]): string {
  const headers: (keyof Lead)[] = [
    'name','category','subtype','quality','status','contact_channel',
    'website_url','instagram_url','facebook_url','email','phone',
    'pitch','notes','google_search_url','ig_search_url','best_contact_url',
    'last_interaction_at','follow_up_at','created_at','updated_at',
  ]
  const escape = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => escape((r as any)[h])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
