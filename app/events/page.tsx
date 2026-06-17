import type { Metadata } from 'next'
import EventsList from './EventsList'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eventsmalta.org'

// Every filter lives in the query string (?tag=&date=&from=&to=&q=&price=&sort=),
// so each filtered view is a distinct shareable URL. Those are near-duplicates of
// the bare list and of the dedicated /events/tag/* landing pages, so we point all
// query variants at the canonical /events — keeping crawlers from indexing the
// faceted permutations while the tag/location/venue landing pages rank on their own.
export const metadata: Metadata = {
  alternates: { canonical: `${SITE_URL}/events` },
}

export default function Page() {
  return <EventsList />
}
