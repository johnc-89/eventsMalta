-- 0030_event_images_bucket_hardening.sql
--
-- Security fix for two Critical findings in the `event-images` bucket:
--
--   1. The 0016 write policies (INSERT/UPDATE/DELETE) only checked
--      `bucket_id = 'event-images'` with NO owner/path constraint. Any
--      authenticated user (free signup) could therefore overwrite or delete
--      EVERY object in the bucket — every event image, including imported
--      ones — via the Storage API + public anon key. We now scope writes to
--      the caller's own top-level folder. EventForm already uploads to
--      `${user.id}/<ts>.<ext>` (see components/EventForm.tsx), so legit
--      uploads keep working; importer writes use the service role and bypass
--      RLS entirely, so `imports/<adapter>/...` is unaffected.
--
--   2. The bucket had no server-side size or MIME limit — the 5 MB /
--      JPEG-PNG-WebP checks in EventForm are client-side only and trivially
--      bypassed by calling the Storage API directly. We now enforce both on
--      the bucket itself.
--
-- storage.foldername(name) returns the path segments as text[]; [1] is the
-- first folder. For `<uid>/123.jpg` that is the uploader's uid; for
-- `imports/popp/ab...jpg` it is the literal 'imports', which no auth.uid()
-- can match, so authenticated users can never touch importer objects.

BEGIN;

-- 1. Server-side size + MIME enforcement on the bucket.
UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5 MB, matches the client-side check
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'event-images';

-- 2. Owner-scoped write policies (replace the unscoped 0016 ones).
DROP POLICY IF EXISTS "event-images authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "event-images owner insert" ON storage.objects;
CREATE POLICY "event-images owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "event-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "event-images owner update" ON storage.objects;
CREATE POLICY "event-images owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "event-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "event-images owner delete" ON storage.objects;
CREATE POLICY "event-images owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (0016) is unchanged — the bucket stays publicly readable.

COMMIT;
