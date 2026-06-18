-- ============================================================================
-- Diagnose: why does approving an event silently revert to pending_review?
-- Run each block in the Supabase SQL editor and read the comments.
-- ============================================================================

-- 1. Confirm YOUR profile role is actually admin/super_admin in the DB.
--    (Replace the email if different.) If role is NOT 'admin'/'super_admin',
--    that is the bug — fix it and stop here.
SELECT id, email, role, deleted_at
FROM public.profiles
WHERE email = 'johnc@ecabstech.com';

-- 2. Does the staff-check function exist, and what does it actually contain?
--    The enforce_event_status trigger reverts status whenever this returns
--    false. It must read public.profiles and match role IN ('admin','super_admin').
SELECT proname,
       prosecdef                AS is_security_definer,
       pg_get_functiondef(oid)  AS definition
FROM pg_proc
WHERE proname IN ('is_admin_or_super_admin', 'enforce_event_status', 'get_my_profile');

-- 3. Is the trigger actually attached and enabled on events?
--    tgenabled = 'O' (origin/enabled) is normal; 'D' = disabled.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.events'::regclass
  AND NOT tgisinternal;

-- 4. List every UPDATE policy on events with its USING + WITH CHECK expressions.
--    Confirm events_admin_update (or "Admins can update any event") is present.
SELECT polname,
       polcmd,
       pg_get_expr(polqual,      polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.events'::regclass
ORDER BY polname;

-- 5. CRITICAL — does is_admin_or_super_admin() see the function owner as the
--    SECURITY DEFINER role, and can it read profiles? Check the function owner
--    has rights. (Returns the owning role; should be a superuser-ish role like
--    postgres / supabase_admin that bypasses RLS.)
SELECT p.proname, r.rolname AS owner, r.rolsuper, r.rolbypassrls
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN ('is_admin_or_super_admin', 'enforce_event_status');

-- ============================================================================
-- Most likely findings & fixes:
--
-- A) Your profile.role isn't admin/super_admin (block 1) → fix the row:
--      UPDATE public.profiles SET role = 'super_admin'
--      WHERE email = 'johnc@ecabstech.com';
--    (Runs as service role in the SQL editor → auth.uid() is NULL → bypasses
--     the enforce_profile_role_change guard, so this is allowed here.)
--
-- B) is_admin_or_super_admin() or enforce_event_status is missing / an old
--    version (block 2 empty or differs) → re-run migration 0011 then 0020.
--
-- C) The trigger is disabled or duplicated (block 3) → re-run 0020.
--
-- D) is_admin_or_super_admin owner lacks rolbypassrls AND there's a restrictive
--    SELECT policy on profiles (block 5) → the SECURITY DEFINER read of profiles
--    returns no row, so the function returns false. Re-create the function with
--    an explicit search_path and ensure it's owned by a privileged role.
-- ============================================================================
