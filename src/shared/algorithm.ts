import katex, { type KatexOptions } from 'katex'
import pseudocode from 'pseudocode'

/** Fence languages whose algorithmic environments are typeset. */
const ALGORITHM_LANGS = new Set(['latex', 'tex', 'algorithm', 'pseudocode'])

/** True when a fenced block holds an algorithmic environment to typeset. */
export function isAlgorithmFence(lang: string, source: string): boolean {
  return ALGORITHM_LANGS.has(lang) && /\\begin\{algorithmic\}/.test(source)
}

/** Marks lines written with \Statex, whose line numbers are removed after rendering. */
const UNNUMBERED = '\uE000'

/**
 * Text-mode commands pseudocode.js does not parse but KaTeX does. Outside
 * math they are moved into inline math, so `\phantom{目标：}` keeps its
 * width and `\quad` its space.
 */
const TEXT_MODE_SPACING = /\\(h?phantom)\{([^{}$]*)\}|\\(quad|qquad)(?![A-Za-z])|\\(ldots|dots)(?![A-Za-z])/g

/** Applies fn to the parts of text outside $...$ math. */
function mapOutsideMath(text: string, fn: (part: string) => string): string {
  let out = ''
  let start = 0
  let inMath = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch !== '$') continue
    const part = text.slice(start, i)
    out += inMath ? `${part}$` : `${fn(part)}$`
    start = i + 1
    inMath = !inMath
  }
  const rest = text.slice(start)
  return out + (inMath ? rest : fn(rest))
}

function textModeToMath(part: string): string {
  return part
    .replace(TEXT_MODE_SPACING, (_, phantom?: string, hidden?: string, space?: string, dots?: string) => {
      if (phantom) return `$\\${phantom}{\\text{${hidden ?? ''}}}$`
      if (space) return `$\\${space}$`
      return `$\\${dots}$`
    })
    .replace(/---/g, '—')
    .replace(/--/g, '–')
}

/** Commands that may follow a control header without a \State. */
const BLOCK_STARTERS =
  /^\\(?:State|Statex|Return|Print|Comment|Call|Break|Continue|If|ElsIf|Elif|Else|EndIf|For|ForAll|EndFor|While|EndWhile|Repeat|Until|Function|EndFunction|Procedure|EndProcedure|end)(?![A-Za-z])/i

/** Index just past the brace group that opens at text[open], or -1. */
function closeBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\\') i += 1
    else if (ch === '{') depth += 1
    else if (ch === '}' && (depth -= 1) === 0) return i + 1
  }
  return -1
}

/**
 * algpseudocode accepts text straight after a control header, as in
 * `\If{...} \textbf{break} \EndIf`; pseudocode.js wants a statement there,
 * so a \State is inserted before such text.
 */
function stateAfterHeaders(text: string): string {
  let out = ''
  let from = 0
  const header = /\\(?:If|ElsIf|Elif|For|ForAll|While)\s*\{|\\(?:Else|Repeat)(?![A-Za-z])/gi
  for (let match = header.exec(text); match; match = header.exec(text)) {
    const end = match[0].endsWith('{') ? closeBrace(text, match.index + match[0].length - 1) : header.lastIndex
    if (end < 0) break
    const gap = /^[ \t]*/.exec(text.slice(end))?.[0].length ?? 0
    const next = text.slice(end + gap)
    out += text.slice(from, end)
    from = end
    if (next && !next.startsWith('\n') && !BLOCK_STARTERS.test(next)) {
      out += `${text.slice(end, end + gap)}\\State `
      from = end + gap
    }
    header.lastIndex = end
  }
  return out + text.slice(from)
}

/**
 * The block as pseudocode.js accepts it. Whole-line % comments (such as the
 * \usepackage reminders) are dropped, and the float placement [H] and
 * algorithmic [1] options, which pseudocode.js does not parse, are removed.
 * \Statex becomes a marked \State, text-mode spacing moves into math, and
 * text written straight after a control header gets its own \State.
 */
export function prepareAlgorithm(source: string): string {
  const body = source
    .split('\n')
    .filter((line) => !/^\s*%/.test(line))
    .join('\n')
    .replace(/\\begin\{(algorithm|algorithmic)\}\s*\[[^\]]*\]/g, '\\begin{$1}')
    .replace(/\\Statex(?![A-Za-z])\s*/g, `\\State ${UNNUMBERED}`)
    .trim()
  return stateAfterHeaders(mapOutsideMath(body, textModeToMath))
}

/**
 * Drops the numbers of \Statex lines and renumbers the rest, restarting in
 * each algorithmic environment as pseudocode.js does. The empty number span
 * stays so the line keeps its indent.
 */
function unnumberStatex(html: string): string {
  if (!html.includes(UNNUMBERED)) return html
  return html
    .split('<div class="ps-algorithmic')
    .map((part) => {
      let line = 0
      return part.replace(
        /(<span class="ps-linenum"[^>]*>)\d+(<\/span>)(\s*\uE000)?/g,
        (_, open: string, close: string, mark?: string) => (mark ? `${open}${close}` : `${open}${(line += 1)}${close}`)
      )
    })
    .join('<div class="ps-algorithmic')
    .replaceAll(UNNUMBERED, '')
}

/** algorithmicx numbers every line when \begin{algorithmic}[n] has n ≥ 1. */
function wantsLineNumbers(source: string): boolean {
  return /\\begin\{algorithmic\}\s*\[\s*[1-9]/.test(source)
}

export type TypesetAlgorithm = { html: string; captions: number }

/**
 * Typesets the algorithmic environments of one fenced block. Captions are
 * numbered from firstCaption + 1. Returns null when pseudocode.js cannot
 * parse the block, so the caller can show the source instead.
 */
export function typesetAlgorithm(
  source: string,
  firstCaption: number,
  katexOptions: KatexOptions
): TypesetAlgorithm | null {
  const input = prepareAlgorithm(source)
  const scope = globalThis as { katex?: unknown }
  const previous = scope.katex
  // pseudocode.js looks for a global `katex` and calls renderToString(text)
  // without options; this driver adds the reader's own KaTeX options.
  scope.katex = { renderToString: (text: string) => katex.renderToString(text, katexOptions) }
  try {
    const html = pseudocode.renderToString(input, {
      lineNumber: wantsLineNumbers(source),
      lineNumberPunc: '',
      titlePrefix: '算法',
      commentDelimiter: '▷ ',
      captionCount: firstCaption
    })
    return { html: unnumberStatex(html), captions: (input.match(/\\caption\b/g) ?? []).length }
  } catch (error) {
    console.warn('算法块无法排版，改为显示源码：', error)
    return null
  } finally {
    if (previous === undefined) delete scope.katex
    else scope.katex = previous
  }
}
