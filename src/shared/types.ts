export type ThemeSetting = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Window and page background; must equal --bg in styles.css. */
export const WINDOW_BACKGROUND: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#1c1c1e'
}

/** macOS windows are transparent and sit on the system vibrancy material. */
export function usesGlass(platform: string): boolean {
  return platform === 'darwin'
}

/** Native window background: clear on macOS so the glass shows, opaque elsewhere. */
export function windowBackgroundFor(platform: string, theme: ResolvedTheme): string {
  return usesGlass(platform) ? '#00000000' : WINDOW_BACKGROUND[theme]
}

export type RecentItem = {
  path: string
  title: string
  hint: string
  openedAt: number
}

export type Settings = {
  theme: ThemeSetting
  fontSize: number
  contentWidth: number
  showToc: boolean
  recent: RecentItem[]
}

export type OpenedFile = {
  path: string
  name: string
  content: string
  mtimeMs: number
  size: number
  error?: string
}

export type Bootstrap = {
  settings: Settings
  resolvedTheme: ResolvedTheme
  platform: string
  version: string
  files: OpenedFile[]
}

export type SettingsPayload = {
  settings: Settings
  resolvedTheme: ResolvedTheme
}

export type MenuAction =
  | 'find'
  | 'find-next'
  | 'find-prev'
  | 'font-inc'
  | 'font-dec'
  | 'font-reset'
  | 'reload'
  | 'toggle-toc'
  | 'close-tab'

export type Heading = {
  level: number
  id: string
  text: string
}

export const CONTENT_WIDTHS = [640, 760, 920, 1100, 0] as const
export const FONT_MIN = 12
export const FONT_MAX = 28
export const FONT_DEFAULT = 16
export const WIDTH_DEFAULT = 760

export const MD_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const
