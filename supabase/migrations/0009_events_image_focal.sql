-- ============================================================================
-- 0009_events_image_focal.sql
-- Stores where the organiser wants to crop/anchor the banner image.
-- Values are 0-100 percentages (CSS object-position).
-- Default 50/50 = centre, matching the previous behaviour.
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_focal_x SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS image_focal_y SMALLINT NOT NULL DEFAULT 50;

NOTIFY pgrst, 'reload schema';
