-- ============================================================================
-- 0000_baseline.sql — REFERENCE SNAPSHOT of the live RLS policies on the
-- `public` schema, captured 2026-06-17 (before migration 0022).
--
-- ⚠️  REFERENCE ONLY — DO NOT paste-run this as a migration. The policies
--     below already exist in the live DB, and the underlying tables/types/
--     functions are not reproduced here, so it is neither idempotent nor
--     standalone-replayable. Its purpose is to put the security boundary
--     (the RLS policies) under version control so future changes are
--     reviewable in diffs. For a complete, replayable schema dump use the
--     Supabase CLI: `supabase db dump --schema public -f <file>`.
--
-- Generated from pg_policies via the SQL editor. Migrations 0001+ ALTER the
-- base schema that predates this repo (created in the Supabase dashboard).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- block_pages
-- ---------------------------------------------------------------------------
CREATE POLICY block_pages_super_admin_all ON public.block_pages AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- event_images
-- ---------------------------------------------------------------------------
CREATE POLICY "Event images are public" ON public.event_images AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY "Event owners can delete images" ON public.event_images AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1 FROM events
    WHERE ((events.id = event_images.event_id) AND (events.organizer_id = auth.uid())))));

CREATE POLICY "Event owners can manage images" ON public.event_images AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM events
    WHERE ((events.id = event_images.event_id) AND (events.organizer_id = auth.uid())))));

-- ---------------------------------------------------------------------------
-- event_occurrences
-- ---------------------------------------------------------------------------
CREATE POLICY occ_select_admin ON public.event_occurrences AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM profiles p
    WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY occ_select_owner ON public.event_occurrences AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM events e
    WHERE ((e.id = event_occurrences.event_id) AND (e.organizer_id = auth.uid())))));

CREATE POLICY occ_select_public ON public.event_occurrences AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM events e
    WHERE ((e.id = event_occurrences.event_id) AND (e.status = 'approved'::event_status) AND (e.deleted_at IS NULL)))));

CREATE POLICY occ_write_admin ON public.event_occurrences AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1 FROM profiles p
    WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM profiles p
    WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY occ_write_owner ON public.event_occurrences AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1 FROM events e
    WHERE ((e.id = event_occurrences.event_id) AND (e.organizer_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM events e
    WHERE ((e.id = event_occurrences.event_id) AND (e.organizer_id = auth.uid())))));

-- ---------------------------------------------------------------------------
-- event_sources
-- ---------------------------------------------------------------------------
CREATE POLICY event_sources_super_admin_all ON public.event_sources AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- events
-- NOTE (see 0022): "Users can update own events" has no WITH CHECK and does
-- not guard deleted_at — it is looser than events_owner_update and, under
-- RLS OR-semantics, lets an owner clear deleted_at to resurrect an
-- admin-soft-deleted event. Consolidated in 0022.
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins can see all events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY "Admins can update any event" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY "Approved events are public" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING (((status = 'approved'::event_status) AND (deleted_at IS NULL)));

CREATE POLICY "Authenticated users can create events" ON public.events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = organizer_id));

CREATE POLICY "Users can see own events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = organizer_id));

CREATE POLICY "Users can soft delete own drafts" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING (((auth.uid() = organizer_id) AND (status = ANY (ARRAY['draft'::event_status, 'pending_review'::event_status]))));

CREATE POLICY "Users can update own events" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = organizer_id));

CREATE POLICY events_owner_select ON public.events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organizer_id = auth.uid()));

CREATE POLICY events_owner_update ON public.events AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((organizer_id = auth.uid()) AND (deleted_at IS NULL)))
  WITH CHECK (((organizer_id = auth.uid()) AND (deleted_at IS NULL)));

-- ---------------------------------------------------------------------------
-- faq_items
-- ---------------------------------------------------------------------------
CREATE POLICY faq_items_public_read ON public.faq_items AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((enabled = true));

CREATE POLICY faq_items_super_admin_all ON public.faq_items AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- import_runs
-- ---------------------------------------------------------------------------
CREATE POLICY import_runs_super_admin_all ON public.import_runs AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- leads / lead_history (CRM)
-- ---------------------------------------------------------------------------
CREATE POLICY lead_history_super_admin_read ON public.lead_history AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY leads_super_admin_all ON public.leads AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- NOTE (see 0020 + 0022): "Users can update own profile" has no WITH CHECK
-- and no column restriction. 0020 added a trigger blocking self-role-change;
-- 0022 extends it to subscription_tier / max_active_events / suspended_at /
-- deleted_at (self-grant of paid tier, higher limits, or self-un-suspend).
-- "Public profiles are viewable" USING(true) exposes PII — anon column access
-- was restricted in 0021; the authenticated cross-user read remains a residual.
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM profiles profiles_1
    WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY "Public profiles are viewable" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

-- ---------------------------------------------------------------------------
-- saved_events
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can save events" ON public.saved_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can see own saves" ON public.saved_events AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

CREATE POLICY "Users can unsave events" ON public.saved_events AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

-- ---------------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------------
CREATE POLICY site_settings_super_admin_all ON public.site_settings AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------------
-- tags
-- NOTE (see 0022): the legacy role='admin'-only INSERT/UPDATE/DELETE policies
-- and the duplicate public-read policy are redundant with tags_admin_* /
-- tags_public_read (OR-semantics). Consolidated in 0022.
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins can create tags" ON public.tags AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Admins can delete tags" ON public.tags AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Admins can update tags" ON public.tags AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Tags are public" ON public.tags AS PERMISSIVE FOR SELECT TO public
  USING (true);

CREATE POLICY tags_admin_delete ON public.tags AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY tags_admin_insert ON public.tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY tags_admin_update ON public.tags AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))))
  WITH CHECK ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'super_admin'::user_role]))))));

CREATE POLICY tags_public_read ON public.tags AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- End of snapshot.
-- ---------------------------------------------------------------------------
