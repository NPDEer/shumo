/// <reference types="vite/client" />

import type { Bootstrap, MenuAction, OpenedFile, SettingsPayload } from '../../shared/types'
import type { MenuCommand, MenuEntry } from '../../shared/contextmenu'

export type ShumoTest = {
  openFind: () => void
  search: (query: string) => void
  closeFind: () => void
  jumpToc: (label: string) => Promise<{ moved: boolean; before: number; after: number }>
  syncLines: () => { open: boolean; previewLine: number; sourceLine: number; lineCount: number }
  /** The context menu a right-click at this element would show, as entry ids. */
  menuAt: (selector: string) => string[]
  /** Runs a context menu command as if chosen on that element. */
  runMenu: (selector: string, command: MenuCommand) => void
  clickLink: (href: string) => boolean
}

export type ShumoApi = {
  platform: string
  openDialog: () => void
  openRelative: (from: string, href: string) => void
  openExternal: (url: string) => void
  revealLink: (from: string, href: string) => void
  revealPath: (filePath: string) => void
  copyText: (text: string) => void
  copyImageAt: (x: number, y: number) => void
  showContextMenu: (entries: MenuEntry[]) => Promise<string | null>
  removeRecent: (filePath: string) => void
  setTheme: (theme: Bootstrap['settings']['theme']) => void
  setFontSize: (size: number) => void
  setContentWidth: (width: number) => void
  setShowToc: (show: boolean) => void
  reloadFile: (filePath: string) => void
  tabClosed: (filePath: string) => void
  closeWindow: () => void
  notifyReady: () => void
  onOpenTabs: (callback: (files: OpenedFile[]) => void) => void
  onFileUpdated: (callback: (file: OpenedFile) => void) => void
  onFileMissing: (callback: (payload: { path: string; message: string }) => void) => void
  onSettings: (callback: (payload: SettingsPayload) => void) => void
  onMenu: (callback: (action: MenuAction) => void) => void
  onStatus: (callback: (message: string) => void) => void
}

declare global {
  interface Window {
    shumo: ShumoApi
    shumoBoot: Bootstrap
    shumoTest: ShumoTest
  }
}

export {}
