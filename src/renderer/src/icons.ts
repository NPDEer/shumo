/**
 * Toolbar and list icons, drawn for this app on a 16×16 grid in the spirit of
 * SF Symbols. They contain no text nodes, so a button's textContent is only
 * its label.
 */
function svg(body: string, extraClass = ''): string {
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`
}

export const icons = {
  sidebar: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>'),
  textSmaller: svg('<path d="M5 11.5 8 4.5l3 7M6.2 9h3.6"/>'),
  textLarger: svg('<path d="M3.5 13 8 2.5 12.5 13M5.2 9.5h5.6"/>'),
  width: svg('<path d="M2.5 3v10M13.5 3v10M5 8h6M6.8 6.2 5 8l1.8 1.8M9.2 6.2 11 8l-1.8 1.8"/>'),
  sun: svg('<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>'),
  moon: svg('<path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75 5.5 5.5 0 1 0 13.25 9.6z"/>'),
  code: svg('<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>'),
  folder: svg('<path d="M2 4.75C2 3.78 2.78 3 3.75 3H6.5l1.5 1.5h4.25c.97 0 1.75.78 1.75 1.75v5c0 .97-.78 1.75-1.75 1.75h-8.5C2.78 13 2 12.22 2 11.25z"/>'),
  close: svg('<path d="M3 3l10 10M13 3 3 13"/>'),
  chevronUp: svg('<path d="M4 10l4-4 4 4"/>'),
  chevronDown: svg('<path d="M4 6l4 4 4-4"/>'),
  search: svg('<circle cx="7" cy="7" r="4.25"/><path d="m10.2 10.2 3.3 3.3"/>'),
  doc: svg('<path d="M4 1.75h5L12.5 5.25v8a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1z"/><path d="M8.75 1.75v3.75h3.75M5.5 8.5h5M5.5 11h3.5"/>', 'doc-icon'),
  brand:
    '<svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="4" fill="#1d1a17"/><circle cx="8" cy="8" r="5" fill="#f3efe6"/><path d="M8 4.7 10.7 10H5.3z" fill="#8e3f2f"/></svg>'
} as const

/** Icon followed by a label that only screen readers (and textContent) see. */
export function toolContent(icon: string, label: string): string {
  return `${icon}<span class="sr-only">${label}</span>`
}
