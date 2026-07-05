-- ============================================================================
-- 0028_block_pages_landing_meta.sql — SEO meta for block pages + landing pages
--
-- Adds draft_meta / published_meta JSONB to block_pages so a block page can
-- carry a page-level SEO override (title + meta description templates, which
-- support {placeholders} like {location}, {count}, {month}). Used by the new
-- block-editable landing page types (landing:location, landing:tag, …) and
-- their per-instance overrides (landing:location:valletta, …).
--
-- The block_pages_public view, publish/revert RPCs and stamp trigger are
-- extended to carry the meta alongside the blocks. Table/RLS/realtime from
-- 0004 stay as-is. Idempotent. Apply once via Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.block_pages
  ADD COLUMN IF NOT EXISTS draft_meta     JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS published_meta JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ---------------------------------------------------------------------------
-- 2. Stamp trigger — also treat a draft_meta edit as a draft change
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_pages_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE actor TEXT;
BEGIN
  IF NEW.draft_blocks IS DISTINCT FROM OLD.draft_blocks
     OR NEW.draft_meta IS DISTINCT FROM OLD.draft_meta THEN
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

-- ---------------------------------------------------------------------------
-- 3. Public view — expose published_meta to anon/authenticated readers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.block_pages_public AS
  SELECT slug, published_blocks, published_meta FROM public.block_pages;

GRANT SELECT ON public.block_pages_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Publish / revert RPCs — move meta together with blocks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_pages_publish(p_slug TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.block_pages
    SET published_blocks = draft_blocks,
        published_meta   = draft_meta
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
    SET draft_blocks = published_blocks,
        draft_meta   = published_meta
    WHERE slug = p_slug
    RETURNING draft_blocks INTO result;
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.block_pages_revert_draft(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Delete-override RPC — drop a per-instance landing override so the page
--    falls back to its type template. Super-admin only. Refuses to delete the
--    generic type templates or the core pages (home/events/privacy/terms).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.block_pages_delete(p_slug TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Only per-instance landing overrides are deletable: slug like
  -- 'landing:<type>:<instance>' (two colons). Templates ('landing:<type>')
  -- and core pages are protected.
  IF p_slug !~ '^landing:[a-z0-9_-]+:[a-z0-9_-]+$' THEN
    RAISE EXCEPTION 'refusing to delete non-override page %', p_slug;
  END IF;
  DELETE FROM public.block_pages WHERE slug = p_slug;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.block_pages_delete(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
