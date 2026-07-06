import { supabase } from '@/lib/supabase'
import { DEFAULT_PALETTE_ID } from './site-palettes'

export type BannerColor = 'gold' | 'teal' | 'burgundy' | 'dark'

export type HomepageSectionId = 'hero' | 'categories' | 'featured' | 'upcoming' | 'faq'
export interface HomepageSection {
  id: HomepageSectionId
  enabled: boolean
}

export interface PageContent {
  title: string
  last_updated: string  // freeform text shown at the top
  content_md: string    // markdown body
}

export interface SiteSettingsShape {
  brand: {
    name: string
    tagline: string
    palette: string             // palette id (see lib/site-palettes.ts)
    logo_url: string | null
    favicon_url: string | null
  }
  hero: {
    title_pre: string           // "Discover Events in"
    title_highlight: string     // "Malta" — rendered in accent colour
    title_post: string          // optional trailing words after the highlight
    subtitle: string
    primary_cta:   { label: string; href: string }
    secondary_cta: { label: string; href: string; enabled: boolean }
    image_url: string | null    // optional background image
    overlay_opacity: number     // 0..1, only used when image is set
  }
  banner: {
    enabled: boolean
    message: string
    link_label: string
    link_href: string
    color: BannerColor
  }
  footer: {
    tagline: string
    contact_email: string
  }
  /** Homepage section ordering and visibility. The order of the array IS the
   *  display order. Adding new sections later: append, default enabled. */
  sections: HomepageSection[]
  /** SEO defaults applied via root layout metadata. */
  seo: {
    default_meta_description: string
    og_image_url: string | null
    twitter_handle: string
  }
  /** Email signature appended to outbound transactional emails. */
  email: {
    signature_html: string
  }
  /** Static pages — markdown editable. */
  pages: {
    privacy: PageContent
    terms:   PageContent
  }
  /** Event-aggregation config. The scraper pipeline reads these from
   *  the *published* slot — drafts are super-admin-only previews. */
  importers: {
    /** UUID of the dedicated profile that owns imported events. Created via
     *  /admin/sources init flow; null until then. The importer pipeline
     *  refuses to run while this is null. */
    aggregator_user_id: string | null
    /** Hard cap on events yielded per source run. Adapters also self-limit
     *  to this, but the pipeline enforces it as a secondary cap. */
    max_events: number
    /** Skip events whose start date is more than this many days from today.
     *  Prevents importing events too far in the future that may change. */
    days_ahead: number
    /** Attribution line displayed on imported event cards. */
    attribution: {
      enabled: boolean
      template: string                 // e.g. "Imported from {source}" — {source} is replaced at render time
    }
    /** Whether the Vercel cron job should actually run imports when it fires.
     *  Disabling this is a quick kill-switch without changing vercel.json. */
    cron_enabled: boolean
    /** Hour of day (0–23) in Europe/Malta local time at which the cron should
     *  run. The cron fires every hour; only the matching hour does real work. */
    cron_hour: number
    /** Two-layer political-content filter. Matches are case-insensitive
     *  substring matches against title + description + venue + organiser. */
    political_filter: {
      /** Hard-block: matched events are never imported. */
      hard_keywords: string[]
      /** Soft-flag: matched events still import, but land in pending_review
       *  with a visible flag for the moderator. */
      soft_keywords: string[]
    }
  }
}

/** Defaults used when the DB row is empty. Keep these matching the current
 *  hardcoded copy on the site so the first deploy looks identical. */
