import type { Config } from 'dompurify'

/**
 * Host sanitizer for HTML produced by the Markdown All in One plugin stack.
 * Upstream alert titles are inserted as raw text, and the alert icons are the
 * package's own SVG strings. User Markdown still has html disabled, and this
 * config drops scripts, foreignObject, and event handlers.
 */
export const markdownSanitizeConfig: Config = {
  ADD_TAGS: ['svg', 'path'],
  ADD_ATTR: ['target', 'rel', 'aria-label', 'role', 'viewBox', 'aria-hidden', 'd', 'xmlns', 'fill-rule', 'open'],
  FORBID_TAGS: ['iframe', 'object', 'embed', 'form', 'style', 'foreignObject', 'script'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onbegin']
}
