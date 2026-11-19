import 'katex/contrib/mhchem'
import MarkdownIt from 'markdown-it'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import katexPlugin from '@neilsustc/markdown-it-katex'
import gitHubAlerts from 'markdown-it-github-alerts'
import { obsidianCallouts, renderCalloutClose, renderCalloutOpen } from './callouts'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import latex from 'highlight.js/lib/languages/latex'
import cpp from 'highlight.js/lib/languages/cpp'
import cLang from 'highlight.js/lib/languages/c'
import rust from 'highlight.js/lib/languages/rust'
import csharp from 'highlight.js/lib/languages/csharp'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import sql from 'highlight.js/lib/languages/sql'
import yaml from 'highlight.js/lib/languages/yaml'
import markdownLang from 'highlight.js/lib/languages/markdown'
import r from 'highlight.js/lib/languages/r'
import julia from 'highlight.js/lib/languages/julia'
import matlab from 'highlight.js/lib/languages/matlab'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import type { Heading } from './types'
import { encodePath } from './pathutil'

hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('jsx', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('latex', latex)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cLang)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdownLang)
hljs.registerLanguage('r', r)
hljs.registerLanguage('julia', julia)
hljs.registerLanguage('matlab', matlab)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)

const MATH_ENVS = new Set([
  'align',
  'align*',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'eqnarray',
  'eqnarray*',
  'alignat',
  'alignat*',
  'cases',
  'matrix',
  'pmatrix',
  'bmatrix',
  'Bmatrix',
  'vmatrix',
  'Vmatrix',
  'array',
  'split',
  'aligned',
  'gathered',
  'CD',
  'rcases',
  'dcases'
])

export type RenderedMarkdown = {
  html: string
  headings: Heading[]
}

type BlockState = {
  src: string
  bMarks: number[]
  eMarks: number[]
  tShift: number[]
  line: number
  push: (
    type: string,
    tag: string,
    nesting: number
  ) => {
    block: boolean
    content: string
    markup: string
    map: [number, number] | null
    meta?: { content?: string }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function lineText(state: BlockState, line: number): string {
  return state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line])
}

function emitBlock(state: BlockState, body: string, from: number, to: number): void {
  const token = state.push('math_block', 'div', 0)
  token.block = true
  token.content = body
  token.markup = '$$'
  token.map = [from, to]
  state.line = to
}

function mathBlock(state: BlockState, startLine: number, endLine: number, silent: boolean): boolean {
  const trimmed = lineText(state, startLine).trim()
  if (!trimmed || trimmed.startsWith('$$')) return false

  if (trimmed.startsWith('\\[')) {
    const single = trimmed.endsWith('\\]') && trimmed.length > 4
    if (single && !trimmed.slice(2, -2).includes('\\]')) {
      const body = trimmed.slice(2, -2).trim()
      if (!body) return false
      if (silent) return true
      emitBlock(state, body, startLine, startLine + 1)
      return true
    }
    let close = -1
    for (let line = startLine + 1; line < endLine; line += 1) {
      if (lineText(state, line).trim().endsWith('\\]')) {
        close = line
        break
      }
    }
    if (close < 0) return false
    const parts: string[] = []
    const firstBody = trimmed.slice(2)
    if (firstBody.trim()) parts.push(firstBody)
    for (let line = startLine + 1; line < close; line += 1) parts.push(lineText(state, line))
    const last = lineText(state, close).trim()
    const lastBody = last.endsWith('\\]') ? last.slice(0, -2) : last
    if (lastBody.trim()) parts.push(lastBody)
    const body = parts.join('\n').trim()
    if (!body) return false
    if (silent) return true
    emitBlock(state, body, startLine, close + 1)
    return true
  }

  const env = /^\\begin\{([A-Za-z*]+)\}/.exec(trimmed)
  if (!env || !MATH_ENVS.has(env[1]!)) return false
  const endTag = `\\end{${env[1]}}`
  if (trimmed.includes(endTag)) {
    if (silent) return true
    emitBlock(state, trimmed, startLine, startLine + 1)
    return true
  }
  let close = -1
  for (let line = startLine + 1; line < endLine; line += 1) {
    if (lineText(state, line).includes(endTag)) {
      close = line
      break
    }
  }
  if (close < 0) return false
  const parts: string[] = []
  for (let line = startLine; line <= close; line += 1) parts.push(lineText(state, line))
  if (silent) return true
  emitBlock(state, parts.join('\n').trim(), startLine, close + 1)
  return true
}

