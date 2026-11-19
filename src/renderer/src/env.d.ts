/// <reference types="vite/client" />

import type { Bootstrap, MenuAction, OpenedFile, SettingsPayload } from '../../shared/types'

export type ShumoTest = {
  openFind: () => void
  search: (query: string) => void
  closeFind: () => void
  jumpToc: (label: string) => Promise<{ moved: boolean; before: number; after: number }>
}

export type ShumoApi = {
  platform: string
  openDialog: () => void
  openRelative: (from: string, href: string) => void
  openExternal: (url: string) => void
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
