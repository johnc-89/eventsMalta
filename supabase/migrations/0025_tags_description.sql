-- 0025_tags_description.sql — editable long description for tag landing pages.
-- Shown as intro copy on /events/tag/<slug> and used as the meta description.
-- Existing row-level policies on tags (public read, admin write) already cover
-- new columns; no RLS changes needed. Idempotent.

ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.tags.description IS
  'Optional landing-page copy for /events/tag/<slug>. Paragraphs separated by blank lines; the first paragraph doubles as the meta description (first 160 chars). Edited in /admin/tags.';

NOTIFY pgrst, 'reload schema';
