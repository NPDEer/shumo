import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { usesGlass, windowBackgroundFor, type Bootstrap, type MenuAction, type OpenedFile, type SettingsPayload } from '../shared/types'

type Handler<T> = (payload: T) => void

const pending = new Map<string, unknown[]>()
const handlers = new Map<string, Handler<unknown>>()

function subscribe<T>(channel: string, callback: Handler<T>): void {
  handlers.set(channel, callback as Handler<unknown>)
  const queued = pending.get(channel) ?? []
  pending.set(channel, [])
  for (const item of queued) callback(item as T)
}

function install(channel: string): void {
  ipcRenderer.on(channel, (_event, payload: unknown) => {
    const handler = handlers.get(channel)
    if (handler) handler(payload)
    else {
      const list = pending.get(channel) ?? []
      list.push(payload)
      pending.set(channel, list)
    }
  })
}

for (const channel of ['open-tabs', 'file-updated', 'file-missing', 'settings', 'menu', 'status']) {
  install(channel)
}

const boot = ipcRenderer.sendSync('bootstrap') as Bootstrap

function applyBoot(data: Bootstrap): void {
  const root = document.documentElement
  root.dataset.theme = data.resolvedTheme
  root.classList.toggle('vscode-dark', data.resolvedTheme === 'dark')
  root.classList.toggle('vscode-light', data.resolvedTheme !== 'dark')
  root.classList.toggle('dark', data.resolvedTheme === 'dark')
  root.dataset.platform = data.platform
  root.dataset.glass = usesGlass(data.platform) ? 'on' : 'off'
  root.dataset.toc = data.settings.showToc ? 'on' : 'off'
  root.dataset.layout = window.matchMedia('(max-width: 759px)').matches ? 'narrow' : 'wide'
  root.dataset.drawer = 'closed'
  root.dataset.width = data.settings.contentWidth === 0 ? 'full' : 'fixed'
  root.style.setProperty('--reading-size', `${data.settings.fontSize}px`)
  root.style.setProperty('--reading-width', data.settings.contentWidth === 0 ? '100%' : `${data.settings.contentWidth}px`)
  root.style.background = usesGlass(data.platform) ? 'transparent' : windowBackgroundFor(data.platform, data.resolvedTheme)
}

if (document.documentElement) applyBoot(boot)
document.addEventListener('DOMContentLoaded', () => applyBoot(boot))

let dragDepth = 0

function setDragging(on: boolean): void {
  document.documentElement.classList.toggle('dragging', on)
}

function installDrag(): void {
  document.addEventListener('dragenter', (event) => {
    event.preventDefault()
    dragDepth += 1
    setDragging(true)
  })
  document.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  })
  document.addEventListener('dragleave', (event) => {
    event.preventDefault()
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) setDragging(false)
  })
  document.addEventListener('dragend', () => {
    dragDepth = 0
    setDragging(false)
  })
  document.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    setDragging(false)
    const files = Array.from(event.dataTransfer?.files ?? [])
    const paths = files.map((file) => webUtils.getPathForFile(file)).filter((item) => item.length > 0)
    if (paths.length) ipcRenderer.send('files-dropped', paths)
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installDrag)
else installDrag()

const api = {
  platform: boot.platform,
  openDialog(): void {
    ipcRenderer.send('dialog-open')
  },
  openRelative(from: string, href: string): void {
    ipcRenderer.send('open-relative', { from, href })
  },
  openExternal(url: string): void {
    ipcRenderer.send('open-external', url)
  },
  setTheme(theme: Bootstrap['settings']['theme']): void {
    ipcRenderer.send('set-theme', theme)
  },
  setFontSize(size: number): void {
    ipcRenderer.send('set-font-size', size)
  },
  setContentWidth(width: number): void {
    ipcRenderer.send('set-content-width', width)
  },
  setShowToc(show: boolean): void {
    ipcRenderer.send('set-show-toc', show)
  },
  reloadFile(filePath: string): void {
    ipcRenderer.send('reload-file', filePath)
  },
  tabClosed(filePath: string): void {
    ipcRenderer.send('tab-closed', filePath)
  },
  closeWindow(): void {
    ipcRenderer.send('close-window')
  },
  notifyReady(): void {
    ipcRenderer.send('content-ready')
  },
  onOpenTabs(callback: (files: OpenedFile[]) => void): void {
    subscribe('open-tabs', callback)
  },
  onFileUpdated(callback: (file: OpenedFile) => void): void {
    subscribe('file-updated', callback)
  },
  onFileMissing(callback: (payload: { path: string; message: string }) => void): void {
    subscribe('file-missing', callback)
  },
  onSettings(callback: (payload: SettingsPayload) => void): void {
    subscribe('settings', callback)
  },
  onMenu(callback: (action: MenuAction) => void): void {
    subscribe('menu', callback)
  },
  onStatus(callback: (message: string) => void): void {
    subscribe('status', callback)
  }
}

contextBridge.exposeInMainWorld('shumoBoot', boot)
contextBridge.exposeInMainWorld('shumo', api)
