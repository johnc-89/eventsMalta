-- ============================================================================
-- 0002_site_settings.sql — Site customisation (super-admin editable)
-- Singleton table with separate `draft` (super-admin edits) and `published`
-- (what the public sees). Plus a `site-assets` Storage bucket for uploaded
-- images. Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. site_settings — singleton row (id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  draft              JSONB NOT NULL DEFAULT '{}'::JSONB,
  published          JSONB NOT NULL DEFAULT '{}'::JSONB,
  draft_updated_at   TIMESTAMPTZ,
  draft_updated_by   TEXT,
  published_at       TIMESTAMPTZ,
  published_by       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed singleton row if missing
INSERT INTO public.site_settings (id, draft, published)
VALUES (1, '{}'::JSONB, '{}'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Auto-stamp draft_updated_at + draft_updated_by on draft change
--    (uses auth.email() so the audit string matches the CRM convention)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_settings_stamp_draft()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor TEXT;
BEGIN
  IF NEW.draft IS DISTINCT FROM OLD.draft THEN
    SELECT email INTO actor FROM auth.users WHERE id = auth.uid();
    NEW.draft_updated_at := now();
    NEW.draft_updated_by := COALESCE(actor, 'system');
  END IF;
  IF NEW.published IS DISTINCT FROM OLD.published THEN
    SELECT email INTO actor FROM auth.users WHERE id = auth.uid();
    NEW.published_at := now();
    NEW.published_by := COALESCE(actor, 'system');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_settings_stamp_draft ON public.site_settings;
CREATE TRIGGER site_settings_stamp_draft
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.site_settings_stamp_draft();

-- ---------------------------------------------------------------------------
-- 3. RLS — super_admin reads/writes everything; public reads `published` only
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_settings_super_admin_all ON public.site_settings;
CREATE POLICY site_settings_super_admin_all ON public.site_settings
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Public read of the published config (anonymous + authenticated).
-- We intentionally expose only the `published` column via a view, so drafts
-- never leak.
CREATE OR REPLACE VIEW public.site_settings_public AS
  SELECT published FROM public.site_settings WHERE id = 1;

GRANT SELECT ON public.site_settings_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Publish RPC — atomic copy of draft → published
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_settings_publish()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.site_settings
    SET published = draft
    WHERE id = 1
    RETURNING published INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.site_settings_publish() TO authenticated;

-- Reset draft back to currently published (discard unsaved changes)
CREATE OR REPLACE FUNCTION public.site_settings_revert_draft()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.site_settings
    SET draft = published
    WHERE id = 1
    RETURNING draft INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.site_settings_revert_draft() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;

-- ---------------------------------------------------------------------------
-- 6. Storage bucket for site assets (logo, hero image, OG image)
--    Public bucket so the front-end can read URLs without signing.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read of all site assets
DROP POLICY IF EXISTS "site-assets public read" ON storage.objects;
CREATE POLICY "site-assets public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'site-assets');

-- Super-admin upload / update / delete
DROP POLICY IF EXISTS "site-assets super_admin write" ON storage.objects;
CREATE POLICY "site-assets super_admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-assets' AND public.is_super_admin());

DROP POLICY IF EXISTS "site-assets super_admin update" ON storage.objects;
CREATE POLICY "site-assets super_admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'site-assets' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'site-assets' AND public.is_super_admin());

DROP POLICY IF EXISTS "site-assets super_admin delete" ON storage.objects;
CREATE POLICY "site-assets super_admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-assets' AND public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
