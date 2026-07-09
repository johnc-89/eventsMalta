// Importer pipeline.
//
// Public entry point: `runImport({ sourceId, triggeredBy })`. The caller is
// always /api/admin/sources/[id]/run (manual) or a future cron handler.
//
// Responsibilities:
//   1. Load the source + importer config from the DB.
//   2. Pre-flight: source must be enabled, an adapter must exist, the
//      aggregator user must be configured.
//   3. Open an import_runs row (status=running).
//   4. Stream events from the adapter.
//   5. For each event:
//        a. apply hard political filter → maybe `excluded++` and continue
//        b. compute content_hash
//        c. look up existing (source_id, source_external_id)
//        d. insert | update | skip according to the matrix below
//   6. Close the import_runs row with final counts + log.
//
//          ┌─────────────────────────────┬───────────────────────────┐
//          │ existing event?             │ action                    │
//          ├─────────────────────────────┼───────────────────────────┤
//          │ none                        │ insert (status per below) │
//          │ exists, hash unchanged      │ touch last_seen_at, skip  │
//          │ exists, hash changed, no   │ update fields              │
//          │   manual_edit_at            │                           │
//          │ exists, hash changed, has  │ skip (don't clobber human) │
//          │   manual_edit_at            │                           │
//          └─────────────────────────────┴───────────────────────────┘
//
//   New-event status: 'approved' when source.auto_publish is true and no
//   soft political-filter match fired, else 'pending_review'.
//
// Slug rule: prefer slugify(title). On collision, append a short hash of the
// external id so the URL stays stable across re-imports.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { EventSource } from '@/types'
import type { ExternalEvent, ImportContext, ImportRunSummary, Occurrence, PoliticalFilterConfig } from './types'
import { applyPoliticalFilter } from './political-filter'
import { rewriteEventText } from './rewriter'
import { contentHash } from './hash'
import { getAdapter } from './registry'
import { suggestTags } from './tag-suggester'
import { suggestTagsAI } from './tag-suggester-ai'
import { mirrorImageToStorage } from './image-mirror'
import { sanitizeHttpUrl } from '@/lib/url'

// Fallback constants — used only if site_settings is unreachable.
const DEFAULT_MAX_EVENTS = 20
const DEFAULT_DAYS_AHEAD = 180

export interface RunImportOpts {
  sourceId: number
  /** Free-form description, surfaced in import_runs.triggered_by. */
  triggeredBy: string
}

export interface RunImportResult {
  runId: number
  summary: ImportRunSummary
}

