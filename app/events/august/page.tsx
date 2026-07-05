import { Metadata } from 'next'
import { monthMetadata, MonthLanding } from '@/lib/month-landing'

export const revalidate = 600

export function generateMetadata(): Promise<Metadata> {
  return monthMetadata('august')
}

export default function Page() {
  return <MonthLanding slug="august" />
}