type InlineState = {
  src: string
  pos: number
  posMax: number
  push: (type: string, tag: string, nesting: number) => { content: string; markup: string }
}

function mathBrackets(state: InlineState, silent: boolean): boolean {
  const start = state.pos
  const src = state.src
  const max = state.posMax
  if (start >= max || src.charCodeAt(start) !== 0x5c) return false
  const kind = src.charCodeAt(start + 1)
  const close = kind === 0x28 ? '\\)' : kind === 0x5b ? '\\]' : ''
  if (!close) return false
  const end = src.indexOf(close, start + 2)
  if (end < 0 || end >= max) return false
  const body = src.slice(start + 2, end)
  if (!body.trim() || body.includes('\n\n')) return false
  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = body.trim()
    token.markup = close === '\\)' ? '\\(' : '\\['
  }
  state.pos = end + 2
  return true
}

function slugify(text: string): string {
  const slug = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

export function plainHeading(raw: string): string {
  return raw
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    .replace(/\$([^$\n]+?)\$/g, '$1')
    .replace(/\\\(([\s\S]+?)\\\)/g, '$1')
    .replace(/\\\[([\s\S]+?)\\\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/*
 * Language aliases follow Visual Studio Code
 * extensions/markdown-language-features/src/markdownEngine.ts normalizeHighlightLang.
 * Copyright (c) Microsoft Corporation. Licensed under the MIT License.
 * tsx is registered to the TypeScript grammar because this highlight.js build
 * has no separate jsx grammar. Registering bash also registers its sh and zsh
 * aliases, so shell maps onto Bash. Registering csharp also registers cs.
 */
function normalizeHighlightLang(lang: string | undefined): string | undefined {
  switch (lang?.toLowerCase()) {
    case 'shell':
      return 'sh'
    case 'py3':
      return 'python'
    case 'tsx':
    case 'typescriptreact':
      return 'jsx'
    case 'json5':
    case 'jsonc':
      return 'json'
    case 'c#':
    case 'csharp':
      return 'cs'
    default:
      return lang?.toLowerCase()
  }
}

function highlightCode(code: string, lang: string): string {
  const language = normalizeHighlightLang(lang)
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      return escapeHtml(code)
    }
  }
  return escapeHtml(code)
}

function frontMatter(state: BlockState, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0 || state.tShift[startLine] !== 0) return false
  const first = state.src.slice(state.bMarks[startLine]!, state.eMarks[startLine]!).replace(/\s+$/, '')
  if (first !== '---') return false
  let next = startLine + 1
  let found = false
  for (; next < endLine; next += 1) {
    if (state.tShift[next] !== 0) continue
    const line = state.src.slice(state.bMarks[next]!, state.eMarks[next]!).replace(/\s+$/, '')
    if (line === '---') {
      found = true
      break
    }
  }
  if (!found) return false
  if (silent) return true
  const raw = state.src.slice(state.bMarks[startLine + 1]!, state.bMarks[next]!).replace(/\n$/, '')
  const token = state.push('front_matter', '', 0)
  token.block = true
  token.markup = '---'
  token.map = [startLine, next + 1]
  token.meta = { content: raw }
  state.line = next + 1
  return true
}

function formatFrontValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    if (!value.length) return ''
    return `<ul>${value.map((item) => `<li>${formatFrontValue(item)}</li>`).join('')}</ul>`
  }
  if (typeof value === 'object') {
    const body = value instanceof Date ? value.toISOString() : stringifyYaml(value).trimEnd()
    return `<pre>${escapeHtml(body)}</pre>`
  }
  return escapeHtml(value instanceof Date ? value.toISOString() : String(value))
}