/** Server-side only — requires SUPABASE_SERVICE_ROLE_KEY. */
export async function runImport(opts: RunImportOpts): Promise<RunImportResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('runImport: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ------------------------------------------------------------------------
  // 1. Load source + importer config in one round-trip pair
  // ------------------------------------------------------------------------
  const [sourceRes, settingsRes] = await Promise.all([
    supabase.from('event_sources').select('*').eq('id', opts.sourceId).single(),
    supabase.from('site_settings').select('published').eq('id', 1).single(),
  ])
  if (sourceRes.error || !sourceRes.data) {
    throw new Error(`runImport: source ${opts.sourceId} not found`)
  }
  const source = sourceRes.data as EventSource
  const published = (settingsRes.data?.published ?? {}) as Record<string, any>
  const importersCfg = (published.importers ?? {}) as Record<string, any>
  const aggregatorUserId: string | null = importersCfg.aggregator_user_id ?? null
  const filterConfig: PoliticalFilterConfig = {
    hard_keywords: Array.isArray(importersCfg.political_filter?.hard_keywords)
      ? importersCfg.political_filter.hard_keywords
      : [],
    soft_keywords: Array.isArray(importersCfg.political_filter?.soft_keywords)
      ? importersCfg.political_filter.soft_keywords
      : [],
  }

  // ------------------------------------------------------------------------
  // 2. Pre-flight
  // ------------------------------------------------------------------------
  if (!source.enabled) {
    throw new Error(`Source "${source.name}" is disabled. Enable it on /admin/sources first.`)
  }
  if (!aggregatorUserId) {
    throw new Error('Aggregator user not configured. Click "Create aggregator user" on /admin/sources.')
  }
  // After the null check above, narrow into a const TS can carry into closures.
  const aggregatorUserIdNonNull: string = aggregatorUserId
  const adapter = getAdapter(source.adapter)
  if (!adapter) {
    throw new Error(`No adapter registered for "${source.adapter}". Phase 2+ ships adapters one at a time.`)
  }

  // ------------------------------------------------------------------------
  // 3. Open the run row
  // ------------------------------------------------------------------------
  const { data: openedRun, error: insertRunErr } = await supabase
    .from('import_runs')
    .insert({
      source_id: source.id,
      triggered_by: opts.triggeredBy,
      status: 'running',
    })
    .select('id')
    .single()
  if (insertRunErr || !openedRun) {
    throw new Error(`runImport: could not open import_runs row: ${insertRunErr?.message}`)
  }
  const runId = openedRun.id as number

  // Mark the source as currently running (last_run_at = now). last_success_at
  // is only updated when we close successfully.
  await supabase
    .from('event_sources')
    .update({ last_run_at: new Date().toISOString(), last_error: null })
    .eq('id', source.id)

  // ------------------------------------------------------------------------
  // 4-5. Resolve importer config from site_settings, then drive the adapter
  // ------------------------------------------------------------------------
  const maxEvents = Number(importersCfg.max_events) > 0
    ? Number(importersCfg.max_events)
    : DEFAULT_MAX_EVENTS
  const daysAhead = Number(importersCfg.days_ahead) > 0
    ? Number(importersCfg.days_ahead)
    : DEFAULT_DAYS_AHEAD
  const cutoffDate = new Date(Date.now() + daysAhead * 86_400_000)

  const logLines: string[] = []
  const log = (line: string) => logLines.push(line)
  log(`[${source.name}] adapter=${adapter.name} triggered_by=${opts.triggeredBy} max_events=${maxEvents} days_ahead=${daysAhead}`)

  // Load all tags for tag suggestion
  const { data: tagsData } = await supabase.from('tags').select('id, name')
  const tagMap = new Map<string, number>()
  if (tagsData) {
    for (const tag of tagsData) {
      tagMap.set(tag.name, tag.id)
    }
  }

  const ctx: ImportContext = {
    source,
    runId,
    maxEvents,
    daysAhead,
    cutoffDate,
    supabase,
    log,
  }

  const summary: ImportRunSummary = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    excluded: 0,
    errored: 0,
    rewrite_errors: 0,
    status: 'ok',
    log: '',
  }

  const cutoffIso = cutoffDate.toISOString()
  // Soft deadline: stop fetching new events before Vercel kills us at
  // maxDuration=300s. We finalize at ~240s so there's headroom for the
  // close-the-row write below.
  const startedAtMs = Date.now()
  const SOFT_DEADLINE_MS = 240_000
  // Process events in parallel batches. Per-event time is dominated by
  // Claude + image-mirror HTTP calls; doing them sequentially put 20-event
  // imports near the Vercel 300s ceiling. 4 in flight is enough to mask
  // most latency without overwhelming Anthropic rate limits or DB writes.
  const BATCH_SIZE = 4
  let deadlineHit = false
  let topLevelError: string | null = null

  /** Flush a batch of events through processOne in parallel and tally errors. */
  async function flushBatch(batch: ExternalEvent[]): Promise<void> {
    if (batch.length === 0) return
    await Promise.all(
      batch.map(async (ext) => {
        try {
          await processOne(supabase, source, aggregatorUserIdNonNull, filterConfig, ext, summary, log, tagMap)
        } catch (err) {
          summary.errored++
          const detail = err instanceof Error ? err.message : String(err)
          log(`  ✗ ${ext.url} — ${detail}`)
        }
      }),
    )
  }

  try {
    let count = 0
    let batch: ExternalEvent[] = []
    for await (const ext of adapter.fetchListings(ctx)) {
      if (count >= maxEvents) {
        log(`Hit per-run cap of ${maxEvents}. Stopping; re-run for more.`)
        break
      }
      if (Date.now() - startedAtMs > SOFT_DEADLINE_MS) {
        deadlineHit = true
        log(`Soft deadline (${Math.round(SOFT_DEADLINE_MS / 1000)}s) reached after ${count} event(s). Stopping; re-run for more.`)
        break
      }
      // Sanity check: dates suspiciously close to "now" (within ±5 min) almost
      // always mean an adapter silently fell back to `new Date()` on parse
      // failure. Skip and log loudly rather than write garbage to the DB.
      const startMs = Date.parse(ext.startsAt)
      if (!Number.isFinite(startMs)) {
        log(`  ✗ ${ext.url} — unparseable startsAt "${ext.startsAt}", skipping`)
        summary.errored++
        continue
      }
      const driftMs = Math.abs(startMs - Date.now())
      if (driftMs < 5 * 60 * 1000) {
        log(`  ✗ ${ext.url} — startsAt within ±5 min of now ("${ext.startsAt}"), likely a date-parse bug in the adapter; skipping`)
        summary.errored++
        continue
      }
      // Hard cutoff: skip events starting after days_ahead from now
      if (ext.startsAt > cutoffIso) {
        log(`  ↷ ${ext.url} — starts after cutoff (${ext.startsAt.slice(0, 10)} > ${cutoffIso.slice(0, 10)})`)
        continue
      }
      count++
      summary.fetched++
      batch.push(ext)
      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch)
        batch = []
      }
    }
    // Drain remaining buffered events.
    await flushBatch(batch)
  } catch (err) {
    topLevelError = err instanceof Error ? err.message : String(err)
    log(`FATAL: ${topLevelError}`)
  }

  // ------------------------------------------------------------------------
  // 6. Close
  // ------------------------------------------------------------------------
  summary.status = topLevelError
    ? 'error'
    : (summary.errored > 0 || deadlineHit)
      ? 'partial'
      : 'ok'
  summary.log = logLines.join('\n').slice(0, 50_000) // cap log size to protect the DB

  await supabase
    .from('import_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: summary.status,
      fetched: summary.fetched,
      inserted: summary.inserted,
      updated: summary.updated,
      skipped: summary.skipped,
      excluded: summary.excluded,
      errored: summary.errored,
      log: summary.log,
    })
    .eq('id', runId)

  await supabase
    .from('event_sources')
    .update({
      last_success_at: summary.status === 'error' ? null : new Date().toISOString(),
      last_error: summary.status === 'error' ? topLevelError : null,
    })
    .eq('id', source.id)

  return { runId, summary }
}

