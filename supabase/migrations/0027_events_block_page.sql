-- ============================================================================
-- 0027_events_block_page.sql — make /events block-editable (like the homepage)
-- Adds a 'events' row to block_pages. Table, RLS, the block_pages_public view,
-- the publish/revert RPCs, stamp trigger and realtime are already generic
-- (see 0004_block_pages.sql) — this only seeds the row.
--
-- Seeded (draft + published) with a single `events_browser` block carrying the
-- current hard-coded copy, so the editor opens showing today's page and the
-- public /events page is visually unchanged until an admin edits it.
-- Idempotent. Apply once via Supabase SQL Editor.
-- ============================================================================

INSERT INTO public.block_pages (slug, draft_blocks, published_blocks)
VALUES (
  'events',
  '[{"id":"b_events_default","type":"events_browser","config":{"title":"Browse Events","intro_md":"Every upcoming event across Malta and Gozo in one place — concerts, parties, festivals, theatre, markets and family days out, with new listings added daily. Filter by date, category or price, or jump straight to what''s on [today](/events/today), [this weekend](/events/this-weekend) or [this month](/events/this-month).","show_past_link":true}}]'::JSONB,
  '[{"id":"b_events_default","type":"events_browser","config":{"title":"Browse Events","intro_md":"Every upcoming event across Malta and Gozo in one place — concerts, parties, festivals, theatre, markets and family days out, with new listings added daily. Filter by date, category or price, or jump straight to what''s on [today](/events/today), [this weekend](/events/this-weekend) or [this month](/events/this-month).","show_past_link":true}}]'::JSONB
)
ON CONFLICT (slug) DO NOTHING;

-- Done.
