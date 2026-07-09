-- ============================================================================
-- 0033_fix_super_admin_delete_event.sql — repair the super-admin hard-delete RPC
--
-- Background: components/SuperAdminDeleteButton.tsx calls
--   supabase.rpc('super_admin_delete_event', { event_id })
-- and expects a BOOLEAN back (true = deleted, false = not found). The RPC has
-- only ever existed in the Supabase dashboard — it was never checked into a
-- migration (0011 merely *mentions* it in a comment). It could break two ways:
--
--   1. A plain `DELETE FROM events` throws a foreign-key violation when the
--      event still has child rows in saved_events / event_images (only
--      event_occurrences is declared ON DELETE CASCADE, in 0013), so the
--      button reports "Could not delete: ...foreign key constraint...".
--   2. If the function RETURNS void, supabase-js hands the button `data = null`,
--      so its `if (!data)` guard shows "Event not found or already deleted."
--      even on a successful delete.
--
-- This migration (re)defines the function authoritatively: SECURITY DEFINER so
-- it bypasses RLS, a super_admin guard, explicit child-row cleanup so the hard
-- delete can never trip an FK, and a BOOLEAN return the client already expects.
--
-- Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- DROP first: CREATE OR REPLACE cannot change a function's return type, and the
-- live copy's return type is unknown. Signature is (event_id bigint).
DROP FUNCTION IF EXISTS public.super_admin_delete_event(bigint);

CREATE FUNCTION public.super_admin_delete_event(event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can delete events'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Remove child rows first so the hard delete can't fail on a foreign key.
  -- event_occurrences already cascades (0013) but is included for safety.
  DELETE FROM public.saved_events      WHERE saved_events.event_id      = super_admin_delete_event.event_id;
  DELETE FROM public.event_images      WHERE event_images.event_id      = super_admin_delete_event.event_id;
  DELETE FROM public.event_occurrences WHERE event_occurrences.event_id = super_admin_delete_event.event_id;

  DELETE FROM public.events WHERE events.id = super_admin_delete_event.event_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_delete_event(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_delete_event(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
