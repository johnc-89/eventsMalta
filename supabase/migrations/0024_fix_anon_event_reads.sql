-- ============================================================================
-- 0024_fix_anon_event_reads.sql — restore public (anon) visibility of events.
--
-- REGRESSION (introduced by 0021): 0021 revoked anon's table-level SELECT on
-- public.profiles, re-granting only (id, display_name, avatar_url). But several
-- RLS policies on events / event_occurrences are FOR SELECT / FOR ALL TO public
-- and evaluate an inline `EXISTS (SELECT 1 FROM profiles WHERE ... role ...)`.
--
-- When an anonymous visitor runs `SELECT * FROM events`, the planner must
-- evaluate EVERY applicable permissive policy — including the admin one — before
-- OR-combining them. Since anon no longer holds privilege on profiles.role, the
-- whole query aborts with `42501 permission denied for table profiles`, so the
-- public events list / detail / occurrence reads return NOTHING for logged-out
-- visitors. (tags was unaffected: its admin policies use the SECURITY DEFINER
-- is_super_admin() helper, which bypasses caller column grants.)
--
-- FIX: scope the staff-only policies TO authenticated. An admin/super_admin is
-- always authenticated, so the admin experience is unchanged — but anon no
-- longer evaluates any policy that touches profiles. Anon now reads approved
-- events solely via "Approved events are public" / occ_select_public, which
-- reference only events columns anon is granted. The USING expressions are
-- otherwise identical to the 0000 baseline; only the grantee role narrows.
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- events: admin all-events read (the policy that breaks anon SELECT).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can see all events" ON public.events;
CREATE POLICY "Admins can see all events" ON public.events
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM public.profiles
    WHERE ((profiles.id = auth.uid())
       AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))));

-- ---------------------------------------------------------------------------
-- event_occurrences: admin read + admin write (FOR ALL also applies to SELECT,
-- so both reference profiles during an anon read). Scope both to authenticated.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS occ_select_admin ON public.event_occurrences;
CREATE POLICY occ_select_admin ON public.event_occurrences
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1 FROM public.profiles p
    WHERE ((p.id = auth.uid())
       AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))));

DROP POLICY IF EXISTS occ_write_admin ON public.event_occurrences;
CREATE POLICY occ_write_admin ON public.event_occurrences
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1 FROM public.profiles p
    WHERE ((p.id = auth.uid())
       AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM public.profiles p
    WHERE ((p.id = auth.uid())
       AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role])))));

-- ---------------------------------------------------------------------------
-- Refresh PostgREST schema cache so the policy changes take effect now.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done. Verify as anon: `SELECT id FROM events WHERE status='approved' LIMIT 1`
-- should now return a row instead of 42501.
-- ---------------------------------------------------------------------------
