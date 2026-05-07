-- ============================================================================
-- 0003_site_extras.sql — FAQ table + featured-events ordering
-- Idempotent. Apply once via Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. faq_items — homepage FAQ, super-admin editable, public read
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faq_items (
  id            BIGSERIAL PRIMARY KEY,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faq_items_order_idx ON public.faq_items (display_order);

CREATE OR REPLACE FUNCTION public.faq_items_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS faq_items_touch ON public.faq_items;
CREATE TRIGGER faq_items_touch
  BEFORE UPDATE ON public.faq_items
  FOR EACH ROW EXECUTE FUNCTION public.faq_items_touch();

ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faq_items_public_read ON public.faq_items;
CREATE POLICY faq_items_public_read ON public.faq_items
  FOR SELECT TO anon, authenticated
  USING (enabled = true);

DROP POLICY IF EXISTS faq_items_super_admin_all ON public.faq_items;
CREATE POLICY faq_items_super_admin_all ON public.faq_items
  FOR ALL TO authenticated
  USING      (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.faq_items;

-- Seed the original FAQ entries (only if the table is empty)
INSERT INTO public.faq_items (question, answer, display_order)
SELECT * FROM (VALUES
  ('How do I post an event on Events Malta?', 'Create a free account, then visit the "Post Event" page. Submissions are reviewed by an admin before they go live, usually within 24 hours.', 10),
  ('Is it free to list an event?', 'Yes — listing events on Events Malta is completely free for organisers and free for visitors to browse.', 20),
  ('What kinds of events are listed?', 'Parties, comedy gigs, concerts, festivals, theatre, sports, food & drink, arts and charity events happening across Malta and Gozo.', 30),
  ('Do you cover events in Gozo?', 'Yes. Events Malta covers events on both Malta and Gozo.', 40),
  ('How do I buy tickets?', 'Each event links out to the organiser''s ticketing platform — we don''t process payments ourselves. Some events are free entry with no ticket required.', 50)
) AS s
WHERE NOT EXISTS (SELECT 1 FROM public.faq_items);

-- ---------------------------------------------------------------------------
-- 2. featured_order column on events — for sorting the featured carousel
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS featured_order INT;

CREATE INDEX IF NOT EXISTS events_featured_order_idx
  ON public.events (featured_order)
  WHERE is_featured = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------------------
