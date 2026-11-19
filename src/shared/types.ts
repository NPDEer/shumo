export type ThemeSetting = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

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
export const FONT_DEFAULT = 14
export const WIDTH_DEFAULT = 0

export const MD_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const
