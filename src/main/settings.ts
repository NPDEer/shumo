import { app, nativeTheme } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTENT_WIDTHS,
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  WIDTH_DEFAULT,
  type RecentItem,
  type ResolvedTheme,
  type Settings,
  type ThemeSetting
} from '../shared/types'

type StoredRecent = {
  path: string
  title: string
  openedAt: number
  hint?: string
}

const empty = (): Settings => ({
  theme: 'system',
  fontSize: FONT_DEFAULT,
  contentWidth: WIDTH_DEFAULT,
  showToc: true,
  recent: []
})

let current = empty()

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function shortenPath(filePath: string): string {
  const home = app.getPath('home')
  if (filePath === home) return '~'
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  if (filePath.startsWith(prefix)) return `~${path.sep}${filePath.slice(prefix.length)}`
  return filePath
}

export function loadSettings(): void {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8')
    current = sanitize(JSON.parse(raw) as Partial<Settings>)
  } catch {
    current = empty()
  }
  nativeTheme.themeSource = current.theme
}

export function getSettings(): Settings {
  return { ...current, recent: current.recent.map((item) => ({ ...item })) }
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitize({ ...current, ...patch, recent: patch.recent ?? current.recent })
  const themeChanged = next.theme !== current.theme
  current = next
  if (themeChanged) nativeTheme.themeSource = current.theme
  persist()
  return getSettings()
}

export function resolvedTheme(): ResolvedTheme {
  if (current.theme === 'dark') return 'dark'
  if (current.theme === 'light') return 'light'
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify(current, null, 2))
  } catch {
    // A full disk should not take the reader down with it.
  }
}

function sanitize(data: Partial<Settings>): Settings {
  const theme: ThemeSetting =
    data.theme === 'light' || data.theme === 'dark' || data.theme === 'system' ? data.theme : 'system'
  const fontSize = clamp(data.fontSize, FONT_MIN, FONT_MAX, FONT_DEFAULT)
  const contentWidth = (CONTENT_WIDTHS as readonly number[]).includes(Number(data.contentWidth))
    ? Number(data.contentWidth)
    : WIDTH_DEFAULT
  const showToc = data.showToc !== false
  const recent = Array.isArray(data.recent)
    ? data.recent.filter(isRecent).slice(0, 10).map(toRecent)
    : []
  return { theme, fontSize, contentWidth, showToc, recent }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function isRecent(value: unknown): value is StoredRecent {
  if (!value || typeof value !== 'object') return false
  const item = value as StoredRecent
  return typeof item.path === 'string' && item.path.length > 0 && typeof item.openedAt === 'number'
}

function toRecent(item: StoredRecent): RecentItem {
  return {
    path: item.path,
    title: typeof item.title === 'string' && item.title ? item.title : path.basename(item.path),
    hint: typeof item.hint === 'string' && item.hint ? item.hint : shortenPath(item.path),
    openedAt: item.openedAt
  }
}
