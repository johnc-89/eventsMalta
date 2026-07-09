import { cache } from 'react'
import { Metadata } from 'next'
import { fetchLandingEvents, getDateRange, TimePreset, SITE_URL } from '@/lib/event-queries'
import EventLanding from '@/components/EventLanding'
import LandingRenderer from '@/components/LandingRenderer'
import { resolveLandingBlocks, landingMetadata } from '@/lib/blocks/landing'
import { countLabel, type LandingType, type PlaceholderValues } from '@/lib/blocks/placeholders'

interface PresetCopy {
  preset: TimePreset
  path: string
  heading: string
  title: string
  description: string
  intro: string
}

export const TIME_PRESETS: Record<string, PresetCopy> = {
  today: {
    preset: 'today',
    path: 'today',
    heading: 'Events in Malta Today',
    title: "What's On in Malta Today",
    description: 'Things to do in Malta tonight and today — parties, gigs, concerts and events across Malta and Gozo, updated daily.',
    intro: "Looking for something to do today? Here's everything happening across Malta and Gozo right now — parties, live music, comedy, culture and more.",
  },
  'this-weekend': {
    preset: 'weekend',
    path: 'this-weekend',
    heading: 'Events in Malta This Weekend',
    title: "What's On in Malta This Weekend",
    description: 'The best events in Malta this weekend — parties, concerts, festivals and things to do across Malta and Gozo, Saturday and Sunday.',
    intro: "Plan your weekend in Malta. Browse every event happening this Saturday and Sunday across the islands — from beach parties to concerts, markets and family days out.",
  },
  'this-month': {
    preset: 'month',
    path: 'this-month',
    heading: 'Events in Malta This Month',
    title: "What's On in Malta This Month",
    description: 'A full guide to events in Malta this month — festivals, concerts, parties and things to do across Malta and Gozo.',
    intro: "Everything happening in Malta and Gozo this month, in one place. Explore festivals, concerts, parties, exhibitions and more, and plan ahead.",
  },
}

// Shared between presetMetadata and PresetLanding — cache() dedupes to one
// fetch per request.
const getPresetEvents = cache(async (key: string) => {
  const c = TIME_PRESETS[key]
  const { from, to } = getDateRange(c.preset)
  return fetchLandingEvents({ from, to })
})

function presetPlaceholders(count: number): PlaceholderValues {
  return { count, count_label: countLabel(count) }
}

export async function presetMetadata(key: string): Promise<Metadata> {
  const c = TIME_PRESETS[key]
  const canonical = `${SITE_URL}/events/${c.path}`

  const events = await getPresetEvents(key)
  const blockData = await resolveLandingBlocks(key as LandingType)
  const override = landingMetadata(blockData, presetPlaceholders(events.length), canonical)
  if (override) return override

  return {
    title: c.title,
    description: c.description,
    alternates: { canonical },
    openGraph: { title: c.title, description: c.description, type: 'website', url: canonical },
  }
}

export async function PresetLanding({ presetKey }: { presetKey: string }) {
  const c = TIME_PRESETS[presetKey]
  const events = await getPresetEvents(presetKey)

  const blockData = await resolveLandingBlocks(presetKey as LandingType)
  if (blockData) {
    return (
      <LandingRenderer
        data={blockData}
        landingEvents={events}
        placeholders={presetPlaceholders(events.length)}
        breadcrumb={{ name: c.heading.replace('Events in Malta ', ''), path: `/events/${c.path}` }}
      />
    )
  }

  const relatedLinks = Object.values(TIME_PRESETS)
    .filter((p) => p.path !== c.path)
    .map((p) => ({ href: `/events/${p.path}`, label: p.heading.replace('Events in Malta ', '') }))

  return (
    <EventLanding
      heading={c.heading}
      intro={c.intro}
      events={events}
      relatedLinks={relatedLinks}
      breadcrumb={{ name: c.heading.replace('Events in Malta ', ''), path: `/events/${c.path}` }}
    />
  )
}
