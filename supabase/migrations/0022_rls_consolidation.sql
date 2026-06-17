-- ============================================================================
-- 0022_rls_consolidation.sql — close two privilege bypasses and remove
-- redundant/loose policies surfaced by the 0000 baseline snapshot.
--
--   1. profiles self-update of privileged columns: "Users can update own
--      profile" is USING (auth.uid()=id) with NO WITH CHECK and no column
--      restriction. 0020's trigger blocked self-`role` changes; this extends
--      it so a non-staff user also cannot self-grant a paid `subscription_tier`,
--      raise their own `max_active_events`, or clear their own `suspended_at` /
--      `deleted_at` (self-un-suspend / self-undelete).
--
--   2. events self-undelete: "Users can update own events" is USING
--      (auth.uid()=organizer_id) with NO WITH CHECK and no deleted_at guard.
--      Under RLS OR-semantics it overrides the stricter events_owner_update,
--      letting an owner set deleted_at = NULL to resurrect an event an admin
--      soft-deleted. We drop it; events_owner_update (which guards
--      deleted_at IS NULL in both USING and WITH CHECK) becomes the sole
--      owner-update path. Editing live/draft events and soft-deleting drafts
--      still work via events_owner_update + "Users can soft delete own drafts".
--
--   3. Redundant policy cleanup (no behavioural change under OR-semantics):
--      duplicate events SELECT and legacy admin-only / duplicate tags policies.
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- Depends on is_super_admin() (0001) and is_admin_or_super_admin() (0011).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the profiles guard to all privileged columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Privileged server contexts (service-role key, SQL editor) — billing
  -- webhooks, the suspend RPCs, and the first super_admin bootstrap.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Role changes.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'forbidden: cannot change your own role';
    END IF;
    IF NOT public.is_admin_or_super_admin() THEN
      RAISE EXCEPTION 'forbidden: insufficient privilege to change role';
    END IF;
    IF (NEW.role IN ('admin', 'super_admin') OR OLD.role IN ('admin', 'super_admin'))
       AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'forbidden: only a super_admin may manage admin roles';
    END IF;
  END IF;

  -- Non-staff may not self-grant a paid tier, raise their own event limit, or
  -- clear their own suspension / soft-delete flag on their own row.
  IF NEW.id = auth.uid() AND NOT public.is_admin_or_super_admin() THEN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.max_active_events IS DISTINCT FROM OLD.max_active_events
       OR NEW.suspended_at     IS DISTINCT FROM OLD.suspended_at
       OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'forbidden: cannot modify account tier, limits, or status';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_profile_role_change ON public.profiles;
CREATE TRIGGER enforce_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_change();

-- ---------------------------------------------------------------------------
-- 2. Events: drop the loose owner-update policy + the duplicate owner-select.
--    events_owner_update (deleted_at-guarded) remains the owner-update path.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own events" ON public.events;
DROP POLICY IF EXISTS "Users can see own events"    ON public.events;

-- ---------------------------------------------------------------------------
-- 3. Tags: drop legacy admin-only writes (superseded by tags_admin_*, which
--    also cover super_admin) and the duplicate public-read.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can create tags" ON public.tags;
DROP POLICY IF EXISTS "Admins can update tags" ON public.tags;
DROP POLICY IF EXISTS "Admins can delete tags" ON public.tags;
DROP POLICY IF EXISTS "Tags are public"        ON public.tags;

-- ---------------------------------------------------------------------------
-- 4. Refresh PostgREST schema cache.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
