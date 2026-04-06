import { Event } from '@/types'
import Link from 'next/link'

interface EventCardProps {
  event: Event
}

export default function EventCard({ event }: EventCardProps) {
  const dateStart = new Date(event.date_start)
  const formattedDate = dateStart.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const formattedTime = dateStart.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const priceLabel = event.ticket_type === 'free'
    ? 'Free'
    : event.price_min
      ? event.price_max && event.price_max !== event.price_min
        ? `${event.currency} ${event.price_min} - ${event.price_max}`
        : `${event.currency} ${event.price_min}`
      : 'See details'

  return (
    <Link href={`/events/${event.slug}`} className="group">
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden border border-gray-100">
        <div className="relative h-48 w-full bg-gray-100">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-indigo-50 to-purple-100">
              {event.category?.icon || '🎪'}
            </div>
          )}
          {event.is_featured && (
            <span className="absolute top-3 left-3 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-full">
              Featured
            </span>
          )}
          <span className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-xs font-medium px-2 py-1 rounded-full">
            {priceLabel}
          </span>
        </div>

        <div className="p-5">
          {event.category && (
            <span className="text-xs font-medium text-indigo-600 mb-1 block">
              {event.category.icon} {event.category.name}
            </span>
          )}
          <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">
            {event.title}
          </h3>
          {event.short_description && (
            <p className="text-gray-500 text-sm mb-3 line-clamp-2">
              {event.short_description}
            </p>
          )}
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formattedDate}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formattedTime}
            </span>
          </div>
          {event.location_name && (
            <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="line-clamp-1">{event.location_name}</span>
            </p>
          )}
          {event.min_age && (
            <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {event.min_age}+
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
