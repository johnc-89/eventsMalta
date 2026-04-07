import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface Props {
  params: { slug: string }
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
  })
  const formattedTime = dateStart.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const formattedEndTime = dateEnd?.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const priceLabel = event.ticket_type === 'free'
    ? 'Free Entry'
    : event.price_min
      ? event.price_max && event.price_max !== event.price_min
        ? `${event.currency} ${event.price_min} - ${event.price_max}`
        : `${event.currency} ${event.price_min}`
      : null

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/events" className="text-indigo-600 hover:text-indigo-700 text-sm mb-6 inline-block">
        ← Back to events
      </Link>

      {/* Event image */}
      {event.image_url && (
        <div className="rounded-xl overflow-hidden mb-8 h-64 sm:h-80 lg:h-96 bg-gray-100">
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          {event.category && (
            <span className="text-sm font-medium text-indigo-600 mb-2 block">
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
                className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-colors"
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
