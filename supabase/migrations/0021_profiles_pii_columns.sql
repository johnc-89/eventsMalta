-- ============================================================================
-- 0021_profiles_pii_columns.sql — stop anonymous harvesting of profile PII
--
-- The "Public profiles are viewable" SELECT policy is USING (true) for the
-- `public` grantee (which includes anonymous visitors), and the default table
-- grant exposes every column — so anyone with the anon key can run
-- `from('profiles').select('email,phone')` and dump every user's email/phone.
--
-- The only legitimate anonymous read of profiles is the organizer embed on the
-- public event page (`organizer:profiles!...(display_name, avatar_url)`), so we
-- revoke anon's blanket column access and re-grant only the columns that embed
-- needs (id is required as the FK join key). RLS (USING true) is unchanged;
-- column grants now gate which columns anon can actually read.
--
-- Authenticated reads are intentionally left unchanged here: auth-context reads
-- the owner's own row (incl. phone), the owner profile page shows it, and admin
-- tooling reads emails via the SECURITY DEFINER RPCs (admin_list_profiles /
-- admin_get_user_email). Closing cross-user PII reads for *authenticated* users
-- as well requires routing own-profile reads through a SECURITY DEFINER RPC and
-- restricting authenticated columns the same way — deferred as a follow-up.
--
-- Idempotent. Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================================

REVOKE SELECT ON public.profiles FROM anon;
GRANT  SELECT (id, display_name, avatar_url) ON public.profiles TO anon;

-- Refresh PostgREST schema cache so column privileges take effect now.
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
