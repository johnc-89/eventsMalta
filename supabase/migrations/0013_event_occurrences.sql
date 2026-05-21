-- Proper recurring-event model.
--
-- An event can have many occurrences (one row per date the event runs).
-- `events.date_start` / `events.date_end` remain as a denormalised cache of
-- the NEXT upcoming occurrence — this keeps existing list/filter/search code
-- working without modification while letting the detail page render the full
-- schedule.
--
-- The importer pipeline writes occurrences for every imported event (the
-- existing single-date adapters yield one occurrence; heritagemalta/visitmalta
-- can yield many). User-submitted events get one occurrence each unless the
-- create form is later extended to multi-date.

CREATE TABLE event_occurrences (
  id         BIGSERIAL PRIMARY KEY,
  event_id   BIGINT      NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ,
  has_time   BOOLEAN     NOT NULL DEFAULT true,
  status     TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, starts_at)
);

CREATE INDEX event_occurrences_event_idx   ON event_occurrences(event_id);
CREATE INDEX event_occurrences_starts_idx  ON event_occurrences(starts_at);

COMMENT ON TABLE  event_occurrences IS
  'One row per occurrence of an event. events.date_start is a denormalised cache of the next upcoming row here.';
COMMENT ON COLUMN event_occurrences.status IS
  'active | cancelled — a cancelled occurrence is hidden from the public schedule but kept for audit.';

-- ---------------------------------------------------------------------------
-- RLS — public can read occurrences of approved events; owners can read
-- their own; admins/super_admins can read everything. Writes restricted to
-- event owners + admins (mirrors events.RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE event_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY occ_select_public ON event_occurrences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_occurrences.event_id
        AND e.status = 'approved'
        AND e.deleted_at IS NULL
    )
  );

CREATE POLICY occ_select_owner ON event_occurrences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_occurrences.event_id
        AND e.organizer_id = auth.uid()
    )
  );

CREATE POLICY occ_select_admin ON event_occurrences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY occ_write_owner ON event_occurrences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_occurrences.event_id
        AND e.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_occurrences.event_id
        AND e.organizer_id = auth.uid()
    )
  );

CREATE POLICY occ_write_admin ON event_occurrences
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: seed event_occurrences from existing events.date_start so the
-- detail page works for already-imported events without re-running the cron.
-- Idempotent — uses ON CONFLICT DO NOTHING via the UNIQUE constraint.
-- ---------------------------------------------------------------------------
INSERT INTO event_occurrences (event_id, starts_at, ends_at, has_time, status)
SELECT id, date_start, date_end, has_time, 'active'
FROM events
WHERE deleted_at IS NULL
ON CONFLICT (event_id, starts_at) DO NOTHING;
