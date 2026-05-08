-- ============================================================================
-- 0007_events_show_organizer.sql
-- Adds an opt-in flag so organisers can choose to display their name on the
-- public event page. Off by default — no existing event is changed.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS show_organizer BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.show_organizer IS
  'When true, the organiser''s display_name is shown on the public event page.';

-- Refresh PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
