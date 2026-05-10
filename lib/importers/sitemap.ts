// Minimal XML sitemap reader. Handles:
//   • <urlset> sitemaps — flat list of <url><loc>…</loc><lastmod>…</lastmod></url>
//   • <sitemapindex> — recurses one level into each referenced sub-sitemap
//
// We deliberately don't pull in an XML library. Sitemaps follow a tiny,
// well-defined schema (sitemaps.org/protocol.html); regex is fine and the
// alternative (`fast-xml-parser` or `xmldom`) would balloon the bundle.

import { fetchText } from './http'

export interface SitemapEntry {
  loc: string
  /** ISO-8601 if present, otherwise null. */
  lastmod: string | null
}

/** Fetch a sitemap or sitemap-index URL and return every <url><loc> entry it
 *  reaches. Recurses one level for sitemap-indexes; deeper nesting is rare
 *  and we'd want to know if it happens. */
export async function fetchSitemap(url: string, opts: { onlyMatching?: RegExp } = {}): Promise<SitemapEntry[]> {
  const xml = await fetchText(url, { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' })

  if (/<sitemapindex[\s>]/i.test(xml)) {
    // Sitemap index — recurse into each referenced child sitemap.
    const children = extractLocs(xml)
    const filtered = opts.onlyMatching
      ? children.filter((c) => opts.onlyMatching!.test(c.loc))
      : children
    const all: SitemapEntry[] = []
    for (const child of filtered) {
      try {
        const entries = await fetchSitemap(child.loc)
        all.push(...entries)
      } catch (err) {
        // One bad child shouldn't abort the whole index. Caller can spot the
        // gap by comparing fetched-vs-expected counts.
        const detail = err instanceof Error ? err.message : String(err)
        console.warn(`[sitemap] failed to fetch ${child.loc}: ${detail}`)
      }
    }
    return all
  }

  return extractLocs(xml)
}

/** Extract <loc> + <lastmod> entries from a sitemap XML body. */
function extractLocs(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = []
  // Match either <url>…</url> (regular sitemap) or <sitemap>…</sitemap> (index).
  // Both have <loc> and may have <lastmod>.
  const re = /<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    const block = match[1]
    const locMatch = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)
    if (!locMatch) continue
    const lastmodMatch = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)
    entries.push({
      loc: decodeXml(locMatch[1]),
      lastmod: lastmodMatch ? lastmodMatch[1] : null,
    })
  }
  return entries
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Sort entries by lastmod descending (most-recently-changed first). Entries
 *  without lastmod sink to the bottom. */
export function sortByLastmodDesc(entries: SitemapEntry[]): SitemapEntry[] {
  return [...entries].sort((a, b) => {
    if (!a.lastmod && !b.lastmod) return 0
    if (!a.lastmod) return 1
    if (!b.lastmod) return -1
    return b.lastmod.localeCompare(a.lastmod)
  })
}
