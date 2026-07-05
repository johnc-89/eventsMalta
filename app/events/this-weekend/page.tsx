import { Metadata } from 'next'
import { presetMetadata, PresetLanding } from '@/lib/landing-presets'

export const revalidate = 600

export function generateMetadata(): Promise<Metadata> {
  return presetMetadata('this-weekend')
}

export default function Page() {
  return <PresetLanding presetKey="this-weekend" />
}
