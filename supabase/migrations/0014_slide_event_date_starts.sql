-- Daily-slide function: re-points every event's denormalised date_start /
-- date_end / has_time at its soonest-future active occurrence.
--
-- Called from /api/cron/import after the import pass finishes. Without this,
-- an event's cached date_start could point at a past occurrence in the 24
-- hours between importer runs (only re-touched events get their cache
-- refreshed by the importer itself).
--
-- Events with NO future occurrence are left alone — the cache stays pointing
-- at the last past occurrence so they correctly appear in the archive.
-- Events with no occurrences at all (legacy or anomaly) are also left alone.

CREATE OR REPLACE FUNCTION slide_event_date_starts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH next_occ AS (
    SELECT DISTINCT ON (event_id)
      event_id,
      starts_at,
      ends_at,
      has_time
    FROM event_occurrences
    WHERE status = 'active'
      AND starts_at >= NOW()
    ORDER BY event_id, starts_at ASC
  )
  UPDATE events e
  SET date_start = n.starts_at,
      date_end   = n.ends_at,
      has_time   = n.has_time
  FROM next_occ n
  WHERE e.id = n.event_id
    AND e.deleted_at IS NULL
    AND (e.date_start IS DISTINCT FROM n.starts_at
      OR e.date_end   IS DISTINCT FROM n.ends_at
      OR e.has_time   IS DISTINCT FROM n.has_time);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION slide_event_date_starts() IS
  'Slides events.date_start to the soonest-future occurrence. Called from the daily import cron. Returns the number of rows updated.';
