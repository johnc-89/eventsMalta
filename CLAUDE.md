# Events Malta — Claude Context

This file is auto-loaded by Claude Code at the start of every session. It is the canonical project map. **Read this first** instead of re-exploring the codebase.

> **Update protocol** (read me at session end): If this session made code/schema/architecture changes, append a dated entry to [.claude/SESSION_LOG.md](.claude/SESSION_LOG.md). Then update any section of this file that is now out of date (new top-level feature, new table, new convention, removed file). Keep this file under ~300 lines — move detail into SESSION_LOG.md or a topic-specific doc.

---

## 1. Product

**Events Malta** — public events listing site for Malta. Visitors browse events; registered users save events and submit their own; organisers (`trusted_uploader`+) submit events that admins approve; super_admins customise the site, manage users, and run an internal CRM for organiser outreach. The site also auto-imports events from external Maltese venues.

Live deployment: Vercel (auto-deploys from `main`).

---

## 2. Stack

- **Next.js 14** (App Router, TypeScript)
- **Supabase** (Postgres + Auth + Row Level Security) — single client at [lib/supabase.ts](lib/supabase.ts) using anon key; security enforced by RLS policies, not API code
- **Tailwind** (custom palette via `brand-gold`, `brand-teal`, `brand-dark`, etc. — see [tailwind.config.js](tailwind.config.js))
- **cheerio** for HTML scraping in importers
- **marked** for markdown rendering
- **@dnd-kit** for drag-and-drop (block editor, image reorder)

No ORM, no API framework, no Redux. State is React Context (`AuthProvider`, `SiteSettingsProvider`).

---

## 3. Directory map

```
app/                      # Next.js App Router
  page.tsx                # Homepage (block-based, configurable)
  layout.tsx              # Root layout — wraps Auth + SiteSettings providers
  events/
    page.tsx              # Events list (filters, search)
    [slug]/page.tsx       # Public event detail (server component, generates metadata)
    [slug]/edit/          # Owner/admin edit form
    create/               # New event form
    past/                 # Archived events
    tag/[slug]/           # SEO landing: one indexable page per enabled tag (server)
    location/[slug]/      # SEO landing per Malta locality (derived via lib/malta-localities.ts)
    today|this-weekend|this-month/  # SEO time-based landing pages (server, force-dynamic)
  venues/[slug]/            # SEO landing per venue (derived from location_name via lib/venues.ts)
  admin/                  # Admin dashboard — gated by profile.role check + middleware
    page.tsx              # Pending review queue
    duplicates/           # Duplicate-event finder (title-similarity + date/venue grouping, soft-delete)
    users/                # User management
    tags/                 # Tag CRUD
    sources/              # Event-import source config (super_admin)
    crm/                  # Lead pipeline (super_admin)
    site/                 # Site customisation: brand, hero, blocks, pages (super_admin)
    guide/                # Admin cheat sheet
  api/
    notify/               # Email notifications (event approved/rejected)
    admin/                # Server-only admin endpoints (use service role key here)
    cron/import/          # Vercel Cron endpoint — runs all enabled sources (GET, CRON_SECRET auth)
  auth/, login/, signup/, forgot-password/, reset-password/
  profile/, my-events/, saved/
  privacy/, terms/        # Legal pages (block-rendered)

components/               # Shared UI (EventCard, Navbar, Footer, EventForm, etc.)
lib/
  supabase.ts             # Browser client (anon key)
  auth-context.tsx        # AuthProvider — exposes user, profile, session, loading, signOut
  site-settings.ts        # Site customisation schema + loader
  site-settings-context.tsx
  site-palettes.ts        # Predefined colour palettes
  blocks/                 # Block-based page builder (Editor, Renderer, registry, types)
  importers/              # External event aggregation
    pipeline.ts           # Orchestrates a source run
    registry.ts           # Maps adapter id → adapter module
    adapters/             # One file per source (popp, teatrumanoel, tsmalta, ...)
    http.ts, hash.ts, sitemap.ts, political-filter.ts
  crm-access.ts, crm-csv.ts
  markdown.ts

types/index.ts            # All shared TypeScript types — single source of truth
supabase/migrations/      # Numbered SQL migrations (0001_…, 0002_…)
vercel.json               # Vercel Cron config — fires hourly, endpoint gates on configured Malta hour
middleware.ts             # No-cache + noindex headers for /admin/*
public/                   # Static assets
```