// ---------------------------------------------------------------------------
// Per-event processing
// ---------------------------------------------------------------------------
async function processOne(
  supabase: SupabaseClient,
  source: EventSource,
  aggregatorUserId: string,
  filterConfig: PoliticalFilterConfig,
  ext: ExternalEvent,
  summary: ImportRunSummary,
  log: (line: string) => void,
  tagMap: Map<string, number>,
): Promise<void> {
  // 1. Political filter
  const filter = applyPoliticalFilter({
    title: ext.title,
    description: ext.description,
    venue: ext.venueName,
  }, filterConfig)
  if (filter.hard.length > 0) {
    summary.excluded++
    const phrases = filter.hard.map((m) => `"${m.phrase}"(${m.field})`).join(', ')
    log(`  ⊘ ${ext.url} — hard-blocked: ${phrases}`)
    return
  }
  if (filter.soft.length > 0) {
    const phrases = filter.soft.map((m) => `"${m.phrase}"(${m.field})`).join(', ')
    log(`  ⚑ ${ext.url} — soft-flagged: ${phrases} (still imported)`)
  }

  // 2. Hash & lookup
  const hash = contentHash(ext)
  const { data: existing } = await supabase
    .from('events')
    .select('id, slug, content_hash, manual_edit_at, deleted_at')
    .eq('source_id', source.id)
    .eq('source_external_id', ext.externalId)
    .maybeSingle()

  const nowIso = new Date().toISOString()

  if (existing) {
    // Deleted (admin hard-deleted) — leave alone.
    if (existing.deleted_at) {
      summary.skipped++
      log(`  ↷ ${ext.url} — was hard-deleted; not re-importing`)
      return
    }
    if (existing.content_hash === hash) {
      // Unchanged: touch last_seen_at only.
      await supabase
        .from('events')
        .update({ last_seen_at: nowIso })
        .eq('id', existing.id)
      summary.skipped++
      return
    }
    if (existing.manual_edit_at) {
      summary.skipped++
      log(`  ✋ ${ext.url} — moderator has edited; respecting manual changes`)
      return
    }
    // Update the row.
    const rewritten = await rewriteEventText(ext.title, ext.description, log, { venueName: ext.venueName, startsAt: ext.startsAt })
    if (!rewritten.ok) summary.rewrite_errors++
    const tags = await pickTags(rewritten.title, rewritten.description, tagMap, log)
    const imageUrl = ext.imageUrl
      ? await mirrorImageToStorage({ sourceUrl: ext.imageUrl, sourceSlug: source.adapter, imageSlug: existing.slug, supabase, log })
      : null
    const occs = resolveOccurrences(ext)
    const primary = pickPrimaryOccurrence(occs)
    await supabase
      .from('events')
      .update({
        title: rewritten.title,
        description: rewritten.description ?? null,
        short_description: shortenDescription(rewritten.description),
        date_start: primary.startsAt,
        date_end: primary.endsAt ?? null,
        has_time: primary.hasTime,
        is_recurring: occs.length > 1,
        location_name: ext.venueName ?? null,
        location_address: ext.venueAddress ?? null,
        image_url: imageUrl,
        ticket_type: resolveTicketType(ext),
        ticket_url: sanitizeHttpUrl(ext.ticketUrl),
        price_min: ext.priceMin ?? null,
        price_max: ext.priceMax ?? null,
        currency: ext.currency ?? 'EUR',
        source_url: ext.url,
        tags: tags.length > 0 ? tags : null,
        content_hash: hash,
        last_seen_at: nowIso,
      })
      .eq('id', existing.id)
    await writeOccurrences(supabase, existing.id, occs)
    summary.updated++
    log(`  ~ ${ext.url} — updated (${occs.length} occurrence${occs.length === 1 ? '' : 's'})`)
    return
  }

  // 3. Insert new event
  const rewritten = await rewriteEventText(ext.title, ext.description, log, { venueName: ext.venueName, startsAt: ext.startsAt })
  if (!rewritten.ok) summary.rewrite_errors++
  const tags = await pickTags(rewritten.title, rewritten.description, tagMap, log)
  const slug = await uniqueSlug(supabase, ext)
  const newImageUrl = ext.imageUrl
    ? await mirrorImageToStorage({ sourceUrl: ext.imageUrl, sourceSlug: source.adapter, imageSlug: slug, supabase, log })
    : null
  const newOccs = resolveOccurrences(ext)
  const newPrimary = pickPrimaryOccurrence(newOccs)
  const { data: inserted, error: insertErr } = await supabase
    .from('events')
    .insert({
      organizer_id: aggregatorUserId,
      title: rewritten.title,
      slug,
      description: rewritten.description ?? null,
      short_description: shortenDescription(rewritten.description),
      date_start: newPrimary.startsAt,
      date_end: newPrimary.endsAt ?? null,
      has_time: newPrimary.hasTime,
      is_recurring: newOccs.length > 1,
      location_name: ext.venueName ?? null,
      location_address: ext.venueAddress ?? null,
      image_url: newImageUrl,
      // Auto-approve only for sources the super_admin has opted in via
      // event_sources.auto_publish — and never for soft-flagged (political
      // filter) matches, which always need a human look regardless.
      status: source.auto_publish && filter.soft.length === 0 ? 'approved' : 'pending_review',
      ticket_type: resolveTicketType(ext),
      ticket_url: sanitizeHttpUrl(ext.ticketUrl),
      price_min: ext.priceMin ?? null,
      price_max: ext.priceMax ?? null,
      currency: ext.currency ?? 'EUR',
      show_organizer: false,                      // imports show the source attribution instead
      tags: tags.length > 0 ? tags : null,
      source_id: source.id,
      source_external_id: ext.externalId,
      source_url: ext.url,
      content_hash: hash,
      imported_at: nowIso,
      last_seen_at: nowIso,
    })
    .select('id')
    .single()
  if (insertErr || !inserted) {
    throw new Error(`insert failed: ${insertErr?.message ?? 'no row returned'}`)
  }
  await writeOccurrences(supabase, inserted.id, newOccs)
  summary.inserted++
  log(`  + ${ext.url} — inserted as "${slug}" (${newOccs.length} occurrence${newOccs.length === 1 ? '' : 's'})`)
}

