-- Wipe imported events per adapter, so you can re-run each importer from a clean slate.
-- Run blocks one at a time in the Supabase SQL editor.
--
-- Notes:
--   * Hard delete: rows in `events` are removed; `event_occurrences` cascades.
--   * `event_sources.last_run_at` is cleared so the next run isn't skipped by any
--     adapter-side "recently run" guard.
--   * Each block runs inside a transaction with a final SELECT so you can review
--     what would be deleted *before* committing. Replace ROLLBACK with COMMIT
--     when you're happy.

-- ---------------------------------------------------------------------------
-- 0. Sanity check — list adapters and how many live events each has.
-- ---------------------------------------------------------------------------
SELECT s.adapter,
       s.id  AS source_id,
       COUNT(e.id) FILTER (WHERE e.deleted_at IS NULL) AS live_events,
       COUNT(e.id)                                     AS total_events
FROM event_sources s
LEFT JOIN events e ON e.source_id = s.id
GROUP BY s.adapter, s.id
ORDER BY s.adapter;

-- ---------------------------------------------------------------------------
-- TEMPLATE: wipe ONE adapter. Duplicate this block per adapter you want to clear.
-- Change the adapter string on the WITH line.
-- ---------------------------------------------------------------------------
BEGIN;

WITH src AS (SELECT id FROM event_sources WHERE adapter = 'teatrumanoel')
DELETE FROM events
WHERE source_id IN (SELECT id FROM src)
RETURNING id, title, date_start;

-- Clear the source's last_run_at so re-import isn't throttled
UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'teatrumanoel';

-- Inspect the RETURNING output above. If it looks right:
--   COMMIT;
-- Otherwise:
ROLLBACK;

-- ---------------------------------------------------------------------------
-- Pre-baked blocks for the 8 implemented adapters. Uncomment one at a time.
-- ---------------------------------------------------------------------------

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'teatrumanoel')        RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'teatrumanoel';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'tsmalta')             RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'tsmalta';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'popp')                RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'popp';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'heritagemalta')       RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'heritagemalta';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'esplora')             RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'esplora';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'festivals_mt')        RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'festivals_mt';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'visitmalta')          RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'visitmalta';
-- COMMIT;

-- BEGIN;
-- DELETE FROM events WHERE source_id = (SELECT id FROM event_sources WHERE adapter = 'maltaartisanmarkets') RETURNING id, title;
-- UPDATE event_sources SET last_run_at = NULL WHERE adapter = 'maltaartisanmarkets';
-- COMMIT;

-- ---------------------------------------------------------------------------
-- DANGER: wipe orphaned events (source_id IS NULL).
-- This will ALSO delete user-submitted events. Only run if you're sure there are
-- no user submissions worth keeping. The preview SELECT shows what would go.
-- ---------------------------------------------------------------------------
-- SELECT id, title, status, user_id, date_start
-- FROM events
-- WHERE source_id IS NULL
-- ORDER BY created_at DESC;

-- BEGIN;
-- DELETE FROM events WHERE source_id IS NULL RETURNING id, title, user_id;
-- ROLLBACK;  -- swap to COMMIT once you've reviewed
