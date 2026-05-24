-- NUCLEAR OPTION: Delete ALL events (both user-submitted and imported).
-- Use this to reset the database to a clean slate for testing.
--
-- event_occurrences cascades automatically. All event_sources.last_run_at
-- are cleared so re-imports aren't throttled.
--
-- REVIEW the preview SELECT first, then swap ROLLBACK → COMMIT to apply.

-- ---------------------------------------------------------------------------
-- Preview: what events exist?
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS total_events,
       COUNT(*) FILTER (WHERE source_id IS NOT NULL) AS imported,
       COUNT(*) FILTER (WHERE source_id IS NULL) AS user_submitted,
       COUNT(*) FILTER (WHERE deleted_at IS NULL) AS live,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS already_soft_deleted
FROM events;

-- ---------------------------------------------------------------------------
-- Delete all events + reset import run metadata
-- ---------------------------------------------------------------------------
BEGIN;

DELETE FROM events RETURNING id, title, status, source_id;

-- Reset all import sources so they don't think they've run recently
UPDATE event_sources SET last_run_at = NULL;

-- Inspect the RETURNING rows above. If you're sure:
--   COMMIT;
-- Otherwise:
ROLLBACK;
