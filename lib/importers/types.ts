// Shared types for the event-import pipeline.
//
// An adapter is one file per external source. It returns a stream of
// `ExternalEvent` objects in a normalised shape. The pipeline handles
// everything else (dedupe, filtering, upsert, logging).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventSource } from '@/types'

/** Normalised event shape returned by an adapter — the pipeline's input. */
export interface ExternalEvent {
  /** Stable identifier within the source. Combined with source_id for the
   *  events.source_external_id dedupe key. Usually the URL slug. */
  externalId: string
  /** Canonical event URL on the source site. */
  url: string
  title: string
  /** Plain-text description (markdown is fine; rendering is the site's job). */
  description?: string
  /** ISO-8601. If `hasTime` is false the time portion is meaningless. */
  startsAt: string
  endsAt?: string
  /** False if the source only gave us a date with no time. */
  hasTime: boolean
  venueName?: string
  venueAddress?: string
  /** Absolute URL to the hero image, on the source site or a CDN. */
  imageUrl?: string
  /** Where to buy tickets (often a third-party booking site). */
  ticketUrl?: string
  priceMin?: number
  priceMax?: number
  currency?: string
  /** Free-form category hint from the source; pipeline maps to a categories.id. */
  categoryHint?: string
  /** Original payload for debugging — never read by the pipeline. */
  raw?: unknown
}

/** Per-run context handed to every adapter. */
export interface ImportContext {
  /** The source row we're importing from. */
  source: EventSource
  /** id of the open import_runs row (so adapters can append to .log if useful). */
  runId: number
  /** Maximum number of events the adapter should yield per run. The pipeline
   *  also enforces this as a hard cap. */
  maxEvents: number
  /** Service-role Supabase client. Adapters generally shouldn't touch the
   *  database directly, but it's available for advanced cases (e.g. reading
   *  last_seen_at to do incremental imports). */
  supabase: SupabaseClient
  /** Append a line to the run log. */
  log: (line: string) => void
}

/** Per-run political-filter config, snapshotted from site_settings.published. */
export interface PoliticalFilterConfig {
  hard_keywords: string[]
  soft_keywords: string[]
}

/** Final per-run summary — written back to the import_runs row. */
export interface ImportRunSummary {
  fetched: number
  inserted: number
  updated: number
  skipped: number      // unchanged (hash match) or manual-edit-locked
  excluded: number     // hard-blocked by political filter
  errored: number      // per-event exceptions
  status: 'ok' | 'partial' | 'error'
  log: string
}

/** Adapter contract — every source implements this. */
export interface Adapter {
  /** Stable adapter id — matches event_sources.adapter. */
  name: string
  /** Yield ExternalEvent objects. The pipeline iterates and applies all
   *  policies (filter, dedupe, upsert). Order matters only insofar as the
   *  pipeline stops after `ctx.maxEvents` items. */
  fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent>
}
