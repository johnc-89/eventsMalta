# Events Malta — Technical Plan

## 1. Architecture Overview

```
Browser → Next.js (Vercel) → Supabase (Auth + Database + Storage)
```

- **Next.js 14** — App Router, Server Components for SEO, Client Components for interactivity
- **Supabase Auth** — Email/password + Google/Facebook social login
- **Supabase Database** — PostgreSQL with Row Level Security
- **Supabase Storage** — Event images (flyers, banners)
- **Vercel** — Hosting with auto-deploy from GitHub

---

## 2. Database Schema

### 2.1 profiles
Extends Supabase Auth. Every signed-up user gets a profile.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | References auth.users |
| email | TEXT | From auth |
| display_name | VARCHAR(100) | |
| avatar_url | TEXT | |
| role | ENUM | `user`, `trusted_uploader`, `admin` |
| subscription_tier | ENUM | `free`, `basic`, `pro` (future) |
| max_active_events | INT | Default 1 for free tier |
| bio | TEXT | Optional organiser bio |
| phone | VARCHAR(20) | Optional contact |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Role logic:**
- `user` — can upload events, but they require admin approval before going live
- `trusted_uploader` — events go live immediately (no review needed)
- `admin` — can approve/reject events, manage users, feature events

### 2.2 categories
Lookup table so we can add/rename categories without schema changes.

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(50) | e.g. "Party", "Comedy", "Music", "Theatre", "Sports", "Food & Drink", "Festival", "Arts", "Charity", "Other" |
| slug | VARCHAR(50) | URL-friendly: "food-and-drink" |
| icon | VARCHAR(10) | Emoji or icon name |
| display_order | INT | For sorting in filters |

### 2.3 events
The core table — significantly expanded from current schema.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | Auto-generated |
| organizer_id | UUID FK | References profiles.id |
| category_id | INT FK | References categories.id |
| title | VARCHAR(255) | Required |
| slug | VARCHAR(255) | URL-friendly, unique |
| description | TEXT | Full description (supports markdown) |
| short_description | VARCHAR(300) | For cards/previews |
| date_start | TIMESTAMPTZ | Event start — required |
| date_end | TIMESTAMPTZ | Event end — nullable for open-ended |
| location_name | VARCHAR(255) | e.g. "Aria Complex" |
| location_address | VARCHAR(500) | Full address |
| latitude | DECIMAL(10,7) | For future map feature |
| longitude | DECIMAL(10,7) | For future map feature |
| image_url | TEXT | Main flyer/banner |
| status | ENUM | `draft`, `pending_review`, `approved`, `rejected`, `cancelled` |
| rejection_reason | TEXT | If admin rejects, explain why |
| is_featured | BOOLEAN | Default false — for homepage promotion (future paid feature) |
| is_recurring | BOOLEAN | Default false |
| recurrence_rule | VARCHAR(100) | e.g. "every friday" (future) |
| ticket_type | ENUM | `free`, `paid`, `external_link` |
| ticket_url | TEXT | External ticketing link |
| price_min | DECIMAL(8,2) | Lowest ticket price (display only for now) |
| price_max | DECIMAL(8,2) | Highest ticket price |
| currency | VARCHAR(3) | Default 'EUR' |
| min_age | INT | Nullable — e.g. 18 for club nights |
| max_capacity | INT | Nullable |
| tags | TEXT[] | PostgreSQL array — e.g. {"live-music", "outdoor", "rooftop"} |
| view_count | INT | Default 0 — for analytics |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### 2.4 event_images
Multiple images per event (gallery).

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| event_id | BIGINT FK | References events.id (CASCADE delete) |
| image_url | TEXT | Supabase Storage URL |
| display_order | INT | Ordering in gallery |
| created_at | TIMESTAMPTZ | |

### 2.5 saved_events
Users can save/bookmark events.

| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID FK | References profiles.id |
| event_id | BIGINT FK | References events.id |
| created_at | TIMESTAMPTZ | |
| PK | | Composite (user_id, event_id) |

### 2.6 event_reviews (future — post-event)
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| event_id | BIGINT FK | |
| user_id | UUID FK | |
| rating | SMALLINT | 1-5 |
| comment | TEXT | |
| created_at | TIMESTAMPTZ | |

---

## 3. Row Level Security (RLS) Policies

### events
| Operation | Rule |
|-----------|------|
| SELECT | Anyone can read events WHERE status = 'approved' OR organizer_id = current user |
| INSERT | Authenticated users only |
| UPDATE | Only the organizer OR admins |
| DELETE | Only the organizer (if draft/pending) OR admins |

