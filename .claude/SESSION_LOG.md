# Session Log

Chronological log of meaningful work done across Claude sessions. **Latest entries first.** Each session that makes code/schema/architecture changes should append a new entry. See the update protocol in [CLAUDE.md](../CLAUDE.md).

## Format

```
## YYYY-MM-DD — Short title

**What changed:** 1–3 sentences on what was done and why.
**Files touched:** [path/one.ts](path/one.ts), [path/two.tsx](path/two.tsx)
**New tables/migrations:** (if any)
**Notes for future sessions:** (gotchas, follow-ups, things deferred)
```

Keep entries tight. If an entry would be longer than ~10 lines, the work probably warrants its own doc — link to it instead.

---

## 2026-05-25 — Fix broken Visit Malta hero images (fourth allowlist bug)

**What changed:** `next.config.js` had `visitmalta.com` allowlisted, but the Visit Malta adapter pulls images from `api.visitmaltaplus.com` ([lib/importers/adapters/visitmalta.ts:25](../lib/importers/adapters/visitmalta.ts:25)). Same shape as Teatru Manoel, Festivals Malta, and Heritage Malta before it — the host the adapter actually uses didn't match the allowlist. Replaced the entry with the right host + path.

**Files touched:** [next.config.js](../next.config.js)

**Notes for future sessions:**
- This is now the **fourth** image-allowlist bug. The follow-up task to mirror images to Supabase Storage (queued earlier — kills this whole bug class) is increasingly worth picking up.

---

## 2026-05-25 — Merge categories + tags into single taxonomy

**What changed:** Diagnosed the "Theatre chip shows no events" bug as a taxonomy split: the homepage chips filtered by `events.category_id` (set only when a human picked from a dropdown), but the AI tagger and every import wrote to `events.tags TEXT[]` instead. Two parallel tables (`categories` + `tags`) with overlapping label names, only one of them ever connected to anything imported. Merged them into a single `tags` table.

**Direction (per user pick from `AskUserQuestion`):** keep `tags` as canonical, drop `categories`. Preserve "Categories" as the user-facing UI label. Backfill events from category_id → tags[] in the migration.

**Migration ([0015_merge_taxonomies.sql](../supabase/migrations/0015_merge_taxonomies.sql)) — apply manually via Supabase SQL editor before deploying the code:**
1. Add `tags.icon TEXT`, `tags.enabled BOOLEAN DEFAULT true`, ensure `tags_name_key` UNIQUE constraint.
2. Update existing tags with matching-name categories' icon/slug/display_order (case-insensitive match, preserves admin edits via COALESCE).
3. Insert any categories without a matching tag.
4. Backfill: for every event with `category_id NOT NULL`, append the category name to `events.tags[]` (DISTINCT-dedup).
5. Drop `event_sources.default_category_id` (never read by any code), `events.category_id`, and the `categories` table.
6. Add `tags_lower_name_idx` and `events_tags_gin_idx` for filter performance.

**Code changes (16 files):**

