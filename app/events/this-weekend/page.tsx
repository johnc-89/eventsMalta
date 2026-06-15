import { Metadata } from 'next'
import { presetMetadata, PresetLanding } from '@/lib/landing-presets'

export const dynamic = 'force-dynamic'

export function generateMetadata(): Metadata {
  return presetMetadata('this-weekend')
}

export default function Page() {
  return <PresetLanding presetKey="this-weekend" />
}
