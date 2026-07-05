-- 0026_fix_increment_view_count.sql
--
-- increment_view_count() has been silently failing for visitors since 0021:
-- the events UPDATE fires the 0020 status-enforcement trigger, which reads
-- profiles.role — and 0021 revoked anon's profiles access, so the whole call
-- errors with 42501 "permission denied for table profiles". (Another instance
-- of the 0024 lesson: anon-reachable paths must not read profiles directly.)
-- Before 0020 it was broken differently — anon has no UPDATE policy on events,
-- so the update matched 0 rows. View counts have likely never tracked visitors.
--
-- Fix: SECURITY DEFINER so both the view_count update and the trigger's
-- profiles read run as the function owner. Safe to widen: the function only
-- ever increments view_count on an existing row — no caller input reaches any
-- other column, and status never changes so the 0020 guard stays inert.

create or replace function increment_view_count(event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update events
  set view_count = view_count + 1
  where id = event_id;
end;
$$;

revoke execute on function increment_view_count(bigint) from public;
grant execute on function increment_view_count(bigint) to anon, authenticated;