export const DEFAULT_SETTINGS: SiteSettingsShape = {
  brand: {
    name: 'Events Malta',
    tagline: 'Discover what’s happening on the island.',
    palette: DEFAULT_PALETTE_ID,
    logo_url: null,
    favicon_url: null,
  },
  hero: {
    title_pre: 'Discover Events in',
    title_highlight: 'Malta',
    title_post: '',
    subtitle: 'Parties, comedy gigs, concerts, festivals and more — find your next night out or day event across Malta and Gozo.',
    primary_cta:   { label: 'Browse Events',   href: '/events' },
    secondary_cta: { label: 'Post Your Event', href: '/events/create', enabled: true },
    image_url: null,
    overlay_opacity: 0.55,
  },
  banner: {
    enabled: false,
    message: '',
    link_label: '',
    link_href: '',
    color: 'gold',
  },
  footer: {
    tagline: 'Events Malta — Discover what’s happening on the island.',
    contact_email: 'admin@eventsmalta.org',
  },
  sections: [
    { id: 'hero',       enabled: true },
    { id: 'categories', enabled: true },
    { id: 'featured',   enabled: true },
    { id: 'upcoming',   enabled: true },
    { id: 'faq',        enabled: true },
  ],
  seo: {
    default_meta_description: 'Discover parties, comedy gigs, concerts, festivals and more happening across Malta and Gozo. Browse and post events for free.',
    og_image_url: null,
    twitter_handle: '@eventsmalta',
  },
  email: {
    signature_html: '<p style="color:#6b7280;font-size:13px;margin-top:24px">— The Events Malta team<br><a href="https://eventsmalta.org" style="color:#0d9488">eventsmalta.org</a></p>',
  },
  pages: {
    privacy: {
      title: 'Privacy Policy',
      last_updated: '11 May 2026',
      content_md: PRIVACY_DEFAULT_MD(),
    },
    terms: {
      title: 'Terms of Service',
      last_updated: '4 May 2026',
      content_md: TERMS_DEFAULT_MD(),
    },
  },
  importers: {
    aggregator_user_id: null,
    max_events: 20,
    days_ahead: 180,
    cron_enabled: true,
    cron_hour: 6,
    attribution: {
      enabled: true,
      template: 'Imported from {source}',
    },
    political_filter: {
      // Keep this list in sync with the seed in migration 0010_event_sources.sql.
      // Matching is case-insensitive substring; spaces around bare initials
      // (' pl ', ' pn ') are intentional to avoid false matches inside words.
      hard_keywords: [
        'partit laburista', 'labour party malta', ' pl ',
        'partit nazzjonalista', 'nationalist party malta', ' pn ',
        'adpd', 'volt malta', 'imperium europa', 'abba malta',
        'campaign rally', 'election rally', 'partisan',
        'manifesto launch', 'comizju', 'attivita politika',
        'meet the candidate', 'mep candidate', 'candidate meet',
      ],
      soft_keywords: [
        'minister', 'parliament', 'government of malta',
        'european commission', 'policy launch',
      ],
    },
  },
}

function PRIVACY_DEFAULT_MD(): string {
  return `## 1. Who we are

Events Malta ("we", "us") operates **eventsmalta.org**, a public events discovery platform for Malta and Gozo. This policy explains what personal data we collect when you visit the site or create an account, why we collect it, and what your rights are under the Maltese Data Protection Act and the EU General Data Protection Regulation (GDPR).

For privacy-related questions, use our [contact page](/contact) or email [admin@eventsmalta.org](mailto:admin@eventsmalta.org).

> **About event listings.** Event details belong to their respective organisers. Please check official event pages for latest updates.

## 2. What we collect

We collect the minimum data needed to run the service:

- **Account data** — email address, optional display name and avatar, account creation date.
- **Authentication metadata** — if you sign in with Google, we receive your name and email from Google. We do not receive your password.
- **Event submissions** — content you submit when posting an event (title, description, location, images, ticket information).
- **Saved events** — the events you bookmark, linked to your account.
- **Technical data** — IP address, browser type, and pages visited, collected by our hosting provider for security and uptime purposes.

We do **not** collect payment information, location data beyond what you submit, or data from third-party trackers.

## 3. Why we collect it (legal basis)

- **Contract** — to provide the account, event-posting, and saved-events features you sign up for.
- **Legitimate interest** — to keep the service secure, prevent abuse, and improve content moderation.
- **Consent** — for any optional features such as email notifications about your events.

## 4. Who we share it with

We use a small number of service providers (data processors) to operate the site. They access only what they need and are contractually bound to protect your data:

- **Supabase** — database and authentication hosting (EU data centres available).
- **Vercel** — application hosting and global content delivery.
- **Resend** — transactional email delivery (review confirmations, status updates).
- **Google (Sign-in)** — only if you choose "Sign in with Google".
- **Google Analytics (GA4)** — only if you accept analytics cookies. See section 5 for what is collected and your opt-out options.

We do not sell your personal data. We do not share it with advertisers. We do not use cross-site tracking or behavioural advertising.

## 5. Cookies and similar technologies

When you first visit the site we ask for your cookie preferences. Cookies fall into two categories:

### Strictly necessary (always on)

These are required for the site to function and cannot be disabled:

- **Authentication token** — a first-party token stored in your browser's local storage to keep you logged in.
- **Cookie consent record** — your cookie preferences themselves, stored in local storage so we don't ask again on every visit. Expires after 365 days.

### Analytics (opt-in, off by default)

If — and only if — you click **Accept all** or enable Analytics in the cookie banner, we load Google Analytics 4 (GA4). This collects:

- Pages you visit and how long you spend on each
- Approximate location (country/region only — your IP is anonymised before storage)
- Device type, browser, screen size
- How you arrived at the site (search engine, direct, referral)

GA4 is operated by Google Ireland Ltd. Data is processed by Google with standard contractual clauses for any transfer outside the EEA. We do not use GA4 for advertising, remarketing, or cross-site tracking — only to understand aggregate usage of Events Malta.

### Changing or withdrawing consent

You can change your cookie choices at any time using the **Cookie settings** link in the footer. Withdrawing consent stops further data collection immediately; previously collected analytics data can be deleted by contacting us.

### What we do not use

We do not use marketing or advertising cookies, social media trackers, fingerprinting, or any other behavioural tracking technology.

## 6. How long we keep it

- Account data — for as long as your account exists, plus up to 30 days after deletion in encrypted backups.
- Event data — published events stay live until they have ended; rejected or unpublished drafts are removed within 90 days.
- Server logs — up to 30 days, then automatically purged.

## 7. Your rights

Under the GDPR you have the right to:

- Access the personal data we hold about you
- Correct inaccurate data
- Request deletion of your account and data (right to be forgotten)
- Export your data in a portable format
- Object to or restrict our processing
- Lodge a complaint with the Office of the Information and Data Protection Commissioner (Malta) — [idpc.org.mt](https://idpc.org.mt)

Email [admin@eventsmalta.org](mailto:admin@eventsmalta.org) with any of these requests and we will respond within 30 days.

## 8. Children

Events Malta is not directed at children under 16. If you believe a child has created an account, contact us and we will remove it.

## 9. Changes to this policy

We may update this policy as the service evolves. Material changes will be announced on the site at least 14 days before they take effect. The date at the top of this page reflects the latest revision.`
}

