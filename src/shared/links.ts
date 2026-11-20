import { isMarkdownFile } from './pathutil'

/**
 * What a click on a link in the document does. Every kind is handled inside
 * the app, so the window never navigates away from the reader.
 * - anchor: scroll to a heading in the same document
 * - external: http, https or mailto, opened in the default browser or mail app
 * - markdown: a local Markdown file, opened in a tab
 * - file: any other local file, revealed in Finder (never run)
 * - unsupported: other schemes such as javascript: or data:, ignored
 */
export type LinkKind = 'anchor' | 'external' | 'markdown' | 'file' | 'unsupported'

/** The href without its #fragment and ?query, percent-decoded when valid. */
export function linkPath(href: string): string {
  const bare = href.split('#')[0]?.split('?')[0] ?? ''
  try {
    return decodeURIComponent(bare)
  } catch {
    return bare
  }
}

export function classifyLink(href: string): LinkKind {
  const value = href.trim()
  if (!value) return 'unsupported'
  if (value.startsWith('#')) return 'anchor'
  if (/^(https?:|mailto:)/i.test(value)) return 'external'
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  // A one-letter scheme is a Windows drive (C:\notes\a.md), not a URL.
  if (scheme && scheme !== 'file' && scheme.length > 1) return 'unsupported'
  const target = linkPath(value)
  if (!target) return 'unsupported'
  return isMarkdownFile(target) ? 'markdown' : 'file'
}
