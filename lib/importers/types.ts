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
  /** Optional explicit list of occurrences. If omitted, the pipeline treats
   *  `startsAt` + `endsAt` + `hasTime` as a single occurrence. If provided,
   *  the pipeline writes ALL listed occurrences to event_occurrences and uses
   *  the soonest-future one as the denormalised events.date_start.
   *  Adapters for recurring sources (Heritage Malta opening_hours, Visit Malta
   *  daily/weekly/monthly recur_type) yield this. */
  occurrences?: Occurrence[]
  /** Original payload for debugging — never read by the pipeline. */
  raw?: unknown
}

/** One occurrence of an event (one date the event runs). */
export interface Occurrence {
  startsAt: string          // ISO 8601 UTC
  endsAt?: string           // ISO 8601 UTC
  hasTime: boolean
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
  /** How many days ahead of today to include events. Events starting after
   *  this date are skipped. Defaults to 180 if not set on the source config. */
  daysAhead: number
  /** Pre-computed cutoff: new Date(now + daysAhead days). Adapters may use
   *  this to short-circuit fetching; the pipeline also enforces it as a hard
   *  filter after each yield. */
  cutoffDate: Date
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
  skipped: number        // unchanged (hash match) or manual-edit-locked
  excluded: number       // hard-blocked by political filter
  errored: number        // per-event exceptions
  rewrite_errors: number // events stored with original text due to Gemini failure
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
