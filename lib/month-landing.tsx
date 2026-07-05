import { Metadata } from 'next'
import { getLandingEventsCached, getMonthRange, SITE_URL } from '@/lib/event-queries'
import EventLanding from '@/components/EventLanding'

// Evergreen month landing pages (/events/october, /events/march, …). The URL
// never carries a year: each landing always shows the NEXT occurrence of its
// month, so the same URL rolls forward every year and keeps its accumulated
// link equity and ranking history ("malta events october 2027" re-ranks the
// page that already ranked for 2026).

export const MONTH_SLUGS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Static month/hub segments shadow any same-named event under /events/[slug].
// Slug generators should avoid these (see verification SQL in the session log).
export const RESERVED_EVENT_SLUGS = new Set([...MONTH_SLUGS, 'locations', 'tags'])

export function getMonthBySlug(slug: string): { index: number; name: string; slug: string } | null {
  const index = MONTH_SLUGS.indexOf(slug)
  return index === -1 ? null : { index, name: MONTH_NAMES[index], slug }
}

export async function monthMetadata(slug: string): Promise<Metadata> {
  const m = getMonthBySlug(slug)
  if (!m) return { title: 'Not Found' }
  const { from, to, year } = getMonthRange(m.index)
  const count = (await getLandingEventsCached(from, to)).length

  const title = `Events in Malta – ${m.name} ${year}: Concerts, Festivals & Things to Do`
  const description = count > 0
    ? `${count} upcoming ${count === 1 ? 'event' : 'events'} in Malta in ${m.name} ${year} — concerts, festivals, parties, culture and family days out across Malta and Gozo, with dates, venues and tickets.`
    : `What's on in Malta in ${m.name} ${year} — concerts, festivals, parties, culture and things to do across Malta and Gozo. Updated daily.`

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/events/${m.slug}` },
    openGraph: { title, description, type: 'website', url: `/events/${m.slug}` },
  }
}

export async function MonthLanding({ slug }: { slug: string }) {
  const m = getMonthBySlug(slug)
  if (!m) return null
  const { from, to, year, isCurrentMonth } = getMonthRange(m.index)
  const events = await getLandingEventsCached(from, to)

  const prev = (m.index + 11) % 12
  const next = (m.index + 1) % 12
  const relatedLinks = [
    { href: `/events/${MONTH_SLUGS[prev]}`, label: `Events in ${MONTH_NAMES[prev]}` },
    { href: `/events/${MONTH_SLUGS[next]}`, label: `Events in ${MONTH_NAMES[next]}` },
    { href: '/events/today', label: 'Today' },
    { href: '/events/this-weekend', label: 'This weekend' },
  ]

  const intro = isCurrentMonth
    ? `Everything still to come in Malta and Gozo this ${m.name} — concerts, festivals, parties, exhibitions, markets and family days out, with dates, venues and ticket details.`
    : `Planning ahead for ${m.name} ${year}? Browse every event announced so far across Malta and Gozo — concerts, festivals, parties, culture and family days out. New listings are added daily, so check back as the month gets closer.`

  return (
    <EventLanding
      heading={`Events in Malta – ${m.name} ${year}`}
      intro={intro}
      events={events}
      relatedLinks={relatedLinks}
      emptyMessage={`No events listed for ${m.name} ${year} yet — organisers usually publish closer to the date. Check back soon or browse all events.`}
    />
  )
}
