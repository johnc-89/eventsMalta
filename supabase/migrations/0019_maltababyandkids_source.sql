-- 0019_maltababyandkids_source.sql
--
-- Seed Malta Baby & Kids as an import source — second kids/family source after
-- Malta for Kids (0018). Created DISABLED (event_sources.enabled defaults to
-- false) so a super_admin enables + smoke-tests it from /admin/sources before
-- it joins the hourly cron run. Adapter: lib/importers/adapters/maltababyandkids.ts.
--
-- ON CONFLICT (name) DO NOTHING keeps this idempotent and safe to re-run.

INSERT INTO public.event_sources (name, homepage_url, events_url, adapter, notes)
VALUES
  ('Malta Baby & Kids',
   'https://www.maltababyandkids.com',
   'https://www.maltababyandkids.com/events/',
   'maltababyandkids',
   'WordPress kids/family directory. No events REST route — adapter scrapes the /events/ listing (stm-event cards: title, date "Month D, YYYY", time, venue, image) and lifts og:description from each detail page. Malta-local → UTC. Review queue should confirm the Children / Family Friendly tag on approval.')

ON CONFLICT (name) DO NOTHING;

-- Refresh PostgREST schema cache (no-op for data-only inserts, harmless).
NOTIFY pgrst, 'reload schema';