function TERMS_DEFAULT_MD(): string {
  return `## 1. Acceptance of terms

By accessing or using **eventsmalta.org** (the "Service") you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.

> **About event listings.** Event details belong to their respective organisers. Please check official event pages for latest updates.

## 2. The Service

Events Malta is a free, public directory of events taking place in Malta and Gozo. It allows organisers to submit listings and visitors to browse them. We do not sell tickets, process payments, or guarantee the accuracy of any individual listing.

## 3. Accounts

To submit events you must create an account using a valid email address. You are responsible for keeping your credentials secure and for all activity under your account. We may suspend or remove accounts that violate these terms.

## 4. Acceptable use

You agree not to use the Service to:

- Submit events that are illegal, fraudulent, hateful, harassing, or sexually explicit
- Post copyrighted content you do not have rights to
- Impersonate another person or organisation
- Submit duplicate, spam, or low-quality listings
- Attempt to gain unauthorised access to the Service

We reject submissions at our discretion and may remove published events that breach these rules.

## 5. Your content

You retain ownership of the content you submit. By submitting content you grant Events Malta a non-exclusive, royalty-free licence to host, display, and promote it on the Service. You confirm you have the right to grant this licence.

## 6. Tickets and third-party links

Events on the Service may link out to third-party ticketing platforms. Events Malta is not a party to ticket purchases and is not responsible for the conduct of organisers, venues, or ticketing providers.

## 7. Disclaimer of warranties

The Service is provided "as is" without warranties of any kind. We do not guarantee that any event listed will take place as advertised. Always check with the organiser before travelling or buying tickets.

## 8. Limitation of liability

To the maximum extent permitted by Maltese law, Events Malta is not liable for indirect, incidental, or consequential damages arising from your use of the Service.

## 9. Termination

You may delete your account at any time from your profile page. We may suspend or terminate your access if you violate these terms.

## 10. Changes

We may update these terms. Material changes will be announced on the site at least 14 days before they take effect.

## 11. Governing law

These terms are governed by the laws of Malta. Any dispute will be resolved in the courts of Malta.

For questions, email [admin@eventsmalta.org](mailto:admin@eventsmalta.org).`
}

