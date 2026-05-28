-- NUCLEAR: Delete ALL events.
--
-- ⚠ This script does NOT touch the `event-images` Storage bucket — Supabase
-- blocks `DELETE FROM storage.objects` with a `protect_delete()` trigger
-- ("Direct deletion from storage tables is not allowed. Use the Storage API
-- instead."). To wipe the bucket use one of:
--   (a) Supabase Dashboard → Storage → event-images → tick the root folder
--       checkbox → Delete (fastest one-off).
--   (b) The "Wipe event-images bucket" button on /admin/sources (uses the
--       Storage API server-side).
--
-- WHAT THIS DOES:
--   • Deletes every row from `events` (cascades to event_occurrences).
--   • Clears `event_sources.last_run_at` so re-imports aren't throttled.
--   • Leaves `tags`, `event_sources`, `profiles`, `site_settings` alone.
--
-- REVIEW the preview SELECTs first, then change `ROLLBACK;` to `COMMIT;` at
-- the bottom to apply.

-- ---------------------------------------------------------------------------
-- Preview: what would this delete?
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM events)                             AS total_events,
  (SELECT COUNT(*) FROM events WHERE source_id IS NOT NULL) AS imported,
  (SELECT COUNT(*) FROM events WHERE source_id IS NULL)     AS user_submitted;

-- ---------------------------------------------------------------------------
-- Do the work
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. Delete every event (event_occurrences cascades automatically)
DELETE FROM events;

-- 2. Reset import sources so the next run isn't throttled
UPDATE event_sources SET last_run_at = NULL;

-- ---------------------------------------------------------------------------
-- Verify before committing
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM events) AS events_remaining;

-- If `events_remaining = 0`, flip this to COMMIT:
ROLLBACK;
-- COMMIT;
