-- ============================================================================
-- 0011_events_admin_rls.sql — let admins & super_admins UPDATE any event
--
-- Background: the /events/[slug]/edit page already lets staff (admin OR
-- super_admin) reach the edit form, and SUPER_ADMIN_GUIDE.html documents
-- "Edit any event" as available to both roles. But migration 0006 only
-- granted UPDATE to the event's organiser — so when staff clicked Save,
-- RLS silently dropped the write and the form appeared to "do nothing".
--
-- This migration closes that gap by adding `events_admin_update`. It runs
-- alongside the existing `events_owner_update` policy (RLS policies are
-- OR'd together — either is sufficient for the write to succeed).
--
-- Also adds `events_admin_select` so admins can read events they don't own
-- (e.g. drafts, rejected, cancelled) when moderating. There's almost
-- certainly an equivalent policy from the initial schema setup; DROP IF
-- EXISTS makes this idempotent regardless.
--
-- Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: is the caller `admin` or `super_admin`?
--    Parallel to is_super_admin() from 0001_crm.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. RLS — staff can UPDATE any non-deleted event.
--    Hard-deleted events stay off-limits to UPDATE; use the existing
--    super_admin_delete_event RPC for destructive actions.
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_admin_update ON public.events;
CREATE POLICY events_admin_update ON public.events
  FOR UPDATE TO authenticated
  USING      (public.is_admin_or_super_admin() AND deleted_at IS NULL)
  WITH CHECK (public.is_admin_or_super_admin() AND deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- 3. RLS — staff can SELECT any event (incl. drafts/rejected/cancelled).
--    Without this the admin queue and the staff-edit pre-load can't read
--    events they don't own. The existing organiser+public SELECT policies
--    are unaffected.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS events_admin_select ON public.events;
CREATE POLICY events_admin_select ON public.events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_super_admin());

-- ---------------------------------------------------------------------------
-- 4. Refresh PostgREST schema cache so the new policies take effect now.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