/** Deep-merge user settings on top of defaults so missing keys don't crash. */
function mergeWithDefaults(input: Partial<SiteSettingsShape> | null | undefined): SiteSettingsShape {
  const src = (input ?? {}) as any
  // Sections: keep stored ordering if present, otherwise default. Append any
  // newly-introduced section ids (so adding a section in code doesn't require
  // a manual settings update).
  const storedSections: HomepageSection[] = Array.isArray(src.sections) ? src.sections : []
  const stored = new Map(storedSections.map((s) => [s.id, s]))
  const sections: HomepageSection[] = []
  for (const def of DEFAULT_SETTINGS.sections) {
    sections.push(stored.get(def.id) ?? def)
  }
  // Preserve any stored order that's not in defaults (future-compat)
  for (const s of storedSections) {
    if (!DEFAULT_SETTINGS.sections.find((d) => d.id === s.id)) sections.push(s)
  }

  return {
    brand:  { ...DEFAULT_SETTINGS.brand,  ...(src.brand  ?? {}) },
    hero:   {
      ...DEFAULT_SETTINGS.hero,
      ...(src.hero ?? {}),
      primary_cta:   { ...DEFAULT_SETTINGS.hero.primary_cta,   ...(src.hero?.primary_cta   ?? {}) },
      secondary_cta: { ...DEFAULT_SETTINGS.hero.secondary_cta, ...(src.hero?.secondary_cta ?? {}) },
    },
    banner:   { ...DEFAULT_SETTINGS.banner,   ...(src.banner   ?? {}) },
    footer:   { ...DEFAULT_SETTINGS.footer,   ...(src.footer   ?? {}) },
    sections,
    seo:      { ...DEFAULT_SETTINGS.seo,      ...(src.seo      ?? {}) },
    email:    { ...DEFAULT_SETTINGS.email,    ...(src.email    ?? {}) },
    pages: {
      privacy: { ...DEFAULT_SETTINGS.pages.privacy, ...(src.pages?.privacy ?? {}) },
      terms:   { ...DEFAULT_SETTINGS.pages.terms,   ...(src.pages?.terms   ?? {}) },
    },
    importers: {
      aggregator_user_id: src.importers?.aggregator_user_id ?? DEFAULT_SETTINGS.importers.aggregator_user_id,
      max_events: Number(src.importers?.max_events) > 0
        ? Number(src.importers.max_events)
        : DEFAULT_SETTINGS.importers.max_events,
      days_ahead: Number(src.importers?.days_ahead) > 0
        ? Number(src.importers.days_ahead)
        : DEFAULT_SETTINGS.importers.days_ahead,
      cron_enabled: typeof src.importers?.cron_enabled === 'boolean'
        ? src.importers.cron_enabled
        : DEFAULT_SETTINGS.importers.cron_enabled,
      cron_hour: Number.isInteger(src.importers?.cron_hour) && src.importers.cron_hour >= 0 && src.importers.cron_hour <= 23
        ? src.importers.cron_hour
        : DEFAULT_SETTINGS.importers.cron_hour,
      attribution: {
        ...DEFAULT_SETTINGS.importers.attribution,
        ...(src.importers?.attribution ?? {}),
      },
      political_filter: {
        hard_keywords: Array.isArray(src.importers?.political_filter?.hard_keywords)
          ? src.importers.political_filter.hard_keywords
          : DEFAULT_SETTINGS.importers.political_filter.hard_keywords,
        soft_keywords: Array.isArray(src.importers?.political_filter?.soft_keywords)
          ? src.importers.political_filter.soft_keywords
          : DEFAULT_SETTINGS.importers.political_filter.soft_keywords,
      },
    },
  }
}

/** Server- or client-safe: reads the *published* settings the public sees. */
export async function getPublishedSiteSettings(): Promise<SiteSettingsShape> {
  const { data } = await supabase
    .from('site_settings_public')
    .select('published')
    .single()
  return mergeWithDefaults(data?.published as Partial<SiteSettingsShape> | undefined)
}

/** Super-admin only: read the draft (the page admins are editing). */
export async function getDraftSiteSettings(): Promise<SiteSettingsShape> {
  const { data } = await supabase
    .from('site_settings')
    .select('draft')
    .eq('id', 1)
    .single()
  return mergeWithDefaults(data?.draft as Partial<SiteSettingsShape> | undefined)
}

export { mergeWithDefaults }
