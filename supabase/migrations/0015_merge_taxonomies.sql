-- 0015_merge_taxonomies.sql
--
-- Merge `categories` into `tags`. Tags becomes the single canonical taxonomy;
-- categories is dropped. Motivation: the homepage chips filtered events by
-- `category_id`, but the AI tagger writes to `events.tags` (text[]) and the
-- importer never sets `category_id` — so every imported event was invisible
-- to every chip on the homepage. Two parallel taxonomies (`Theatre` in
-- `categories`, `Theatre` in `tags`) with overlapping names.
--
-- After this migration:
--   • `tags` table carries the richer fields previously on categories
--     (icon, slug, display_order, enabled).
--   • `events.tags TEXT[]` is the only event–taxonomy link.
--   • `events.category_id` is gone.
--   • `event_sources.default_category_id` is gone (was never read by code).
--   • `categories` table is dropped.
--
-- The UI label "Categories" is preserved in copy — only the underlying
-- column changes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend `tags` with the UX fields previously on `categories`.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS icon          TEXT,
  ADD COLUMN IF NOT EXISTS enabled       BOOLEAN NOT NULL DEFAULT true;

-- `tags.name` should already be unique; ensure it for the merge below.
-- Use a DO block so re-running this migration doesn't error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tags_name_key' AND conrelid = 'public.tags'::regclass
  ) THEN
    ALTER TABLE public.tags ADD CONSTRAINT tags_name_key UNIQUE (name);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Copy categories into tags.
--    Match by NAME (case-insensitive) OR SLUG — a category and a tag that
--    share either are treated as the same thing. This handles the case where
--    "Culture & Arts" (tag) and "Culture / Arts" (category) have different
--    display names but the same slug `culture-arts`, which would otherwise
--    blow up on the tags.slug UNIQUE constraint at INSERT time.
--
--      (a) update matching tags with category metadata (COALESCE preserves
--          existing admin edits).
--      (b) insert categories that don't match any tag by name or slug.
-- ---------------------------------------------------------------------------

-- (a) Update existing matching tags with category metadata.
UPDATE public.tags t
SET
  icon          = COALESCE(t.icon, c.icon),
  slug          = COALESCE(t.slug, c.slug),
  display_order = LEAST(COALESCE(t.display_order, 999), COALESCE(c.display_order, 999))
FROM public.categories c
WHERE LOWER(t.name) = LOWER(c.name)
   OR (t.slug IS NOT NULL AND c.slug IS NOT NULL AND t.slug = c.slug);

-- (b) Insert categories that have no matching tag (by name OR slug).
INSERT INTO public.tags (name, slug, icon, display_order)
SELECT c.name, c.slug, c.icon, c.display_order
FROM public.categories c
WHERE NOT EXISTS (
  SELECT 1 FROM public.tags t
  WHERE LOWER(t.name) = LOWER(c.name)
     OR (t.slug IS NOT NULL AND c.slug IS NOT NULL AND t.slug = c.slug)
);

-- ---------------------------------------------------------------------------
-- 3. Backfill events.tags[] from events.category_id.
--    For every event with a category set, append the *post-merge tag name*
--    (not the raw category name) to its tags array, dedup via DISTINCT.
--    This ensures events labelled with a renamed-by-merge category end up
--    with the canonical tag label that matches what's now in `tags.name`.
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET tags = (
  SELECT ARRAY(
    SELECT DISTINCT name FROM unnest(
      COALESCE(e.tags, ARRAY[]::TEXT[]) || ARRAY[tag.name]
    ) AS name
  )
)
FROM public.categories c
JOIN public.tags tag
  ON LOWER(tag.name) = LOWER(c.name)
  OR (tag.slug IS NOT NULL AND c.slug IS NOT NULL AND tag.slug = c.slug)
WHERE e.category_id = c.id;

-- ---------------------------------------------------------------------------
-- 4. Drop dead FK column on event_sources (was never read by code).
-- ---------------------------------------------------------------------------
ALTER TABLE public.event_sources
  DROP COLUMN IF EXISTS default_category_id;

-- ---------------------------------------------------------------------------
-- 5. Drop events.category_id (and its FK).
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  DROP COLUMN IF EXISTS category_id;

-- ---------------------------------------------------------------------------
-- 6. Drop the categories table.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.categories CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Helpful index: tags lookups by name (the AI tagger and filter both do
--    name-based lookups now).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tags_lower_name_idx ON public.tags (LOWER(name));

-- ---------------------------------------------------------------------------
-- 8. Index events.tags for filter performance.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS events_tags_gin_idx ON public.events USING GIN (tags);

COMMIT;