function renderFrontMatter(meta: unknown): string {
  const content = (meta && typeof meta === 'object' && 'content' in meta ? String((meta as { content?: unknown }).content ?? '') : '')
  if (!content.trim()) return ''
  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `<div class="frontmatter-error"><p>无法解析文首信息</p><pre>${escapeHtml(message)}</pre></div>\n`
  }
  if (parsed === null || parsed === undefined) return ''
  const entries: [string, unknown][] =
    typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.entries(parsed as Record<string, unknown>)
      : [['', parsed]]
  if (!entries.length) return ''
  const rows = entries
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${formatFrontValue(value)}</td></tr>`)
    .join('')
  return `<table class="frontmatter" title="文首信息">${rows}</table>\n`
}

const katexOptions = {
  throwOnError: false,
  trust: false,
  strict: 'ignore' as const,
  output: 'html' as const
}

function createMarkdown(headings: Heading[]) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false
  })
  md.use(footnote)
  // Same plugin options as Markdown All in One extendMarkdownIt
  // (src/markdown-it-plugin-provider.ts): task lists enabled, alerts
  // case-insensitive, KaTeX throwOnError false, mhchem imported above.
  md.use(taskLists, { enabled: true })
  md.use(gitHubAlerts, { matchCaseSensitive: false })
  // Inserted immediately after the block parse, so it runs before
  // github-alerts. Unfolded note/tip/important/warning/caution are left for
  // that plugin. Every other Obsidian type, alias, and +/- fold is rewritten
  // here, still before inline parsing.
  md.core.ruler.after('block', 'obsidian_callouts', obsidianCallouts as never)
  md.renderer.rules.alert_open = (tokens, idx) => renderCalloutOpen(md, tokens as never, idx)
  md.renderer.rules.alert_close = (tokens, idx) => renderCalloutClose(tokens as never, idx)
  md.use(katexPlugin, katexOptions)
  md.block.ruler.before('fence', 'front_matter', frontMatter as never, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })
  md.block.ruler.before('paragraph', 'math_brackets_block', mathBlock as never, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
  })
  // markdown-it's escape rule turns \( and \[ into plain parentheses before
  // later inline rules run. These delimiters have to be recognized first.
  // Dollar math stays on the upstream rule, which is registered after escape.
  md.inline.ruler.before('escape', 'math_brackets', mathBrackets as never)
  md.renderer.rules.front_matter = (tokens, idx) => renderFrontMatter(tokens[idx]?.meta)

  const defaultLink = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    if (!token) return ''
    const href = String(token.attrGet('href') ?? '')
    if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
      token.attrSet('target', '_blank')
      token.attrSet('rel', 'noopener noreferrer')
      token.attrJoin('class', 'external-link')
    } else if (/\.(?:md|markdown|mdown|mkd)(?:$|#|\?)/i.test(href)) {
      token.attrJoin('class', 'local-doc')
    }
    if (defaultLink) return defaultLink(tokens, idx, options, env, self)
    return self.renderToken(tokens, idx, options)
  }

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    if (!token) return ''
    const info = (token.info ?? '').trim().split(/\s+/)[0] ?? ''
    const lang = info.toLowerCase()
    if (lang === 'mermaid') {
      const source = token.content.replace(/\n$/, '')
      return `<div class="mermaid-block" data-source="${encodePath(source)}"><pre class="mermaid">${escapeHtml(source)}</pre></div>\n`
    }
    const highlighted = highlightCode(token.content.replace(/\n$/, ''), lang)
    const klass = lang ? ` class="hljs language-${escapeHtml(lang)}"` : ' class="hljs"'
    return `<pre class="hljs"><code${klass}>${highlighted}</code></pre>\n`
  }

  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

  md.core.ruler.push('heading_ids', (state) => {
    const seen = new Map<string, number>()
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]
      if (!token || token.type !== 'heading_open') continue
      const inline = tokens[i + 1]
      const raw = inline?.type === 'inline' ? inline.content : ''
      const text = plainHeading(raw)
      let slug = slugify(text)
      const count = seen.get(slug) ?? 0
      seen.set(slug, count + 1)
      if (count > 0) slug = `${slug}-${count + 1}`
      token.attrSet('id', slug)
      const level = Number(token.tag.slice(1))
      headings.push({ level, id: slug, text: text || '（无标题）' })
    }
  })

  return md
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const headings: Heading[] = []
  const md = createMarkdown(headings)
  const html = md.render(source.replace(/^\uFEFF/, ''))
  return { html, headings }
}
