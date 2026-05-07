import EventForm from '@/components/EventForm'

export const metadata = {
  title: 'Post a New Event',
}

export default function CreateEventPage() {
  return <EventForm mode="create" />
}
