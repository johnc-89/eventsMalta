import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import SuperAdminDeleteButton from '@/components/SuperAdminDeleteButton'
import StaffEditButton from '@/components/StaffEditButton'
import EventDisclaimer from '@/components/EventDisclaimer'
import SaveButton from '@/components/SaveButton'
import ClaimEventButton from '@/components/ClaimEventButton'
import BackToEvents from '@/components/BackToEvents'
import EventCard from '@/components/EventCard'
import ViewTracker from '@/components/ViewTracker'
import { fetchRelatedEvents } from '@/lib/event-queries'
import { deriveLocality } from '@/lib/malta-localities'
import { slugifyVenue, isRealVenue } from '@/lib/venues'
import { sanitizeHttpUrl, renderableImageUrl } from '@/lib/url'

export const revalidate = 600

// Event slugs live in the DB; render on demand and cache (ISR).
export async function generateStaticParams() {
  return []
}

interface Props {
  params: { slug: string }
}

const MALTA_TZ = 'Europe/Malta'

// Serialize JSON-LD for embedding inside a <script> tag. JSON.stringify does
// not escape "<", so a user-controlled field containing "</script>" would
// break out of the tag (stored XSS). Escaping "<" to its unicode form keeps
// the JSON valid while making an HTML tag-close impossible.
function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { data: event } = await supabase
    .from('events')
    .select('title, short_description, description, image_url, date_start, location_name, slug')
    .eq('slug', params.slug)
    .eq('status', 'approved')
    .single()

  if (!event) return { title: 'Event Not Found' }

  const description = event.short_description || event.description?.slice(0, 160) || ''
  const date = new Date(event.date_start).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: MALTA_TZ,
  })
  const fullDescription = event.location_name
    ? `${description} — ${date} at ${event.location_name}, Malta`
    : `${description} — ${date}, Malta`

  return {
    title: event.title,
    description: fullDescription,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      title: event.title,
      description: fullDescription,
      type: 'article',
      url: `/events/${event.slug}`,
      ...(event.image_url && {
        images: [{ url: event.image_url, width: 1200, height: 630, alt: event.title }],
      }),
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description: fullDescription,
      ...(event.image_url && { images: [event.image_url] }),
    },
  }
}

