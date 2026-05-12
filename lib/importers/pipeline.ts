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
//          │ none                        │ insert (pending_review)   │
//          │ exists, hash unchanged      │ touch last_seen_at, skip  │
//          │ exists, hash changed, no   │ update fields              │
//          │   manual_edit_at            │                           │
//          │ exists, hash changed, has  │ skip (don't clobber human) │
//          │   manual_edit_at            │                           │
//          └─────────────────────────────┴───────────────────────────┘
//
// Slug rule: prefer slugify(title). On collision, append a short hash of the
// external id so the URL stays stable across re-imports.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { EventSource } from '@/types'
import type { ExternalEvent, ImportContext, ImportRunSummary, PoliticalFilterConfig } from './types'
import { applyPoliticalFilter } from './political-filter'
import { rewriteEventText } from './rewriter'
import { contentHash } from './hash'
import { getAdapter } from './registry'

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
  let topLevelError: string | null = null
  try {
    let count = 0
    for await (const ext of adapter.fetchListings(ctx)) {
      if (count >= maxEvents) {
        log(`Hit per-run cap of ${maxEvents}. Stopping; re-run for more.`)
        break
      }
      // Hard cutoff: skip events starting after days_ahead from now
      if (ext.startsAt > cutoffIso) {
        log(`  ↷ ${ext.url} — starts after cutoff (${ext.startsAt.slice(0, 10)} > ${cutoffIso.slice(0, 10)})`)
        continue
      }
      count++
      summary.fetched++
      try {
        await processOne(supabase, source, aggregatorUserId, filterConfig, ext, summary, log)
      } catch (err) {
        summary.errored++
        const detail = err instanceof Error ? err.message : String(err)
        log(`  ✗ ${ext.url} — ${detail}`)
      }
    }
  } catch (err) {
    topLevelError = err instanceof Error ? err.message : String(err)
    log(`FATAL: ${topLevelError}`)
  }

  // ------------------------------------------------------------------------
  // 6. Close
  // ------------------------------------------------------------------------
  summary.status = topLevelError
    ? 'error'
    : summary.errored > 0
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
    .select('id, content_hash, manual_edit_at, deleted_at')
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
    const rewritten = await rewriteEventText(ext.title, ext.description, log)
    if (!rewritten.ok) summary.rewrite_errors++
    await supabase
      .from('events')
      .update({
        title: rewritten.title,
        description: rewritten.description ?? null,
        short_description: shortenDescription(rewritten.description),
        date_start: ext.startsAt,
        date_end: ext.endsAt ?? null,
        has_time: ext.hasTime,
        location_name: ext.venueName ?? null,
        location_address: ext.venueAddress ?? null,
        image_url: ext.imageUrl ?? null,
        ticket_type: ext.ticketUrl ? 'paid' : 'free',
        ticket_url: ext.ticketUrl ?? null,
        price_min: ext.priceMin ?? null,
        price_max: ext.priceMax ?? null,
        currency: ext.currency ?? 'EUR',
        source_url: ext.url,
        content_hash: hash,
        last_seen_at: nowIso,
      })
      .eq('id', existing.id)
    summary.updated++
    log(`  ~ ${ext.url} — updated`)
    return
  }

  // 3. Insert new event
  const rewritten = await rewriteEventText(ext.title, ext.description, log)
  if (!rewritten.ok) summary.rewrite_errors++
  const slug = await uniqueSlug(supabase, ext)
  const { error: insertErr } = await supabase
    .from('events')
    .insert({
      organizer_id: aggregatorUserId,
      title: rewritten.title,
      slug,
      description: rewritten.description ?? null,
      short_description: shortenDescription(rewritten.description),
      date_start: ext.startsAt,
      date_end: ext.endsAt ?? null,
      has_time: ext.hasTime,
      location_name: ext.venueName ?? null,
      location_address: ext.venueAddress ?? null,
      image_url: ext.imageUrl ?? null,
      status: 'pending_review', // hard rule — never auto-publish imports
      ticket_type: ext.ticketUrl ? 'paid' : 'free',
      ticket_url: ext.ticketUrl ?? null,
      price_min: ext.priceMin ?? null,
      price_max: ext.priceMax ?? null,
      currency: ext.currency ?? 'EUR',
      show_organizer: false,                      // imports show the source attribution instead
      source_id: source.id,
      source_external_id: ext.externalId,
      source_url: ext.url,
      content_hash: hash,
      imported_at: nowIso,
      last_seen_at: nowIso,
    })
  if (insertErr) {
    throw new Error(`insert failed: ${insertErr.message}`)
  }
  summary.inserted++
  log(`  + ${ext.url} — inserted as "${slug}"`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
