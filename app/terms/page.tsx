import { Metadata } from 'next'
import Link from 'next/link'
import { getPublishedSiteSettings, DEFAULT_SETTINGS } from '@/lib/site-settings'
import { renderMarkdown } from '@/lib/markdown'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublishedSiteSettings().catch(() => null)
  const page = settings?.pages?.terms ?? DEFAULT_SETTINGS.pages.terms
  return {
    title: page.title,
    description: 'The terms governing your use of Events Malta.',
  }
}

export default async function TermsPage() {
  const settings = await getPublishedSiteSettings().catch(() => null)
  const page = settings?.pages?.terms ?? DEFAULT_SETTINGS.pages.terms
  const html = renderMarkdown(page.content_md)

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/" className="text-brand-teal-dark hover:text-brand-teal text-sm mb-6 inline-block">
        ← Back to home
      </Link>
      <h1 className="text-3xl sm:text-4xl font-heading font-bold text-brand-dark mb-2">{page.title}</h1>
      {page.last_updated && (
        <p className="text-sm text-gray-500 mb-8">Last updated: {page.last_updated}</p>
      )}
      <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
