import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

interface Props {
  params: { slug: string }
}

const MALTA_TZ = 'Europe/Malta'

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
    .select('*, category:categories(*), organizer:profiles!events_organizer_id_fkey(display_name, avatar_url)')
    .eq('slug', params.slug)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .single()

  if (!event) notFound()

  // Increment view count (fire and forget)
  supabase.rpc('increment_view_count', { event_id: event.id }).then(() => {})

  const dateStart = new Date(event.date_start)
  const dateEnd = event.date_end ? new Date(event.date_end) : null

  const formattedDate = dateStart.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: MALTA_TZ,
  })
  const formattedTime = dateStart.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MALTA_TZ,
  })
  const formattedEndTime = dateEnd?.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: MALTA_TZ,
  })

  const priceLabel = event.ticket_type === 'free'
    ? 'Free Entry'
    : event.price_min
      ? event.price_max && event.price_max !== event.price_min
        ? `${event.currency} ${event.price_min} - ${event.price_max}`
        : `${event.currency} ${event.price_min}`
      : null

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.com'
  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.short_description || event.description || event.title,
    startDate: event.date_start,
    ...(event.date_end && { endDate: event.date_end }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    ...(event.image_url && { image: [event.image_url] }),
    ...(event.location_name && {
      location: {
        '@type': 'Place',
        name: event.location_name,
        address: {
          '@type': 'PostalAddress',
          ...(event.location_address && { streetAddress: event.location_address }),
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
    }),
    organizer: {
      '@type': 'Organization',
      name: event.organizer?.display_name || 'Events Malta',
      url: siteUrl,
    },
    ...(event.ticket_type !== 'free' && event.price_min ? {
      offers: {
        '@type': 'Offer',
        price: event.price_min,
        priceCurrency: event.currency || 'EUR',
        availability: 'https://schema.org/InStock',
        validFrom: event.created_at,
        ...(event.ticket_url && { url: event.ticket_url }),
      },
    } : event.ticket_type === 'free' ? {
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: event.currency || 'EUR',
        availability: 'https://schema.org/InStock',
      },
    } : {}),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <Link href="/events" className="text-brand-cyan hover:text-brand-teal text-sm mb-6 inline-block">
        ← Back to events
      </Link>

      {/* Event image */}
      {event.image_url && (
        <div className="relative rounded-xl overflow-hidden mb-8 h-64 sm:h-80 lg:h-96 bg-gray-100">
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
            priority
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          {event.category && (
            <span className="text-sm font-medium text-brand-teal mb-2 block">
              {event.category.icon} {event.category.name}
            </span>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            {event.title}
          </h1>

          {event.tags && event.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {event.tags.map((tag: string) => (
                <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{event.description || event.short_description}</p>
          </div>

          {event.organizer && (
            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-gray-500">Organised by</p>
              <p className="font-medium text-gray-900">{event.organizer.display_name}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-500">Date</p>
              <p className="font-medium text-gray-900">{formattedDate}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Time</p>
              <p className="font-medium text-gray-900">
                {formattedTime}{formattedEndTime ? ` - ${formattedEndTime}` : ''}
              </p>
            </div>
            {event.location_name && (
              <div>
                <p className="text-sm text-gray-500">Venue</p>
                <p className="font-medium text-gray-900">{event.location_name}</p>
                {event.location_address && (
                  <p className="text-sm text-gray-500">{event.location_address}</p>
                )}
              </div>
            )}
            {priceLabel && (
              <div>
                <p className="text-sm text-gray-500">Price</p>
                <p className="font-medium text-gray-900">{priceLabel}</p>
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
                href={event.ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-brand-gold hover:bg-brand-gold/90 text-brand-dark py-3 rounded-lg font-medium transition-colors"
              >
                Get Tickets
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
