-- ============================================================================
-- 0008_events_has_time.sql
-- Adds an opt-in flag so organisers can post events without a specific time
-- (e.g. all-day or multi-day festivals). Default TRUE preserves existing
-- behaviour for events that already have times set.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS has_time BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.events.has_time IS
  'When false the event has no specific time — only dates are displayed.';

NOTIFY pgrst, 'reload schema';
