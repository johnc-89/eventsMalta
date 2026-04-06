import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Events Malta',
  description: 'Discover and manage events in Malta',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