/** An event is 'paid' if the adapter captured a ticket URL OR found
 *  "tickets"/"biljetti" in the scraped source text; otherwise 'free'. */
function resolveTicketType(ext: ExternalEvent): 'free' | 'paid' {
  return ext.ticketUrl || ext.hasPaidKeyword ? 'paid' : 'free'
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------
/** Return the list of occurrences for an ExternalEvent. If the adapter
 *  supplied `occurrences`, use those; otherwise treat startsAt/endsAt/hasTime
 *  as one occurrence. */
function resolveOccurrences(ext: ExternalEvent): Occurrence[] {
  if (Array.isArray(ext.occurrences) && ext.occurrences.length > 0) {
    return ext.occurrences.slice().sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )
  }
  return [{ startsAt: ext.startsAt, endsAt: ext.endsAt, hasTime: ext.hasTime }]
}

/** The denormalised events.date_start = the soonest-future occurrence. If all
 *  occurrences are past, falls back to the latest (so past events still show
 *  a meaningful date in the archive). */
function pickPrimaryOccurrence(occs: Occurrence[]): Occurrence {
  const now = Date.now()
  const future = occs.find((o) => Date.parse(o.startsAt) >= now)
  return future ?? occs[occs.length - 1]!
}

/** Replace all occurrences for an event (delete-then-insert pattern). */
async function writeOccurrences(
  supabase: SupabaseClient,
  eventId: number,
  occs: Occurrence[],
): Promise<void> {
  await supabase.from('event_occurrences').delete().eq('event_id', eventId)
  if (occs.length === 0) return
  await supabase.from('event_occurrences').insert(
    occs.map((o) => ({
      event_id: eventId,
      starts_at: o.startsAt,
      ends_at: o.endsAt ?? null,
      has_time: o.hasTime,
      status: 'active',
    })),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Choose tags for an event. Tries Groq first (constrained to the existing DB
 *  tag vocabulary), falls back to the keyword matcher on any failure. Both
 *  paths return only names that exist in `tagMap`. */
async function pickTags(
  title: string,
  description: string | undefined,
  tagMap: Map<string, number>,
  log: (line: string) => void,
): Promise<string[]> {
  const vocabulary = Array.from(tagMap.keys())
  const ai = await suggestTagsAI(title, description, vocabulary, log)
  if (ai && ai.length > 0) return ai
  // Fallback: keyword matcher (already restricted to a fixed list).
  const kw = suggestTags(title, description, undefined).filter((name) => tagMap.has(name))
  log(`  ↩ tags: fell back to keyword matcher → ${kw.length > 0 ? `[${kw.join(', ')}]` : '(none)'}`)
  return kw
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function uniqueSlug(supabase: SupabaseClient, ext: ExternalEvent): Promise<string> {
  const base = slugify(ext.title) || 'event'
  // Cheap collision check — one round-trip. On hit, append a deterministic
  // short hash of the external id.
  const { data: clash } = await supabase
    .from('events')
    .select('id')
    .eq('slug', base)
    .maybeSingle()
  if (!clash) return base
  const suffix = createHash('sha256').update(ext.externalId).digest('hex').slice(0, 6)
  return `${base}-${suffix}`.slice(0, 80)
}

function shortenDescription(desc: string | undefined): string | null {
  if (!desc) return null
  const flat = desc.replace(/\s+/g, ' ').trim()
  if (flat.length <= 300) return flat
  return flat.slice(0, 297) + '…'
}
