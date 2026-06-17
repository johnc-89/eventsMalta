-- 0018_kids_event_sources.sql
--
-- Seed Malta for Kids as an import source to address thin coverage of
-- children's/family events. Created DISABLED (event_sources.enabled defaults
-- to false) so a super_admin enables + smoke-tests it from /admin/sources
-- before it joins the hourly cron run. Adapter: lib/importers/adapters/maltaforkids.ts.
--
-- ON CONFLICT (name) DO NOTHING keeps this idempotent and safe to re-run.

INSERT INTO public.event_sources (name, homepage_url, events_url, adapter, notes)
VALUES
  ('Malta for Kids',
   'https://maltaforkids.com',
   'https://maltaforkids.com/wp-json/my-calendar/v1/events',
   'maltaforkids',
   'WordPress + My Calendar plugin. Clean public JSON at /wp-json/my-calendar/v1/events?from=&to=, keyed by date. Adapter dedupes occurrences by occur_id, groups by event_id, converts Malta-local times to UTC. Kids/family directory — review queue should confirm the Children / Family Friendly tag on approval.')

ON CONFLICT (name) DO NOTHING;

-- Refresh PostgREST schema cache (no-op for data-only inserts, harmless).
NOTIFY pgrst, 'reload schema';
