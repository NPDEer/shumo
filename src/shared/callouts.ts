import MarkdownIt from 'markdown-it'
import gitHubAlerts from 'markdown-it-github-alerts'

/**
 * Obsidian callout types and aliases, from the published help page
 * "Callouts" (help.obsidian.md). Two aliases are intentionally not
 * remapped: GitHub's [!important] and [!caution] stay those alerts.
 * Obsidian would fold important into tip and caution into warning.
 */
const CANONICAL: Record<string, string> = {
  note: 'note',
  abstract: 'abstract',
  summary: 'abstract',
  tldr: 'abstract',
  info: 'info',
  todo: 'todo',
  tip: 'tip',
  hint: 'tip',
  important: 'important',
  success: 'success',
  check: 'success',
  done: 'success',
  question: 'question',
  help: 'question',
  faq: 'question',
  warning: 'warning',
  caution: 'caution',
  attention: 'warning',
  failure: 'failure',
  fail: 'failure',
  missing: 'failure',
  danger: 'danger',
  error: 'danger',
  bug: 'bug',
  example: 'example',
  quote: 'quote',
  cite: 'quote'
}

const GITHUB_MARKERS = new Set(['note', 'tip', 'important', 'warning', 'caution'])

const DEFAULT_TITLE: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  abstract: '摘要',
  info: '信息',
  todo: '待办',
  success: '完成',
  question: '疑问',
  failure: '失败',
  danger: '危险',
  bug: '缺陷',
  example: '示例',
  quote: '引文'
}

function glyph(name: string, path: string): string {
  return `<svg class="octicon octicon-${name}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="${path}"></path></svg>`
}

function loadGithubIcons(): Record<string, string> {
  const md = new MarkdownIt({ html: false, linkify: false })
  md.use(gitHubAlerts, { matchCaseSensitive: false })
  const html = md.render('> [!NOTE]\n> x\n\n> [!TIP]\n> x\n\n> [!IMPORTANT]\n> x\n\n> [!WARNING]\n> x\n\n> [!CAUTION]\n> x\n')
  const byClass: Record<string, string> = {
    'octicon-info': 'note',
    'octicon-light-bulb': 'tip',
    'octicon-report': 'important',
    'octicon-alert': 'warning',
    'octicon-stop': 'caution'
  }
  const icons: Record<string, string> = {}
  for (const match of html.matchAll(/<svg class="octicon [^"]*"[\s\S]*?<\/svg>/g)) {
    const svg = match[0]
    const klass = svg.match(/octicon-[a-z0-9-]+/g)?.find((name) => name !== 'octicon')
    const kind = klass ? byClass[klass] : undefined
    if (kind) icons[kind] = svg
  }
  return icons
}

const githubIcons = loadGithubIcons()

const ICONS: Record<string, string> = {
  ...githubIcons,
  abstract: glyph('abstract', 'M2 3.2h12v1.5H2zm0 4h12v1.5H2zm0 4h8v1.5H2z'),
  info: glyph(
    'info',
    'M8 1.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zm0 2.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM7.15 7h1.7v5.1h-1.7z'
  ),
  todo: glyph('todo', 'M3 2.5h10v11H3zm1.6 1.6v7.8h6.8V4.1zm.6 3.9 1.3 1.3 2.8-2.8.9.9-3.7 3.7-2.2-2.2z'),
  success: glyph('success', 'M8 1.2a6.8 6.8 0 1 0 0 13.6A6.8 6.8 0 0 0 8 1.2zm3.4 4.2-4 5.1-2.5-2 .9-1.1 1.4 1.1 3.2-4z'),
  question: glyph(
    'question',
    'M8 1.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6zM6.6 6.2c.2-.9 1-1.5 2-.1.5.6.4 1.2-.1 1.7-.4.4-.8.7-.8 1.4v.3H9v-.5c0-.3.1-.5.4-.8.7-.6 1.2-1.4.8-2.4-.5-1.2-2-1.6-3-.9-.4.3-.7.6-.8.9zM7.3 11h1.5v1.5H7.3z'
  ),
  failure: glyph('failure', 'M8 1.2a6.8 6.8 0 1 0 0 13.6A6.8 6.8 0 0 0 8 1.2zM5.4 6.2l1.8 1.8-1.8 1.8 1.1 1.1L8.3 9.1l1.8 1.8 1.1-1.1-1.8-1.8 1.8-1.8-1.1-1.1-1.8 1.8-1.8-1.8z'),
  danger: glyph('danger', 'M8 1.4 15 14.2H1L8 1.4zm0 4.2.1 4.2h-1.2l.1-4.2zm-.7 5.6h1.4v1.4H7.3z'),
  bug: glyph('bug', 'M6 2.2h4v1.2H6zm-2.2 3h8.4v3.2c0 2.6-1.6 4.4-4.2 4.4S3.8 11 3.8 8.4zm1.6 1.2v2c0 1.6.9 2.6 2.6 2.6s2.6-1 2.6-2.6V6.4zM2 6.2h1.6v1.4H2zm10.4 0H14v1.4h-1.6zM2.2 10.6h1.6v1.4H2.2zm10 0H14v1.4h-1.8z'),
  example: glyph('example', 'M2 3.1h1.5v1.5H2zm2.6 0H14v1.5H4.6zM2 7.2h1.5v1.5H2zm2.6 0H14v1.5H4.6zM2 11.3h1.5V12.8H2zm2.6 0H11v1.5H4.6z'),
  quote: glyph('quote', 'M3 12.8c2 0 3.4-1.2 3.4-3.4V5.2H3.2v4.2h1.6c0 1.2-.6 2-1.8 2v1.4zm6.4 0c2 0 3.4-1.2 3.4-3.4V5.2H9.6v4.2H11.2c0 1.2-.6 2-1.8 2v1.4z'),
  unknown: glyph('unknown', 'M8 1.4a6.6 6.6 0 1 0 0 13.2A6.6 6.6 0 0 0 8 1.4zm0 2a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2z')
}

