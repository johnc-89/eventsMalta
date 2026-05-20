# Events Malta — Technical Plan

> **Status:** Live production. This document reflects the architecture as it currently exists, not the original launch plan. For day-to-day session history see [.claude/SESSION_LOG.md](.claude/SESSION_LOG.md). For the navigable codebase map see [CLAUDE.md](CLAUDE.md).

## 1. Architecture

```
Browser ──► Next.js 14 (Vercel) ──► Supabase (Postgres + Auth + Storage)
                │                       ▲
                │                       │ RLS-enforced reads/writes
                │
                ├──► Vercel Cron (daily 05:00 UTC) ──► /api/cron/import
                │       └──► importer pipeline ──► Postgres
                │                ├──► Groq (AI text rewriter)
                │                └──► tag-suggester (keyword matcher)
                │
                ├──► Resend (transactional email)
                └──► Google Analytics 4 (opt-in only)
```

| Layer | Tech | Notes |
|---|---|---|
| App | Next.js 14 App Router, TypeScript | Server components for public reads, client components for auth/admin |
| Hosting | Vercel | Auto-deploys from `main`. Hobby plan — daily cron only. |
| DB / Auth | Supabase Postgres + Supabase Auth | Single client at [lib/supabase.ts](lib/supabase.ts), anon key in browser; service-role key server-only |
| Security | Postgres Row Level Security | Every table; UI checks are belt-and-braces |
| Email | Resend | Transactional (event approved/rejected, invites) via [app/api/notify](app/api/notify) |
| Analytics | Google Analytics 4 | Loaded only after explicit cookie consent (see §10) |
| AI rewriter | Groq (`llama-3.1-8b-instant`) | Paraphrases scraped event text before storing — see [lib/importers/rewriter.ts](lib/importers/rewriter.ts) |
| Cron | Vercel Cron | One entry in [vercel.json](vercel.json) hitting `/api/cron/import` daily |
| Styling | Tailwind | Custom palette via `brand-*` tokens — see [tailwind.config.js](tailwind.config.js) |

No ORM, no API framework, no Redux. State is React Context (`AuthProvider`, `SiteSettingsProvider`).

---

## 2. Database schema (current)

All schema changes go into `supabase/migrations/NNNN_*.sql` and are applied via the Supabase SQL Editor (no automated runner). Every table has RLS enabled.

### Core content

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | One row per signed-up user. Extends `auth.users`. | `role` (user / trusted_uploader / admin / super_admin), `subscription_tier`, `max_active_events`, `suspended_at`, `deleted_at` |
| `categories` | Top-level event taxonomy. | `slug`, `display_order`, optional `icon` emoji |
| `tags` | Flexible labels, super_admin-managed. | `slug` |
| `events` | The core listing. | `status` (draft / pending_review / approved / rejected / cancelled), `organizer_id`, `category_id`, `tags TEXT[]`, `image_url`, `image_focal_x/y`, `has_time`, `show_organizer`, `view_count`, `manual_edit_at`, `content_hash`, `source_id`, `source_external_id`, `last_seen_at`, `deleted_at` |
| `event_images` | Gallery beyond `image_url`. | `event_id`, `display_order` |
| `saved_events` | User ↔ event bookmark. | PK `(user_id, event_id)` |

### Site customisation

| Table | Purpose |
|---|---|
| `site_settings` | Single-row table holding the `draft` and `published` JSON blobs for brand, hero, sections, blocks, pages, importer config, etc. See [lib/site-settings.ts](lib/site-settings.ts) for the full TypeScript shape. |
| `site_settings_public` | View exposing only the `published` slot. Public-readable. |

### Event importing

| Table | Purpose |
|---|---|
| `event_sources` | External sites we pull from. `adapter` field maps to a module in `lib/importers/adapters/`. Holds `enabled`, `auto_publish` (locked false), `last_run_at`, `last_error`. |
| `import_runs` | One row per pipeline invocation. Stores `triggered_by`, status (`ok` / `partial` / `error`), counts (fetched / inserted / updated / skipped / excluded / errored), and an `error_log` text field. |

### CRM (super_admin only)

| Table | Purpose |
|---|---|
| `leads` | Outreach pipeline. `status` (Not Contacted → Contacted → Responded → Converted / Rejected), `quality`, `category`, contact fields, `converted_user_id`. |
| `lead_history` | Append-only audit log written by a DB trigger on every field change. |

