import { notFound } from 'next/navigation'
import LandingPageEditor from '../_components/LandingPageEditor'
import { LANDING_TYPES, type LandingType } from '@/lib/blocks/placeholders'

export default function LandingTypePage({ params }: { params: { type: string } }) {
  const type = params.type as LandingType
  if (!LANDING_TYPES[type]) notFound()
  return <LandingPageEditor type={type} />
}
