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
