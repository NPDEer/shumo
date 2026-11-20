export const TOC_WIDTH_DEFAULT = 236
export const TOC_WIDTH_MIN = 180
export const TOC_WIDTH_MAX = 420

/**
 * Sidebar width the reader asked for, kept usable: at least TOC_WIDTH_MIN,
 * and at most TOC_WIDTH_MAX or 40% of the window, whichever is smaller, so
 * the reading pane always keeps most of the width.
 */
export function clampTocWidth(width: number, windowWidth: number): number {
  if (!Number.isFinite(width)) return TOC_WIDTH_DEFAULT
  const roomy = Number.isFinite(windowWidth) ? Math.floor(windowWidth * 0.4) : TOC_WIDTH_MAX
  const max = Math.max(TOC_WIDTH_MIN, Math.min(TOC_WIDTH_MAX, roomy))
  return Math.round(Math.min(max, Math.max(TOC_WIDTH_MIN, width)))
}
