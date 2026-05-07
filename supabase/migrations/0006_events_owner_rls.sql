-- ============================================================================
-- 0006_events_owner_rls.sql — let organisers UPDATE their own events
-- The /events/[slug]/edit page lets users edit events they organised, but
-- the RLS policies on `events` may not include an organiser-write policy.
-- This migration adds idempotent policies so organisers can SELECT and
-- UPDATE their own (non-deleted) events. Existing admin/super-admin
-- policies are not touched.
-- ============================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Organisers can read their own events (incl. drafts/rejected/etc.)
DROP POLICY IF EXISTS events_owner_select ON public.events;
CREATE POLICY events_owner_select ON public.events
  FOR SELECT TO authenticated
  USING (organizer_id = auth.uid());

-- Organisers can update their own events as long as they aren't soft-deleted.
-- The form blocks editing of cancelled / past events at the page level.
DROP POLICY IF EXISTS events_owner_update ON public.events;
CREATE POLICY events_owner_update ON public.events
  FOR UPDATE TO authenticated
  USING      (organizer_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (organizer_id = auth.uid() AND deleted_at IS NULL);

-- Refresh PostgREST schema cache so the new policies take effect immediately.
NOTIFY pgrst, 'reload schema';
