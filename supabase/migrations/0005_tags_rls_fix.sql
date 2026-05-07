-- ============================================================================
-- 0005_tags_rls_fix.sql — Restore admin write access to the `tags` table
-- The Manage Tags admin page was failing with:
--   "new row violates row-level security policy for table tags"
-- because no INSERT policy existed for admins. This migration adds the
-- read + write policies in an idempotent way (safe to re-run).
-- ============================================================================

-- Make sure RLS is on (no-op if already enabled)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Public read — anyone can see the tag list (used by event submission forms)
DROP POLICY IF EXISTS tags_public_read ON public.tags;
CREATE POLICY tags_public_read ON public.tags
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin / super_admin can insert
DROP POLICY IF EXISTS tags_admin_insert ON public.tags;
CREATE POLICY tags_admin_insert ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Admin / super_admin can update
DROP POLICY IF EXISTS tags_admin_update ON public.tags;
CREATE POLICY tags_admin_update ON public.tags
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Admin / super_admin can delete
DROP POLICY IF EXISTS tags_admin_delete ON public.tags;
CREATE POLICY tags_admin_delete ON public.tags
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- Refresh PostgREST schema cache so the new policies take effect immediately
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
