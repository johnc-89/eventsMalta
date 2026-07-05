import { Metadata } from 'next'
import { presetMetadata, PresetLanding } from '@/lib/landing-presets'

export const revalidate = 600

export function generateMetadata(): Metadata {
  return presetMetadata('today')
}

export default function Page() {
  return <PresetLanding presetKey="today" />
}