export default async function EventDetailPage({ params }: Props) {
  const { data: event } = await supabase
    .from('events')
    .select('*, organizer:profiles!events_organizer_id_fkey(display_name, avatar_url), claimant:profiles!events_claimed_by_fkey(id, display_name, avatar_url)')
    .eq('slug', params.slug)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .single()

  if (!event) notFound()

  // All occurrences (recurring events have many). Single-occurrence events
  // backfilled from events.date_start via migration 0013.
  const { data: occurrencesData } = await supabase
    .from('event_occurrences')
    .select('starts_at, ends_at, has_time, status')
    .eq('event_id', event.id)
    .eq('status', 'active')
    .order('starts_at', { ascending: true })
  const occurrences = (occurrencesData ?? []).map((o) => ({
    startsAt: new Date(o.starts_at),
    endsAt: o.ends_at ? new Date(o.ends_at) : null,
    hasTime: o.has_time,
  }))

  // Map this event's tag names → slugs so the chips can link to tag landing
  // pages (internal links that help those pages get crawled and ranked).
  const tagSlugByName = new Map<string, string>()
  if (event.tags && event.tags.length > 0) {
    const { data: tagRows } = await supabase
      .from('tags')
      .select('name, slug')
      .in('name', event.tags)
      .eq('enabled', true)
    for (const t of (tagRows as { name: string; slug: string | null }[] | null) || []) {
      if (t.slug) tagSlugByName.set(t.name, t.slug)
    }
  }

  const locality = deriveLocality(event.location_name)

  const dateStart = new Date(event.date_start)
  const dateEnd = event.date_end ? new Date(event.date_end) : null

  // An event is "ended" once its last relevant date is in the past. Use the
  // latest active occurrence if any, else the event's own end/start date.
  const lastDate = occurrences.length > 0
    ? occurrences[occurrences.length - 1].startsAt
    : (dateEnd ?? dateStart)
  const isPast = lastDate.getTime() < Date.now()

  // For ended events, surface upcoming alternatives so the page stays useful
  // and passes link equity instead of being a dead end.
  const relatedEvents = isPast
    ? await fetchRelatedEvents({ excludeId: event.id, tagNames: event.tags })
    : []

  // Detect multi-day by comparing date strings in Malta timezone
  const startDateKey = dateStart.toLocaleDateString('en-CA', { timeZone: MALTA_TZ })
  const endDateKey   = dateEnd?.toLocaleDateString('en-CA', { timeZone: MALTA_TZ })
  const isMultiDay   = !!dateEnd && startDateKey !== endDateKey

  const fmtDate = (d: Date, weekday = false) =>
    d.toLocaleDateString('en-GB', {
      ...(weekday ? { weekday: 'long' } : {}),
      day: 'numeric', month: 'long', year: 'numeric',
      timeZone: MALTA_TZ,
    })
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: MALTA_TZ })

  const priceLabel = event.ticket_type === 'free'
    ? 'Free Entry'
    : event.price_min
      ? event.price_max && event.price_max !== event.price_min
        ? `${event.currency} ${event.price_min} - ${event.price_max}`
        : `${event.currency} ${event.price_min}`
      : null

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.short_description || event.description || event.title,
    startDate: event.date_start,
    endDate: event.date_end || event.date_start,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    // Cancelled events currently 404 for anon (page query + RLS filter on
    // 'approved'), so this branch waits on an RLS widening — mapped anyway so
    // it's correct the day that ships. schema.org has no "ended" status;
    // past events correctly keep EventScheduled.
    eventStatus: event.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    ...(event.image_url && { image: [event.image_url] }),
    // Google requires `location` on every offline Event. Fall back to the
    // derived locality (or Malta) as the place name when no venue is set, so
    // events without a location_name still validate for rich results.
    location: {
      '@type': 'Place',
      name: event.location_name || locality?.name || 'Malta',
      address: {
        '@type': 'PostalAddress',
        ...(event.location_address && { streetAddress: event.location_address }),
        ...(locality && { addressLocality: locality.name }),
        addressCountry: 'MT',
        addressRegion: 'Malta',
      },
      ...(event.latitude && event.longitude && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: event.latitude,
          longitude: event.longitude,
        },
      }),
    },
    organizer: {
      '@type': 'Organization',
      name: event.organizer?.display_name || 'Events Malta',
      url: siteUrl,
    },
    // Single Offer with price_min is Google's documented "from" price pattern
    // for event rich results; AggregateOffer adds validation risk for no gain.
    // Ended events emit SoldOut instead of InStock — claiming tickets are still
    // available on a finished event is inaccurate and draws Search Console
    // "Event" warnings (schema.org has no "ended" availability closer to it).
    offers: {
      '@type': 'Offer',
      ...(event.ticket_type === 'free'
        ? { price: '0', priceCurrency: event.currency || 'EUR' }
        : event.price_min != null
          ? { price: event.price_min, priceCurrency: event.currency || 'EUR' }
          : {}),
      availability: isPast
        ? 'https://schema.org/SoldOut'
        : 'https://schema.org/InStock',
      url: sanitizeHttpUrl(event.ticket_url) || `${siteUrl}/events/${event.slug}`,
      validFrom: event.created_at,
    },
    ...(event.min_age && { typicalAgeRange: `${event.min_age}+` }),
    url: `${siteUrl}/events/${event.slug}`,
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Events', item: `${siteUrl}/events` },
      { '@type': 'ListItem', position: 3, name: event.title, item: `${siteUrl}/events/${event.slug}` },
    ],
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(eventJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumbJsonLd) }} />
      <ViewTracker eventId={event.id} />

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <BackToEvents className="text-brand-teal-dark hover:text-brand-teal text-sm inline-block" />
        <div className="flex items-center gap-2">
          <SaveButton eventId={event.id} variant="detail" />
          <StaffEditButton slug={event.slug} />
          <SuperAdminDeleteButton eventId={event.id} eventTitle={event.title} />
        </div>
      </div>

      {isPast && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">This event has ended.</span> Browse{' '}
          <Link href="/events" className="underline hover:no-underline">upcoming events</Link> or see the suggestions below.
        </div>
      )}

      {/* Event image */}
      {renderableImageUrl(event.image_url) && (
        <div className="relative rounded-xl overflow-hidden mb-8 h-64 sm:h-80 lg:h-96 bg-gray-100">
          <Image
            src={renderableImageUrl(event.image_url)!}
            alt={event.title}
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
            style={{ objectPosition: `${event.image_focal_x ?? 50}% ${event.image_focal_y ?? 50}%` }}
            priority
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          {event.tags && event.tags.length > 0 && (
            <span className="text-sm font-medium text-brand-teal-dark mb-2 block">
              {event.tags[0]}
            </span>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {event.title}
          </h1>

          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {event.tags.map((tag: string) => {
                const slug = tagSlugByName.get(tag)
                return slug ? (
                  <Link
                    key={tag}
                    href={`/events/tag/${slug}`}
                    className="bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 text-xs px-3 py-1 rounded-full transition-colors"
                  >
                    #{tag}
                  </Link>
                ) : (
                  <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                    #{tag}
                  </span>
                )
              })}
            </div>
          )}

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{event.description || event.short_description}</p>
          </div>

          <EventDisclaimer variant="card" className="mt-8" />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-6 space-y-4">
            {isMultiDay ? (
              <>
                <div>
                  <p className="text-sm text-gray-500">Start</p>
                  <p className="font-medium text-gray-900">
                    {fmtDate(dateStart)}
                    {event.has_time && <span className="text-gray-500"> · {fmtTime(dateStart)}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">End</p>
                  <p className="font-medium text-gray-900">
                    {fmtDate(dateEnd!)}
                    {event.has_time && <span className="text-gray-500"> · {fmtTime(dateEnd!)}</span>}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{fmtDate(dateStart, true)}</p>
                </div>
                {event.has_time && (
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-medium text-gray-900">
                      {fmtTime(dateStart)}
                      {dateEnd && !isMultiDay && <> – {fmtTime(dateEnd)}</>}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* All dates (recurring events) */}
            {occurrences.length > 1 && (
              <div>
                <p className="text-sm text-gray-500">All dates ({occurrences.length})</p>
                <ul className="mt-1 space-y-1">
                  {occurrences.map((occ, i) => {
                    const isPast = occ.startsAt.getTime() < Date.now()
                    return (
                      <li
                        key={i}
                        className={`text-sm ${isPast ? 'text-gray-400 line-through' : 'text-gray-700'}`}
                      >
                        {occ.startsAt.toLocaleDateString('en-GB', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                          timeZone: MALTA_TZ,
                        })}
                        {occ.hasTime && (
                          <span className="text-gray-500"> · {fmtTime(occ.startsAt)}{occ.endsAt && ` – ${fmtTime(occ.endsAt)}`}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {event.location_name && (
              <div>
                <p className="text-sm text-gray-500">Venue</p>
                {isRealVenue(event.location_name) ? (
                  <Link
                    href={`/venues/${slugifyVenue(event.location_name)}`}
                    className="font-medium text-gray-900 hover:text-brand-teal"
                  >
                    {event.location_name}
                  </Link>
                ) : (
                  <p className="font-medium text-gray-900">{event.location_name}</p>
                )}
                {event.location_address && (
                  <p className="text-sm text-gray-500">{event.location_address}</p>
                )}
                {locality && (
                  <Link
                    href={`/events/location/${locality.slug}`}
                    className="text-sm text-brand-teal-dark hover:text-brand-teal inline-block mt-1"
                  >
                    More events in {locality.name} →
                  </Link>
                )}
              </div>
            )}
            {priceLabel && (
              <div>
                <p className="text-sm text-gray-500">Price</p>
                <p className="font-medium text-gray-900">{priceLabel}</p>
              </div>
            )}
            {event.show_organizer && event.organizer?.display_name && (
              <div>
                <p className="text-sm text-gray-500">Organiser</p>
                <p className="font-medium text-gray-900">{event.organizer.display_name}</p>
              </div>
            )}
            {event.min_age && (
              <div>
                <p className="text-sm text-gray-500">Age Restriction</p>
                <p className="font-medium text-gray-900">{event.min_age}+</p>
              </div>
            )}
            {event.ticket_url && (
              <a
                href={`/api/referral/track?event_id=${event.id}&link_type=ticket_url`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-brand-gold hover:bg-brand-gold/90 text-brand-dark py-3 rounded-lg font-medium transition-colors"
              >
                Get Tickets
              </a>
            )}
            {event.source_url && !event.ticket_url && (
              <a
                href={`/api/referral/track?event_id=${event.id}&link_type=source_url`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-brand-teal hover:bg-brand-teal/90 text-white py-3 rounded-lg font-medium transition-colors"
              >
                View on Event Page
              </a>
            )}

            {event.claimed_by && event.claimant && (
              <div className="border-t pt-4">
                <p className="text-sm text-gray-500 mb-1">Claimed by</p>
                <Link
                  href={`/organisers/${event.claimed_by}`}
                  className="flex items-center gap-2 group"
                >
                  {event.claimant.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={event.claimant.avatar_url}
                      alt={event.claimant.display_name || 'Organiser'}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-brand-teal/15 text-brand-teal-dark flex items-center justify-center text-sm font-bold">
                      {(event.claimant.display_name || 'O')[0].toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium text-gray-900 group-hover:text-brand-teal">
                    {event.claimant.display_name || 'Verified organiser'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-brand-teal/10 text-brand-teal-dark">
                    Verified
                  </span>
                </Link>
              </div>
            )}

            <div className="border-t pt-4">
              <ClaimEventButton eventId={event.id} claimedBy={event.claimed_by} />
            </div>
          </div>
        </div>
      </div>

      {relatedEvents.length > 0 && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Upcoming events you might like</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {relatedEvents.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
