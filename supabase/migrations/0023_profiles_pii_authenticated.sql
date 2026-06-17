-- ============================================================================
-- 0023_profiles_pii_authenticated.sql — stop cross-user PII reads by logged-in
-- users (the residual after 0021, which only covered anon).
--
-- `Public profiles are viewable` is USING (true), so any *authenticated* user
-- could still `from('profiles').select('email,phone')` and read every other
-- user's contact details. We revoke those two columns from the `authenticated`
-- grant (anon was already restricted in 0021). The owner still needs their own
-- phone, so it's served by a SECURITY DEFINER RPC scoped to auth.uid().
--
-- Email is unaffected in app code — auth-context already sources the owner's
-- email from the session (auth.users), not this table. Admin tooling reads
-- other users' emails via the existing SECURITY DEFINER RPCs (admin_list_
-- profiles / admin_get_user_email), which bypass column grants.
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Owner-scoped full-profile reader (returns only the caller's own row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Remove email/phone from the authenticated SELECT grant. Other columns
--    (role, display_name, etc.) stay readable — many API routes read the
--    caller's own `role`, and the organizer embed reads display_name/avatar.
-- ---------------------------------------------------------------------------
REVOKE SELECT (email, phone) ON public.profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Refresh PostgREST schema cache.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
