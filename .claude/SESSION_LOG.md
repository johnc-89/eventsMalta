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