### Soft delete

`events` and `profiles` use the `deleted_at TIMESTAMPTZ NULL` pattern. Every query filters `.is('deleted_at', null)`. Never hard-delete.

---

## 3. Roles & permissions

| Role | Can |
|---|---|
| `user` | Browse, save events, submit events for review |
| `trusted_uploader` | Same as user; submissions auto-approve (no review queue) |
| `admin` | All of above + approve/reject events, edit/delete any event, manage users (non-admin), manage tags |
| `super_admin` | Everything: customise site, manage event sources, run imports, access CRM, change other users' roles |

Authorisation is enforced **in the database via RLS**. UI gating (page-level `useEffect` reading `profile.role`) is a UX nicety only — the real defense is in Postgres policies.

Admin-only API routes (`app/api/admin/*`) use the service-role key on the server to bypass RLS where needed (e.g. inviting users, deleting accounts).

---

## 4. Authentication

- **Supabase Auth** — email/password + Google OAuth + magic-link / password reset.
- **Email verification** required before a user can submit events.
- **Suspended users** (`profiles.suspended_at IS NOT NULL`) see a static "suspended" page; their existing events remain unaffected.
- **Soft-deleted accounts** (`profiles.deleted_at`) hide from all queries; their events are kept under the aggregator.
- **Invite flow** — admins invite organisers from `/admin/users`. Invitee gets an email with a `/reset-password` link that doubles as "set initial password".

---

## 5. Event lifecycle

```
[User submission]                       [Cron import]
     │                                       │
     ▼                                       ▼
   draft                              SCHEDULED in source
     │                                       │
     │  Submit for review                    │  Adapter yields ExternalEvent
     ▼                                       ▼
pending_review ◄──────── pipeline (rewrites text, suggests tags, hashes for dedupe)
     │
     │ Admin approves    (or rejects with reason)
     ▼
  approved  ──── live on site ──── view_count increments
     │
     │  Event end date passes (≤ today)
     ▼
   past       ──── still viewable at /events/[slug]/past
     │
     │  Owner cancels OR admin deletes
     ▼
 cancelled / deleted_at set (soft delete)
```

**`trusted_uploader`** skips `pending_review` and goes straight to `approved`.

**Imported events** always land in `pending_review` regardless of source. `event_sources.auto_publish` is locked to `false` per policy.

---

## 6. Pages & routes

| Route | Auth | Purpose |
|---|---|---|
| `/` | public | Homepage — block-rendered |
| `/events` | public | Events list with filters/search |
| `/events/[slug]` | public | Event detail (server component, OG/SEO metadata) |
| `/events/create` | signed-in, not suspended | Submit a new event |
| `/events/[slug]/edit` | owner / admin / super_admin | Edit |
| `/events/past` | public | Archive |
| `/saved` | signed-in | Saved bookmarks |
| `/my-events` | signed-in | Upcoming + past split, with edit links |
| `/profile` | signed-in | Profile + organiser bio |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | public | Auth flows |
| `/privacy`, `/terms` | public | Legal pages (block-rendered, markdown-editable) |
| `/admin` | admin+ | Pending-review queue with inline editing + tag suggestions |
| `/admin/users` | admin+ | User management |
| `/admin/tags` | admin+ | Tag CRUD |
| `/admin/sources` | super_admin | External source config + run history + per-source Run button |
| `/admin/crm` | super_admin | Lead pipeline (dashboard / leads / import-export) |
| `/admin/site` | super_admin | Site editor — brand, hero, sections, blocks, importers, pages, SEO, email |
| `/admin/guide` | admin+ | In-app cheat sheet (renders `SUPER_ADMIN_GUIDE.html`) |
| `/api/admin/*` | server-only | Service-role endpoints (invite, delete-user, publish, import run) |
| `/api/cron/import` | Vercel Cron only | Hourly trigger (gated by `CRON_SECRET` + Malta-hour check) |
| `/api/notify` | internal | Transactional email via Resend |

---

## 7. Site customisation (super_admin)

The homepage and legal pages are **not hard-coded** — they're composed from blocks defined in [lib/blocks/](lib/blocks/):

- `types.ts` — block schema definitions
- `registry.ts` — registered block types (hero, categories grid, event lists, FAQ, markdown, image, etc.)
- `Editor.tsx` — drag-and-drop block editor used in `/admin/site`
- `Renderer.tsx` — runtime renderer used by public pages
- `defaults.ts` — initial blocks for fresh installs