const CALLOUT_RE = /^\s*\[!([A-Za-z][\w-]{0,32})\]([+-])?[ \t]*([^\n\r]*)/i

type CalloutToken = {
  type: string
  tag: string
  content: string
  meta?: {
    title?: string
    type?: string
    icon?: string
    fold?: string
    titleMarkdown?: boolean
  }
}

function matchingClose(tokens: CalloutToken[], openAt: number): number {
  let depth = 0
  for (let k = openAt; k < tokens.length; k += 1) {
    const kind = tokens[k]?.type
    if (kind === 'blockquote_open') depth += 1
    else if (kind === 'blockquote_close') {
      depth -= 1
      if (depth === 0) return k
    }
  }
  return -1
}

export function obsidianCallouts(state: { tokens: CalloutToken[] }): void {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i += 1) {
    const open = tokens[i]
    if (!open || open.type !== 'blockquote_open') continue
    const closeAt = matchingClose(tokens, i)
    if (closeAt < 0) continue
    let inlineAt = -1
    for (let k = i + 1; k < closeAt; k += 1) {
      if (tokens[k]?.type === 'inline') {
        inlineAt = k
        break
      }
    }
    const inline = inlineAt >= 0 ? tokens[inlineAt] : undefined
    if (!inline) continue
    const match = CALLOUT_RE.exec(inline.content)
    if (!match) continue
    const written = (match[1] ?? '').toLowerCase()
    const fold = match[2] === '+' || match[2] === '-' ? match[2] : ''
    // Unfolded GitHub markers stay on markdown-it-github-alerts so their
    // title filtering and octicons do not change.
    if (!fold && GITHUB_MARKERS.has(written)) continue
    const canonical = CANONICAL[written] ?? 'unknown'
    const custom = (match[3] ?? '').trim()
    const title = custom || DEFAULT_TITLE[canonical] || written
    const rest = inline.content.slice(match[0].length).replace(/^[ \t]*(?:\r?\n)?/, '')
    const meta = {
      title,
      type: canonical,
      icon: ICONS[canonical] ?? ICONS.unknown,
      fold,
      titleMarkdown: true
    }
    open.type = 'alert_open'
    open.tag = fold ? 'details' : 'div'
    open.meta = meta
    const close = tokens[closeAt]
    if (close) {
      close.type = 'alert_close'
      close.tag = fold ? 'details' : 'div'
      close.meta = { fold, type: canonical }
    }
    if (!rest.trim()) {
      const paraOpen = inlineAt - 1
      const paraClose = inlineAt + 1
      if (tokens[paraOpen]?.type === 'paragraph_open' && tokens[paraClose]?.type === 'paragraph_close') {
        tokens.splice(paraOpen, 3)
      } else {
        inline.content = ''
      }
    } else {
      inline.content = rest
    }
  }
}

function safeIcon(icon: string | undefined): string {
  if (!icon || !icon.startsWith('<svg') || /script|on\w+=/i.test(icon)) return ''
  return icon
}

export function renderCalloutOpen(
  md: { renderInline: (source: string) => string },
  tokens: CalloutToken[],
  idx: number
): string {
  const meta = tokens[idx]?.meta ?? {}
  const type = String(meta.type ?? 'note').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'note'
  const fold = meta.fold === '+' || meta.fold === '-' ? meta.fold : ''
  const icon = safeIcon(meta.icon)
  const rawTitle = meta.title ?? ''
  const titleHtml = meta.titleMarkdown ? md.renderInline(rawTitle) : rawTitle
  const head = `${icon}<span class="markdown-alert-title-text">${titleHtml}</span>`
  if (fold) {
    const openAttr = fold === '+' ? ' open' : ''
    return `<details class="markdown-alert markdown-alert-${type}" data-callout="${type}"${openAttr}><summary class="markdown-alert-title">${head}</summary>\n`
  }
  return `<div class="markdown-alert markdown-alert-${type}" data-callout="${type}" role="note"><p class="markdown-alert-title">${head}</p>\n`
}

export function renderCalloutClose(tokens: CalloutToken[], idx: number): string {
  const fold = tokens[idx]?.meta?.fold
  if (fold === '+' || fold === '-') return '</details>\n'
  return '</div>\n'
}
