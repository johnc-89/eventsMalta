-- 0031_enforce_event_cap.sql
--
-- Security fix (High): `max_active_events` was enforced in the UI only. The
-- events INSERT policy is just `auth.uid() = organizer_id`, so any user could
-- insert unlimited events via the API — and a `trusted_uploader` (whose
-- submissions auto-approve) could flood the PUBLIC listings directly.
--
-- This adds a BEFORE INSERT trigger that counts a user's active events and
-- rejects the insert once they hit their profile's `max_active_events`.
--
-- Semantics (agreed):
--   * "Active" = status IN ('draft','pending_review','approved') AND not soft-
--     deleted. `rejected` and `cancelled` events do NOT count.
--   * admin / super_admin are exempt.
--   * NULL max_active_events is treated as unlimited (defensive).
--   * The importer inserts under the aggregator account (a trusted_uploader);
--     we raise that one account's cap so imports never trip the trigger.
--
-- SECURITY DEFINER so the function can read `profiles` regardless of the
-- caller's RLS grants (anon/authenticated inserts, service-role imports) —
-- the same pattern used by is_admin_or_super_admin() to avoid the 42501
-- "permission denied for table profiles" class of bug (see 0024/0026).
--
-- Note: this only fires on INSERT. Users already over their limit keep their
-- existing events; they just can't add new ones until they're back under it.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_event_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role  text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT role, max_active_events
    INTO v_role, v_limit
  FROM public.profiles
  WHERE id = NEW.organizer_id;

  -- Staff are exempt.
  IF v_role IN ('admin', 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- No profile row or no configured limit → treat as unlimited.
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_count
  FROM public.events
  WHERE organizer_id = NEW.organizer_id
    AND deleted_at IS NULL
    AND status IN ('draft', 'pending_review', 'approved');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'Event limit reached (% of % active). Delete, cancel, or archive an event before adding another.',
      v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_cap ON public.events;
CREATE TRIGGER trg_enforce_event_cap
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_cap();

-- Raise the importer aggregator's cap so bulk imports never hit the limit.
-- No-op (0 rows) if the aggregator account hasn't been provisioned yet.
UPDATE public.profiles
SET max_active_events = 1000000
WHERE email = 'aggregator@noreply.eventsmalta.org';

COMMIT;