### profiles
| Operation | Rule |
|-----------|------|
| SELECT | Public (display_name, avatar, bio) |
| UPDATE | Only own profile |

### saved_events
| Operation | Rule |
|-----------|------|
| ALL | Only own bookmarks |

---

## 4. Authentication & Security

### Auth Flow
1. **Sign up** — email/password (Supabase Auth)
2. **Email verification** — required before uploading events
3. **Social login** — Google, Facebook (configure in Supabase dashboard)
4. **Password reset** — built-in Supabase flow

### Security Measures
- **RLS on every table** — no data leaks even if someone calls the API directly
- **Input validation** — server-side validation on all API routes
- **Image uploads** — file type + size limits (max 5MB, jpg/png/webp only)
- **Rate limiting** — Supabase has built-in rate limiting on auth endpoints
- **CSRF protection** — handled by Next.js
- **XSS prevention** — React auto-escapes, plus sanitize markdown
- **SQL injection** — impossible with Supabase client (parameterized queries)
- `.env.local` gitignored — secrets never in repo

---

## 5. Event Lifecycle

```
User creates event
       ↓
   [draft] ← user can edit freely
       ↓
User clicks "Submit for Review"
       ↓
   [pending_review]
       ↓
Admin reviews ──→ [rejected] (with reason) → user edits → resubmit
       ↓
   [approved] → LIVE on site
       ↓
Event date passes → automatically archived (still viewable)
       ↓
User can [cancel] at any time
```

**Exception:** `trusted_uploader` role skips review → goes straight to `approved`.

---

## 6. Pages & Routes

| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Homepage — featured + upcoming events | No |
| `/events` | Browse all events with filters | No |
| `/events/[slug]` | Single event detail page | No |
| `/events/create` | Create new event form | Yes |
| `/events/[slug]/edit` | Edit event | Yes (owner/admin) |
| `/login` | Sign in | No |
| `/signup` | Create account | No |
| `/profile` | User's profile + their events | Yes |
| `/saved` | User's saved/bookmarked events | Yes |
| `/admin` | Admin dashboard — pending events queue | Yes (admin) |
| `/admin/events` | Manage all events | Yes (admin) |
| `/admin/users` | Manage users/roles | Yes (admin) |

---

## 7. Implementation Phases

### Phase 1 — Foundation (NOW)
1. Database schema (drop old table, create new schema)
2. Supabase Auth setup (email/password)
3. Profile creation trigger (auto-create profile on signup)
4. Seed categories table
5. Image storage bucket

### Phase 2 — Core Pages
6. Homepage (upcoming events grid)
7. Event detail page
8. Browse/search events with category filters
9. Login/signup pages

### Phase 3 — Event Management
10. Create event form (with image upload)
11. Edit event
12. User profile page (my events)
13. Save/bookmark events

### Phase 4 — Admin
14. Admin dashboard
15. Event approval/rejection flow
16. User role management
17. Trusted uploader workflow

### Phase 5 — Polish
18. Social login (Google/Facebook)
19. Email notifications (event approved, new events in your area)
20. SEO optimisation (meta tags, Open Graph)
21. Mobile responsiveness audit
22. Performance optimisation

### Phase 6 — Monetisation (Future)
23. Subscription tiers (Stripe integration)
24. Featured/promoted events
25. Ticket sales on platform
26. Analytics dashboard for organisers

---

## 8. Suggested Additions (My Recommendations)

### Do now — low effort, high value:
- **Slug-based URLs** (`/events/rooftop-party-valletta` not `/events/42`) — better SEO
- **Soft delete** — never hard-delete events, add a `deleted_at` column
- **Timezone handling** — Malta is CET/CEST. Store as TIMESTAMPTZ, display in local time
- **Image optimisation** — use Next.js `<Image>` with Supabase Storage (already partially set up)

### Do later — worth planning for:
- **Full-text search** — PostgreSQL has built-in `tsvector` search, perfect for events
- **Location-based discovery** — PostGIS extension on Supabase for "events near me"
- **Recurring events** — model as a template that generates individual event instances
- **Multi-language** — Malta is bilingual (Maltese/English), consider i18n from the start or not at all
- **PWA/mobile** — Next.js PWA plugin for "add to home screen"

### Avoid for now:
- Don't build a custom CMS — use Supabase dashboard for admin data fixes
- Don't build real-time features yet — polling/refresh is fine for events
- Don't over-engineer the subscription system — a simple boolean flag is enough until you validate the business model
