-- 0017_more_event_sources.sql
--
-- Seed four additional Malta nightlife / events promoters as import sources.
-- Rows are created DISABLED (event_sources.enabled defaults to false) so a
-- super_admin enables + smoke-tests each from /admin/sources before it joins
-- the hourly cron run. Adapter files: lib/importers/adapters/<adapter>.ts.
--
-- ON CONFLICT (name) DO NOTHING keeps this idempotent and safe to re-run.

INSERT INTO public.event_sources (name, homepage_url, events_url, adapter, notes)
VALUES
  ('Gianpula Village',
   'https://gianpulavillage.com',
   'https://gianpulavillage.com/events/',
   'gianpula',
   'WordPress (upcoming_events CPT). Scrapes the /events/ listing cards directly (date/time/venue/genre/image). Listed date has no year — adapter infers the soonest future year.'),

  ('Café del Mar Malta',
   'https://cafedelmar.com.mt',
   'https://cafedelmar.com.mt/events/',
   'cafedelmar',
   'WordPress (event CPT) via /wp-json/wp/v2/event. Date not in REST — recovered from the "Book Sofa" CTA link on each detail page (?date=YYYY-MM-DD). Stored date-only.'),

  ('G7 Events',
   'https://www.g7events.com',
   'https://www.g7events.com/',
   'g7events',
   'WordPress. Blocks browser UAs (403) but serves our importer UA. No sitemap/REST — harvests /events/<slug> links off the homepage, parses each detail page (.detail.calendar / .clock / .location).'),

  ('UNO Malta',
   'https://unomalta.com',
   'https://unomalta.com/whats-on/',
   'unomalta',
   'WordPress + The Events Calendar (Tribe). Clean REST at /wp-json/tribe/events/v1/events with utc_start_date, venue, cost, image. Blocks browser UAs but serves our importer UA.')

ON CONFLICT (name) DO NOTHING;

-- Refresh PostgREST schema cache (no-op for data-only inserts, harmless).
NOTIFY pgrst, 'reload schema';