Brand (name, tagline, palette, logo, favicon), hero copy/CTAs, footer, section toggles, SEO defaults, email signature, and importer settings all live in `site_settings.draft` → `site_settings.published` via a draft/publish workflow. The full TypeScript shape is in [lib/site-settings.ts](lib/site-settings.ts).

Palettes are pre-defined in [lib/site-palettes.ts](lib/site-palettes.ts) — picking one swaps the Tailwind `brand-*` tokens site-wide.

---

## 8. Event importers

**Goal:** auto-aggregate events from Maltese venues so visitors find everything in one place.

**Pipeline** (`lib/importers/pipeline.ts`):
1. Trigger: manual (`/admin/sources` Run button) or cron (`/api/cron/import`).
2. Load source + per-run config (`max_events`, `days_ahead`) from `site_settings.published.importers`.
3. Pre-flight: source must be enabled, an adapter must be registered, the aggregator user must exist.
4. Open an `import_runs` row with status `running`.
5. Stream events from the adapter (`async function*`).
6. For each event:
   - Apply hard political filter — drop matches as `excluded`.
   - Compute `content_hash` from original scraped text (so re-imports dedupe deterministically).
   - Match against existing `(source_id, source_external_id)`:
     - **None** → insert as `pending_review` (with AI rewrite + tag suggestion).
     - **Hash unchanged** → touch `last_seen_at`, skip.
     - **Hash changed, no `manual_edit_at`** → update (with re-rewrite).
     - **Hash changed, `manual_edit_at` set** → skip (don't clobber human edits).
7. Close the run row with final counts and a capped log (50 KB).

**Failure handling is best-effort at three layers:**

- Per-event try/catch in the pipeline → bumps `errored` count, moves on.
- Per-source try/catch in `/api/cron/import` → one source failing doesn't stop the rest.
- Top-level pipeline catch → records status as `error` in `import_runs` with the message.

### Adapters

Each external source has an **adapter** in [lib/importers/adapters/](lib/importers/adapters/) implementing the `Adapter` interface from [lib/importers/types.ts](lib/importers/types.ts):

```ts
interface Adapter {
  name: string
  fetchListings(ctx: ImportContext): AsyncIterable<ExternalEvent>
}
```

**Implemented (7 of 8):**

| Adapter id | Source | Technique |
|---|---|---|
| `teatrumanoel` | Teatru Manoel | WP sitemap → HTML parse |
| `tsmalta` | Teatru Salesjan | Archive page → uncode_text_column block |
| `popp` | POPP.mt | Events sitemap → embedded iCal block |
| `heritagemalta` | Heritage Malta | WP REST API `/wp/v2/events` + ACF fields |
| `esplora` | Esplora MCST | WP REST API posts (category 71), Chrome UA required |
| `festivals_mt` | Festivals Malta | Wix SSR — extract embedded `\/Events":{<uuid>:...}` JSON blob, Chrome UA required |
| `visitmalta` | Visit Malta | Drupal API: guest token → `api.visitmaltaplus.com/api/v2/LoadAllEvents`. Malta-local naive timestamps converted to UTC with built-in DST check. |

**Deferred:** `artisanmarkets` (React SPA — would need network-tab API discovery).

### AI rewriter (`lib/importers/rewriter.ts`)

Calls Groq (`llama-3.1-8b-instant`) to paraphrase scraped `title` and `description` before storing — avoids verbatim reproduction of source copy. Fallbacks gracefully to original text on API failure (the run banner warns the admin). Titles ≤ 5 words skip rewrite. Free tier limits are well above our throughput.

Requires `GROQ_API_KEY` in Vercel env vars.

### Tag suggester (`lib/importers/tag-suggester.ts`)

Deterministic keyword matcher (no LLM cost) — suggests up to 5 tags per imported event from a curated keyword map covering 12 event types (Music, Theatre, Dance, Art, Food & Drink, Family, Sport, Outdoor, Festival, Heritage, Comedy, Film). Admins review/edit tags inline in `/admin` before approving.

### Political-content filter (`lib/importers/political-filter.ts`)

Two layers, both case-insensitive substring matches against title + description + venue + organiser:

- **Hard-block** — drop entirely, counted as `excluded`.
- **Soft-flag** — still imports, but lands in `pending_review` with a visible flag.

Keyword lists are editable at `/admin/site/importers` (draft/publish flow).

---

## 9. Cron schedule

`vercel.json` registers one cron entry:

```json
{ "crons": [{ "path": "/api/cron/import", "schedule": "0 5 * * *" }] }
```

This fires daily at **05:00 UTC** (≈ 07:00 Malta in summer, 06:00 in winter). The endpoint:

1. Validates `Authorization: Bearer <CRON_SECRET>` (Vercel auto-injects).
2. Reads `site_settings.published.importers.cron_enabled` — if false, returns `{skipped: true}`.
3. Queries `event_sources WHERE enabled=true`.
4. Calls `runImport()` for each source sequentially, returning per-source results in the JSON response.

> **Why daily, not hourly?** Vercel Hobby plan silently rejects sub-daily cron schedules. To get hourly + configurable run time from the admin UI, upgrade to Pro and switch `vercel.json` to `"0 * * * *"`. The Malta-hour gate code is preserved in git history.

---

## 10. Privacy & analytics

- **Cookie consent banner** — GDPR/EU compliant. Strictly-necessary cookies always on; analytics opt-in only.
- **Google Analytics 4** — loaded lazily, only after explicit consent. No advertising, remarketing, or cross-site tracking. Anonymised IPs.
- **Privacy policy + Terms** — editable as markdown via the Site Editor; rendered at `/privacy` and `/terms`.
- **No third-party trackers** beyond GA4 (opt-in).
- **Data retention** — account data kept while active + 30 days encrypted backup; rejected drafts purged within 90 days.

---

## 11. Deploy & dev workflow

1. Local dev: `npm run dev` (port 3000). Local build check: `npm run build`.
2. Schema changes: write a new file at `supabase/migrations/NNNN_<description>.sql` and paste into the Supabase SQL editor (no automated runner). RLS policies live in the same migration as the table.
3. Code: commit to `main` → Vercel auto-deploys (1–2 min). Failed builds keep the previous deploy live.
4. Env vars required in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`, `RESEND_FROM`
   - `GROQ_API_KEY`
   - `CRON_SECRET`
   - `NEXT_PUBLIC_SITE_URL`, `ADMIN_EMAIL`

---

## 12. Conventions

- **Server vs client:** public read pages (event detail, lists) are **server components** using `supabase` directly. Auth/interactive pages are `'use client'`.
- **Service-role key:** server-only (`app/api/admin/*`, `/api/cron/*`). Never exposed to the browser.
- **Tailwind:** use brand palette tokens (`brand-gold`, `brand-teal`, `brand-dark`, `brand-burgundy`) — never raw hex.
- **Dates:** display in `Europe/Malta`; format with `toLocaleDateString('en-GB', …)`.
- **Soft delete:** always filter `.is('deleted_at', null)` on `events` and `profiles`.
- **Notifications:** fire-and-forget `fetch('/api/notify', …)` from UI handlers — don't await.
- **Comments:** only when the *why* is non-obvious. Code should be self-explanatory.

---

## 13. Roadmap / known gaps

- **Cross-source de-duplication** — currently dedup is per-source only. A Heritage Malta concert also listed on Visit Malta creates two records. Pragmatic options: manual rejection in the review queue (cheap, ships now), or fuzzy match on `normalize(title) + start_date + venue` at insert time with a `duplicate_of_event_id` link.
- **Scrape protection** — robots.txt is in place; further protection (Cloudflare Bot Management, content watermarking) is unfunded. The honest moat is being the canonical destination, not access control.
- **`artisanmarkets` adapter** — React SPA, needs network-tab API discovery.
- **Vercel Pro upgrade** — would enable hourly cron + configurable Malta-time run window (UI is already built; backend has the gate code in git history).
- **Per-source schedules** — each `event_sources` row has a `schedule_cron` column already, but the cron endpoint runs everything together. Per-source cron is a Pro-plan-only feature.
- **Recurring events** — the importer flattens recurring Drupal events to a single occurrence. A proper recurring-event model would let us surface all instances.
- **Full-text search** — currently filters by category/tag/text-contains. Postgres `tsvector` would be a more robust upgrade.
- **Location-based discovery** — PostGIS extension would enable "events near me".
- **Multi-language** — content is English only. Visit Malta serves Maltese/German/French/etc; we could plumb `lang` through.
