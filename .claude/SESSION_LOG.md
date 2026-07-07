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

## 2026-07-06 — Security fix Phase 3: in-memory rate limiting (Hobby-plan fallback)

**What changed:** Attempted Phase 3 via Vercel WAF (user's chosen no-code path): linked the repo to the `events-malta` Vercel project and staged rate-limit firewall rules, but the project is on the **Hobby plan** and WAF rate limiting requires **Pro** (`"Rate limiting is not available for this plan (401)"`). Discarded the staged drafts (firewall left clean). User opted for the in-memory code fallback instead. Added `lib/rate-limit.ts` — a best-effort per-IP fixed-window limiter (per-instance, resets on cold start; MAX_KEYS_PER_BUCKET=10k guards against memory-DoS from many distinct IPs) — and wired it into `POST /api/notify` (5/60s/IP, blunts admin-mailbox email-bomb) and `GET /api/referral/track` (10/10s/IP, protects the unauthenticated service-role DB read). Note: `/login`,`/signup` etc. call Supabase directly from the browser, so a server-side limiter can't cover auth brute-force — Supabase's own auth limits do.
**Files touched:** [lib/rate-limit.ts](../lib/rate-limit.ts) (new), [app/api/notify/route.ts](../app/api/notify/route.ts), [app/api/referral/track/route.ts](../app/api/referral/track/route.ts). Also: repo now linked to Vercel (`.vercel/`, gitignored). `npx tsc --noEmit` clean.
**Notes for future sessions:** In-memory limiter is a stopgap — for robust cross-instance limiting either upgrade `events-malta` to Vercel Pro (the 5 WAF rule commands are documented in chat: referral/track 10/10s, notify 5/60s, contact 5/60s, /api/admin/ 30/60s, auth pages 10/60s) or add Upstash/@upstash/ratelimit. `app/api/contact/route.ts` already had its own equivalent in-memory limiter (5/hr/IP) — could be migrated to `lib/rate-limit.ts` for consistency but left as-is. Phase 4 (optional, not done): one-shot `event_submitted` email guard; open-redirect interstitial on referral/track. Migrations 0030+0031 applied by user; 0029/0030/0031 still uncommitted in git.

## 2026-07-06 — Security fix Phase 2: DB-side event cap (migration)

**What changed:** Wrote `0031_enforce_event_cap.sql` — fixes the High "no DB-side event cap" finding (`max_active_events` was UI-only). Adds `enforce_event_cap()` (SECURITY DEFINER, reads profiles regardless of caller RLS — the 0024/0026 pattern) + a `BEFORE INSERT` trigger on `events` that rejects inserts once a non-staff user's active events (status IN draft/pending_review/approved, `deleted_at IS NULL`) reach their `max_active_events`. admin/super_admin exempt; NULL limit = unlimited. Also bumps the importer aggregator account (`aggregator@noreply.eventsmalta.org`) cap to 1,000,000 so bulk imports never trip it. Phase 1 (`0030`) confirmed applied by user; `0031` **not yet applied**.
**Files touched:** [supabase/migrations/0031_enforce_event_cap.sql](../supabase/migrations/0031_enforce_event_cap.sql) (new)
**New tables/migrations:** 0031 (trigger + function on `events`).
**Notes for future sessions:** Trigger fires on INSERT only — users already over-limit keep existing events but can't add new ones. Count semantics: rejected/cancelled excluded (change one WHERE line if the user later wants cancelled to count). If the aggregator bump UPDATE hits 0 rows, the aggregator account isn't provisioned under that email — revisit. Remaining plan: Phase 3 = Vercel WAF dashboard rate-limit rules (user's task, no code); Phase 4 optional (one-shot email guard, open-redirect interstitial).

## 2026-07-06 — Security fix Phase 1: event-images bucket hardening (migration only)

**What changed:** Wrote `0030_event_images_bucket_hardening.sql` to fix the two Critical findings from the security review below. (1) Replaces the unscoped 0016 INSERT/UPDATE/DELETE storage policies (any authenticated user could delete/overwrite every object in `event-images`) with owner-scoped ones keyed on `(storage.foldername(name))[1] = auth.uid()::text`. (2) Sets `file_size_limit = 5 MB` + `allowed_mime_types` (jpeg/png/webp) on the bucket (EventForm checks were client-side only). **Not yet applied** — needs manual paste into the Supabase SQL editor.
**Files touched:** [supabase/migrations/0030_event_images_bucket_hardening.sql](../supabase/migrations/0030_event_images_bucket_hardening.sql) (new)
**New tables/migrations:** 0030 (storage.objects policies + storage.buckets limits). Apply after 0029.
**Notes for future sessions:** Remaining agreed plan — Phase 2: DB-side `max_active_events` via a BEFORE INSERT trigger on `events` (deferred pending user confirm of count semantics + aggregator exemption). Phase 3: rate limiting via **Vercel WAF dashboard rules** (user's choice, no code) on `/api/referral/track`, `/api/notify`, `/api/admin/*`, auth pages. Phase 4 (optional): one-shot `event_submitted` email guard; open-redirect interstitial. Importer writes bypass RLS (service role) so `imports/` objects are unaffected by the owner-scoped policies.

## 2026-07-06 — (housekeeping note, no new changes)

**What changed:** Nothing beyond the contact-page entry below, which was committed and pushed in `9045a33`. The only remaining dirty file at session end is `supabase/migrations/0030_event_images_bucket_hardening.sql` — created by a **different concurrent session** (storage-bucket security fix), deliberately left uncommitted here for that session to log and commit.

---

## 2026-07-06 — Contact page: form + inbox + CRM lead capture

**What changed:** Replaced the footer `mailto:` with a real `/contact` page (SEO/credibility): a `contact_form` block type + [components/ContactForm.tsx](../components/ContactForm.tsx) (name/email/topic/message, conditional listing-URL field, honeypot + min-fill-time anti-spam) posting to `POST /api/contact` (per-IP rate limit, service-role insert into `contact_messages`, Resend notification with reply-to, organiser topic auto-creates a CRM lead). New admin inbox at [/admin/messages](../app/admin/messages/page.tsx) (new/read/archived triage). Page is block-editable (Site Editor → Pages → Contact Page, slug `contact`) with the usual hard-coded fallback; ContactPage JSON-LD + sitemap entry added.
**Files touched:** [app/contact/page.tsx](../app/contact/page.tsx), [app/api/contact/route.ts](../app/api/contact/route.ts), [app/admin/messages/page.tsx](../app/admin/messages/page.tsx), [app/admin/site/pages/contact/page.tsx](../app/admin/site/pages/contact/page.tsx), [components/ContactForm.tsx](../components/ContactForm.tsx), lib/blocks/{types,defaults,registry,Renderer,Editor}, [components/Footer.tsx](../components/Footer.tsx), [app/sitemap.ts](../app/sitemap.ts), [app/admin/page.tsx](../app/admin/page.tsx), [types/index.ts](../types/index.ts), [lib/site-settings.ts](../lib/site-settings.ts)
**New tables/migrations:** 0029 — `contact_messages` (RLS: admin read/update only; inserts via service role, no anon INSERT policy). **Must be applied in the Supabase SQL editor before the form works in prod** — until then submissions return the friendly 500.
**Notes for future sessions:**
- Notification email goes to `footer.contact_email` from published site settings (fallback `ADMIN_EMAIL`); form submissions are stored in DB first, email is best-effort.
- Organiser-topic submissions create a lead (`category='Inbound'`, `status='Responded'`); if a lead with the same name exists it links instead of overwriting.
- Rate limit is in-memory per serverless instance (5/hr/IP) — add Turnstile only if real spam shows up.

---

## 2026-07-06 — Security review (read-only, no code changed)

**What changed:** Nothing in code — this was an attacker-perspective security audit of the app's attack surface (API routes, service-role usage, RLS, storage policies, CSP, injection/XSS, DoS). Logged here for the record; findings below are open, unfixed.
**Files touched:** none (audit only — all `grep`/`cat`/`Read`).
**Findings (ranked):**
- **Critical — storage bucket write policies unscoped:** [supabase/migrations/0016_event_images_bucket.sql](../supabase/migrations/0016_event_images_bucket.sql) INSERT/UPDATE/DELETE policies check only `bucket_id = 'event-images'`, not owner/path. Any authenticated user (free signup) can delete/overwrite **every** image in the bucket via the Storage API + anon key. Fix: scope to `(storage.foldername(name))[1] = auth.uid()::text` (form already uploads to `${user.id}/...`).
- **Critical — no server-side upload limits:** bucket created with no `file_size_limit`/`allowed_mime_types`; the 5MB + JPEG/PNG/WebP checks in [components/EventForm.tsx](../components/EventForm.tsx) (~line 191) are client-side only → storage/bandwidth exhaustion, arbitrary file hosting on the public domain.
- **High — no rate limiting anywhere:** amplifies DoS/cost (e.g. unauthenticated service-role DB read per hit on [app/api/referral/track/route.ts](../app/api/referral/track/route.ts)), credential stuffing, email bombing.
- **High — no DB-side event cap:** `max_active_events` enforced in UI only; events INSERT policy is just `auth.uid() = organizer_id` (0000_baseline.sql). trusted_uploader auto-approve → public-listing flood.
- **Medium:** admin email bomb via repeated `event_submitted` to [app/api/notify/route.ts](../app/api/notify/route.ts); open redirect via [app/api/referral/track/route.ts](../app/api/referral/track/route.ts) (http/https-only but off-domain, phishing).
- **Verified solid:** all service-role admin routes verify caller JWT+role; no stored XSS (descriptions render escaped; markdown only fed super-admin content; JSON-LD uses `jsonLdSafe`); strong headers; RLS hardening 0020–0027.
**Notes for future sessions:** The two storage-bucket fixes are the priority (one migration, `0030`). **Unrelated pre-existing uncommitted changes were in the working tree at session start and were NOT made by this session:** `types/index.ts` (modified) and `supabase/migrations/0029_contact_messages.sql` (new `contact_messages` table/feature) — untouched and unreviewed here; commit/log separately.

## 2026-07-06 — Fix sitewide text contrast failures (brand-cyan/brand-teal on light backgrounds)

**What changed:** The same Lighthouse audit flagged brand-cyan (#22d3ee, 1.8:1 on white) and brand-teal (#0d9488, 3.7:1 on white) failing WCAG AA's 4.5:1 text-contrast requirement wherever they're used as resting-state link/label text — "View all" links, tag pill labels (e.g. "Family Friendly"), badge text, and the cookie banner's Privacy Policy link, across ~35 files. Added `brand-teal-dark` (#0f766e, 5.5:1 on white) to `tailwind.config.js` and swapped every non-hover `text-brand-cyan`/`text-brand-teal` usage to it via a scripted regex pass (hover states, borders, and `bg-brand-teal/NN` tints were intentionally left untouched — they weren't flagged and changing hover colors would remove the visual affordance).
**Files touched:** [tailwind.config.js](../tailwind.config.js) (new `brand-teal-dark` token) + ~35 files across `app/`, `components/`, `lib/blocks/` (every file matching `text-brand-cyan`/`text-brand-teal`).
**Notes for future sessions:** If a new component introduces link/label text on a light background, reach for `text-brand-teal-dark`, not `text-brand-cyan` or `text-brand-teal` — those two remain reserved for hover states, borders, and background tints where the lower contrast doesn't matter.

## 2026-07-06 — Fix agentic-browsing accessibility audit failures (nav + date filters)

**What changed:** A mobile Lighthouse-style "agentic browsing" audit flagged two accessibility-tree issues: the navbar's hamburger button had no discernible text, and the events date-range `<input type="date">` fields had no labels. Added `aria-label`/`aria-expanded` to the hamburger toggle, and `aria-label="From date"`/`"To date"` to both date-range filter implementations (the interactive `/events` filter bar and the homepage/landing-page `DateRangeFilter` widget). Purely additive a11y attributes, no behavior change. Verified in mobile preview: button now announces "Open menu"/"Close menu" and toggles `aria-expanded`; date inputs show as labeled `Date` controls in the accessibility snapshot.
**Files touched:** [components/Navbar.tsx](../components/Navbar.tsx) (hamburger button, ~line 135), [app/events/EventsList.tsx](../app/events/EventsList.tsx) (custom from/to date inputs, ~line 341), [components/DateRangeFilter.tsx](../components/DateRangeFilter.tsx) (from/to date inputs, ~line 25)
**Notes for future sessions:** Unrelated issue surfaced while testing on mobile — `/events` currently throws an unhandled client error because an imported event's image host (`gianpulavillage.com`, from the `gianpula` adapter) isn't mirrored to Supabase storage and isn't in `next.config.js` `remotePatterns` (which per convention only allows `*.supabase.co` — see §8 image mirroring). Suggests either a past image-mirror failure for that event or a gap in the mirroring step; worth a follow-up look at `lib/importers/image-mirror.ts` and that event's row.

## 2026-07-06 — Block editor UX: full-width canvas + slide-over edit drawer

**What changed:** Reworked the block builder layout (used by the homepage, events page, and all landing editors) from a cramped 3-column grid into a 2-pane layout: a slim, collapsible block rail + a full-width canvas. The block config panel is now a right slide-over drawer (~440px, `sm:w-[440px]`, full-width on mobile) that opens only when a block is selected and closes via the ✕, `Esc`, or clicking the backdrop — replacing the permanent 3rd column and the "👈 click a block" empty state. Drawer form is single-column for the roomier width. Pure presentational change — no block logic/data touched. Verified: typecheck + all editor routes render 200 with no errors (interactive drawer not driven — needs super_admin login).
**Files touched:** [BlockBuilder.tsx](../app/admin/site/blocks/_components/BlockBuilder.tsx) (rail collapse state, Esc handler, drawer overlay), [ConfigPanel.tsx](../app/admin/site/blocks/_components/ConfigPanel.tsx) (close button, single-column form, drop empty-state).
**Notes for future sessions:** Drawer is modal (backdrop closes it) — to switch blocks you close then pick another. If non-modal switching is wanted later, drop the backdrop + add canvas right-padding when open.

## 2026-07-06 — Fix Event JSON-LD "Missing field 'location'" (Search Console)

**What changed:** Google Search Console flagged three event pages (Two Springs, Justice, Feast of St Nicholas of Bari-Siġġiewi) with "Missing field 'location'" — invalid Event rich results. The Event JSON-LD in the event detail page only emitted `location` when `event.location_name` was set (`...(event.location_name && { location: {…} })`), so events with no venue name shipped structured data without the required `location`. Changed `location` to be always emitted, falling back to the derived Malta locality or `'Malta'` as the Place name when no venue is set; `addressCountry: 'MT'` keeps it valid. Typecheck passes.
**Files touched:** [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx) (JSON-LD `location` block, ~line 174)
**New tables/migrations:** none
**Notes for future sessions:**
- After deploy, run **VALIDATE FIX** in Search Console on the "Missing field 'location'" issue. Pages are ISR (`revalidate = 600`) so cached HTML refreshes within ~10 min.
- The affected events genuinely lack `location_name` in the DB. "Malta" is a valid-but-vague fallback; if a real venue exists (e.g. Siġġiewi is in the title), populating `location_name` would be more precise. Not done this session — offered to the user.

---

## 2026-07-05 — Events page is now block-editable (WordPress-style)

**What changed:** Made `/events` editable via the same drag-and-drop block builder as the homepage, reachable from Site Editor → Pages → Events Page. The `block_pages` table was already multi-page-ready (keyed by `slug`), so the editor was made slug-generic and a new `events_browser` block type was added that wraps the interactive `EventsList` (searchable/filterable/infinite-scroll list) with an editable heading + markdown intro. Public `/events` renders published blocks when present, else falls back to the original hard-coded layout (same pattern as `app/page.tsx`).
**Files touched:** [lib/blocks/types.ts](../lib/blocks/types.ts), [lib/blocks/defaults.ts](../lib/blocks/defaults.ts), [lib/blocks/registry.ts](../lib/blocks/registry.ts), [lib/blocks/Renderer.tsx](../lib/blocks/Renderer.tsx), [lib/blocks/Editor.tsx](../lib/blocks/Editor.tsx), [BlockEditorContext.tsx](../app/admin/site/blocks/BlockEditorContext.tsx) (slug prop + `allowImportFromSections`), [_components/BlockBuilder.tsx](../app/admin/site/blocks/_components/BlockBuilder.tsx) (extracted reusable builder — Next.js forbids extra named exports from `page.tsx`), [app/admin/site/blocks/page.tsx](../app/admin/site/blocks/page.tsx), [app/admin/site/pages/events/page.tsx](../app/admin/site/pages/events/page.tsx) (new), [Canvas.tsx](../app/admin/site/blocks/_components/Canvas.tsx) (passes `preview:true`), [EditorSidebar.tsx](../app/admin/site/_components/EditorSidebar.tsx), [app/events/page.tsx](../app/events/page.tsx), [.claude/launch.json](launch.json) (autoPort).
**New tables/migrations:** [0027_events_block_page.sql](../supabase/migrations/0027_events_block_page.sql) — seeds a `block_pages` row (`slug='events'`) pre-populated (draft + published) with one `events_browser` block carrying the current copy, so the page is visually unchanged until edited. **Must be applied via Supabase SQL editor (manual paste).**
**Notes for future sessions:**
- **`events_browser` needs a preview guard:** it renders the live `EventsList`, whose effects call `router.replace('/events?…')`. Inside the admin canvas that would navigate the editor away, so `RenderContext.preview` (set by `Canvas.tsx`) makes the block render a static, side-effect-free grid instead.
- **Block mode was NOT verified end-to-end against the live DB** — the production write to seed the row was (correctly) blocked by the auto-mode classifier. Verified: `npm run build` (typechecks all block branches via the discriminated union) + fallback `/events` renders identically. To finish verifying: apply 0027, then load `/events` (block mode) and `/admin/site/pages/events`.
- Until 0027 is applied, the admin editor at `/admin/site/pages/events` will show a save-error state (no `block_pages` row to load), and public `/events` stays in fallback mode.

## 2026-07-05 — Block-editable landing pages: Phase 4 (admin UI) — feature complete

**What changed:** Built the Site Editor admin for the landing page types. New "Landing pages" group in the Site Editor sidebar → one editor per type (location/tag/venue/today/this-weekend/this-month/month) that reuses the existing drag-and-drop `BlockBuilder` targeting `landing:<type>`, plus: an SEO meta panel (title/description templates), a placeholder cheat-sheet, a "Load starter layout" button, and — for types with instances — an override picker that switches the builder to `landing:<type>:<instance>` (with "Delete override" → reverts to template). The block editor context now (a) creates the `block_pages` row on first open if missing (super_admin RLS permits), (b) manages `draft_meta`/`published_meta` alongside blocks, (c) accepts a `landingType` so the canvas previews sample placeholders + a sample event grid. **Verified:** typecheck + `npm run build` green; block mode renders end-to-end (seeded a temp `landing:location:valletta` override → H1/related-links/grid/JSON-LD + SEO title & description all interpolated `{location}`/`{count}`/`{month_year}` correctly → deleted it, fallback restored); all 7 editor routes server-render 200. **NOT yet verified:** the interactive editor UI (needs super_admin login) — that's the user walkthrough.
**Files touched:** New — [app/admin/site/pages/landing/[type]/page.tsx](../app/admin/site/pages/landing/[type]/page.tsx), [landing/_components/LandingPageEditor.tsx](../app/admin/site/pages/landing/_components/LandingPageEditor.tsx), [landing/_components/LandingControls.tsx](../app/admin/site/pages/landing/_components/LandingControls.tsx), [lib/blocks/landing-starters.ts](../lib/blocks/landing-starters.ts). Modified — [BlockEditorContext.tsx](../app/admin/site/blocks/BlockEditorContext.tsx) (meta + create-on-missing + `landingType` + `loadStarterLayout`; uses `.maybeSingle()`), [BlockBuilder.tsx](../app/admin/site/blocks/_components/BlockBuilder.tsx) (`landingType` + `headerSlot`; canvas ctx gets sample placeholders/events), [EditorSidebar.tsx](../app/admin/site/_components/EditorSidebar.tsx) (Landing pages group).
**Notes for future sessions:**
- Instance lists in the picker: location = `LOCALITIES`; month = hard-coded 12; tag = `tags` table; venue = derived client-side via `groupByVenue` over upcoming events. Rows are created lazily when an instance is first opened.
- The public site only changes when an admin **publishes** a template/override; drafts + fallback keep production untouched.
- Full feature now spans migrations 0027 (events page) + 0028 (landing meta/delete RPC). Both applied.

## 2026-07-05 — Block-editable landing pages: Phases 1–3 (foundation + render wiring)

**What changed:** Made the SEO landing page types block-editable (like the homepage), behind a safe fallback. Phase 1 (foundation): placeholder engine + two new block types. Phase 2/3 (render wiring): every landing page type now resolves published blocks (per-instance override → type template) and renders them via a shared `LandingRenderer`, falling back to the existing hard-coded `EventLanding` when no blocks are published. `{placeholders}` ({location}/{tag}/{count}/{month}/…) are interpolated across all block text + SEO meta. **No live behaviour change until an admin publishes blocks** (verified: all landing types still return 200 + render unchanged in fallback mode, no server errors). Phase 4 (admin UI) is next.
**Files touched:** New — [lib/blocks/placeholders.ts](../lib/blocks/placeholders.ts), [lib/blocks/landing.ts](../lib/blocks/landing.ts) (`resolveLandingBlocks` cache()'d + `landingMetadata`), [components/LandingRenderer.tsx](../components/LandingRenderer.tsx), migration [0028](../supabase/migrations/0028_block_pages_landing_meta.sql). Block system — [types.ts](../lib/blocks/types.ts), [defaults.ts](../lib/blocks/defaults.ts), [registry.ts](../lib/blocks/registry.ts), [Renderer.tsx](../lib/blocks/Renderer.tsx) (new `landing_events` + `related_links`; dispatcher deep-interpolates placeholders), [Editor.tsx](../lib/blocks/Editor.tsx). Pages — [location/[slug]](../app/events/location/[slug]/page.tsx), [tag/[slug]](../app/events/tag/[slug]/page.tsx), [venues/[slug]](../app/venues/[slug]/page.tsx), [landing-presets.tsx](../lib/landing-presets.tsx) (`presetMetadata` now async → today/this-weekend/this-month `generateMetadata` returns `Promise<Metadata>`), [month-landing.tsx](../lib/month-landing.tsx).
**New tables/migrations:** 0028 — `block_pages.draft_meta`/`published_meta` JSONB (SEO title/desc templates), extends the public view + publish/revert RPCs + stamp trigger, adds `block_pages_delete(p_slug)` (deletes per-instance landing overrides only). **Paste in Supabase SQL editor before block mode / the admin editor works.**
**Notes for future sessions:**
- Slug scheme: templates `landing:<type>` (location/tag/venue/today/this-weekend/this-month/month); overrides `landing:<type>:<instance>` (e.g. `landing:location:valletta`, `landing:month:october`). Resolution = override → template → EventLanding fallback (first non-empty `published_blocks` wins).
- `resolveLandingBlocks` selects `published_meta`; pre-migration that column is absent → query errors → null → fallback. Safe but noisy until 0028 applied.
- **Phase 4 TODO (admin UI):** Site Editor → Pages → "Landing pages" group; per-type editor = `BlockBuilder slug="landing:<type>"` + SEO meta panel + placeholder cheat-sheet + instance-override picker + "load starter layout". Needs BlockEditorContext extended to (a) create the row on first open if missing, (b) manage `draft_meta`, (c) accept a `landingType` so the canvas preview supplies sample placeholders + sample events. Template/instance rows created client-side by super_admin (RLS allows); starter layouts generated in TS (no seed migration).

## 2026-07-05 — Planning session: block-editable landing pages (no code changes)

**What changed:** No code, schema, or config changes this session. Explored the block system and landing-page architecture and produced a plan to make the SEO landing page types (location, tag, venue, time-presets, months) block-editable like the homepage, with per-instance overrides. Plan is in the conversation; awaiting go-ahead before building.
**Files touched:** none (this log entry only).
**Notes for future sessions:**
- The "Events Page" block editor is **already committed** as `307190a` (HEAD/origin-main): [BlockBuilder.tsx](../app/admin/site/blocks/_components/BlockBuilder.tsx), [app/admin/site/pages/events/](../app/admin/site/pages/events/), migration [0027_events_block_page.sql](../supabase/migrations/0027_events_block_page.sql), and the slug-generic changes to `BlockEditorContext.tsx`, `lib/blocks/*`, `EditorSidebar.tsx`, `app/events/page.tsx`. (Earlier in this session `git status` showed these as dirty — that was a **stale git index / overlay-FS artifact**: `git diff HEAD` was empty and `update-index --refresh` cleared it. No uncommitted work existed.) Still worth verifying migration 0027 is applied to Supabase (manual paste).
- Key finding for the landing-pages build: block infra is already **slug-generic** — `BlockEditorProvider({ slug })`, `BlockBuilder slug=…`, `block_pages` rows, `block_pages_publish(p_slug)`/`block_pages_revert_draft(p_slug)` RPCs, and the publish route all take an arbitrary slug. Events Page (`slug='events'`) already renders via `BlockRenderer` on the public page.
- Planned landing-page slug scheme: templates `landing:<type>`, instance overrides `landing:<type>:<instance>`; render resolution instance→template→hardcoded `EventLanding` fallback. New block types needed: `landing_events` (scoped grid + ItemList JSON-LD), `related_links`; plus `{placeholder}` interpolation in text blocks + SEO meta (needs `draft_meta`/`published_meta` on `block_pages`).

---

## 2026-07-05 — Site Editor sidebar: Blocks → Homepage, FAQ nested under Pages

**What changed:** Follow-up to the same-day sidebar redesign. Renamed the "Blocks" nav label to "Homepage" (it edits the homepage block builder, not blocks in the abstract — the `/admin/site/blocks` route itself is unchanged). Nested "FAQ" as a child of "Pages" in the Content group rather than a sibling top-level item — `EditorSidebar`'s `NavItem` type now supports an optional `children` array, rendered indented (`md:ml-3 md:text-[13px]`) directly under their parent on desktop; on the mobile horizontal-scroll strip they just appear as the next chip (no visual nesting there). Verified visually in the preview browser at both mobile (642px) and desktop (1280px) widths — confirmed active-state highlighting and indentation render correctly. FAQ and Pages remain separate editors/data models (FAQ is its own DB table saved immediately; Pages is markdown in the site-settings draft) — only the nav grouping changed, not the underlying pages.
**Files touched:** [app/admin/site/_components/EditorSidebar.tsx](../app/admin/site/_components/EditorSidebar.tsx)
**New tables/migrations:** none
**Notes for future sessions:** none.

---

## 2026-07-05 — Site Editor sidebar: Privacy Policy + Terms of Service split out from Pages tabs

**What changed:** Third follow-up to the same-day sidebar redesign. Privacy Policy and Terms of Service were internal tab-switcher buttons inside the single `/admin/site/pages` page; moved them to their own routes so they can sit in the sidebar next to FAQ. Extracted the shared title/last-updated/markdown-editor/live-preview UI into `PageContentEditor.tsx` (parameterized by `pageId: 'privacy' | 'terms'`), added `app/admin/site/pages/privacy/page.tsx` and `.../terms/page.tsx`, and changed `app/admin/site/pages/page.tsx` to a redirect to `/privacy` (same pattern as the existing `sections/page.tsx` stub). In `EditorSidebar.tsx`, "Pages" is no longer a clickable link — `NavItem.href` is now optional, and an href-less item renders as a plain (non-interactive) group label — with three sibling sub-links underneath: FAQ, Privacy Policy, Terms of Service. Verified in the preview: each route renders its own content correctly and highlights the right sidebar sub-link; FAQ and both Pages editors keep their separate data models (FAQ's own DB table vs. the site-settings draft) as before, only the nav routing changed.
**Files touched:** [app/admin/site/_components/EditorSidebar.tsx](../app/admin/site/_components/EditorSidebar.tsx), [app/admin/site/pages/_components/PageContentEditor.tsx](../app/admin/site/pages/_components/PageContentEditor.tsx) (new), [app/admin/site/pages/privacy/page.tsx](../app/admin/site/pages/privacy/page.tsx) (new), [app/admin/site/pages/terms/page.tsx](../app/admin/site/pages/terms/page.tsx) (new), [app/admin/site/pages/page.tsx](../app/admin/site/pages/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** none.

---

## 2026-07-05 — Admin nav restructure + Site Editor sidebar redesign

**What changed:** Two admin UX changes. (1) The Navbar's "Admin" dropdown (desktop + mobile) was a flat list; regrouped into two labeled subsections — **Event Management** (Approve Events, Find Duplicates, Tags, Sources) and **Site Management** (Users, Analytics, Site Editor, Leads) — and renamed the "Site" link to "Site Editor". Existing admin/super_admin gating per-link is unchanged, only the grouping/labels. Committed and pushed (`49992ee`). (2) The Site Editor's (`/admin/site`) `EditorTopbar` crammed 11 tabs (Blocks, Branding, Featured, FAQ, Pages, Banner, Footer, SEO, Email, Theme, Importers) into a wrapping horizontal bar. Replaced with a new `EditorSidebar` component grouping the same 11 pages into **Content** (Blocks, Featured, FAQ, Pages, Banner), **Design** (Branding, Theme, Footer), **Settings** (SEO, Email, Importers); horizontal scroll strip on mobile, left column on desktop (`md:flex-col`). `EditorTopbar` now only shows the sync-status indicator + Discard/Publish actions (tab-nav code removed). **This part is uncommitted as of session end** — pending live visual verification as a super_admin (no test credentials available in-session; user was going to log in but session ended first).
**Files touched:** [components/Navbar.tsx](../components/Navbar.tsx), [app/admin/site/_components/EditorSidebar.tsx](../app/admin/site/_components/EditorSidebar.tsx) (new), [app/admin/site/_components/EditorTopbar.tsx](../app/admin/site/_components/EditorTopbar.tsx), [app/admin/site/layout.tsx](../app/admin/site/layout.tsx)
**New tables/migrations:** none
**Notes for future sessions:** Before committing the Site Editor sidebar work, verify visually as a super_admin (`/admin/site/branding` etc.) — TypeScript compiles clean but the layout was never rendered against real auth in this session. If a future session picks this up cold, check `git status`/`git diff` on the four files above first.

---

## 2026-07-04 — SEO overhaul: server-rendered /events, ISR, month + hub landing pages, copy engineering

**What changed:** Six-phase SEO build-out. (1) `/events` is now a server component with real metadata + ItemList JSON-LD; it seeds `EventsList` via a new `initialEvents` prop whose Suspense fallback (`StaticEventGrid`) carries the full card grid — crawlers previously got an empty shell because `useSearchParams` bails out of static rendering. A `loadedKeyRef` keyed on the filter signature skips the redundant client refetch (also fixing a pre-existing double-fetch on plain `/events`). (2) All public pages switched from `force-dynamic` to ISR (`revalidate = 600`; sitemap 3600); dynamic segments got `generateStaticParams`; the render-time `increment_view_count` RPC moved to a client `ViewTracker` so ISR doesn't freeze counts. (3) Twelve evergreen month landing pages `/events/january…december` via `lib/month-landing.tsx` + `getMonthRange()` (next-occurrence semantics, year in copy not URL). (4) Hub pages `/events/locations`, `/venues`, `/events/tags` + footer "Discover" row for crawl depth 1. (5) React `cache()` wrappers dedupe generateMetadata/body fetches; landing titles now carry live counts + month/year; hand-written locality copy for top 10 localities (`Locality.description`); `tags.description` column (migration 0025) editable in /admin/tags, rendered on tag landings. (6) Event JSON-LD: `addressLocality` from `deriveLocality`, `eventStatus` cancelled mapping.
**Found bugs:** (a) `increment_view_count` has been failing for visitors since 0021 — the events UPDATE fires the 0020 trigger which reads `profiles.role`, anon lost access → 42501 (same class as the 0024 lesson). Fixed in **migration 0026** (SECURITY DEFINER + explicit grants). View counts likely never tracked anon visitors at all (no anon UPDATE policy pre-0020 → 0-row update). (b) `npm run dev` pages never hydrated — CSP `script-src` lacked `'unsafe-eval'`, which webpack dev bundles need; now added in development only.
**Files touched:** [app/events/page.tsx](../app/events/page.tsx), [app/events/EventsList.tsx](../app/events/EventsList.tsx), [lib/event-queries.ts](../lib/event-queries.ts), [lib/month-landing.tsx](../lib/month-landing.tsx) (new), 12× `app/events/<month>/page.tsx` (new), [app/events/locations/page.tsx](../app/events/locations/page.tsx) (new), [app/venues/page.tsx](../app/venues/page.tsx) (new), [app/events/tags/page.tsx](../app/events/tags/page.tsx) (new), [components/ViewTracker.tsx](../components/ViewTracker.tsx) (new), [components/EventLanding.tsx](../components/EventLanding.tsx), [components/Footer.tsx](../components/Footer.tsx), [lib/malta-localities.ts](../lib/malta-localities.ts), [app/events/location/[slug]/page.tsx](../app/events/location/[slug]/page.tsx), [app/events/tag/[slug]/page.tsx](../app/events/tag/[slug]/page.tsx), [app/venues/[slug]/page.tsx](../app/venues/[slug]/page.tsx), [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx), [app/admin/tags/page.tsx](../app/admin/tags/page.tsx), [app/sitemap.ts](../app/sitemap.ts), [app/page.tsx](../app/page.tsx), [types/index.ts](../types/index.ts), [next.config.js](../next.config.js), migrations 0025 + 0026
**Notes for future sessions:**
- **Manual steps pending:** apply migrations 0025 + 0026 in the Supabase SQL editor; run `SELECT slug FROM events WHERE slug IN ('january','february','march','april','may','june','july','august','september','october','november','december','locations','tags');` (must be empty — static segments shadow those event slugs; `RESERVED_EVENT_SLUGS` in lib/month-landing.tsx lists them); submit sitemap in Google Search Console.
- Content freshness is now ≤10 min (ISR). A future `/api/revalidate` hook on event approval would make approvals instant.
- The cancelled-event flow (keep cancelled URLs live with `EventCancelled`) is deliberately deferred — needs an RLS widening; the JSON-LD mapping is already in place.

---

## 2026-07-03 — "Tickets"/"Biljetti" keyword signal for paid/free classification

**What changed:** `ticket_type` for imported events was decided solely by `ext.ticketUrl ? 'paid' : 'free'` — many adapters never populate `ticketUrl`, so plenty of real paid events were silently defaulting to free. Added a second, independent signal: adapters now scan their already-fetched scraped text (detail-page HTML, description/excerpt fields, or — for `tsmalta`/`popp`/`heritagemalta` — the `bodyText`/`htmlContent` var they already had for their own free-language check) for "tickets" or "biljetti" (Maltese) via a new `containsPaidKeyword()` helper (word-bounded regex, case-insensitive). Each adapter sets the result on a new `ExternalEvent.hasPaidKeyword` field; the pipeline's new `resolveTicketType()` OR's it with the `ticketUrl` check, used at both the insert and update call sites. For listing-page adapters (`gianpula`), the scan is scoped to the single event's card element, not the whole page, to avoid flagging every event on the page identically; `festivals_mt` scans only `ev.description` for the same reason (the page fetch there embeds every event's JSON in one blob). `maltaartisanmarkets` has no scrapeable text (description is synthesized boilerplate) so it's skipped — and its unconditional `ticketUrl` (a generic link to the listing page, not a real ticket link) was removed as a found bug: combined with the old logic it was silently forcing every free market event to `'paid'`. Follow-up in the same session: `unomalta` events are always ticketed in practice (the Tribe `cost` field's occasional "Free" is a free-entry-before-Xpm perk, not a free event) — hardcoded `hasPaidKeyword: true` there instead of relying on cost-text/keyword detection, and stopped zeroing `priceMin` on a "Free" cost string.
**Files touched:** [lib/importers/ticket-keywords.ts](../lib/importers/ticket-keywords.ts) (new), [lib/importers/types.ts](../lib/importers/types.ts), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), all 14 files in [lib/importers/adapters/](../lib/importers/adapters/)
**New tables/migrations:** none
**Notes for future sessions:** No importer test harness exists (no `*.test.ts`, no test runner) and adapters hit live third-party sites, so this was verified by `npm run build` (type-check) + a standalone `node -e` regex sanity check, not automated tests — see the regex test cases in this session's transcript if the keyword list needs revisiting. Known accepted limitation: for adapters without a narrower content region (`teatrumanoel`, `esplora`, `cafedelmar`, `g7events`, `maltababyandkids`), the scan covers the full detail-page HTML including nav/footer, so a site-wide "Buy Tickets" menu link could false-positive an otherwise-free event — this mirrors the existing `$('body').text()` convention already in `tsmalta`/`popp`/`heritagemalta`, not a new risk class.

---

## 2026-07-02 — Per-source auto-approve for imported events

**What changed:** Imports previously always landed at `status='pending_review'` — a hard-coded rule in the pipeline, even though `event_sources.auto_publish` existed in the schema since 0010 and was never wired up. Wired it up: the pipeline now inserts new events as `approved` when `source.auto_publish` is true, unless the soft political-filter matched (that always forces `pending_review` regardless of the toggle, since soft-flags exist precisely to get a human look). Added an "Auto-approve on/off" toggle per source on `/admin/sources`, using the same direct-`.update()`-via-RLS pattern as the existing enable/disable toggle — no new API route needed since `event_sources_super_admin_all` is a table-level policy. Default stays off for every source; a super_admin opts in per adapter.
**Files touched:** [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [types/index.ts](../types/index.ts), [CLAUDE.md](../CLAUDE.md)
**New tables/migrations:** none (column already existed, unused until now)
**Notes for future sessions:** The `enforce_event_status` trigger (0020) only touches writes where `auth.uid()` is non-null; the importer pipeline runs on the service-role key so `status='approved'` inserts pass through untouched — verified this before wiring it up. No source has `auto_publish=true` yet; that's a deliberate per-adapter decision left to the super_admin via the new toggle.

---

## 2026-06-18 — Events smoke test as a push/deploy gate

**What changed:** Added a dependency-free Node smoke test that pings the live Supabase project two ways — as a normal visitor (anon key: must read approved events, must NOT read draft/pending/rejected) and as an admin (service-role key: must read the events table). It reproduces the exact anon read path that the 0021→0024 regression broke, so it fails loudly if event visibility breaks again. Wired in as `npm run smoke`, a committed `pre-push` git hook (enabled via the `prepare` script setting `core.hooksPath .githooks`), and a `smoke` job in CI. Admin auth uses the service-role key by choice — note this bypasses RLS, so the admin leg only proves reachability, not that admin RLS works.
**Files touched:** [scripts/smoke-events.mjs](../scripts/smoke-events.mjs), [.githooks/pre-push](../.githooks/pre-push), [package.json](../package.json), [.github/workflows/ci.yml](../.github/workflows/ci.yml)
**New tables/migrations:** none
**Notes for future sessions:** CI needs the `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secret added (URL + anon key already exist as build secrets). The test targets PROD (what `.env.local` points at), so it's a healthcheck of the deployed DB, not of the code being pushed — it catches RLS/grant breakage (which is applied to prod via the dashboard, like 0021), which is the main failure mode here. Bypass a push with `git push --no-verify`. To make CI a true deploy *block*, mark the `smoke` job as a required status check / enable Vercel "wait for CI".

---

## 2026-06-18 — Fix: anon visitors saw zero events (0021 regression)

**What changed:** Logged-out visitors got NO events anywhere (list, detail, occurrences). Reproduced as anon: `select * from events` failed with `42501 permission denied for table profiles`. Cause: 0021 revoked anon's SELECT on `profiles` (keeping only id/display_name/avatar_url), but the `events` policy `"Admins can see all events"` (and `event_occurrences` `occ_select_admin`/`occ_write_admin`) is `TO public` with an inline `EXISTS (SELECT 1 FROM profiles ... role ...)`. The planner evaluates every applicable policy on an anon read, hits `profiles.role` anon can't access, and aborts the whole query. Fix (0024): rescope those staff-only policies `TO authenticated` — identical USING expressions, narrower grantee — so anon never touches profiles and reads approved events via the public policies only.
**Files touched:** [supabase/migrations/0024_fix_anon_event_reads.sql](../supabase/migrations/0024_fix_anon_event_reads.sql)
**New tables/migrations:** 0024 (RLS policy rescope; **must be applied in Supabase SQL editor**)
**Notes for future sessions:** General rule surfaced here — any RLS policy reachable by `anon` (FOR SELECT/ALL, TO public/anon) must NOT inline-reference a table/column anon lacks grants on, or it poisons the whole query. Prefer `is_admin_or_super_admin()` (SECURITY DEFINER, bypasses caller grants) or scope `TO authenticated`. The 0000 baseline still shows the old `TO public` forms; live DB now differs for these three policies after 0024 is applied.

---

## 2026-06-18 — Fix silent approval failure on admin review queue

**What changed:** Approving an event left it stuck in `pending_review` with no error. Prime suspect is the `enforce_event_status` trigger (migration 0020): when `is_admin_or_super_admin()` returns false for the caller, the trigger **silently rewrites `NEW.status` back to `OLD.status`** (lines 63–66) — the UPDATE succeeds and returns a row, but status never changes. `approveEvent`/`rejectEvent`/`approveAll` did optimistic local removal and never verified the result, so the event vanished from the UI then reappeared on refresh. Hardened all three: they now `.select('id, status')` and (a) alert + keep the row if the write errored / hit 0 rows (RLS block), and (b) alert + keep the row if the returned status isn't the target value (trigger silent-revert). `approveAll` only clears events whose returned status is actually `approved`. Added [supabase/diagnose_approve.sql](../supabase/diagnose_approve.sql) to pinpoint the DB-side cause.
**Files touched:** [app/admin/page.tsx](../app/admin/page.tsx), [supabase/diagnose_approve.sql](../supabase/diagnose_approve.sql) (new, diagnostic only — not a migration)
**New tables/migrations:** none
**Deployment status:** Merged to `main` (`e552e81`, fast-forward) and pushed — Vercel auto-deploy triggered, pre-push smoke test passed. The client-side detection is now live; the underlying DB cause is still unconfirmed (run the diagnostic SQL). Note: the unrelated in-progress work in the tree (0024 migration, smoke-test scripts, `ci.yml`, `package.json`, `CLAUDE.md`, `.githooks/`, `scripts/`) was deliberately left uncommitted and untouched.
**ROOT CAUSE (confirmed via diagnose_approve.sql):** `is_admin_or_super_admin()` **did not exist in the live DB** — migration 0011's function was never applied (only `is_super_admin()` from 0001 was present, which is why CRM/site-settings worked but events didn't). The `enforce_event_status` trigger (0020) calls `public.is_admin_or_super_admin()`; plpgsql resolves that call only at runtime, so the trigger was created fine but errored (`function does not exist`) on **every authenticated event UPDATE**, aborting the write. Old client code swallowed the error → optimistic removal → phantom disappear/reappear. **Fix applied directly in Supabase SQL editor:** recreated `is_admin_or_super_admin()` + the `events_admin_update` / `events_admin_select` policies (re-ran migration 0011's body). Approving now sticks — user confirmed working.
**Diagnostic gotcha:** querying `profiles` by `email` returns no rows post-0023 (email isn't synced to `profiles`; it lives in `auth.users`). Join `auth.users` to check a user's role by email.
**Lesson / follow-up:** live DB had drifted from the repo migrations (manual paste-apply means a migration can be partially/never applied with no record). A plpgsql function that *calls* a missing function still creates cleanly and only fails at call time — so "trigger exists" ≠ "trigger works." Consider a small idempotent `0025_ensure_admin_helper.sql` that guarantees `is_admin_or_super_admin()` exists, run ahead of anything consuming it (0020/0024 both depend on it). Same lockdown family as the 0021→0024 anon-read regression below. The client-side status verification stays valuable regardless — it turns any future silent revert into a visible alert instead of a phantom disappear/reappear.

---

## 2026-06-18 — Approve All button on admin review queue

**What changed:** Added an "Approve All (N)" button to the admin pending review page. Appears next to the "Pending Review" heading when there are 2+ events. Requires a browser `confirm()` before executing. Batches the DB update in a single `.in('id', ids)` call rather than N individual updates; notifications are still fired per-event, fire-and-forget. Button hides itself when only one event is pending.
**Files touched:** [app/admin/page.tsx](../app/admin/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** none

## 2026-06-18 — Content Security Policy

**What changed:** Added a `Content-Security-Policy` header to all responses via `next.config.js`. Locks down script execution to self + Google Analytics (`googletagmanager.com`, `google-analytics.com`) only; connections to Supabase (REST/Auth/Storage/Realtime WS) + GA endpoints only; images to Supabase Storage + data/blob URIs; frames and objects fully blocked; `base-uri` and `form-action` locked to self. `unsafe-inline` is present in `script-src` because Next.js App Router emits inline hydration scripts and JSON-LD is injected via `dangerouslySetInnerHTML` — a nonce/strict-dynamic approach would remove it but requires middleware nonce injection.
**Files touched:** [next.config.js](../next.config.js)
**New tables/migrations:** none
**Notes for future sessions:**
- The one remaining hardening step is replacing `unsafe-inline` with a nonce-based `strict-dynamic` policy (requires generating a nonce in `middleware.ts` and threading it to all inline scripts/Next.js script tags). Deferred — non-trivial refactor.

## 2026-06-17 — Block authenticated cross-user PII reads (audit follow-up)

**What changed:** Closed the residual from 0021 — `Public profiles are viewable` is `USING (true)`, so any *logged-in* user could still `from('profiles').select('email,phone')` and harvest every user's contact details. Migration **0023** revokes `email`/`phone` from the `authenticated` SELECT grant on `profiles` and adds `get_my_profile()` (SECURITY DEFINER, scoped to `auth.uid()`) so the owner can still read their own row. [lib/auth-context.tsx](../lib/auth-context.tsx) now loads the owner profile via that RPC, with a fallback to a safe-column table select (no email/phone) for the window before 0023 is applied — so the deploy is order-independent and can't break profile loading. Email was already session-sourced (`auth.users`), and admin email reads go through the existing `admin_list_profiles`/`admin_get_user_email` SECURITY DEFINER RPCs, so nothing else needed touching.
**Files touched:** [supabase/migrations/0023_profiles_pii_authenticated.sql](../supabase/migrations/0023_profiles_pii_authenticated.sql) (new), [lib/auth-context.tsx](../lib/auth-context.tsx)
**New tables/migrations:** 0023_profiles_pii_authenticated.sql (apply in Supabase SQL editor)
**Notes for future sessions:**
- Rollout: push the resilient code first (auto-deploys), then apply 0023 — the fallback means there's no breakage window in either order.
- After 0023, all audit DB findings are closed. Remaining optional item: CSP header. The base schema (tables/types/signup trigger/RPCs) still lives only in the dashboard; `0000_baseline.sql` snapshots the RLS but not the DDL.

## 2026-06-17 — RLS baseline export + consolidation (audit follow-up)

**What changed:** Exported the live `public`-schema RLS policies (via a `pg_policies` → `CREATE POLICY` query in the SQL editor, since there's no CLI/psql/DB-conn locally) into a reference snapshot, [supabase/migrations/0000_baseline.sql](../supabase/migrations/0000_baseline.sql) (marked DO-NOT-RUN; full DDL still needs `supabase db dump`). The snapshot exposed two more bypasses the un-versioned schema was hiding: (1) **`profiles` self-update of privileged columns** — `Users can update own profile` has no WITH CHECK / no column restriction, so beyond `role` (already blocked by 0020) a user could self-set `subscription_tier='pro'`, raise `max_active_events`, or clear their own `suspended_at`/`deleted_at`; (2) **`events` self-undelete** — `Users can update own events` (no WITH CHECK, no deleted_at guard) overrides the stricter `events_owner_update` under OR-semantics, letting an owner clear `deleted_at` to resurrect an admin-soft-deleted event. Migration **0022** extends the profiles trigger to those columns and drops the loose `events`/`tags` legacy+duplicate policies. Also found: heavy policy sprawl (duplicate owner-select, legacy admin-only tag writes) — cleaned in 0022.
**Files touched:** [supabase/migrations/0000_baseline.sql](../supabase/migrations/0000_baseline.sql) (new snapshot), [supabase/migrations/0022_rls_consolidation.sql](../supabase/migrations/0022_rls_consolidation.sql) (new)
**New tables/migrations:** 0000_baseline.sql (reference only), 0022_rls_consolidation.sql (apply in Supabase SQL editor)
**Notes for future sessions:**
- **Apply 0022** in the SQL editor for the new guards to take effect; verify editing/soft-deleting own events still works and a non-staff user can't `PATCH profiles {subscription_tier:'pro'}`.
- The events moderation (status) and role escalation are belt-and-suspenders: the RLS policies are permissive, the 0020/0022 **triggers** are the real enforcement. Keep new owner-write policies guarded (WITH CHECK), or rely on triggers.
- Still deferred: authenticated cross-user `profiles` email/phone read (needs a `get_my_profile()` RPC + restrict `authenticated` columns); full replayable schema baseline via `supabase db dump`; CSP header.

## 2026-06-17 — Profiles PII exposure fix (audit follow-up)

**What changed:** Verifying the live `profiles` RLS (per the audit) confirmed (a) the role-escalation hole was real — `Users can update own profile` is `USING (auth.uid()=id)` with a NULL `with_check`, so any user could `UPDATE profiles SET role='super_admin'` on their own row (now blocked by 0020's `enforce_profile_role_change` trigger); and (b) a new leak — `Public profiles are viewable` is `USING (true)` for `public`, so the anon key could `select('email,phone')` and harvest every user's PII. Added migration **0021** revoking anon's blanket column SELECT on `profiles` and re-granting only `id, display_name, avatar_url` (the columns the public event-page organizer embed uses). No app-code change; authenticated/owner/admin reads unchanged.
**Files touched:** [supabase/migrations/0021_profiles_pii_columns.sql](../supabase/migrations/0021_profiles_pii_columns.sql)
**New tables/migrations:** 0021_profiles_pii_columns.sql (apply in Supabase SQL editor)
**Notes for future sessions:**
- **Residual:** authenticated users can still read other users' `email`/`phone` via the table (RLS is `USING true`, `authenticated` keeps full column grant). Closing it needs a `get_my_profile()` SECURITY DEFINER RPC + restricting `authenticated` columns + switching the auth-context read to the RPC — deferred.
- Only anon read of `profiles` is the organizer embed in [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx) (`display_name, avatar_url`); admin embeds are authenticated.

---

## 2026-06-17 — Canonical guard for /events filter URLs (SEO)

**What changed:** SEO audit of the recent adapter + back-navigation work found no regressions, but the new URL-driven filters made `/events?tag=&date=&q=&sort=…` real shareable URLs that are near-duplicates of the bare list and the dedicated `/events/tag/*` landing pages. Split the client list page into a tiny server wrapper ([app/events/page.tsx](../app/events/page.tsx)) that exports a static `alternates.canonical` of `${SITE_URL}/events`, rendering the moved client component ([app/events/EventsList.tsx](../app/events/EventsList.tsx)). All faceted permutations now canonicalise to clean `/events`, so crawlers won't index them. Verified in-browser: bare `/events` and `/events?tag=children&price=free&sort=date_desc` both emit `<link rel="canonical" href="https://eventsmalta.org/events">`, list still renders, no console errors.
**Files touched:** [app/events/page.tsx](../app/events/page.tsx) (new server wrapper), [app/events/EventsList.tsx](../app/events/EventsList.tsx) (moved from page.tsx)
**Notes for future sessions:**
- `'use client'` pages can't export `metadata`; the server-wrapper-renders-client-component pattern is the way to attach canonical/OG to an interactive list page.
- The filter chips are `onClick` state toggles (not `<a href>`) and the query URLs aren't in the sitemap, so discovery risk was already low — the canonical is belt-and-suspenders against externally shared filter links.

---

## 2026-06-17 — Security audit + hardening

**What changed:** Full audit from DB/RLS through API routes to client. Found and fixed: (1) **event moderation bypass** — `events_owner_update` (0006) and the create flow never constrain `status`, so a non-staff user could PATCH/INSERT their own event to `status='approved'` via PostgREST and skip review; (2) **role-escalation exposure** — roles are changed client-side with a raw `profiles.update({role})`, and the governing UPDATE policy isn't in version control. Added migration **0020** with two `SECURITY DEFINER` BEFORE-triggers: `enforce_event_status` (non-staff can't publish/reject; trusted_uploader still auto-approves; service-role/SQL-editor bypassed via `auth.uid() IS NULL`) and `enforce_profile_role_change` (no self-role change; only staff change roles; only super_admin grants/revokes admin). Also: **SSRF guard** ([lib/importers/url-safety.ts](../lib/importers/url-safety.ts)) now vets `image_url` before the mirror fetches it (blocks non-http(s), loopback, link-local, RFC-1918, CGNAT); **/api/referral/track** scoped to `status='approved'` (was leaking draft/pending URLs via service-role) + validates the redirect target is http(s) (open-redirect/scheme guard); homepage JSON-LD switched from raw `JSON.stringify` to `jsonLdSafe()`. UI: "Promote to Admin" button now super_admin-only to match the new DB rule.
**Files touched:** [supabase/migrations/0020_security_hardening.sql](../supabase/migrations/0020_security_hardening.sql), [lib/importers/url-safety.ts](../lib/importers/url-safety.ts), [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts), [app/api/referral/track/route.ts](../app/api/referral/track/route.ts), [app/page.tsx](../app/page.tsx), [app/admin/users/page.tsx](../app/admin/users/page.tsx)
**New tables/migrations:** 0020_security_hardening.sql (triggers only — apply via Supabase SQL editor)
**Notes for future sessions:**
- **0020 must be applied in the Supabase SQL editor** to take effect — code is deployed but the triggers aren't live until run.
- **Verify the live `profiles` UPDATE policy** with `SELECT polname, cmd, qual, with_check FROM pg_policies WHERE tablename='profiles';` — 0020's trigger is defense-in-depth, but a too-broad policy should still be tightened.
- The base schema + its RLS/RPCs remain un-versioned; export a `0000_baseline.sql` so the crown-jewel policies are reviewable. Other open items: no CSP header; markdown render (`marked`) is unsanitized but super_admin-only input.

## 2026-06-17 — Events filters in the URL (robust back-navigation)

**What changed:** Reworked how the `/events` list state survives navigation. The earlier popstate-flag + module-cache approach only restored filters on the **browser Back button**; the detail page's in-page "← Back to events" link is a `<Link href="/events">` (a forward push), so clicking it dropped all filters — the "list refreshes completely" the user reported. Fix: **all filters now live in the URL** (`?tag=&date=&from=&to=&q=&price=&sort=`), mirrored via `router.replace(url, { scroll: false })` as filters change, so any return path (browser Back, the in-page link, a shared link) rebuilds the same view. A guarded URL→state sync effect (`if (incoming === filterKey) return`) adopts real navigations (e.g. the navbar link to bare `/events` now correctly clears filters) without reverting live typing. A module cache **keyed by the URL query** still gives an instant results+scroll restore (no skeleton flash). New [components/BackToEvents.tsx](../components/BackToEvents.tsx): the detail page's back control navigates to the recorded last list URL (`ev:lastList` in sessionStorage), falling back to `/events` for direct entries. Verified in-browser: search + category-chip filters both restore via the in-page link AND browser Back; navbar clears; rapid typing keeps focus and doesn't revert; no skeleton flash. (Next 14.2 observes native `history.replaceState`, which is why raw replaceState desynced the router — `router.replace` is required.)
**Files touched:** [app/events/page.tsx](../app/events/page.tsx), [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx), [components/BackToEvents.tsx](../components/BackToEvents.tsx)
**Notes for future sessions:**
- Filter state is now URL-driven and shareable/bookmarkable — `/events?tag=children` etc. work as deep links.
- Any "deps size changed between renders" warning seen while editing `app/events/page.tsx` is Fast Refresh noise from hot-swapping the hook list; the hook list is static, so clean mounts (prod / full reload) don't warn.
- The project was moved this session to `…/Documents/Claude - Personal/Projects/Events Malta`; the in-session shell cwd may still report the old path.

---

## 2026-06-17 — Malta Baby & Kids importer (2nd kids source)

**What changed:** Added the `maltababyandkids` adapter. The site is WordPress but exposes no events REST route (the `event` post type isn't in wp/v2), so the adapter scrapes the `/events/` listing with cheerio: each `stm-event` card gives title + `/event/<slug>/` URL, featured image, date ("Month D, YYYY"), an optional free-text time, and a venue. Times come in several shapes (`9:30am`, `16.30`, `10am - 12pm`, `9:30 AM – 11:30 AM`, `9:30am OR 11:30am`) — `parseTime` takes the first token and handles meridiem vs 24-hour; no-time cards are stored date-only (`hasTime=false`). For each upcoming card it fetches the detail page and lifts `og:description` (best-effort — a failed detail fetch still yields the event). Malta-local → UTC via the shared DST helper. Live smoke test: 20 cards → 14 upcoming, dates/times/venues/images all correct. Seeded by migration 0019 (disabled). No `IMPLEMENTED_ADAPTERS` edit needed — the registry-driven gate from earlier today handles it.
**Files touched:** [lib/importers/adapters/maltababyandkids.ts](../lib/importers/adapters/maltababyandkids.ts), [lib/importers/registry.ts](../lib/importers/registry.ts)
**New tables/migrations:** [0019_maltababyandkids_source.sql](../supabase/migrations/0019_maltababyandkids_source.sql) — seeds the source (disabled; enable + smoke-test in Admin → Sources).
**Notes for future sessions:**
- Overlap: "Messy Cinema Mornings" (Eden Cinemas) appears in both maltababyandkids and maltaforkids — content-hash + Admin → Duplicates handle cross-source dupes at review time.
- The listing shows a single date per event even for multi-day camps (start date only); good enough for discovery.
- Remaining deferred kids sources (outwithkidz private tRPC, edencinemas, theeden, playmobil) documented in CLAUDE.md §8 — kids/family coverage is now considered complete (esplora + maltaforkids + maltababyandkids).

---

## 2026-06-17 — Back-nav list restoration + Malta for Kids importer + registry-driven Run-now

**What changed:** Three pieces of user feedback. (1) **Back-navigation on `/events`** now returns the visitor to the exact list they left — same filters, results, and scroll position — instead of reloading at the top. The page is a client component the App Router unmounts on navigation, so a module-level `listCache` holds the last state; a `popstate` listener flags a restore only when landing back on `/events` (a fresh navbar click still starts clean at the top). Cached results render synchronously so the grid keeps its height and the saved `scrollY` restores via `useLayoutEffect` with no skeleton flash. (2) **New `maltaforkids` adapter** to fix thin kids/family coverage — Malta for Kids runs WordPress + My Calendar plugin with a clean public JSON endpoint (`/wp-json/my-calendar/v1/events?from=&to=`, keyed by date). Adapter flattens the date-keyed rows, dedupes occurrences by `occur_id`, groups by `event_id`, and converts Malta-local times to UTC (DST-aware, mirrors the visitmalta helper). Live smoke test: 59 distinct events / 120-day window. This supersedes the "in-progress" placeholder noted in the JSON-LD entry below. (3) **Run-now gate now reads the registry** — the admin Sources page used to hard-code an `IMPLEMENTED_ADAPTERS` set that had to be hand-synced with `registry.ts` and **deployed** before "Run now" enabled (the recurring "button still disabled after adding an adapter" complaint). Replaced it with `GET /api/admin/sources/adapters` (super_admin) returning `listAdapterNames()` from the registry; the page fetches it on load. Adding an adapter now only needs the registry entry + a deploy — no second list to forget. (Note: a deploy is still inherent — a new adapter is new server code Vercel must build.)
**Files touched:** [app/events/page.tsx](../app/events/page.tsx), [lib/importers/adapters/maltaforkids.ts](../lib/importers/adapters/maltaforkids.ts), [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [app/api/admin/sources/adapters/route.ts](../app/api/admin/sources/adapters/route.ts)
**New tables/migrations:** [0018_kids_event_sources.sql](../supabase/migrations/0018_kids_event_sources.sql) — seeds the Malta for Kids source (disabled by default; enable + smoke-test in Admin → Sources).
**Notes for future sessions:**
- Malta for Kids lists each session as its own `event_id`, so imports include many similar dated sessions (e.g. recurring classes); the review queue + Admin → Duplicates + per-run `maxEvents` cap manage volume. Confirm the Children / Family Friendly tag on approval — the adapter passes `categoryHint` but cannot force tags (AI tagger + admin review own that).
- Ongoing multi-day events (e.g. "Luna Park") import with a past `date_start`, so the gte-now `/events` query hides them even while running — a site-wide behaviour, not adapter-specific. Left as-is.
- Other kids sources investigated & deferred: **maltababyandkids.com** (WP but no events REST route → would need HTML scrape), **outwithkidz.com** (JS-rendered SPA, no per-event sitemap → need to find its API), **edencinemas.com.mt** special events (custom site / elqueque CMS, few events, overlaps kids aggregators), **theeden.mt** (Next.js leisure centre, not really kids), **playmobilmalta.com** (WP category, currently empty). **esplora** already covered by the existing adapter.
- Scroll restoration could be extended to `/events/past` (same client-fetch pattern) if users report the same issue there.
- The `M app/events/[slug]/page.tsx` JSON-LD diff in the working tree is prior-session work (logged below), not part of this change.

---

## 2026-06-17 — Event JSON-LD: clear GSC "improve item appearance" warnings

**What changed:** Google Search Console flagged the Event rich-result as valid but missing recommended fields `endDate`, `offers`, `performer` on a paid event with no `price_min` and no `date_end` (it fell through every conditional). In [app/events/[slug]/page.tsx](app/events/[slug]/page.tsx): `endDate` now always emits (falls back to `date_start`); `offers` is now always emitted as a single `Offer` — free → price `0`, paid-with-price → `price`/`priceCurrency`, paid-without-price → just `availability` + `url` (ticket_url or canonical event URL) + `validFrom`. **`performer` deliberately left out** (user decision): no honest source — organiser ≠ act, and imports default organiser to "Events Malta", so fabricating it would risk a quality-guidelines penalty for mismatched structured data.
**Files touched:** [app/events/[slug]/page.tsx](app/events/[slug]/page.tsx)
**Notes for future sessions:** Two of three GSC warnings now resolved honestly; `performer` warning remains by design (optional, no penalty). If organisers ever need to supply performers, add a real `performer` column + EventForm input + importer support, then emit `PerformingGroup`/`Person` JSON-LD. Validate post-deploy with Google's Rich Results Test on a paid event URL, then re-run GSC validation.
**Session-end state (not this session's work):** An in-progress "Malta for Kids" event-source feature was present uncommitted in the working tree at session end — `lib/importers/adapters/maltaforkids.ts`, `supabase/migrations/0018_kids_event_sources.sql`, and edits to `app/events/page.tsx`, `app/admin/sources/page.tsx`, `lib/importers/registry.ts`. This session did **not** author or commit it; left untouched for its author to finish and log separately.

---

## 2026-06-16 — AI/LLM discovery: fix llms.txt domain + enrich

**What changed:** Audited AI/answer-engine discoverability. Found the structured-data foundation already complete: Event + BreadcrumbList JSON-LD on event detail ([app/events/[slug]/page.tsx](app/events/[slug]/page.tsx)), ItemList on all landing pages via [EventLanding.tsx](components/EventLanding.tsx) + [event-queries.ts](lib/event-queries.ts), Organization + WebSite + FAQPage + SearchAction on the homepage ([app/page.tsx](app/page.tsx)), robots `*` allows AI crawlers, dynamic sitemap. Only real defect: [public/llms.txt](public/llms.txt) linked to `eventsmalta.com` (canonical domain is `eventsmalta.org`) — fixed all 3 links, and enriched the file with the time-based "what's on" routes (today/this-weekend/this-month), the tag/locality/venue URL patterns, and a note on which JSON-LD each page type emits.
**Files touched:** [public/llms.txt](public/llms.txt)
**Notes for future sessions:** Two things left to the site owner, not code: (1) confirm Vercel project Firewall/Bot-management isn't blocking AI crawlers (GPTBot/ClaudeBot/PerplexityBot) at the edge — robots.txt allows them but the edge can override. (2) The main `/events` list is a client component with no server-rendered ItemList; landing pages cover structured lists, so deferred. Minor nit: homepage JSON-LD uses raw `JSON.stringify` (not `jsonLdSafe`) on admin-controlled brand/meta/FAQ strings — admin-only self-XSS risk, low severity.

---

## 2026-06-15 — Homepage: infinite-scroll lazy loading of events

**What changed:** Homepage previously fetched 24 upcoming events server-side and showed 6. Added `components/InfiniteEvents.tsx` (client) that renders the SSR first page then paginates approved upcoming events directly from Supabase via `range()` queries on an IntersectionObserver sentinel (400px rootMargin), dedupes by id, and supports tag filtering via `.overlaps('tags', names)`. The `date_start` lower bound is frozen at server render (`afterISO`) so paging windows stay stable. Wired into both the block renderer's upcoming-events block and the fallback homepage section; `afterISO` threaded through `RenderContext` (incl. admin editor preview). Verified in dev: scroll grew cards 9→21, no console errors.
**Files touched:** [components/InfiniteEvents.tsx](components/InfiniteEvents.tsx) (new), [app/page.tsx](app/page.tsx), [lib/blocks/Renderer.tsx](lib/blocks/Renderer.tsx), [app/admin/site/blocks/page.tsx](app/admin/site/blocks/page.tsx)
**Follow-up (same day):** Capped lazy loading at `maxItems` (default 36) in `InfiniteEvents` — it was loading every upcoming event. Once the cap is hit, paging stops and a "Browse all events →" link to `/events` is shown. Then made the cap admin-controllable: added `max_items` to `UpcomingEventsConfig` (default 36) with a "Max to load on scroll" field in the block Editor; renderer passes `maxItems={c.max_items ?? 36}` (fallback covers legacy stored blocks). Homepage confirmed to be in block mode with an `upcoming_events` block, so the block editor is the right control surface.
**Files touched (follow-up):** [components/InfiniteEvents.tsx](components/InfiniteEvents.tsx), [lib/blocks/types.ts](lib/blocks/types.ts), [lib/blocks/defaults.ts](lib/blocks/defaults.ts), [lib/blocks/Editor.tsx](lib/blocks/Editor.tsx), [lib/blocks/Renderer.tsx](lib/blocks/Renderer.tsx)

---

## 2026-06-15 — Admin: duplicate-event finder

**What changed:** Added `/admin/duplicates` (admin + super_admin gated). Loads all approved + pending non-deleted events and groups likely duplicates via normalized-title Levenshtein similarity + date/venue, using union-find so 3+ copies cluster together. Two modes: Strict (same calendar day, ≥0.82 title sim) and Loose (any date, ≥0.7); a matching `location_name` relaxes the title threshold by 0.1. Each group renders candidates side-by-side with View + Delete; Delete is a soft-delete (`deleted_at`) with confirm. Linked from the admin dashboard via a "Find Duplicates" button.
**Files touched:** [app/admin/duplicates/page.tsx](app/admin/duplicates/page.tsx) (new), [app/admin/page.tsx](app/admin/page.tsx)
**Follow-up (same day):** Also surfaced "Find Duplicates" in the navbar Admin menu (desktop dropdown + mobile menu) — [components/Navbar.tsx](components/Navbar.tsx).
**Notes for future sessions:** Pairing is O(n²) client-side; if event volume grows large, move detection to a server route. Thresholds (0.82/0.7) are hardcoded — tune if noisy.

---

## 2026-06-15 — SEO: venue landing pages

**What changed:** Added `/venues/[slug]` SEO pages, one per distinct venue with upcoming events (e.g. `/venues/teatru-manoel`). Like locality pages, venues are derived from free-text `location_name` (no venues table) — `lib/venues.ts` provides `slugifyVenue`, `isRealVenue` (filters out generic values: malta/gozo/various/roaming/tba/tbc), and `groupByVenue` (groups upcoming events by slug, picks most-common spelling as display name). Pages reuse `EventLanding`, cross-link to the venue's locality page; event-detail Venue field now links to the venue page; sitemap emits one route per real venue. Verified: 27 venue routes, e.g. Teatru Manoel 22 events, Gianpula rooms 6–7; non-venue slug ("malta") → 404; event-detail venue + locality links render.
**Files touched:** [lib/venues.ts](lib/venues.ts) (new), [app/venues/[slug]/page.tsx](app/venues/%5Bslug%5D/page.tsx) (new), [app/sitemap.ts](app/sitemap.ts), [app/events/[slug]/page.tsx](app/events/%5Bslug%5D/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** Venue pages are per-distinct-location_name, so sub-venues like "Marrakech, Gianpula Village" get their own pages — acceptable. Remaining roadmap item: editorial/blog. Recommended to pause new builds and use Search Console Performance data (after ~2 wks indexing) to prioritise.

## 2026-06-15 — Admin: unmapped-venues diagnostic panel

**What changed:** Added a read-only "Unmapped venues" panel to the top of the admin dashboard ([components/admin/UnmappedVenues.tsx](components/admin/UnmappedVenues.tsx)). It runs upcoming approved events' `location_name` through `deriveLocality()` and lists any venue that returns null (i.e. won't appear on a /events/location page), with per-venue event counts. Solves the visibility gap: unmapped venues previously failed silently. Mapping is still done in code (`lib/malta-localities.ts`); the panel just surfaces what needs it. Hides itself entirely when all venues are mapped. Verified against live data — currently surfaces: Quarry Wharf (2), Offbeat Music Bar (1), "Malta" (1), "Roaming" (1).
**Files touched:** [components/admin/UnmappedVenues.tsx](components/admin/UnmappedVenues.tsx) (new), [app/admin/page.tsx](app/admin/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** This is the Tier-1 (detection-only) option. Tier 2 (per-event locality override column + form dropdown) and Tier 3 (DB-backed admin-editable venue map) were scoped but deferred — only build if unmapped venues become frequent.

## 2026-06-15 — SEO: location landing pages

**What changed:** Added `/events/location/[slug]` SEO landing pages (e.g. `/events/location/valletta`). Locality is derived from each event's free-text `location_name` — the town is usually NOT in the string (most are bare venue names), so `lib/malta-localities.ts` maps known venues → locality plus parses any trailing/inline canonical locality name. Derivation is computed at request time (no DB column/migration — event volume is small; `deriveLocality()` can backfill a column later if needed). Pages reuse `EventLanding`; sitemap emits only localities that currently have upcoming events; event-detail sidebar now shows a "More events in {locality}" internal link. Verified counts vs live data: Valletta 33, Rabat 23 (Gianpula maps here), St Paul's Bay 11, Sliema 9, Floriana 8, St Julian's 5, Birgu/Qrendi 4, Kalkara 3, Naxxar 2, Tarxien/Birżebbuġa 1; unknown slug → 404.
**Files touched:** [lib/malta-localities.ts](lib/malta-localities.ts) (new), [lib/event-queries.ts](lib/event-queries.ts) (added `fetchAllUpcoming`), [app/events/location/[slug]/page.tsx](app/events/location/%5Bslug%5D/page.tsx) (new), [app/sitemap.ts](app/sitemap.ts), [app/events/[slug]/page.tsx](app/events/%5Bslug%5D/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** Venue→locality map in `malta-localities.ts` is curated/best-effort — a few assumptions (Café del Mar→St Paul's Bay, Gianpula→Rabat) may need owner confirmation; correct the map there if wrong. Importer adapters do NOT yet set locality (not needed — derived on read). The whole programmatic-SEO set (tag, time, location landing pages + expired-event module) is now complete.

## 2026-06-15 — SEO: expired-event related-events module

**What changed:** Past event detail pages were dead ends (rendered like live events with stale dates). Added: (1) an "This event has ended" banner, and (2) a "Upcoming events you might like" section showing related upcoming events — prefers shared tags, tops up with general upcoming so it's never empty, excludes the event itself. "Ended" is computed from the latest active occurrence (or `date_end ?? date_start`) vs now. Keeps the page useful and passes link equity instead of soft-404-ing. Verified in browser: past event shows banner+module (6 cards), upcoming event shows neither.
**Files touched:** [lib/event-queries.ts](lib/event-queries.ts) (added `fetchRelatedEvents`), [app/events/[slug]/page.tsx](app/events/%5Bslug%5D/page.tsx)
**New tables/migrations:** none
**Notes for future sessions:** Next SEO build item still pending: location landing pages (needs a normalised `locality` field — `location_name` is free text from importers — so a migration + backfill).

## 2026-06-15 — SEO: programmatic tag + time-based landing pages

**What changed:** Added server-rendered, indexable landing pages to capture local+temporal search intent (the biggest organic-growth lever for this niche). New real routes replace the old `?tag=` query-param pages that Google largely ignored: `/events/tag/[slug]` (one rankable page per enabled tag) and time pages `/events/today`, `/events/this-weekend`, `/events/this-month`. Each has unique `generateMetadata` (title/description/canonical), an H1, intro copy, `ItemList` JSON-LD, and internal links to sibling landing pages. Event-detail tag chips now link to their tag landing page (internal-linking so the new pages get crawled). Sitemap updated: tag routes now point at `/events/tag/<slug>`, time pages added.
**Files touched:** [lib/event-queries.ts](lib/event-queries.ts) (new — shared Malta-TZ date ranges + `fetchLandingEvents` + `itemListJsonLd`), [lib/landing-presets.tsx](lib/landing-presets.tsx) (new — time-preset copy + `PresetLanding`), [components/EventLanding.tsx](components/EventLanding.tsx) (new — reusable server landing body), [app/events/tag/[slug]/page.tsx](app/events/tag/%5Bslug%5D/page.tsx), [app/events/today/page.tsx](app/events/today/page.tsx), [app/events/this-weekend/page.tsx](app/events/this-weekend/page.tsx), [app/events/this-month/page.tsx](app/events/this-month/page.tsx), [app/events/[slug]/page.tsx](app/events/%5Bslug%5D/page.tsx) (tag chips → links), [app/sitemap.ts](app/sitemap.ts)
**New tables/migrations:** none
**Notes for future sessions:** All new pages are `force-dynamic` (live event data). Next high-ROI SEO steps from the strategy, not yet done: (1) location landing pages — needs a normalised `locality` field since `events.location_name` is free text from importers; (2) related-upcoming-events module on expired event pages to stop soft-404 trust decay; (3) connect Google Search Console + validate Event schema in Rich Results Test; (4) editorial/blog + venue pages. The main `/events` list is still a `'use client'` page (filters) — fine since the landing pages now cover the crawlable surface.

## 2026-06-14 — Fix image mirroring for bot-UA-blocking hosts

**What changed:** Image mirroring downloaded source images with a single browser-style UA (`Mozilla/5.0 (compatible; EventsMaltaImporter/1.0)`). Hosts that block browser-looking UAs but serve our plain importer UA (g7events, unomalta) returned 403, so the mirror fell back to the original URL — which then fails to render on-site because the host isn't in the Next.js image allowlist. Added a UA fallback: try the browser UA first (Wix/Cloudflare need it), and on 401/403/429 retry with the canonical importer `USER_AGENT` from http.ts. Also ran a one-off backfill that re-mirrored all 32 existing approved events whose `image_url` was still a non-bucket URL (tsmalta, unomalta, g7events) — 0 failures; every approved event now serves from the `event-images` bucket.

**Files touched:** [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts)

**Notes for future sessions:** The backfill was a throwaway node script (parsed `.env.local` directly with the service-role key, not committed). If more bot-blocked sources appear, the in-pipeline UA fallback now handles them automatically on import. Note `.env.local` here uses the newer short Supabase key format (`sb_secret_…`), and shell `source` mangled the service-role line — parse the file directly in scripts.

---

## 2026-06-14 — Fix /events filter race showing unfiltered results

**What changed:** On the events list page the tag list (slug→name map) loads in one effect while the filter query runs in another. When arriving via `/events?tag=<slug>`, the first query ran before `categories` loaded, so the slug→name lookup returned nothing and the query fetched ALL events unfiltered (a flash of wrong results). Added a guard that skips the query while a tag filter is selected but `categories` is still empty; the effect re-runs once tags load.

**Files touched:** [app/events/page.tsx](../app/events/page.tsx)

**Notes for future sessions:** This was diagnosed while investigating "category filter shows other categories." The deeper cause is NOT a filter bug — events are multi-tagged (e.g. a jazz concert carries both `Live Music` and `Nightlife`) and the filter uses `.overlaps` (has-ANY), so multi-tagged events legitimately appear under each tag. Tightening the importer's AI tag-suggester or introducing a single primary category was offered but left undecided by the user.

---

## 2026-06-14 — Reliable GA4 page views on SPA navigation

**What changed:** GA4 is wired correctly (consent-gated in `Analytics.tsx`, only loads when `NEXT_PUBLIC_GA_ID` is set) but gtag's `config` only fires a page_view on initial load, so App Router client-side navigations weren't reliably counted. Added a `usePathname` effect that sends an explicit `page_view` to gtag on every route change. No new deps. The remaining work to "turn on" analytics is config-only: set `NEXT_PUBLIC_GA_ID` in Vercel and redeploy.

**Files touched:** [components/Analytics.tsx](../components/Analytics.tsx)

**Notes for future sessions:** Analytics is consent-gated by design (GA loads only after the cookie banner's analytics opt-in), so GA totals undercount vs raw traffic — the first-party `events.view_count` shown in /admin/analytics is the unconditional counter. Known minor bug not yet fixed: the "Open Google Analytics" link in [app/admin/analytics/page.tsx](../app/admin/analytics/page.tsx) builds its URL from the Measurement ID (G-…) but GA dashboard URLs need the numeric property ID.

---

## 2026-06-14 — Add 4 nightlife/promoter import adapters

**What changed:** Added importers for Gianpula Village, Café del Mar Malta, G7 Events and UNO Malta. Techniques: `gianpula` scrapes the `/events/` listing cards (date has no year → inferred); `cafedelmar` lists via `wp/v2/event` REST then recovers the date from each detail page's "Book Sofa" CTA link (`?date=YYYY-MM-DD`, stored date-only); `g7events` harvests `/events/<slug>` links off the homepage and parses `.detail.calendar/.clock/.location` (blocks browser UAs but serves our importer UA); `unomalta` uses the clean The Events Calendar (Tribe) REST at `/wp-json/tribe/events/v1/events`. Registered all four, added to `IMPLEMENTED_ADAPTERS`, seeded source rows (disabled) via migration 0017. ra.co was investigated and dropped — hard Cloudflare block, no fetch-based path.

**Files touched:** [lib/importers/adapters/gianpula.ts](../lib/importers/adapters/gianpula.ts), [lib/importers/adapters/cafedelmar.ts](../lib/importers/adapters/cafedelmar.ts), [lib/importers/adapters/g7events.ts](../lib/importers/adapters/g7events.ts), [lib/importers/adapters/unomalta.ts](../lib/importers/adapters/unomalta.ts), [lib/importers/registry.ts](../lib/importers/registry.ts), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx)

**New tables/migrations:** [supabase/migrations/0017_more_event_sources.sql](../supabase/migrations/0017_more_event_sources.sql) — seeds 4 disabled `event_sources` rows. Apply via Supabase SQL editor.

**Notes for future sessions:** Rows are seeded disabled — enable + "Run now" each from /admin/sources to smoke-test before they join the hourly cron. cafedelmar skips events without a Book-Sofa date link (≈1 in 4); gianpula/g7events/cafedelmar store Malta-local times as UTC (≤2h drift, like popp); unomalta uses Tribe's `utc_start_date` (true UTC). ra.co left unimplemented by design.

---

## 2026-06-03 — Fix popp adapter 504 timeout

**What changed:** The popp adapter was pre-fetching `maxEvents * 3` pages (up to 60) all at once before filtering for future events, which easily exceeded Vercel's function timeout. Switched to a streaming batch approach: fetches pages in batches of 4 (the existing concurrency) and stops as soon as `maxEvents` future events are collected. Typically reduces fetches from 60 to 4–8.

**Files touched:** [lib/importers/adapters/popp.ts](../lib/importers/adapters/popp.ts)

---

## 2026-06-03 — Cron diagnosis + pre-launch security fixes

**What changed:** Diagnosed why imports stopped after Jun 1 — `site_settings.published.importers.aggregator_user_id` was null, so every source threw "Aggregator user not configured" before opening an import_runs row (3s no-op cron, empty logs). Fix is data-only (restore the UUID via SQL UPDATE on site_settings). Then ran a pre-launch security scan and fixed two findings:
- **Stored XSS (HIGH):** event detail page injected `JSON.stringify(eventJsonLd/breadcrumbJsonLd)` into `<script type="application/ld+json">` via `dangerouslySetInnerHTML`. User-controlled fields (title, descriptions, location, organizer display_name) could contain `</script>` and break out. Added `jsonLdSafe()` helper escaping `<` → `<`.
- **Hardcoded GA4 secret (LOW):** moved `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` to env vars; GA4 send now skipped when secret absent (redirect still works).

**Files touched:** [app/events/[slug]/page.tsx](../app/events/[slug]/page.tsx), [app/api/referral/track/route.ts](../app/api/referral/track/route.ts)

**Notes for future sessions:**
- **Action items for user before launch:** (1) set `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` env vars in Vercel — referral-click analytics is silent until `GA4_API_SECRET` is set, though redirects always work; (2) rotate the GA4 secret (old value `8_Cxub-rT_COwY6B0c2rvA` is in git history).
- The aggregator_user_id null is the root cause of "no events to approve" — if imports silently stop again, check that field first.
- Security fixes were committed + pushed to `main` (commit 46324c3) — auto-deploys to prod.
- **Pre-existing uncommitted change** to [lib/importers/adapters/popp.ts](../lib/importers/adapters/popp.ts) was already in the working tree at session start (POPP adapter: batch-fetch pages until `maxEvents` future events found, rather than a fixed upfront pool). NOT authored this session and left uncommitted — confirm intent with the user before committing.

---

## 2026-06-01 — Date preset filter chips on events page + homepage

**What changed:** Added Today / This Weekend / This Week / This Month quick-filter chips to the events browse page. Each chip narrows the Supabase query with `.gte`/`.lte` on `date_start` using Malta timezone. Chips are toggleable; "Clear all filters" resets them. Also added the same chips to the homepage categories card (and block renderer) as links to `/events?date=X`. The events page reads `?date=` from the URL on load so homepage links land with the filter pre-applied.

**Files touched:** [app/events/page.tsx](../app/events/page.tsx), [app/page.tsx](../app/page.tsx), [lib/blocks/Renderer.tsx](../lib/blocks/Renderer.tsx)

---

## 2026-06-01 — Categories wrap to multiple rows on homepage

**What changed:** The categories strip was a single horizontally-scrollable row (`overflow-x-auto`). Changed to `flex-wrap` so all tags are visible at a glance (two rows on typical screens). Also removed `flex-shrink-0` from individual pills since it's no longer needed.

**Files touched:** [app/page.tsx](../app/page.tsx) (`renderCategories`), [lib/blocks/Renderer.tsx](../lib/blocks/Renderer.tsx) (`CategoriesStripR`) — both paths updated for consistency.

---

## 2026-05-30 — Fix broken Wix images (festivals_mt) escaping image-mirror

**What changed:** Wix originals (e.g. Pegasus Flight to Freedom, 13 MB) exceeded image-mirror's 10 MB cap. The mirror kept the original `static.wixstatic.com` URL on the event, which Next/Image then rejected (only `*.supabase.co` is allowlisted). Fixed at the source: `wixImageUrl()` now emits a Wix CDN-transformed variant (`/v1/fit/w_1600,h_1600,q_85/file.jpg`) — typically <500 KB. Also raised the mirror cap 10 → 25 MB as a backstop.

**Files touched:** [lib/importers/adapters/festivals_mt.ts](../lib/importers/adapters/festivals_mt.ts), [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts)

**Notes for future sessions:**
- Existing festivals_mt events will self-heal on the next import: imageUrl is part of `content_hash`, so the new transform suffix flips them onto the update path and triggers re-mirror.
- Events with `manual_edit_at` set will NOT self-heal — moderator-edit guard still applies. Re-save in admin or clear `manual_edit_at` for affected rows.
- Same Wix transform pattern (`/v1/fit/w_<W>,h_<H>,q_85/file.<ext>`) is reusable for any future Wix-backed adapter.

---

## 2026-05-28 — Drop per-source remotePatterns from next.config.js

**What changed:** After the image-mirroring system landed and the user opted to wipe-and-reimport (rather than backfill), every event in the DB will end up with an `image_url` on `*.supabase.co/storage/...`. The per-source allowlist entries in `next.config.js` are now obsolete. Removed all 8 of them; the `*.supabase.co` wildcard entry is the only one left.

**Files touched:** [next.config.js](../next.config.js)

**Notes for future sessions:**
- New adapters do NOT need a `next.config.js` entry — the mirror handles every host.
- This is the close of the six-instance allowlist-bug saga. The single-line wildcard is the architectural fix that prevents it from happening again.
- Order of operations the user is following: apply migration 0016 → wipe imports via `.claude/scripts/wipe_imports.sql` → manually trigger each source's "Run now" on `/admin/sources` → verify mirrored URLs in run logs.

---

## 2026-05-28 — Mirror imported images to Supabase Storage (kills the allowlist-bug class)

**What changed:** After **six** image-allowlist bugs in two days, implemented the permanent fix flagged as a follow-up task: every imported event image is now downloaded server-side at import time and uploaded to the `event-images` bucket. `events.image_url` ends up at `*.supabase.co/storage/v1/object/public/event-images/imports/<adapter>/<sha256(url)>.<ext>`. The `next.config.js` per-source allowlist becomes obsolete — `*.supabase.co/storage/...` is the only entry needed for imports going forward.

**Architecture:**

- **New helper** [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts) — `mirrorImageToStorage({ sourceUrl, sourceSlug, supabase, log })`. HEAD-checks content-type and size (10MB cap, image/* only, 15s timeout per request, bounded body reader so a runaway response can't OOM us). Path is deterministic from `sha256(sourceUrl)` so the same URL never gets uploaded twice; the helper does a public-URL HEAD before downloading to confirm the file isn't already there. Returns the original URL on any failure — the importer never breaks.
- **Pipeline integration** [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) — both insert and update paths call `mirrorImageToStorage` after the AI rewrite/tag steps, using `source.adapter` as the slug.
- **Backfill endpoint** [app/api/admin/mirror-images/route.ts](../app/api/admin/mirror-images/route.ts) — super_admin-only POST. Takes `?limit=` (default 25, max 100). Returns `{ mirrored, skipped, failed, done, log }`. The UI calls it in a loop until `done: true`. Uses `isOurBucketUrl()` to skip already-mirrored rows. Looks up `event_sources.adapter` for the path slug; falls back to `'user'` for human-uploaded events with external URLs (probably no rows hit this case today).
- **UI** [app/admin/sources/page.tsx](../app/admin/sources/page.tsx) — collapsible panel above the sources list with a "Run mirror" button. Shows running totals + a dark `<pre>` for the log.
- **Migration** [supabase/migrations/0016_event_images_bucket.sql](../supabase/migrations/0016_event_images_bucket.sql) — idempotent. Ensures `event-images` bucket exists, public read, authenticated-user write (existing EventForm flow). Service-role bypasses RLS so the pipeline writes without explicit policy.

**Files touched:** [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts) (new), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts), [app/api/admin/mirror-images/route.ts](../app/api/admin/mirror-images/route.ts) (new), [app/admin/sources/page.tsx](../app/admin/sources/page.tsx), [supabase/migrations/0016_event_images_bucket.sql](../supabase/migrations/0016_event_images_bucket.sql) (new), [CLAUDE.md](../CLAUDE.md).

**Rollout sequence (manual):**
1. **Apply migration 0016** (idempotent — re-running is safe even if the bucket already exists).
2. Push deploys; new cron runs and manual reruns will auto-mirror going forward.
3. **Click "Run mirror"** on `/admin/sources` to backfill existing events. Browser will sit on the page while it loops through batches (~25 events × 10s each ≈ 4 min per 100 events). Don't navigate away.
4. **After backfill completes** with zero `failed`, drop the per-source entries from `next.config.js`. Verify with the curl recipe documented in earlier session entries.

**Notes for future sessions:**
- Backfill leaves the `next.config.js` entries in place — they're harmless after mirroring (the URLs no longer route through those hosts), but removing them is a separate cleanup. Don't drop them until the user confirms backfill completed cleanly.
- The dedupe-by-URL-hash means a single source URL is uploaded only once even across hundreds of events that reference it (e.g. the MaltaArtisanMarkets fallback image is shared across every market). The first event pays the upload cost; the rest get a cached public URL.
- 15s timeout × 10MB cap × HEAD-first pattern means each image costs at most ~16s of import time. With 25 events per batch and 8 sources × ~20 events per cron run, worst case adds ~6 min to a full cron — still inside Vercel's 5-min route limit only because most images skip via the existing-URL HEAD check on the second run onward. If the first cold backfill cron times out, the user can re-run manually.
- `categoryHint` (set by all adapters, never read) still dead. Future cleanup.

---

## 2026-05-28 — Audit all 8 adapters; fix POPP + TSMalta image allowlist

**What changed:** User asked for a full audit after the fourth image-allowlist bug in two days. Cross-referenced every adapter's `imageUrl` source against `next.config.js` remotePatterns. Found two more wrong entries:

- **POPP** — adapter uses `popp.mt/wp-content/uploads/...` (og:image meta), allowlist had `popp.com.mt` (wrong TLD)
- **TSMalta** — adapter uses `tsmalta.com/wp-content/uploads/...` (og:image meta), allowlist had `salesjan.edu.mt` (different domain entirely — someone confused the two Teatru Salesjan domains)

Replaced both with the correct host + a `/wp-content/uploads/**` path scope (instead of `/**`).

**Audit results (all 8 adapters):**

| Adapter | Image source | Allowlist match |
|---|---|---|
| esplora | `esplora.org.mt/wp-content/uploads/...` | ✓ |
| festivals_mt | `static.wixstatic.com/media/...` | ✓ |
| heritagemalta | `heritagemalta.mt/app/uploads/...` | ✓ (fixed 2026-05-25) |
| maltaartisanmarkets | `*.supabase.co/storage/v1/object/public/...` | ✓ (covered by wildcard) |
| **popp** | `popp.mt/wp-content/uploads/...` | ❌ → fixed today |
| teatrumanoel | `teatrumanoel.mt/wp-content/uploads/...` | ✓ |
| **tsmalta** | `tsmalta.com/wp-content/uploads/...` | ❌ → fixed today |
| visitmalta | `api.visitmaltaplus.com/api/v2/images/...` | ✓ (fixed 2026-05-25) |

**Files touched:** [next.config.js](../next.config.js)

**Notes for future sessions:**
- This is the **sixth** image-allowlist bug. The spawned task to mirror images to Supabase Storage (cwd unchanged) is now badly overdue — fixing the bug class permanently would take ~3 hours and prevent every future occurrence.
- Diagnostic recipe documented earlier still holds: `curl -A "Mozilla/5.0"` the direct image URL (should 200), then curl the `/_next/image?url=<encoded>` proxy (must also 200 — 400 = remotePattern mismatch).
- All 8 adapters audited as of this date; any new adapter should be tested against the proxy on first import.

---

## 2026-06-01 — Wix image size fix (carried from prior session)

**What changed:** Two related tweaks found uncommitted in the working tree, carried forward and committed for traceability:

1. [lib/importers/adapters/festivals_mt.ts](../lib/importers/adapters/festivals_mt.ts) — `wixImageUrl()` now requests a CDN-transformed 1600×1600 fit variant (`/v1/fit/w_1600,h_1600,q_85/file.jpg`) instead of the raw original. Wix originals are routinely 10–20 MB; the previous URL pattern handed those raw files to image-mirror, which silently rejected them against the size cap and left events pointing at `static.wixstatic.com` URLs that Next/Image refused to render (we'd dropped the per-source `remotePatterns` after introducing image-mirror).
2. [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts) — `MAX_BYTES` raised from 10 MB → 25 MB as a belt-and-braces guard for the same class of bug (large originals from other CMSes).

**Files touched:** [lib/importers/adapters/festivals_mt.ts](../lib/importers/adapters/festivals_mt.ts), [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts)

**Notes for future sessions:**
- The Wix CDN transform also speeds up the mirror download (smaller bytes) → bonus latency win for the festivals_mt path.
- If we add more CMS adapters that hit oversized images (Heritage Malta originals, Esplora print-quality JPEGs), consider standardising on CDN variants per-source rather than raising MAX_BYTES further.

---

## 2026-05-30 — Parallelise per-event work (BATCH_SIZE=4)

**What changed:** After the no-retry + soft-deadline fix, Visit Malta still 504'd. Per-event work (Claude rewriter + Claude tagger + image-mirror + DB writes) takes 3-12s sequential. At 20 events that's 60-240s, right at the soft deadline; 30+ events couldn't fit.

[lib/importers/pipeline.ts](../lib/importers/pipeline.ts) now buffers events from the adapter into batches of 4 and processes each batch with `Promise.all`. Adapters still yield one event at a time (can't parallelise an async iterable), but processing them concurrently masks the per-event latency. Wall-clock for 20 events drops from ~120s to ~30s in typical cases.

**Files touched:** [lib/importers/pipeline.ts](../lib/importers/pipeline.ts)

**Notes for future sessions:**
- BATCH_SIZE=4 was chosen to stay well under Anthropic's Tier 1 rate limits (50 RPM on Haiku 4.5 = 1 request every 1.2s; 4 concurrent × 2 calls/event × ~3s/call = ~6.7 RPS = 400 RPM, comfortably under tier limits since each event only sustains for seconds).
- Each batch's `Promise.all` waits for the slowest event in the batch — a single 30s stragger blocks the whole batch. If individual events get pathologically slow, the soft deadline still catches it (we just process up to 4 in flight when the deadline trips).
- Closure type narrowing: had to materialise `aggregatorUserId: string | null` into a local const after the null-check; TS doesn't carry narrowing into closures.
- If we ever see batch-internal races (e.g. two events with the same slug racing to insert), would need to dedupe upstream or hold a per-source mutex around DB writes. Not seen so far.

---

## 2026-05-30 — No-retry on timeout + soft deadline (teatru manoel 504)

**What changed:** After the image-mirror fix, Teatru Manoel still 504'd. Curl'd the source: pages currently take ~32s each (Cloudflare under load). Our `fetchText` had a 15s timeout + retry → effective 30s per slow page, killing the run. And without a wall-clock guard, the function always 504'd and left the `import_runs` row at `status='running'` forever with no log.

Two fixes:
1. [lib/importers/http.ts](../lib/importers/http.ts) — don't retry on `AbortError` (timeout). Retrying a slow server is pointless; we just burn another 15s. Network errors and 5xx still retry once as before.
2. [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) — soft deadline at 240s. When tripped, stop fetching new events from the adapter, close the run row cleanly as `'partial'` with a useful log. Means a slow source now produces a finalized partial-success row instead of an orphaned `'running'` row.

**Files touched:** [lib/importers/http.ts](../lib/importers/http.ts), [lib/importers/pipeline.ts](../lib/importers/pipeline.ts)

**Notes for future sessions:**
- 240s leaves 60s of headroom for the close-the-row write before Vercel's 300s ceiling. If the Anthropic SDK is mid-call when we hit the deadline, the `for await` won't break until the current iteration finishes — so there's still a worst-case of `240 + (single event time)`. Acceptable.
- If teatrumanoel is still slow tomorrow, consider reducing its over-fetch buffer (`maxEvents * 3`) and timeout. For now leaving as-is.
- Pre-existing orphaned `import_runs` rows from the two prior 504s should be cleaned up — SQL is in the previous log entry.

---

## 2026-05-30 — Image-mirror surgical perf fix (festivals_mt 504)

**What changed:** Festivals Malta manual import 504'd at Vercel's 300s `maxDuration` with no log persisted (the row never closed). Diagnosis: image-mirror was doing **three HTTP roundtrips per event** (HEAD source → HEAD public-URL → GET source), each with a 15s timeout. Combined with Claude rewriter + tagger calls per event, 28 events sequential pushed past the ceiling.

Collapsed to a single GET that doubles as content-type validation. Always upsert (idempotent). Now ~1-2 roundtrips per event vs 3 — recovers roughly 2-4s per event on a hot run, 10-30s on slow ones.

**Files touched:** [lib/importers/image-mirror.ts](../lib/importers/image-mirror.ts)

**Notes for future sessions:**
- If 504s persist on bigger sources, the next step up is parallelising `processOne` into batches of 4-5 in [lib/importers/pipeline.ts](../lib/importers/pipeline.ts) — would need careful DB-write ordering but `processOne` is already self-contained per event.
- Tradeoff: we now re-upload bytes even when the image is already mirrored. Storage cost is negligible at this volume; the perf win matters more.
- Orphaned `import_runs` rows from 504s are still left at `status='running'` forever (no watchdog). Same issue flagged previously. Cleanup SQL:
  ```sql
  UPDATE import_runs SET status='error', finished_at=now(), log='timed out (no callback)'
  WHERE status='running' AND started_at < now() - INTERVAL '10 minutes';
  ```

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
