-- ============================================================================
-- 0034_event_claims.sql — let verified users "claim" an event
--
-- A signed-up user who has been marked `is_verified` (by an admin/super_admin)
-- can claim an approved event. Claiming is *attribution only*: it sets
-- events.claimed_by → the caller and stamps claimed_at. It does NOT change
-- organizer_id, edit rights, or the event cap. The public event page then shows
-- a "Claimed by …" marker linking to /organisers/<id>, a public organiser page.
--
-- Why RPCs: a non-owner cannot UPDATE events directly (events RLS + the 0020
-- status trigger block it), so claiming/unclaiming go through SECURITY DEFINER
-- functions — same pattern as super_admin_delete_event (0033) and
-- increment_view_count (0026). Verification is guarded so users can't self-set
-- is_verified (extends the 0020/0022 profiles trigger).
--
-- Depends on is_admin_or_super_admin() (0011).
-- Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Block non-staff from self-toggling is_verified (extend the 0022 trigger).
--    Everything else in the function is carried over verbatim from 0022.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

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

  -- Non-staff may not self-grant a paid tier, raise their own event limit,
  -- clear their own suspension / soft-delete flag, or self-verify.
  IF NEW.id = auth.uid() AND NOT public.is_admin_or_super_admin() THEN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
       OR NEW.max_active_events IS DISTINCT FROM OLD.max_active_events
       OR NEW.suspended_at     IS DISTINCT FROM OLD.suspended_at
       OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
       OR NEW.is_verified      IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'forbidden: cannot modify account tier, limits, or status';
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- 3. claim_event — a verified user claims an unclaimed approved event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_event(p_event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_verified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden: must be logged in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT is_verified INTO v_verified
  FROM public.profiles
  WHERE id = v_uid AND suspended_at IS NULL AND deleted_at IS NULL;

  IF NOT COALESCE(v_verified, false) THEN
    RAISE EXCEPTION 'forbidden: only verified organisers can claim events'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.events
  SET claimed_by = v_uid, claimed_at = now()
  WHERE id = p_event_id
    AND status = 'approved'
    AND deleted_at IS NULL
    AND claimed_by IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not available to claim (missing, unapproved, or already claimed)';
  END IF;

  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 4. unclaim_event — the current claimant (or any admin) releases a claim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unclaim_event(p_event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden: must be logged in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.events
  SET claimed_by = NULL, claimed_at = NULL
  WHERE id = p_event_id
    AND (claimed_by = v_uid OR public.is_admin_or_super_admin());

  RETURN FOUND;
END $$;

-- ---------------------------------------------------------------------------
-- 5. get_public_organiser — safe public fields for a verified organiser only.
--    Used by the /organisers/<id> server page (anon key), avoiding a change to
--    the 0021 anon column grant. Hides non-verified / suspended / deleted rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_organiser(p_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  bio text,
  is_verified boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.bio, p.is_verified
  FROM public.profiles p
  WHERE p.id = p_id
    AND p.is_verified = true
    AND p.suspended_at IS NULL
    AND p.deleted_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_event(bigint)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unclaim_event(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_event(bigint)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.unclaim_event(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_organiser(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
