import katex, { type KatexOptions } from 'katex'
import pseudocode from 'pseudocode'

/** Fence languages whose algorithmic environments are typeset. */
const ALGORITHM_LANGS = new Set(['latex', 'tex', 'algorithm', 'pseudocode'])

/** True when a fenced block holds an algorithmic environment to typeset. */
export function isAlgorithmFence(lang: string, source: string): boolean {
  return ALGORITHM_LANGS.has(lang) && /\\begin\{algorithmic\}/.test(source)
}

/**
 * The block as pseudocode.js accepts it. Whole-line % comments (such as the
 * \usepackage reminders) are dropped, and the float placement [H] and
 * algorithmic [1] options, which pseudocode.js does not parse, are removed.
 */
export function prepareAlgorithm(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*%/.test(line))
    .join('\n')
    .replace(/\\begin\{(algorithm|algorithmic)\}\s*\[[^\]]*\]/g, '\\begin{$1}')
    .trim()
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
    return { html, captions: (input.match(/\\caption\b/g) ?? []).length }
  } catch (error) {
    console.warn('算法块无法排版，改为显示源码：', error)
    return null
  } finally {
    if (previous === undefined) delete scope.katex
    else scope.katex = previous
  }
}