---

## 4. Domain model (key types — see [types/index.ts](types/index.ts) for full)

- **Profile** — `role: 'user' | 'trusted_uploader' | 'admin' | 'super_admin'`, `subscription_tier: 'free' | 'basic' | 'pro'`, `max_active_events`, `suspended_at`, `deleted_at`
- **Event** — `status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'cancelled'`, soft-delete via `deleted_at`, `view_count`, optional time (`has_time`), image focal point (`image_focal_x/y`), tags as text array
- **Category** — fixed taxonomy, `display_order`, optional `icon` emoji
- **Tag** — flexible labels, super_admin-managed
- **EventImage** — additional images beyond `image_url`
- **SavedEvent** — user ↔ event bookmarks
- **Lead / LeadHistory** — CRM for outreach (super_admin only)
- **EventSource / ImportRun** — external aggregation config + run history

---

## 5. Roles & permissions (enforced in DB via RLS)

| Role | Can |
|---|---|
| `user` | Browse, save events, submit events for review |
| `trusted_uploader` | Same as user; submissions auto-approve (no review queue) |
| `admin` | All of above + approve/reject events, edit/delete any event, manage users (non-admin), manage tags |
| `super_admin` | Everything: customise site, manage event sources, run imports, access CRM, change other users' roles |

UI gating: page-level `useEffect` checks `profile?.role`. Real defense is RLS in Postgres — never rely on UI checks alone. Admin-only endpoints under `app/api/admin/` use the **service role key** server-side.

---

## 6. Database & migrations

