export type UserRole = 'user' | 'trusted_uploader' | 'admin' | 'super_admin'
export type SubscriptionTier = 'free' | 'basic' | 'pro'
export type EventStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'cancelled'
export type TicketType = 'free' | 'paid'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  role: UserRole
  subscription_tier: SubscriptionTier
  max_active_events: number
  bio: string | null
  phone: string | null
  created_at: string
  updated_at: string
  suspended_at?: string | null
  deleted_at?: string | null
}

// Single taxonomy. `tags` replaces what used to be split between `categories`
// and `tags` — migration 0015 dropped categories and copied its icon /
// display_order / enabled fields onto tags. UI copy still says "Categories".
export interface Tag {
  id: number
  name: string
  slug: string | null
  icon: string | null
  // Landing-page copy for /events/tag/<slug> (migration 0025). Paragraphs
  // separated by blank lines; first paragraph doubles as the meta description.
  description: string | null
  display_order: number
  enabled: boolean
  created_at: string
}

// Back-compat alias so any straggler `Category` imports still typecheck
// during the rollout. Safe to delete once no more imports reference it.
export type Category = Tag

export interface Event {
  id: number
  organizer_id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  date_start: string
  date_end: string | null
  location_name: string | null
  location_address: string | null
  latitude: number | null
  longitude: number | null
  image_url: string | null
  status: EventStatus
  rejection_reason: string | null
  is_featured: boolean
  is_recurring: boolean
  recurrence_rule: string | null
  ticket_type: TicketType
  ticket_url: string | null
  source_url: string | null
  price_min: number | null
  price_max: number | null
  currency: string
  min_age: number | null
  max_capacity: number | null
  tags: string[] | null
  show_organizer: boolean
  has_time: boolean
  image_focal_x: number
  image_focal_y: number
  view_count: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  organizer?: Profile
}

export interface EventImage {
  id: number
  event_id: number
  image_url: string
  display_order: number
  created_at: string
}

export interface SavedEvent {
  user_id: string
  event_id: number
  created_at: string
}

export type LeadStatus = 'Not Contacted' | 'Contacted' | 'Responded' | 'Converted' | 'Rejected'
export type LeadQuality = 'High' | 'Medium' | 'Low'

export const LEAD_STATUSES: LeadStatus[] = ['Not Contacted', 'Contacted', 'Responded', 'Converted', 'Rejected']
export const LEAD_QUALITIES: LeadQuality[] = ['High', 'Medium', 'Low']

export interface Lead {
  id: number
  name: string
  category: string | null
  subtype: string | null
  quality: LeadQuality | null
  status: LeadStatus
  contact_channel: string | null
  website_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  email: string | null
  phone: string | null
  pitch: string | null
  notes: string | null
  google_search_url: string | null
  ig_search_url: string | null
  best_contact_url: string | null
  last_interaction_at: string | null
  follow_up_at: string | null
  converted_user_id: string | null
  created_at: string
  updated_at: string
}

export interface LeadHistory {
  id: number
  lead_id: number
  lead_name: string
  changed_by: string
  field_name: string
  old_value: string | null
  new_value: string | null
  changed_at: string
}

export const LEAD_EDITABLE_FIELDS: (keyof Lead)[] = [
  'name', 'category', 'subtype', 'quality', 'status', 'contact_channel',
  'website_url', 'instagram_url', 'facebook_url', 'email', 'phone',
  'pitch', 'notes', 'google_search_url', 'ig_search_url', 'best_contact_url',
  'last_interaction_at', 'follow_up_at',
]

// ---------------------------------------------------------------------------
// Event aggregation — external sources, import runs, provenance
// ---------------------------------------------------------------------------

export type ImportRunStatus = 'running' | 'ok' | 'partial' | 'error'

export interface EventSource {
  id: number
  name: string
  homepage_url: string
  events_url: string | null
  adapter: string
  config: Record<string, unknown>
  enabled: boolean
  auto_publish: boolean             // per-source opt-in: true publishes new imports immediately, skipping pending_review (soft political-filter matches still hold for review)
  schedule_cron: string
  attribution_label: string | null  // override for the display label; falls back to `name`
  last_run_at: string | null
  last_success_at: string | null
  last_error: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ImportRun {
  id: number
  source_id: number
  started_at: string
  finished_at: string | null
  triggered_by: string
  status: ImportRunStatus
  fetched: number
  inserted: number
  updated: number
  skipped: number
  excluded: number
  errored: number
  log: string | null
}