- **Types** — [types/index.ts](../types/index.ts): extended `Tag` with `icon` + `enabled`; `Category` retained as `type Category = Tag` alias to avoid touching every import site; dropped `Event.category_id`, `Event.category`, `EventSource.default_category_id`.
- **Homepage & filters** — [app/page.tsx](../app/page.tsx): chips load from `tags` table, link to `/events?tag=<slug>`. [app/events/page.tsx](../app/events/page.tsx): replaced `category_id` filter with `events.tags @> ARRAY[name]`; accepts both `?tag=` (canonical) and `?category=` (legacy) via `useSearchParams` wrapped in `Suspense` for prerender compat.
- **Display surface** — `event.category.icon`/`event.category.name` references replaced with `event.tags?.[0]` across [EventCard](../components/EventCard.tsx), [/events/[slug]](../app/events/%5Bslug%5D/page.tsx), [/admin](../app/admin/page.tsx), [/admin/site/featured](../app/admin/site/featured/page.tsx), [/my-events](../app/my-events/page.tsx), [/profile](../app/profile/page.tsx). Icon dropped from cards (no per-tag lookup needed).
- **All Supabase joins** — dropped `, category:categories(*)` from 10 query call sites; rewrote `from('categories')` queries to `from('tags').eq('enabled', true)`.
- **Block system** — [lib/blocks/Renderer.tsx](../lib/blocks/Renderer.tsx) `CategoriesStripR` chips link to `?tag=`; `UpcomingEventsR` filter looks up tag names from configured slugs and matches `events.tags[]`. [lib/blocks/Editor.tsx](../lib/blocks/Editor.tsx) handles `Tag.slug` being nullable. Block config field name `category_slugs` kept as-is (DB-persisted block config doesn't need migration).
- **EventForm** — [components/EventForm.tsx](../components/EventForm.tsx): dropped category dropdown entirely. Multi-tag chip selector now stores **names** in `events.tags[]` (was inconsistently storing slugs before — pre-existing bug fixed in passing). UI label changed to "Categories".
- **CategoryFilter** — [components/CategoryFilter.tsx](../components/CategoryFilter.tsx): renamed prop type from `Category[]` to `Tag[]` (same shape); kept filename + component name to minimize churn.
- **Sitemap** — [app/sitemap.ts](../app/sitemap.ts): emits `?tag=<slug>` per enabled tag instead of `?category=`.
- **Admin** — [app/admin/tags/page.tsx](../app/admin/tags/page.tsx) rewritten with inline editing of icon, display_order, enabled. Page heading now "Manage Categories". `/admin/categories` did not exist as a separate page — nothing to delete.

**Files NOT touched (intentional):**
- `categoryHint` on `ExternalEvent` and the 8 adapters that set it: dead scaffolding, never read by anything. Leaving for a future cleanup.
- CRM `leads.category` (TEXT): unrelated domain.
- `lib/blocks/registry.ts` `category` field: unrelated — that's the block-grouping (structure/content/data/cta).
- `lib/site-settings.ts` `HomepageSectionId = 'categories'`: the section ID is stable, just points at tag-strip rendering now.

**Notes for future sessions:**
- **The migration MUST be applied before the deploy lands**, or the live site will 500 (queries reference dropped columns). Order of operations: apply 0015 in Supabase SQL editor → confirm `tags` table has `icon` and `enabled` columns and `categories` is gone → push the code.
- Existing `published_blocks` JSON in `block_pages_public` still references field `category_slugs` — kept the field name precisely so this doesn't break.
- `Tag.slug` is `string | null` (allows backfill edge cases). Every render site filters with `cat.slug` truthy guard.
- Legacy `?category=` URLs still work — the events page reads both query params. Can deprecate after a few weeks.
- `Category` type alias in `types/index.ts` exists only to soften the type churn; can be removed later.
- Pre-existing inconsistency fixed: EventForm was storing tag *slugs* in `events.tags[]` while the AI tagger writes *names*, breaking edit-form repopulation for AI-tagged events. Now both write names.

---

## 2026-05-25 — Fix broken Heritage Malta hero images

**What changed:** User reported "broken links" on `/events/guardians-of-the-night-the-carafa-enceinte-tour`. Diagnosis: the *links* are fine (ticket URL 200s with a real UA); the *hero image* was 400ing through Next.js's `/_next/image` optimizer. Root cause: `next.config.js` had `heritagemalta.org` + `/wp-content/uploads/**` but Heritage Malta's actual image host is `heritagemalta.mt` and path is `/app/uploads/**`. Same bug class as the 2026-05-25 Festivals Malta image fix (allowlist had `wix.com` instead of `static.wixstatic.com`).

**Files touched:** [next.config.js](../next.config.js)

**Notes for future sessions:**
- This is the **third** image-allowlist bug we've shipped (Festivals Malta on 2026-05-25, Heritage Malta now, and the original Teatru Manoel image fix in pre-2026-05-11 baseline). All same shape: adapter pulls image URLs from one host, `remotePatterns` was guessed from a different host. The Phase 3 plan in the file's comment ("download these to Supabase Storage so we can drop these patterns entirely") would eliminate this class of bug permanently.
- Verify image hosts in two ways: `curl -A "<browser UA>"` the direct image (should 200), then `curl /_next/image?url=...` (must also 200 — 400 = remotePattern mismatch).
- Cloudflare-protected sources (Heritage Malta, Esplora) return 403 to default WebFetch/curl UAs; always use a real browser UA when testing them manually.

---

## 2026-05-25 — Move AI rewriter + tagger to Claude Haiku 4.5 (Groq fallback)

**What changed:** Both Groq paths now try Claude Haiku 4.5 first via the Anthropic SDK and fall back to Groq llama-3.1-8b-instant on any failure. Motivation: Groq's free-tier TPM (6000/min) was burning out partway through ~28-event imports even with 429 retries, and llama-3.1-8b's tag picks were noisier than Haiku's (occasional weird choices, e.g. `[Other]` on a clear concert). Volume is tiny (~320 calls/day) so cost is rounding error — expect <$5/month even on Haiku, and Anthropic's prompt caching would knock the system-prompt portion ~90% if our prefix were ≥4096 tokens (it isn't, so we don't bother with `cache_control` — would silently no-op on Haiku 4.5).

**Chain (both rewriter and tagger):** Claude → Groq → original/keyword.

- **Rewriter** (`lib/importers/rewriter.ts`): try Claude; on failure try Groq; on Groq failure keep original text. Log lines now distinguish providers: `✓ rewriter: claude ok (N→M chars)` vs `✓ rewriter: groq ok (...)`.
- **Tag suggester** (`lib/importers/tag-suggester-ai.ts`): try Claude with `output_config.format` JSON schema for guaranteed-valid output; on failure try Groq with its `response_format: json_object`; on full AI failure return null so `pickTags` in pipeline.ts falls back to the keyword matcher. Both providers' outputs are filtered against the live `tagMap` vocabulary the same way as before.

**Files touched:**
- [package.json](../package.json) — added `@anthropic-ai/sdk` ^0.98.0.
- [lib/importers/claude.ts](../lib/importers/claude.ts) (new) — singleton client factory gated on `ANTHROPIC_API_KEY`; exports `CLAUDE_MODEL = 'claude-haiku-4-5'`.
- [lib/importers/rewriter.ts](../lib/importers/rewriter.ts) — rewritten with internal `tryClaude` + `tryGroq` helpers, same public `rewriteEventText()` signature.
- [lib/importers/tag-suggester-ai.ts](../lib/importers/tag-suggester-ai.ts) — same pattern; shared `filterToVocabulary` helper.

**Notes for future sessions:**
- Requires `ANTHROPIC_API_KEY` in Vercel env vars (Production scope). User confirmed added.
- Without `ANTHROPIC_API_KEY`: `getClaude()` returns null, every event flows straight to Groq — old behavior preserved as a free fallback.
- Cost ceiling: Anthropic Console has a per-month spend limit you can set under **Plans & Billing → Spend Limits**. User was advised to set ~$20.
- Prompt caching deliberately skipped — Haiku 4.5's min cacheable prefix is 4096 tokens; our system prompts are ~150 tokens each. `cache_control` would silently not engage. If we ever grow the system prompt past 4K (e.g. by inlining the tag taxonomy + descriptions) this becomes worth wiring up — see `shared/prompt-caching.md` in the claude-api skill.
- The Anthropic SDK call uses no `thinking`/`effort`/`temperature` — these are simple paraphrase + classification tasks; defaults are fine. Haiku 4.5 doesn't support `effort` anyway.
- Schema design choice: I send the vocabulary in the *user message* rather than the *schema* (could have used `enum` to constrain). Putting it in the schema would force a per-vocab-change schema recompile (24h cache miss); putting it in the user message means the schema is stable and only the prompt varies. Same constraint enforced post-hoc via `filterToVocabulary`.

---

## 2026-05-25 — Retry Groq 429s once with Retry-After

**What changed:** First real run of the AI tagger on Festivals Malta hit Groq's free-tier TPM cap (6000 tokens/min on `llama-3.1-8b-instant`) after ~15 events — the remaining ~13 all 429'd and fell back to the keyword matcher. Added a tiny retry wrapper: on HTTP 429, parse `Retry-After` header (default 10s, cap 30s), sleep, retry once. Most Groq 429s clear within seconds because TPM is a rolling window.

**Files touched:**
- [lib/importers/groq-fetch.ts](../lib/importers/groq-fetch.ts) (new) — `groqFetchWithRetry(url, init, log)`. Logs `⏳ Groq 429 — waiting Ns then retrying once` so retries are visible in `import_runs.log`.
- [lib/importers/rewriter.ts](../lib/importers/rewriter.ts) — swap `fetch` for `groqFetchWithRetry`.
- [lib/importers/tag-suggester-ai.ts](../lib/importers/tag-suggester-ai.ts) — same.

**Notes for future sessions:**
- Retry is bounded: 1 retry per call, max 30s wait. Worst-case added latency for a 28-event import where every call 429s twice ≈ 28 × 2 × 30s = ~28 min, which would exceed the cron's `maxDuration: 300` ([app/api/cron/import/route.ts:11](../app/api/cron/import/route.ts:11)). In practice we expect <1 min of cumulative waits. If runs start timing out on the cron, the next-step options are pacing (sleep between events when `x-ratelimit-remaining-tokens` is low) or upgrading Groq tier.
- After deploy, the next manual Festivals Malta run should show `⏳ Groq 429 — waiting Ns then retrying once` lines but mostly succeed instead of falling back.

---

## 2026-05-25 — Surface import logs + positive Groq path logging

**What changed:** Before this, the only signal that Groq's rewriter and AI tagger ran was the *absence* of a `⚠` failure line in `import_runs.log` — and the log itself wasn't displayed anywhere in the UI. Two fixes:

1. **Positive log lines** so success is observable, not inferred:
   - [lib/importers/rewriter.ts](../lib/importers/rewriter.ts) on success: `✓ rewriter: ok (412→387 chars)`
   - [lib/importers/tag-suggester-ai.ts](../lib/importers/tag-suggester-ai.ts) on success: `✓ ai-tags: [Music, Jazz]` (or `(none)` if AI confidently picked nothing)
   - [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) `pickTags` when falling back: `↩ tags: fell back to keyword matcher → [Music]`
2. **Log expander in `/admin/sources`** — each "Recent runs" row is now a button; click to reveal the full `import_runs.log` in a dark-theme `<pre>` (max-height 96 with scroll). `select('*')` was already pulling the `log` column; just added `openRunId` state and a collapsible body.

**Files touched:**
- [lib/importers/rewriter.ts](../lib/importers/rewriter.ts)
- [lib/importers/tag-suggester-ai.ts](../lib/importers/tag-suggester-ai.ts)
- [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) — `pickTags()` only
- [app/admin/sources/page.tsx](../app/admin/sources/page.tsx) — `openRunId` state + expandable run rows

**Notes for future sessions:**
- After deploy: trigger any source on `/admin/sources` → click the new run row to see per-event lines. For each imported event you should see one `✓ rewriter` line and one `✓ ai-tags` (or `↩ tags: fell back…`) line.
- `import_runs.log` is capped at 50KB ([pipeline.ts:228](../lib/importers/pipeline.ts:228)). Adding 2 lines × ~80 chars × ~20 events/run = ~3KB extra per run, well inside the cap.
- Still open from prior session: `summary` counters for AI-tag vs keyword-fallback (not added — log lines were sufficient for the diagnostic goal).

---

## 2026-05-25 — AI tag suggester (Groq) for imports

**What changed:** Added a Groq-powered tag suggester alongside the existing keyword matcher. Imported events now get tags chosen by `llama-3.1-8b-instant`, hard-constrained to the names that already exist in the `tags` table — the model cannot invent tags. Falls back to the keyword matcher on any failure (missing key, HTTP error, malformed JSON, empty pick) so imports never break. Reuses the same `GROQ_API_KEY` env var as the rewriter.

Also discussed cron setup: there is only **one** Vercel cron (`/api/cron/import` at `0 5 * * *`), not two. "Archiving" is implicit — `slide_event_date_starts()` slides each event's `date_start` to its next-future occurrence; events with no future occurrence keep a past `date_start` and fall into `/events/past` by date filtering alone. CLAUDE.md §8 still says the cron fires hourly with Malta-hour gating — that comment + the dead `cron_hour` setting in `site_settings.importers` are stale (route only checks `cron_enabled`). Not fixed this session.

**Files touched:**
- [lib/importers/tag-suggester-ai.ts](../lib/importers/tag-suggester-ai.ts) (new) — `suggestTagsAI(title, description, availableTags, log, maxTags=5)`. JSON-mode Groq call, validates output against `availableTags`, returns `null` on any failure.
- [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) — new `pickTags(title, description, tagMap, log)` helper near the other helpers. Tries AI first, falls back to `suggestTags` keyword matcher. Replaced both call sites (insert + update paths). Reuses existing `tagMap` load — no extra DB round-trip per event.

**Notes for future sessions:**
- Cost: ~1 Groq call per imported event on top of the rewriter's 1 call. With 8 sources × ~20 events cap = ~160 extra calls per cron run, comfortably inside Groq free tier.
- `pickTags` falls back to keyword if AI returns `null` OR an empty array. If we want to trust an AI "no fit" signal, change the check to `ai !== null`.
- Stale-docs follow-up worth doing: CLAUDE.md §8 cron paragraph, the dead `importers.cron_hour` setting, and the misleading "fires every hour" comment at the top of [app/api/cron/import/route.ts](../app/api/cron/import/route.ts).
- User asked whether the morning cron is actually firing and whether sources are enabled — not verified this session (needs Vercel dashboard logs or `SELECT id, name, enabled FROM event_sources` + `import_runs` history).

**Admin review UI cleanup (same session):** The review queue at `/admin` was showing `short_description` and `description` stacked, which for AI-imported events is the same Groq text duplicated (under 300 chars they're byte-identical, since `shortenDescription()` just flattens whitespace and clips at 297). Removed the `short_description` `<p>` from the review card — only the full description shows now. Also added `whitespace-pre-wrap` so paragraph breaks in Groq output render. `short_description` is still written by the importer and still used elsewhere (event cards, SEO meta on `/events`). File: [app/admin/page.tsx](../app/admin/page.tsx) ~line 299.

---

## 2026-05-25 — Fix broken Festivals Malta event images

**What changed:** Festivals Malta imported events showed no hero image (e.g. /events/sand-sculptures). Root cause: `next.config.js` allowed `wix.com` in `images.remotePatterns`, but the adapter's `wixImageUrl()` builds URLs against `static.wixstatic.com` (Wix's CDN). Next.js image optimizer rejected every request with `400 INVALID_IMAGE_OPTIMIZE_REQUEST`. Replaced the entry with `static.wixstatic.com` + path `/media/**`. Source-URL referral redirect was already working.
**Files touched:** [next.config.js](../next.config.js)
**Notes for future sessions:**
- When adding a Wix-backed source, the image host is `static.wixstatic.com`, not `wix.com`.
- Verify image hosts by hitting `/_next/image?url=<encoded>&w=3840&q=75` directly — 400 = remotePattern mismatch.

## 2026-05-24 — Reduce permission prompts: add curl to allowlist

**What changed:** Added `Bash(curl *)` to `.claude/settings.json` permissions.allow to skip prompts for HTTP/API calls. Scanned recent transcripts (Events Malta project); found 28 curl invocations for Supabase API queries, all read-only GET requests. Other common read-only commands (grep, git log, cat, ls, find, etc.) are already auto-allowed by Claude Code — no rules needed. Deliberately excluded interpreters (python, node), package managers (npm install, npm run build), and write operations (git add, git commit).
**Files touched:** [.claude/settings.json](.claude/settings.json)
**Notes for future sessions:**
- Users can now run `curl` commands without permission prompts. Only write/mutation commands will prompt.
- To add more read-only patterns: run `fewer-permission-prompts` skill to scan transcripts and suggest additions.
- Current allowlist: 11 MCP preview tools + 1 bash pattern (curl).

## 2026-05-24 — Referral tracking via GA4 (events only, no database)

**What changed:** Switched referral tracking from custom database table to Google Analytics 4 Measurement Protocol. Removed migration 0015 and all database logging. `/api/referral/track` now sends `referral_click` events to GA4 with event_id, event_title, link_type params. No local database storage — all analytics in GA4 dashboards. Event detail + admin approval pages still use tracking links; clicks are now visible in GA4 Admin → Events → custom_event > referral_click.
**Files touched:** [app/api/referral/track/route.ts](../app/api/referral/track/route.ts)
**Deleted:** [supabase/migrations/0015_referral_tracking.sql](../supabase/migrations/0015_referral_tracking.sql) (no longer needed)
**Notes for future sessions:**
- GA4 credentials embedded: G-JQPY4CK6D4 (measurement ID), API secret (hardcoded in route.ts).
- Events appear in GA4 within ~24h. Filter by event_title or link_type to see which events/link types drive traffic.
- No database queries needed — all reporting via GA4 UI.
- To rotate credentials: update route.ts and redeploy.

## 2026-05-24 — Referral tracking for external event links (revenue)

**What changed:** Added referral tracking to log clicks on external event links (tickets, event pages) for revenue attribution. New `/api/referral/track` endpoint logs clicks and redirects. Event detail page updated: "Get Tickets" button and new "View on Event Page" link now use tracking. Admin approval page now shows "Source Event" link for imported events. Event type interface extended with `source_url` field.
**Files touched:** [app/api/referral/track/route.ts](../app/api/referral/track/route.ts) *(new)*, [app/events/[slug]/page.tsx](../app/events/%5Bslug%5D/page.tsx), [app/admin/page.tsx](../app/admin/page.tsx), [types/index.ts](../types/index.ts)

## 2026-05-24 — Fix broken image links + emit occurrences for recurring Esplora events

**What changed:** Two fixes: (1) **Image links broken after approval** — Vercel's Image Optimization was rejecting external URLs because only `teatrumanoel.mt` was whitelisted in `next.config.js`. Added `remotePatterns` entries for all 8 adapter hostnames (Esplora, Heritage Malta, POPP, Visit Malta, Theatru Salesjan, Festivals Malta, Malta Artisan Markets). (2) **Recurring events not showing dates** — Esplora adapter was finding all future dates in event prose but only using first/last. Now emits an `occurrences[]` array with all found dates (as `Occurrence` objects with `startsAt`, `hasTime`). Events with multiple dates will now display via the "All dates (N)" list on event detail pages.
**Files touched:** [next.config.js](../next.config.js), [lib/importers/adapters/esplora.ts](../lib/importers/adapters/esplora.ts)
**Notes for future sessions:**
- Image fix deployed to Vercel and should be live within 1–2 min of push.
- Esplora occurrences fix: to test, wipe Esplora events and re-run the import. The Xjenzanzjan event (14 Oct 2026 – 7 May 2027) should now show all weekly dates.
- Other adapters (tsmalta, popp, heritagemalta, etc.) may also have multi-date data suitable for occurrences — can be updated similarly if needed.

## 2026-05-24 — Cleanup scripts: per-adapter + full wipe

**What changed:** Added two SQL scripts under [.claude/scripts/](scripts/): (1) [wipe_imports.sql](scripts/wipe_imports.sql) for clearing imported events adapter-by-adapter so importers can be re-run from a clean slate, with pre-baked blocks for all 8 adapters; (2) [nuke_all_events.sql](scripts/nuke_all_events.sql) for nuclear-option reset during testing — deletes all events (user-submitted + imported) in one shot. Both hard-delete (event_occurrences cascades), clear `event_sources.last_run_at`, transaction-wrapped with RETURNING for preview, default to ROLLBACK. Also verified migration 0014 (`slide_event_date_starts`) has been applied — RPC returns 0 (no events needed sliding).
**Files touched:** [.claude/scripts/wipe_imports.sql](scripts/wipe_imports.sql) *(new)*, [.claude/scripts/nuke_all_events.sql](scripts/nuke_all_events.sql) *(new)*
**Notes for future sessions:**
- `wipe_imports.sql`: per-adapter blocks; includes orphan-wipe (source_id IS NULL) which also deletes user submissions — preview before committing.
- `nuke_all_events.sql`: full reset for testing. Shows preview counts (imported vs user-submitted) before deletion.
- If a future adapter is added, add a matching pre-baked block to `wipe_imports.sql`.

---

## 2026-05-22 — Always show year on event dates

**What changed:** Added `year: 'numeric'` to user-facing event date displays that were omitting it: EventCard (both single-day and multi-day branches), admin review card's "When"/"End" fields, and the "All dates (N)" list on the event detail page (was conditional on year ≠ current). All event-related dates now show day + month + year consistently. CRM, admin metadata, and timestamp displays (last edit, joined, last success) untouched — they have their own conventions.
**Files touched:** [components/EventCard.tsx](../components/EventCard.tsx), [app/admin/page.tsx](../app/admin/page.tsx), [app/events/[slug]/page.tsx](../app/events/%5Bslug%5D/page.tsx)

---

## 2026-05-22 — Daily slide function so cached date_start stays current

**What changed:** New Postgres function `slide_event_date_starts()` (migration 0014) re-points every event's denormalised `date_start`/`date_end`/`has_time` at its soonest-future active occurrence. Called from `/api/cron/import` after the import pass finishes. Without this, an event's cached "next date" could lag by up to 24h between cron runs — only re-imported events were getting their cache refreshed by the importer itself. Events with no future occurrence are left alone (cache stays on last past occurrence so they appear correctly in the archive). The cron response now includes `slide: { updated: N }` or `slide: { error: "..." }` for observability.
**Files touched:** [supabase/migrations/0014_slide_event_date_starts.sql](../supabase/migrations/0014_slide_event_date_starts.sql) *(new)*, [app/api/cron/import/route.ts](../app/api/cron/import/route.ts)
**New tables/migrations:** Function `slide_event_date_starts()` (0014).
**Notes for future sessions:**
- Apply migration 0014 in Supabase SQL Editor before next deploy. Without it the cron's RPC call will return an error in the slide field but imports still work fine.
- Function uses `DISTINCT ON (event_id) ... ORDER BY event_id, starts_at ASC` to pick the soonest-future occurrence per event in one statement (no JS loop).
- If Vercel upgrades to Pro, consider running the slide independently every few hours instead of only after imports.

---

## 2026-05-20 — Recurring events: event_occurrences table + heritagemalta expansion

**What changed:** Proper recurring-event model. New `event_occurrences` table (migration 0013) — one row per date the event runs. RLS mirrors `events` (public reads of approved-event occurrences; owners + admins write). `events.date_start` becomes a denormalised cache of the next-upcoming occurrence, so the existing list/filter/search/SEO code keeps working unchanged. Migration backfills occurrences from existing `events.date_start` (idempotent via UNIQUE `(event_id, starts_at)`). `ExternalEvent` gets an optional `occurrences[]` array — adapters can yield it; pipeline writes via delete-then-insert and sets `events.date_start` + `events.is_recurring`. Heritage Malta adapter now materialises all `opening_hours` slots: same-day events yield one occurrence per slot; multi-day events distribute slots across days. Visit Malta recur-type=daily/weekly/monthly materialisation deferred — audit showed 230/230 events are `recur_type=custom` so it'd be speculative code. UI: event detail page shows "All dates (N)" list with past entries struck through; EventCard adds a small "+ more dates" pill when `event.is_recurring`.
**Files touched:** [supabase/migrations/0013_event_occurrences.sql](../supabase/migrations/0013_event_occurrences.sql) *(new)*, [lib/importers/types.ts](../lib/importers/types.ts), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [lib/importers/adapters/heritagemalta.ts](../lib/importers/adapters/heritagemalta.ts), [app/events/[slug]/page.tsx](../app/events/%5Bslug%5D/page.tsx), [components/EventCard.tsx](../components/EventCard.tsx), [CLAUDE.md](../CLAUDE.md), [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md)
**New tables/migrations:** `event_occurrences` (0013).
**Notes for future sessions:**
- Apply migration 0013 in Supabase SQL Editor before next deploy or all imports break.
- `events.date_start` is now derived. A daily cron task would be needed to "advance" it as past occurrences fall off; for now, the daily importer cron re-writes it on each run (good enough).
- User create-event form still single-date. Multi-date input UI is a future enhancement.
- Visit Malta materialisation: add only when their API starts returning non-`custom` recur_type events. The `parseFormattedDate` fallback path in `visitmalta.ts` is the place to extend.
- Other adapters not yet emitting occurrences: tsmalta, popp, teatrumanoel, festivals_mt, esplora, maltaartisanmarkets, visitmalta — they get a single occurrence each per the pipeline default. Fine as-is for sources where each external entity = one date.

---

## 2026-05-20 — Fix teatrumanoel cross-event date pollution

**What changed:** Real cause of the wrong-date bug found. Each teatrumanoel event page renders a "What's On" sidebar widget listing *other* upcoming events at the venue, each with their own dates. The adapter was running `extractDates($('body').text())` — scanning the entire page body — then picking the first-future date, which was almost always a sidebar event's date, not the actual event's date. Example: Francesco Cavestri (actually 26–28 June 2026) was getting stamped with 22 May 2026 (UNFOLD's date — the soonest future show in the venue widget). Fixed by scoping extraction to `.se-eventformat-time` (per-show timings) and `.hew-date` (header date range), with the `.single-event-container` text as a fallback (after pruning `.se-whats-on` and `.events-grid-container`). Seeded the regex input with `.hew-date` text so per-show entries (which lack a year) can still resolve the year via the existing future-bias logic.
**Files touched:** [lib/importers/adapters/teatrumanoel.ts](../lib/importers/adapters/teatrumanoel.ts)
**Notes for future sessions:**
- The pipeline-level ±5 min sanity check I added earlier wouldn't have caught this (the wrong date was 22 May, well outside the window). It's still worth keeping as a future tripwire.
- Cleanup SQL for already-imported bad rows: `update events set deleted_at = now() where source_id = (select id from event_sources where adapter = 'teatrumanoel') and deleted_at is null;` then re-run the adapter from Admin → Sources.
- Other adapters audited and clean: tsmalta scopes via `firstPara` / `dateNode`; popp uses iCal DTSTART or specific Elementor selectors; the API-based adapters (heritagemalta, esplora, festivals_mt, visitmalta, maltaartisanmarkets) get dates from API fields not page scraping.

---

## 2026-05-20 — Defensive date handling + admin review label fix

**What changed:** User reported imported events showing the import date instead of the event date. Live audit of all 230 Visit Malta events showed every date parsed correctly, so the bug isn't reproducing with current upstream data, but the code had a latent silent-fallback that could cause it. Three changes: (1) `visitmalta.ts` `toIsoUtc` no longer falls back to `new Date().toISOString()` on parse failure — returns null and the caller skips the event. Also accepts trailing `.SSS` and optional `Z` on the input. (2) Pipeline now logs+skips any event whose `startsAt` is within ±5 min of `now` (a strong signal of a silent date-parse bug in some adapter) or whose `startsAt` doesn't parse at all. (3) Admin review card relabelled the small grey date under each title from bare "DD/MM/YYYY" to "submitted DD/MM/YYYY" so it can't be confused with the event date (which appears separately under "When").
**Files touched:** [lib/importers/adapters/visitmalta.ts](../lib/importers/adapters/visitmalta.ts), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [app/admin/page.tsx](../app/admin/page.tsx)
**Notes for future sessions:**
- The ±5 min sanity check will surface any future adapter bug loudly. If a legitimate event is genuinely scheduled to start in the next 5 minutes it'd be skipped — acceptable tradeoff.
- To clean up bad rows already in the DB (if any): `update events set deleted_at = now() where source_id is not null and abs(extract(epoch from (date_start - created_at))) < 60 and date_start::date = created_at::date;` (soft-deletes imported events where date_start ≈ created_at).

---

## 2026-05-20 — Malta Artisan Markets adapter (8 of 8 — all sources live)

**What changed:** Final adapter. The site is a React SPA built on Lovable/GPT-Engineer with a Supabase backend; their anon key and project URL are shipped in the client bundle (so legitimately public). All content lives in a `site_content` key/value table — the upcoming markets are a single JSON-array row at `(section='schedule', key='markets')`. Adapter fetches that row via PostgREST, parses the JSON, infers the year from the `deadline` field (YYYY-MM-DD), parses "HH:MM - HH:MM" times when present, falls back to date-only otherwise. Malta-local times converted to UTC with the same DST helper used in `visitmalta`. The "featured" market image is fetched once per run and used as fallback hero. Tested live: 8/8 upcoming markets extracted with stable IDs and correct UTC times.
**Files touched:** [lib/importers/adapters/maltaartisanmarkets.ts](../lib/importers/adapters/maltaartisanmarkets.ts) *(new)*, [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [CLAUDE.md](../CLAUDE.md)
**Notes for future sessions:**
- All 8 seeded sources are now implemented. Future adapters (new sources) follow the existing pattern: write an adapter file, register in `registry.ts`, add to `IMPLEMENTED_ADAPTERS` in the sources admin page, and seed a new row in `event_sources` (via SQL migration).
- The maltaartisanmarkets adapter is the only one with a hardcoded foreign anon key. If the site changes its Supabase project or rotates keys, the adapter will throw 401/404 — log will be clear.
- Year inference is `deadline` first (always present), then current year. Will correctly handle Dec→Jan rollover.

---

## 2026-05-20 — Refresh TECHNICAL_PLAN.md + on-site admin guide

**What changed:** TECHNICAL_PLAN.md hadn't been touched since the very first commit (0a854b1) — completely rewrote it to reflect current architecture: stack diagram with Vercel Cron + Resend + Groq + GA4; current schema (events with content_hash/source_id/manual_edit_at/deleted_at, event_sources, import_runs, site_settings, leads/lead_history); 4-role model with RLS; event lifecycle including the import flow; current routes including admin sub-pages and the cron endpoint; site-customisation block system; importer pipeline (filter → hash → AI rewrite → tag suggest → upsert) with 7-of-8 adapter status; cron-on-Hobby constraint and Pro-upgrade path; GDPR/analytics; deploy/env vars; conventions; and a roadmap/known-gaps section. Updated the on-site admin handbook (`SUPER_ADMIN_GUIDE.html`, surfaced at `/admin/guide`): removed the stale "Phase 2 not built" callout, rewrote the importers section to document the live pipeline + cron + AI rewriter, added a new Site Editor section, expanded the Supabase tables list and URLs table, added three new troubleshooting entries (cron didn't fire / rewrite errors / manual_edit lock), refreshed the TL;DR to lead with importer + site editor flows.
**Files touched:** [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md), [SUPER_ADMIN_GUIDE.html](../SUPER_ADMIN_GUIDE.html)
**Notes for future sessions:**
- TECHNICAL_PLAN.md and SUPER_ADMIN_GUIDE.html are now in sync with reality as of 2026-05-20. CLAUDE.md §12 marks both as "do not touch unless asked" — keep that rule but refresh when the user explicitly requests it.
- `SUPER_ADMIN_GUIDE.html` is served at runtime by `/api/admin/guide` (which reads the file via `fs.readFile`). Bundled into the serverless deploy by `next.config.js → outputFileTracingIncludes`.

---

## 2026-05-20 — Visit Malta adapter (7 of 8 sources implemented)

**What changed:** Discovered the hidden Drupal-backed API behind visitmalta.com's events page. Auth flow: GET `https://api.visitmaltaplus.com/api/v1/authentication/guest-access-token?deviceId=<id>` → token; then GET `https://api.visitmaltaplus.com/api/v2/LoadAllEvents?limit=500&lang=en` with `Authorization: Bearer <token>` → 227 events as raw Drupal field structures. Each field is an array of `{value}` or `{target_id}` — adapter extracts title, body/summary, custom_date (start + end_value, ISO naive Malta-local), field_dtp_event_image (media id → image URL), field_booking_link, field_event_category (taxonomy id → free-form hint). Naive Malta-local times converted to UTC with a built-in CET/CEST DST check. Tested live: 226/227 upcoming and Published, dates correctly converted. Adapter at `lib/importers/adapters/visitmalta.ts`, registered in registry and IMPLEMENTED_ADAPTERS.
**Files touched:** [lib/importers/adapters/visitmalta.ts](../lib/importers/adapters/visitmalta.ts) *(new)*, [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [CLAUDE.md](../CLAUDE.md)
**Notes for future sessions:**
- Enable in Admin → Sources before it'll run.
- `recur_type='custom'` events use ISO dates; other recur types (daily/weekly/monthly) fall back to formatted `start_date`/`end_date` strings with `hasTime=false` and only yield a single occurrence.
- Per-run cap (max_events default 20) will see ~226 candidates — adjust to import more per run.
- API requires no key; guest token is anonymous and renews per request.
- 1 source still deferred: `artisanmarkets` (React SPA).

---

## 2026-05-20 — Festivals Malta adapter (6 of 8 sources implemented)

**What changed:** Added the festivals.mt adapter. Although it's a Wix SPA, the `/events` page server-renders the full upcoming-events dataset into the HTML as a JSON blob keyed `\/Events":{"<uuid>":...}`. The adapter regex-matches the UUID-keyed variant (Wix also embeds a schema definition at the same key), walks balanced braces (with string-literal awareness) to extract the object, parses it, and yields one ExternalEvent per SCHEDULED/STARTED entry with a future `start.$date`. Wix `image://` URIs are converted to `https://static.wixstatic.com/media/...`. Tested against live page: 41/41 upcoming events extracted. Requires Chrome User-Agent (Wix returns a stripped page otherwise). Registered in `lib/importers/registry.ts` and `IMPLEMENTED_ADAPTERS` in the sources admin page.
**Files touched:** [lib/importers/adapters/festivals_mt.ts](../lib/importers/adapters/festivals_mt.ts) *(new)*, [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [CLAUDE.md](../CLAUDE.md)
**Notes for future sessions:**
- Enable in Admin → Sources before it'll run.
- If Wix changes their SSR data shape, the regex `\\\/Events":\{"<uuid>"` is the canary — adapter will silently yield 0 events.
- 2 sources still deferred: `visitmalta` (no events page) and `artisanmarkets` (React SPA — would need network-tab API discovery).

---

## 2026-05-20 — Revert cron to daily (Vercel Hobby plan constraint)

**What changed:** Vercel Hobby plan rejects sub-daily cron schedules silently — the hourly `0 * * * *` schedule never registered. Reverted `vercel.json` to `0 5 * * *` (daily, 5am UTC ≈ 7am Malta summer). Removed the Malta-hour gate from the cron endpoint (only `cron_enabled` is checked now). Simplified the admin "Automatic schedule" section to just the enable/disable toggle, with the fixed run time noted in the description. `cron_hour` field is still in `site_settings` (no migration needed) but is no longer read.
**Files touched:** [vercel.json](../vercel.json), [app/api/cron/import/route.ts](../app/api/cron/import/route.ts), [app/admin/site/importers/page.tsx](../app/admin/site/importers/page.tsx)
**Notes for future sessions:**
- If user upgrades to Vercel Pro, re-enable hourly cron + Malta-hour gate to restore the configurable time picker. `cron_hour` is still in settings.
- Run time is locked to 05:00 UTC. To change, edit `vercel.json` and redeploy.

---

## 2026-05-20 — Gitignore fix for worktrees

**What changed:** Added `.claude/worktrees/` to `.gitignore` — it's a tool-generated directory that was showing as untracked and causing the stop hook to misfire. Note: `BRANDING.md` and `branding.config.js` remain untracked; commit or gitignore them if appropriate.
**Files touched:** [.gitignore](../.gitignore)

---

## 2026-05-20 — Configurable cron schedule via Site Editor

**What changed:** Made the auto-import schedule configurable from Admin → Site → Importers. Added `cron_enabled` (bool) and `cron_hour` (0–23, Malta local time) to `SiteSettingsShape.importers`. Changed `vercel.json` to fire every hour (`0 * * * *`); the cron endpoint now reads published settings, checks `cron_enabled`, converts UTC now to Europe/Malta time, and skips if the current hour doesn't match `cron_hour`. Added a "Automatic schedule" section to the importers settings page with an enable/disable toggle and a 24-option time select.
**Files touched:** [lib/site-settings.ts](../lib/site-settings.ts), [vercel.json](../vercel.json), [app/api/cron/import/route.ts](../app/api/cron/import/route.ts), [app/admin/site/importers/page.tsx](../app/admin/site/importers/page.tsx)
**Notes for future sessions:**
- Default: `cron_enabled=true`, `cron_hour=6` (6:00 AM Malta time).
- Settings changes take effect after Publish in the Site Editor.
- Vercel fires the function 24×/day; 23 of those return immediately with `skipped: true`.
- Requires `CRON_SECRET` env var in Vercel dashboard (Settings → Environment Variables).
- CLAUDE.md updated: directory map now includes `vercel.json` and `app/api/cron/import/`; section 8 notes the cron wiring.

---

## 2026-05-13 — Auto-tag suggestion + enhanced event approval

**What changed:** Imported events now auto-suggest tags (5 max) based on keyword matching in title/description, reviewed/edited inline by admins before approval. Approval page redesigned to show full event info (dates, pricing, venue, etc.), display auto-generated tags as pills, and allow in-place editing of title, description, image, and tags without leaving the page. Added "Full Edit" button to open `/events/{slug}/edit` for comprehensive editing. Tag suggestions use fast keyword matching (deterministic, no LLM cost); curated keyword map covers 12 event types (Music, Theatre, Dance, Art, Food & Drink, Family, Sport, Outdoor, Festival, Heritage, Comedy, Film).
**Files touched:** [lib/importers/tag-suggester.ts](../lib/importers/tag-suggester.ts) *(new)*, [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [app/admin/page.tsx](../app/admin/page.tsx)
**Notes for future sessions:**
- Tag keyword map can be expanded in `tag-suggester.ts` if new tag types are added. Currently optimized for Malta events context.
- Inline edits set `manual_edit_at` to prevent importer from overwriting approver changes.
- Approval page now fetches tags table on load to populate the tag selector in edit mode.

---

## 2026-05-12 — AI rewriter for imported event text (Gemini)

**What changed:** Added a rewrite step to the import pipeline that paraphrases scraped `title` and `description` via Google Gemini (`gemini-1.5-flash`, free tier) before storing, to avoid verbatim reproduction of source copy. Installed `@google/generative-ai`. Created `lib/importers/rewriter.ts` which returns `{ title, description, ok }` — `ok: false` means it fell back to original text. The rewriter is called only in the insert and update branches of `processOne()`. `contentHash` is computed from original scraped text so source dedup is unaffected. Added `rewrite_errors` to `ImportRunSummary` (not written to DB — no migration needed); the sources page shows a warning banner if any events were stored with unrewritten text.
**Files touched:** [lib/importers/rewriter.ts](../lib/importers/rewriter.ts) *(new)*, [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [lib/importers/types.ts](../lib/importers/types.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), `package.json`, `package-lock.json`
**Notes for future sessions:**
- Requires `GEMINI_API_KEY` in `.env.local` and Vercel env vars. Without it the pipeline logs a notice and stores original text, and the run banner warns the admin.
- Rewrite only fires for new inserts and hash-changed updates; hash-unchanged skips and manual-edit-locked events are untouched.
- Title rewriting is skipped for titles ≤ 5 words (usually just event names, not copyrightable).
- Free tier: 1,500 req/day, 15 RPM — more than enough for 20 events/run.

---

## 2026-05-11 — Global max_events + days_ahead via Site Editor

**What changed:** `max_events` and `days_ahead` are now global importer settings stored in `site_settings.published.importers` (draft/publish flow, super_admin only). Added both fields to `SiteSettingsShape.importers`, defaults (20 / 180), and parser in `site-settings.ts`. Pipeline reads them from `importersCfg` (already loaded in the same round-trip as `aggregator_user_id`). Added a **Run limits** section to `/admin/site/importers` with two number inputs. Removed per-source `ConfigEditor` that was briefly added to the Sources page. `ImportContext` still carries `daysAhead` + `cutoffDate` for adapters that want to short-circuit early.
**Files touched:** [lib/site-settings.ts](../lib/site-settings.ts), [lib/importers/types.ts](../lib/importers/types.ts), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [app/admin/site/importers/page.tsx](../app/admin/site/importers/page.tsx), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx)
**Notes for future sessions:**
- Change limits at Admin → Site → Importers → Run limits section → Publish.
- Defaults: `max_events=20`, `days_ahead=180`. These apply to all sources equally.
- Cutoff enforced in pipeline after each yield; `count` (for maxEvents cap) only increments for events that pass the cutoff check.

---

## 2026-05-11 — Heritage Malta + Esplora adapters (5 of 8 sources implemented)

**What changed:** Added two more import adapters. Heritage Malta uses the WP REST API with ACF custom fields (`start_date` YYYYMMDD, `opening_hours`, `ticket_groups`, `getting_here_*`; featured image via `_embed`) — the cleanest source so far. Esplora uses the WP REST API posts endpoint filtered by category 71, requires a Chrome User-Agent to bypass mod_security, and parses event dates from prose content via regex. Also added a `userAgent` override option to `fetchText()` in http.ts. The three remaining sources (Festivals.mt/Wix, Visit Malta, Malta Artisan Markets/SPA) have no accessible API and are deferred.
**Files touched:** [lib/importers/adapters/heritagemalta.ts](../lib/importers/adapters/heritagemalta.ts), [lib/importers/adapters/esplora.ts](../lib/importers/adapters/esplora.ts), [lib/importers/http.ts](../lib/importers/http.ts), [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx)
**Notes for future sessions:**
- 5 adapters live: `teatrumanoel`, `tsmalta`, `popp`, `heritagemalta`, `esplora`. All need enabling in Admin → Sources before running.
- Esplora currently produces 0 events (all recent seasonal events are past). Will produce events once they post their next programme.
- Heritage Malta has 864 total events; we only fetch page 1 (100, sorted by modified desc) and filter for future `start_date`. If upcoming events are missed, bump `per_page` or add a second page fetch.
- Deferred: Festivals.mt (Wix SPA), Visit Malta (no events API), Malta Artisan Markets (React SPA).
- Next logical steps: enable all 5 sources and test; attribution rendering on EventCard; Vercel Cron wiring.

---

## 2026-05-11 — No substantive changes (stop-hook noise)

**What changed:** Nothing beyond the adapter work logged above. Remaining dirty files at session end are `tsconfig.tsbuildinfo` (build artifact, excluded per CLAUDE.md §12) and `.claude/settings.local.json` (auto-modified by Claude Code tooling). No code, schema, or config changes.

---

## 2026-05-11 — Add Claude context system + Stop hook

**What changed:** Created [CLAUDE.md](../CLAUDE.md) (auto-loaded project map: stack, directories, domain model, roles, conventions, common tasks) and this session log so future sessions have context without re-exploring the codebase. Added a **Stop hook** in [.claude/settings.json](settings.json) that blocks session end if files were modified but `.claude/SESSION_LOG.md` wasn't updated — enforces the update protocol automatically. Discussed an analytics implementation plan (self-hosted Supabase tracking + admin dashboard) — **not yet built**, awaiting go-ahead.
**Files touched:** [CLAUDE.md](../CLAUDE.md), [.claude/SESSION_LOG.md](SESSION_LOG.md), [.claude/settings.json](settings.json)
**Notes for future sessions:**
- Analytics MVP is queued — see plan in conversation or ask the user. Open decisions: track logged-in users separately? add geo via request headers? show view badges on event cards?
- The Stop hook checks `git status --porcelain` for changes; if any exist and SESSION_LOG.md isn't among them, it forces Claude to keep working until the log is updated. Edge case: if you `git commit` everything (including without updating SESSION_LOG) before stopping, the hook won't catch it (working tree is clean). This is a small known gap.
- To disable temporarily: `/hooks` menu, or remove the `hooks.Stop` block from `.claude/settings.json`.

---

## Pre-2026-05-11 — Baseline (from `git log`)

This log starts on 2026-05-11. For earlier work, run `git log --oneline -50`. Highlights from recent commits:

- POPP.mt import adapter ([lib/importers/adapters/popp.ts](lib/importers/adapters/popp.ts))
- Teatru Salesjan import adapter ([lib/importers/adapters/tsmalta.ts](lib/importers/adapters/tsmalta.ts))
- "Edit" button on public event page for admins/super_admins ([components/StaffEditButton.tsx](components/StaffEditButton.tsx))
- RLS fix so admins/super_admins can UPDATE any event (migration 0011)
- Image extraction fix for Teatru Manoel imports
