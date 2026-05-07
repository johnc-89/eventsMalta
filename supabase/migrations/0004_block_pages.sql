-- ============================================================================
-- 0004_block_pages.sql — block-builder pages (super-admin editable)
-- A page is a singleton row keyed by `slug`; today only 'home'. Schema is
-- multi-page-ready (just insert another row later).
-- Idempotent. Apply once via Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. block_pages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.block_pages (
  id                BIGSERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  draft_blocks      JSONB NOT NULL DEFAULT '[]'::JSONB,
  published_blocks  JSONB NOT NULL DEFAULT '[]'::JSONB,
  draft_updated_at  TIMESTAMPTZ,
  draft_updated_by  TEXT,
  published_at      TIMESTAMPTZ,
  published_by      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.block_pages (slug, draft_blocks, published_blocks)
VALUES ('home', '[]'::JSONB, '[]'::JSONB)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Auto-stamp draft_updated_at + draft_updated_by on draft change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_pages_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor TEXT;
BEGIN
  IF NEW.draft_blocks IS DISTINCT FROM OLD.draft_blocks THEN
    SELECT email INTO actor FROM auth.users WHERE id = auth.uid();
    NEW.draft_updated_at := now();
    NEW.draft_updated_by := COALESCE(actor, 'system');
  END IF;
  IF NEW.published_blocks IS DISTINCT FROM OLD.published_blocks THEN
    SELECT email INTO actor FROM auth.users WHERE id = auth.uid();
    NEW.published_at := now();
    NEW.published_by := COALESCE(actor, 'system');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS block_pages_stamp ON public.block_pages;
CREATE TRIGGER block_pages_stamp
  BEFORE UPDATE ON public.block_pages
  FOR EACH ROW EXECUTE FUNCTION public.block_pages_stamp();

-- ---------------------------------------------------------------------------
-- 3. RLS — super_admin reads/writes; public reads `published_blocks` via view
-- ---------------------------------------------------------------------------
ALTER TABLE public.block_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS block_pages_super_admin_all ON public.block_pages;
CREATE POLICY block_pages_super_admin_all ON public.block_pages
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE VIEW public.block_pages_public AS
  SELECT slug, published_blocks FROM public.block_pages;

GRANT SELECT ON public.block_pages_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Publish + revert RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_pages_publish(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.block_pages
    SET published_blocks = draft_blocks
    WHERE slug = p_slug
    RETURNING published_blocks INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.block_pages_publish(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_pages_revert_draft(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.block_pages
    SET draft_blocks = published_blocks
    WHERE slug = p_slug
    RETURNING draft_blocks INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.block_pages_revert_draft(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.block_pages;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
