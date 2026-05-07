import { marked } from 'marked'

// Configure marked: GFM on, breaks on (single newlines = <br/>),
// classy headings without the auto-anchor noise.
marked.setOptions({
  gfm: true,
  breaks: false,
  // Headings without auto-generated ids
  // (we control IDs ourselves if we ever need anchors)
})

/**
 * Render trusted markdown to HTML. INPUT IS TRUSTED — only super-admin
 * editors write this content (RLS enforced). Don't expose the markdown
 * input field to end users without a sanitizer.
 */
export function renderMarkdown(md: string): string {
  if (!md?.trim()) return ''
  // marked.parse returns string in sync mode by default
  return marked.parse(md, { async: false }) as string
}