- All schema changes go in `supabase/migrations/NNNN_description.sql` (next number is whatever's after the highest existing).
- Apply via Supabase SQL editor (no automated runner — manual paste).
- RLS is enabled on every table. Policies live in the same migration as the table.
- Soft delete pattern: `deleted_at TIMESTAMPTZ NULL` + every query filters `.is('deleted_at', null)`.

Existing migrations (high level):
- 0001 — CRM (leads, lead history)
- 0002–0003 — Site settings (brand, hero, palettes, footer)
- 0004 — Block-based pages
- 0005 — Tags RLS fix
- 0006, 0011 — Events RLS (owner, admin)
- 0007 — `events.show_organizer`
- 0008 — `events.has_time`
- 0009 — Image focal point
- 0010 — Event sources + import runs
- 0012 — `increment_view_count` RPC
- 0013 — `event_occurrences` table (recurring events; `events.date_start` is now a denormalised cache of the next-upcoming occurrence)
- 0014 — Slide event `date_start` (homepage slider support)
- 0015 — Merge taxonomies (categories → tags)
- 0016 — `event-images` storage bucket
- 0017 — More event sources (gianpula, cafedelmar, g7events, unomalta)
- 0018 — Malta for Kids event source

---

## 7. Site customisation (super_admin)

The homepage and legal pages are **not hard-coded**. They are composed from blocks defined in [lib/blocks/](lib/blocks/):

- `lib/blocks/types.ts` — block schema definitions
- `lib/blocks/registry.ts` — registered block types (hero, categories grid, event lists, FAQ, markdown, etc.)
- `lib/blocks/Editor.tsx` — drag-and-drop block editor used in `/admin/site`
- `lib/blocks/Renderer.tsx` — runtime renderer used by public pages
- `lib/blocks/defaults.ts` — initial blocks for fresh installs

Brand (name, tagline, palette, logo, favicon) and section toggles live in `site_settings` table — see [lib/site-settings.ts](lib/site-settings.ts) for the full shape.

---

## 8. Event importers

External sources auto-imported on cron. Each source has an **adapter** in [lib/importers/adapters/](lib/importers/adapters/) implementing the `Adapter` interface from [lib/importers/types.ts](lib/importers/types.ts). The pipeline:

1. Cron / manual trigger → `lib/importers/pipeline.ts`
2. Pipeline calls `adapter.fetchListings(ctx)` — an `AsyncIterable<ExternalEvent>`
3. Text rewrite: titles/descriptions paraphrased via AI (`lib/importers/rewriter.ts`); falls back to original on error
4. Each event is hashed (`lib/importers/hash.ts`) for dedupe against `events.content_hash`
5. Political filter applied (`lib/importers/political-filter.ts`) — hard-block drops, soft-flag logs
6. Tag suggestion: Claude Haiku 4.5 (via `@anthropic-ai/sdk`) → Groq llama-3.1-8b-instant → keyword fallback. Hard-constrained to existing tag names; the model cannot invent tags. See `lib/importers/tag-suggester-ai.ts` + `pickTags()` in `pipeline.ts`. Requires `ANTHROPIC_API_KEY` (preferred) and/or `GROQ_API_KEY` (fallback).
7. Image mirroring: each event's `imageUrl` is downloaded server-side and uploaded to the `event-images` bucket at `imports/<adapter>/<sha256(url)>.<ext>` via `lib/importers/image-mirror.ts`. `events.image_url` then holds the `*.supabase.co/storage/v1/object/public/event-images/...` URL. Dedup is by URL hash — same source URL → same path → at most one upload ever. Failures keep the original URL so the import never breaks. **This replaces the per-source `next.config.js` remotePatterns** that caused 6 image-allowlist bugs in two days; the `event-images` allowlist entry is the only one new adapters need.
8. Insert / update / skip based on hash + `manual_edit_at` guard; stats written to `import_runs`

Imports always create events with `status='pending_review'` (`auto_publish` is locked false per policy). Admins review suggested tags + event info inline on [/admin](app/admin/page.tsx), then approve or reject with optional edits.

**Implemented adapters (13 of 13 seeded sources):**

| Adapter id | Source | Technique |
|---|---|---|
| `teatrumanoel` | Teatru Manoel | WP sitemap → HTML parse (og:image, regex date) |
| `tsmalta` | Teatru Salesjan | Archive page → uncode_text_column block |
| `popp` | POPP.mt | Events sitemap → embedded iCal block |
| `heritagemalta` | Heritage Malta | WP REST API `/wp/v2/events` + ACF fields |
| `esplora` | Esplora MCST | WP REST API posts (category 71), Chrome UA required |
| `festivals_mt` | Festivals Malta | Wix SSR — extract embedded `\/Events":{<uuid>:...}` JSON blob, Chrome UA required |
| `visitmalta` | Visit Malta | Drupal API: guest token → `api.visitmaltaplus.com/api/v2/LoadAllEvents`. Malta-local → UTC with DST check. |
| `maltaartisanmarkets` | Malta Artisan Markets | Their Supabase project's `site_content` table (anon key shipped in their client bundle). Schedule is one JSON-array row. |
| `gianpula` | Gianpula Village | Scrape `/events/` listing cards (date/time/venue/genre/image). Date has no year → inferred to soonest future. |
| `cafedelmar` | Café del Mar Malta | `/wp/v2/event` REST list → recover date from each detail page's "Book Sofa" CTA link (`?date=YYYY-MM-DD`). Date-only. |
| `g7events` | G7 Events | Homepage `/events/<slug>` link harvest → detail parse (`.detail.calendar/.clock/.location`). Blocks browser UA; importer UA works. |
| `unomalta` | UNO Malta | The Events Calendar (Tribe) REST `/wp-json/tribe/events/v1/events` (`utc_start_date`, venue, cost, image). |
| `maltaforkids` | Malta for Kids | WordPress + My Calendar plugin. Public JSON `/wp-json/my-calendar/v1/events?from=&to=` keyed by date. Dedupe occurrences by `occur_id`, group by `event_id`, Malta-local → UTC. Kids/family directory. |

**All 13 seeded sources are now implemented.** (ra.co / Resident Advisor was evaluated and dropped — hard Cloudflare bot block, no fetch-based path that fits the adapter model.)

**Kids/family sources evaluated & deferred** (2026-06-17): maltababyandkids.com (WP, no events REST route → HTML scrape needed), outwithkidz.com (JS-rendered SPA), edencinemas.com.mt special events (custom/elqueque CMS, few events), theeden.mt (Next.js leisure centre, not really kids), playmobilmalta.com (WP category, currently empty). esplora already covered.

To add a source: write `lib/importers/adapters/<name>.ts`, register in `lib/importers/registry.ts`, seed the `event_sources` row via a migration, deploy, then enable the row in `/admin/sources`. The "Run now" button reads the registry live via `GET /api/admin/sources/adapters` — no separate UI list to keep in sync (an adapter just needs to be in the registry and **deployed**).

**Cron:** `vercel.json` fires `GET /api/cron/import` every hour. The endpoint reads `site_settings.importers.cron_enabled` + `cron_hour` (Malta local time, 0–23) and skips unless the current Malta hour matches. Schedule is configurable from Admin → Site → Importers without a redeploy. Requires `CRON_SECRET` env var in Vercel dashboard.

---

## 9. Conventions

- **Server vs client**: Public read pages (event detail, lists for SEO) are **server components** using `supabase` directly. Pages with auth/interaction are `'use client'`.
- **Auth in client**: `useAuth()` from [lib/auth-context.tsx](lib/auth-context.tsx). Always check `loading` before reading `user`/`profile`.
- **Server-side privileged actions**: Use the service role key in API routes under `app/api/admin/`, never expose it to the client.
- **Tailwind classes**: Use the brand palette tokens (`brand-gold`, `brand-teal`, `brand-dark`, `brand-burgundy`) — never raw hex.
- **Dates**: Display in `Europe/Malta` timezone; format with `toLocaleDateString('en-GB', …)`.
- **Soft delete**: Always filter `.is('deleted_at', null)` on `events` and `profiles`.
- **Notifications**: Don't await `fetch('/api/notify', …)` from UI handlers — fire-and-forget so the UI stays snappy.
- **No comments unless WHY is non-obvious** — code should be self-explanatory.
- **No Prettier/ESLint enforcement in commits** — match surrounding style.

---

## 10. Common tasks

| Task | Where |
|---|---|
| Run dev server | `npm run dev` (port 3000) |
| Add a DB column | New migration in `supabase/migrations/`, update `types/index.ts` |
| Add a new admin page | `app/admin/<name>/page.tsx`, add link in `app/admin/page.tsx` |
| Add a new event-source importer | `lib/importers/adapters/<name>.ts` + register in `lib/importers/registry.ts` |
| Add a new block type | `lib/blocks/registry.ts` + `Renderer.tsx` + `Editor.tsx` |
| Add a new role permission | Update RLS in a migration; UI check uses `profile?.role` |

Test build locally before pushing: `npm run build`.

---

## 11. Recent work

See [.claude/SESSION_LOG.md](.claude/SESSION_LOG.md) for the chronological log. Latest entries are most relevant.

---

## 12. Files NOT to touch unless explicitly asked

- `*.html` setup guides at root (DEVELOPER_SETUP.html, SUPER_ADMIN_GUIDE.html) — generated/curated separately
- `CLAUDE_CODE_INSTRUCTIONS.md`, `SETUP*.md`, `DEPLOYMENT.md`, `QUICKSTART.md`, `TECHNICAL_PLAN.md` — human-facing setup docs, not Claude context
- `.env.local` — secrets
- `tsconfig.tsbuildinfo` — build artifact
