-- 0035_merge_overlapping_tags.sql
--
-- Merge 4 pairs of overlapping categories/tags that had accumulated near-
-- duplicate meanings (e.g. "Arts" vs "Culture & Arts"):
--
--   Family / Kids  -> Family Friendly
--   Rooftop        -> Outdoor
--   Arts           -> Culture & Arts
--   Nightlife      -> Party
--
-- For each event whose `tags[]` contains a losing name, the name is swapped
-- for the winner's and the array de-duplicated (an event already carrying
-- both collapses to one). The losing tag rows are then deleted. No FK
-- references `tags.id` (event<->tag is a plain TEXT[] on `events.tags`), so
-- this is safe once the array rewrite above has run.
--
-- Applied directly against production via a one-off service-role script
-- (supabase-js .update()/.delete() calls, same net effect as the SQL below)
-- since the merge is pure DML — no DDL needed. This file exists so the
-- change is on record like every other migration; it is idempotent (safe to
-- re-run against a fresh DB where the losing rows still exist, a no-op
-- otherwise).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rewrite events.tags[]: replace losing names with winners, de-dup.
-- ---------------------------------------------------------------------------
UPDATE public.events e
SET tags = (
  SELECT ARRAY(
    SELECT DISTINCT name FROM unnest(
      array_replace(
        array_replace(
          array_replace(
            array_replace(e.tags, 'Family / Kids', 'Family Friendly'),
            'Rooftop', 'Outdoor'
          ),
          'Arts', 'Culture & Arts'
        ),
        'Nightlife', 'Party'
      )
    ) AS name
  )
)
WHERE e.tags && ARRAY['Family / Kids', 'Rooftop', 'Arts', 'Nightlife'];

-- ---------------------------------------------------------------------------
-- 2. Backfill an icon onto the winner only if it has none (e.g. "Family
--    Friendly" had no icon; "Family / Kids" had 👨‍👩‍👧).
-- ---------------------------------------------------------------------------
UPDATE public.tags winner
SET icon = loser.icon
FROM public.tags loser
WHERE winner.icon IS NULL
  AND loser.icon IS NOT NULL
  AND (winner.name, loser.name) IN (
    ('Family Friendly', 'Family / Kids'),
    ('Outdoor', 'Rooftop'),
    ('Culture & Arts', 'Arts'),
    ('Party', 'Nightlife')
  );

-- ---------------------------------------------------------------------------
-- 3. Drop the losing tag rows.
-- ---------------------------------------------------------------------------
DELETE FROM public.tags WHERE name IN ('Family / Kids', 'Rooftop', 'Arts', 'Nightlife');

COMMIT;
