-- TRULY NUCLEAR: Delete ALL events + every object in the event-images bucket.
--
-- Use this for a complete clean slate when you also want the storage bucket
-- emptied (e.g. before re-running imports with new image-handling logic).
--
-- WHAT THIS DOES:
--   • Deletes every row from `events` (cascades to event_occurrences).
--   • Clears `event_sources.last_run_at` so re-imports aren't throttled.
--   • Deletes every object in the `event-images` Storage bucket (both
--     mirrored imports under `imports/*` AND user-uploaded event photos).
--   • Leaves `site-assets` alone — your logo, hero image, OG image are safe.
--   • Leaves `tags`, `event_sources`, `profiles`, `site_settings` alone.
--
-- REVIEW the preview SELECTs first, then change `ROLLBACK;` to `COMMIT;` at
-- the bottom to apply.

-- ---------------------------------------------------------------------------
-- Preview: what would this delete?
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM events)                                        AS total_events,
  (SELECT COUNT(*) FROM events WHERE source_id IS NOT NULL)            AS imported,
  (SELECT COUNT(*) FROM events WHERE source_id IS NULL)                AS user_submitted,
  (SELECT COUNT(*) FROM storage.objects WHERE bucket_id='event-images') AS event_images_in_bucket,
  (SELECT COUNT(*) FROM storage.objects WHERE bucket_id='site-assets')  AS site_assets_untouched;

-- ---------------------------------------------------------------------------
-- Do the work
-- ---------------------------------------------------------------------------
BEGIN;

-- 1. Delete every event (event_occurrences cascades automatically)
DELETE FROM events;

-- 2. Reset import sources so the next run isn't throttled
UPDATE event_sources SET last_run_at = NULL;

-- 3. Wipe the entire event-images bucket. Both the imports/* mirrored files
--    and user-uploaded event photos. The underlying S3 objects are removed
--    by Supabase's storage delete triggers.
DELETE FROM storage.objects WHERE bucket_id = 'event-images';

-- ---------------------------------------------------------------------------
-- Verify before committing
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM events)                                        AS events_remaining,
  (SELECT COUNT(*) FROM storage.objects WHERE bucket_id='event-images') AS event_images_remaining,
  (SELECT COUNT(*) FROM storage.objects WHERE bucket_id='site-assets')  AS site_assets_remaining;

-- If `events_remaining = 0`, `event_images_remaining = 0`, and
-- `site_assets_remaining` matches what was there before — flip this to COMMIT:
ROLLBACK;
-- COMMIT;
