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
