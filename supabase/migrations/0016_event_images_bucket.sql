-- 0016_event_images_bucket.sql
--
-- Ensure the `event-images` Storage bucket exists and has the right policies.
-- The bucket was previously created via the Supabase UI; this migration
-- formalises it so a fresh deployment provisions correctly.
--
-- The pipeline writes here via the service role key (bypasses RLS), so we
-- only need policies for end users posting their own events via EventForm.

BEGIN;

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Public read of every object in the bucket.
DROP POLICY IF EXISTS "event-images public read" ON storage.objects;
CREATE POLICY "event-images public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-images');

-- 3. Authenticated users can upload to their own paths.
--    (EventForm uploads with the anon key; the user must be signed in.)
DROP POLICY IF EXISTS "event-images authenticated insert" ON storage.objects;
CREATE POLICY "event-images authenticated insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event-images authenticated update" ON storage.objects;
CREATE POLICY "event-images authenticated update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-images')
  WITH CHECK (bucket_id = 'event-images');

DROP POLICY IF EXISTS "event-images authenticated delete" ON storage.objects;
CREATE POLICY "event-images authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-images');

-- Service-role writes (importer) bypass RLS automatically — no policy needed.

COMMIT;
