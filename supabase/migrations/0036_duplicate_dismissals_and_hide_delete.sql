-- ============================================================================
-- 0036_duplicate_dismissals_and_hide_delete.sql
--
-- Two changes, bundled because they came out of the same /admin/duplicates
-- (app/admin/duplicates/page.tsx) bugfix pass:
--
--   1. event_duplicate_dismissals — lets an admin mark a specific pair of
--      events as "not duplicates" so the fuzzy title/date matcher stops
--      re-flagging that exact pair on every visit. Scoped to a pair, not a
--      whole group: if either event later fuzzy-matches a *third*, new
--      event, that new pair still surfaces normally.
--
--   2. super_admin_delete_event(bigint) — was a true `DELETE FROM events`
--      (0033). Deleting a duplicate this way erased `deleted_at` along with
--      the row, so lib/importers/pipeline.ts's dedup check
--      (`existing.deleted_at` → skip re-import) had nothing to find, and the
--      next adapter run reinserted the "deleted" event from scratch.
--      Redefined to soft-delete (set deleted_at), same as every other
--      delete path in this app, so the pipeline's existing skip logic
--      actually applies. Child-row cleanup (saved_events/event_images/
--      event_occurrences) is no longer needed since the row itself is kept.
--      No hard-delete is exposed in the UI anymore; use the SQL editor
--      directly for a genuine purge (GDPR, spam) if ever needed.
--
-- Depends on is_admin_or_super_admin() (0011), is_super_admin() (0001).
-- Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. event_duplicate_dismissals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_duplicate_dismissals (
  event_id_a   bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_id_b   bigint NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id_a, event_id_b),
  CONSTRAINT event_duplicate_dismissals_ordered CHECK (event_id_a < event_id_b)
);

ALTER TABLE public.event_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_duplicate_dismissals_admin_all ON public.event_duplicate_dismissals;
CREATE POLICY event_duplicate_dismissals_admin_all ON public.event_duplicate_dismissals
  FOR ALL TO authenticated
  USING      (public.is_admin_or_super_admin())
  WITH CHECK (public.is_admin_or_super_admin());

-- ---------------------------------------------------------------------------
-- 2. super_admin_delete_event — hide (soft-delete) instead of hard-delete.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_delete_event(event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can delete events'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.events
  SET deleted_at = now()
  WHERE events.id = super_admin_delete_event.event_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_delete_event(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_event(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
