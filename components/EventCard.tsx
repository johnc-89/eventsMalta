import { Event } from '@/types'
import Image from 'next/image'

interface EventCardProps {
  event: Event
}

export default function EventCard({ event }: EventCardProps) {
  const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      {event.image_url && (
        <div className="relative h-48 w-full bg-gray-200">
          <Image
            src={event.image_url}
            alt={event.title}
            fill
            className="object-cover"
          />
        </div>
      )}

      <div className="p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {event.title}
        </h3>

        <p className="text-gray-600 mb-4 line-clamp-2">
          {event.description || 'No description available'}
        </p>

        <div className="space-y-2 text-sm text-gray-500">
          <p className="flex items-center">
            <span className="mr-2">📅</span>
            {formattedDate}
          </p>
          {event.location && (
            <p className="flex items-center">
              <span className="mr-2">📍</span>
              {event.location}
            </p>
          )}
        </div>

        <button className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md transition-colors">
          View Details
        </button>
      </div>
    </div>
  )
}
