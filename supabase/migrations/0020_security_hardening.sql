-- ============================================================================
-- 0020_security_hardening.sql — DB-level enforcement of two trust boundaries
-- that were previously only enforced in client code:
--
--   1. Event moderation: a non-staff user could PATCH their own event's
--      `status` to 'approved' directly via PostgREST, bypassing the review
--      queue (the events_owner_update policy in 0006 does not constrain
--      `status`). We add a BEFORE INSERT/UPDATE trigger that forces a safe
--      status for non-staff and blocks transitions into approved/rejected.
--
--   2. Role escalation: roles are changed from the client with a plain
--      `profiles.update({ role })`. If the (un-versioned) profiles UPDATE
--      policy is permissive, any user could set their own role to
--      super_admin. We add a BEFORE UPDATE trigger that blocks self-role
--      changes, restricts role changes to staff, and limits granting/revoking
--      admin & super_admin to super_admins only.
--
-- Both triggers are SECURITY DEFINER (so they can read profiles.role despite
-- RLS) and bypass enforcement when there is no authenticated user
-- (auth.uid() IS NULL) — that path is the service-role key and the Supabase
-- SQL editor, which are already privileged (and is how the first super_admin
-- is bootstrapped).
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- Depends on is_super_admin() (0001) and is_admin_or_super_admin() (0011).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Events: enforce status by caller role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_event_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  caller_role text;
BEGIN
  -- Privileged server contexts (service-role key, SQL editor, importer
  -- pipeline) have no JWT subject — leave their writes untouched.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff may set any status (approve/reject/cancel from the admin queue).
  IF public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  -- trusted_uploader submissions auto-approve by policy — allow 'approved'.
  IF caller_role = 'trusted_uploader' THEN
    RETURN NEW;
  END IF;

  -- Regular users: never let them publish or reject their own events.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'pending_review') THEN
      NEW.status := 'pending_review';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Block transitioning INTO approved/rejected; keep the prior status.
    -- (Editing an already-approved event keeps status='approved', which is
    -- allowed because OLD.status = NEW.status — no transition.)
    IF NEW.status IN ('approved', 'rejected')
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_event_status ON public.events;
CREATE TRIGGER enforce_event_status
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_status();

-- ---------------------------------------------------------------------------
-- 2. Profiles: enforce who may change the `role` column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- No role change → nothing to enforce (display_name, suspend, etc.).
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Privileged server contexts (service-role key, SQL editor) have no JWT —
  -- this is also how the first super_admin is bootstrapped.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Nobody may change their own role (blocks self-escalation).
  IF NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot change your own role';
  END IF;

  -- Only staff may change anyone's role.
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'forbidden: insufficient privilege to change role';
  END IF;

  -- Granting OR revoking admin/super_admin requires super_admin.
  IF (NEW.role IN ('admin', 'super_admin') OR OLD.role IN ('admin', 'super_admin'))
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: only a super_admin may manage admin roles';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_profile_role_change ON public.profiles;
CREATE TRIGGER enforce_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_change();

-- ---------------------------------------------------------------------------
-- 3. Refresh PostgREST schema cache.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
