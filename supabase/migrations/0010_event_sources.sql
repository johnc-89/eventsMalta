-- ============================================================================
-- 0010_event_sources.sql — External event aggregation
--
-- Foundations only (Phase 1):
--   • event_sources         — one row per external site we import from
--   • import_runs           — one row per scrape execution (observability)
--   • events provenance     — source_id / source_external_id / hashes / etc.
--   • site_settings extras  — attribution + political-content filter rules
--   • Seed: 8 source rows for the announced target sites (all DISABLED)
--
-- No adapters yet — Phase 2 adds the importer code. Until then the UI lets
-- super-admins inspect/edit sources and the rules, but no automated import
-- runs occur.
--
-- The aggregator user (who owns imported events) is NOT created here — see
-- /admin/sources for the one-click setup button, which uses the service-role
-- key to call auth.admin.createUser. Pre-seeding via SQL would fight Supabase's
-- auth machinery (password hashing, identities, etc.).
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. event_sources — registered external sites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_sources (
  id                     BIGSERIAL PRIMARY KEY,
  name                   TEXT NOT NULL UNIQUE,                  -- "Festivals Malta"
  homepage_url           TEXT NOT NULL,
  events_url             TEXT,                                  -- entry point to list events
  adapter                TEXT NOT NULL,                         -- 'teatrumanoel' | 'tsmalta' | ...
  config                 JSONB NOT NULL DEFAULT '{}'::JSONB,    -- adapter-specific (selectors, tz, sitemap URL)
  enabled                BOOLEAN NOT NULL DEFAULT false,        -- master switch
  auto_publish           BOOLEAN NOT NULL DEFAULT false,        -- if false, imports land in pending_review (DEFAULT)
  schedule_cron          TEXT NOT NULL DEFAULT '0 */6 * * *',   -- Vercel-cron-compatible expression
  default_category_id    INT REFERENCES public.categories(id),  -- nullable; categorise unmatched events
  attribution_label      TEXT,                                  -- display override; falls back to `name`
  last_run_at            TIMESTAMPTZ,
  last_success_at        TIMESTAMPTZ,
  last_error             TEXT,
  notes                  TEXT,                                  -- super-admin notes (e.g. partnership status)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_sources_enabled_idx ON public.event_sources (enabled);
CREATE INDEX IF NOT EXISTS event_sources_adapter_idx ON public.event_sources (adapter);

-- updated_at touch trigger (matches the leads convention)
CREATE OR REPLACE FUNCTION public.event_sources_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS event_sources_touch_updated_at ON public.event_sources;
CREATE TRIGGER event_sources_touch_updated_at
  BEFORE UPDATE ON public.event_sources
  FOR EACH ROW EXECUTE FUNCTION public.event_sources_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. import_runs — one row per scrape execution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_runs (
  id                BIGSERIAL PRIMARY KEY,
  source_id         BIGINT NOT NULL REFERENCES public.event_sources(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  triggered_by      TEXT NOT NULL DEFAULT 'cron',               -- 'cron' | 'manual' | 'webhook' | <email>
  status            TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running','ok','partial','error')),
  fetched           INT NOT NULL DEFAULT 0,
  inserted          INT NOT NULL DEFAULT 0,
  updated           INT NOT NULL DEFAULT 0,
  skipped           INT NOT NULL DEFAULT 0,                     -- dedupe / unchanged
  excluded          INT NOT NULL DEFAULT 0,                     -- political-content filter
  errored           INT NOT NULL DEFAULT 0,
  log               TEXT                                        -- truncated debug output
);

CREATE INDEX IF NOT EXISTS import_runs_source_started_idx
  ON public.import_runs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS import_runs_status_idx
  ON public.import_runs (status, started_at DESC);

-- ---------------------------------------------------------------------------
-- 3. events — provenance columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source_id           BIGINT REFERENCES public.event_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_external_id  TEXT,
  ADD COLUMN IF NOT EXISTS source_url          TEXT,
  ADD COLUMN IF NOT EXISTS imported_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_hash        TEXT,
  ADD COLUMN IF NOT EXISTS manual_edit_at      TIMESTAMPTZ;   -- bumped when a human edits an imported event;
                                                              -- importer must NOT overwrite manual edits

COMMENT ON COLUMN public.events.source_id IS
  'NULL = user-submitted. Non-null = imported via event_sources[source_id].';
COMMENT ON COLUMN public.events.source_external_id IS
  'Source-stable identifier (slug or numeric id). Combined with source_id for dedupe.';
COMMENT ON COLUMN public.events.content_hash IS
  'sha256 of normalised (title|date_start|location_name|description). Lets the importer skip writes when nothing changed.';
COMMENT ON COLUMN public.events.last_seen_at IS
  'Updated every import run that finds this event. Stale (>48h) events with future dates get auto-cancelled.';
COMMENT ON COLUMN public.events.manual_edit_at IS
  'NULL while still in pure-import state. Set by /events/[slug]/edit when a human modifies an imported event so re-imports leave it alone.';

-- Dedupe key: a given source can only supply one event per external_id.
CREATE UNIQUE INDEX IF NOT EXISTS events_source_dedupe
  ON public.events (source_id, source_external_id)
  WHERE source_id IS NOT NULL AND source_external_id IS NOT NULL;

-- Index for the stale-event janitor query
CREATE INDEX IF NOT EXISTS events_last_seen_idx
  ON public.events (source_id, last_seen_at)
  WHERE source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS — super-admin manages sources & runs; nobody else sees them.
--    Imported events appear in the normal events table and inherit the
--    existing events RLS (public reads `approved`, organisers + admins
--    read everything else). No new policies needed on events itself.
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_sources_super_admin_all ON public.event_sources;
CREATE POLICY event_sources_super_admin_all ON public.event_sources
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS import_runs_super_admin_all ON public.import_runs;
CREATE POLICY import_runs_super_admin_all ON public.import_runs
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 5. Importer config in site_settings (draft + published, super-admin editable)
--
--    Layout under site_settings.draft / .published:
--      importers: {
--        aggregator_user_id: "<uuid>" | null,           // set by /admin/sources init button
--        attribution: {
--          enabled: true,                                // hide attribution line if false
--          template: "Imported from {source}"            // {source} placeholder
--        },
--        political_filter: {
--          hard_keywords: [ ... ],   // case-insensitive substring match → event NEVER imported
--          soft_keywords: [ ... ]    // event imported into pending_review with auto_flag_reason
--        }
--      }
--
--    We merge defaults non-destructively so existing keys aren't clobbered.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  defaults JSONB := jsonb_build_object(
    'importers', jsonb_build_object(
      'aggregator_user_id', NULL,
      'attribution', jsonb_build_object(
        'enabled', true,
        'template', 'Imported from {source}'
      ),
      'political_filter', jsonb_build_object(
        'hard_keywords', jsonb_build_array(
          'partit laburista', 'labour party malta', ' pl ',
          'partit nazzjonalista', 'nationalist party malta', ' pn ',
          'adpd', 'volt malta', 'imperium europa', 'abba malta',
          'campaign rally', 'election rally', 'partisan',
          'manifesto launch', 'comizju', 'attivita politika',
          'meet the candidate', 'mep candidate', 'candidate meet'
        ),
        'soft_keywords', jsonb_build_array(
          'minister', 'parliament', 'government of malta',
          'european commission', 'policy launch'
        )
      )
    )
  );
BEGIN
  -- Merge into draft if any importer keys are missing
  UPDATE public.site_settings
     SET draft = jsonb_strip_nulls(defaults || draft)
   WHERE id = 1
     AND NOT (draft ? 'importers');

  -- Also merge into published so the runtime importer can read defaults
  -- without a manual publish step
  UPDATE public.site_settings
     SET published = jsonb_strip_nulls(defaults || published)
   WHERE id = 1
     AND NOT (published ? 'importers');
END $$;

-- ---------------------------------------------------------------------------
-- 6. Helper: aggregator user id (NULL until the admin-UI init button runs).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aggregator_user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF((published -> 'importers' ->> 'aggregator_user_id'), '')::UUID
    FROM public.site_settings
   WHERE id = 1
$$;

-- ---------------------------------------------------------------------------
-- 7. Seed the 8 announced source rows (all DISABLED until adapter ships +
--    super-admin reviews). auto_publish stays false per locked-in decision:
--    imports always go to pending_review.
--
--    The adapter strings are stable identifiers — Phase 2 will add the
--    matching files at lib/importers/adapters/<adapter>.ts.
-- ---------------------------------------------------------------------------
INSERT INTO public.event_sources (name, homepage_url, events_url, adapter, notes)
VALUES
  ('Teatru Manoel',
   'https://teatrumanoel.mt',
   'https://teatrumanoel.mt/whats-on/',
   'teatrumanoel',
   'WordPress + Elementor. Sitemap available. Reference adapter — build first.'),

  ('Teatru Salesjan',
   'https://tsmalta.com',
   'https://tsmalta.com/events/',
   'tsmalta',
   'WordPress. Sitemap available. /events/<slug>/ pattern.'),

  ('Heritage Malta',
   'https://heritagemalta.mt',
   'https://heritagemalta.mt/whats-on/',
   'heritagemalta',
   'WordPress + WPML. /event/<slug>/ — confirm Cloudflare bot challenge with a real UA before building.'),

  ('Festivals Malta',
   'https://www.festivals.mt',
   'https://www.festivals.mt/events',
   'festivals_mt',
   'Custom hosting. Sitemap index points to event-pages-sitemap.xml — use that as the entry.'),

  ('Pop-Up Malta',
   'https://popp.mt',
   'https://popp.mt/events/',
   'popp',
   'WordPress. Sitemap available. robots.txt explicitly blocks ClaudeBot — set User-Agent: EventsMalta/1.0.'),

  ('Malta Artisan Markets',
   'https://www.maltaartisanmarkets.com',
   'https://www.maltaartisanmarkets.com/upcoming-events',
   'maltaartisanmarkets',
   'Likely Squarespace — try ?format=json on the upcoming-events page; falls back to HTML if unavailable.'),

  ('VisitMalta (MTA)',
   'https://www.visitmalta.com',
   'https://www.visitmalta.com/en/events-in-malta-and-gozo/',
   'visitmalta',
   'JS-rendered. Defer — try partnership/feed request to Malta Tourism Authority before building the adapter.'),

  ('Esplora (MCST)',
   'https://esplora.org.mt',
   'https://esplora.org.mt/week-schedule/',
   'esplora',
   'Static weekly schedule, no per-event URLs. Defer — try partnership/feed request to MCST before building.')

ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Realtime (so the admin UI auto-refreshes during import runs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'event_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_sources;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'import_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.import_runs;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Refresh PostgREST schema cache.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done. Next: deploy the /admin/sources UI (Phase 1) and the importer
-- pipeline + first adapter (Phase 2).
-- ---------------------------------------------------------------------------
