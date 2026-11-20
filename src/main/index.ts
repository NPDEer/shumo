import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  type WebContents
} from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isMarkdownFile } from '../shared/pathutil'
import { classifyLink, linkPath } from '../shared/links'
import { isMenuEntries, type MenuEntry } from '../shared/contextmenu'
import { removeRecent } from '../shared/recent'
import {
  usesGlass,
  windowBackgroundFor,
  type Bootstrap,
  type MenuAction,
  type OpenedFile,
  type SettingsPayload,
  type ThemeSetting
} from '../shared/types'
import {
  canonical,
  guessTitle,
  readMarkdown,
  registerImageProtocol,
  unwatch,
  unwatchSender,
  watchedPaths,
  watchFile
} from './files'
import { installMenu, type MenuHandlers } from './menu'
import { runLifecycleTest } from './lifecycle'
import { runSelfTest } from './selftest'
import { getSettings, loadSettings, resolvedTheme, shortenPath, updateSettings } from './settings'

const here = path.dirname(fileURLToPath(import.meta.url))
const SELF_TEST = process.env.SHUMO_SELF_TEST === '1'
const LIFECYCLE_TEST = process.env.SHUMO_LIFECYCLE_TEST === '1'
const DEV_URL = process.env.ELECTRON_RENDERER_URL

if (SELF_TEST || LIFECYCLE_TEST) {
  const dir = path.join(os.tmpdir(), `shumo-userdata-${process.pid}`)
  fs.mkdirSync(dir, { recursive: true })
  app.setPath('userData', dir)
  if (SELF_TEST) app.commandLine.appendSwitch('force-device-scale-factor', '1.25')
  if (process.env.SHUMO_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox')
}

// The single-instance lock lives in userData. A dev build sharing it with an
// installed 数墨 would hand its files to that copy and quit, so the old UI
// opened instead of the code under development.
if (DEV_URL && !SELF_TEST && !LIFECYCLE_TEST) {
  app.setPath('userData', path.join(app.getPath('appData'), 'shumo-dev'))
}

if (LIFECYCLE_TEST) {
  const fail = (kind: string, error: unknown): void => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`LIFECYCLE ${kind}`, message)
    app.exit(1)
  }
  process.on('uncaughtException', (error) => fail('uncaught', error))
  process.on('unhandledRejection', (error) => fail('rejection', error))
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'localimg',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: 'shumo',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.setName('数墨')
if (process.platform === 'win32') app.setAppUserModelId('app.shumo.reader')

let launching = true
const queued: string[] = []
const initialByWebContents = new Map<number, string[]>()
const bootstrapped = new Set<number>()
const readyWaiters: Array<() => void> = []

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!app.isReady() || launching) {
    queued.push(filePath)
    return
  }
  void openPaths(liveWindow(BrowserWindow.getFocusedWindow()), [filePath], true)
})

app.on('second-instance', (_event, argv) => {
  const files = extractFiles(argv)
  const win = liveWindow(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])
  if (files.length) void openPaths(win, files, false)
  else if (win) {
    win.show()
    win.focus()
  } else createWindow([])
})

if (gotLock) {
  app.whenReady().then(async () => {
    loadSettings()
    registerImageProtocol()
    registerAppProtocol()
    installCsp()
    app.setAboutPanelOptions({
      applicationName: '数墨',
      applicationVersion: app.getVersion(),
      copyright: '只读 Markdown 阅读器',
      credits: '为计算数学笔记而写。公式由 KaTeX 渲染。'
    })
    nativeTheme.on('updated', () => {
      if (getSettings().theme === 'system') broadcastSettings()
    })
    installIpc()
    refreshMenu()

    const initial = uniqueExisting([...queued.splice(0), ...extractFiles(process.argv), ...envFile()])
    if (LIFECYCLE_TEST) {
      launching = false
      try {
        await runLifecycleTest({ createWindow, openPaths })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error)
        console.error('LIFECYCLE fail', message)
        app.exit(1)
      }
      return
    }
    if (SELF_TEST) {
      launching = false
      if (!initial.length) {
        console.error('SELFTEST missing file argument')
        app.exit(1)
        return
      }
      const pending = waitForReady()
      const win = createWindow(initial)
      await runSelfTest(win, pending)
      return
    }
    if (initial.length) {
      launching = false
      await openPaths(null, initial, false)
      return
    }
    if (process.platform === 'darwin') await delay(200)
    launching = false
    const late = uniqueExisting(queued.splice(0))
    if (late.length) {
      await openPaths(null, late, true)
      return
    }
    if (BrowserWindow.getAllWindows().length === 0) createWindow([])
  }).catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
}

app.on('activate', () => {
  if (launching) return
  if (BrowserWindow.getAllWindows().length === 0) createWindow([])
})

app.on('window-all-closed', () => {
  if (LIFECYCLE_TEST) return
  if (process.platform !== 'darwin' || SELF_TEST) app.quit()
})

function installIpc(): void {
  ipcMain.on('bootstrap', (event) => {
    const id = event.sender.id
    // The preload also runs in any page the window is pushed to by mistake.
    // Only the reader page takes the files; recoverPage brings it back.
    const reader = isAppPage(event.senderFrame?.url ?? event.sender.getURL())
    const files = reader ? (initialByWebContents.get(id) ?? []) : []
    if (reader) {
      initialByWebContents.delete(id)
      bootstrapped.add(id)
    }
    const opened = files.map((file) => {
      const item = readMarkdown(file)
      if (!item.error) {
        rememberRecent(item)
        watchFile(event.sender, item)
      }
      return item
    })
    const payload: Bootstrap = {
      settings: getSettings(),
      resolvedTheme: resolvedTheme(),
      platform: process.platform,
      version: app.getVersion(),
      files: opened
    }
    event.returnValue = payload
  })

  ipcMain.on('content-ready', () => {
    const waiters = readyWaiters.splice(0)
    for (const waiter of waiters) waiter()
  })

  ipcMain.on('dialog-open', (event) => {
    void openDialog(windowFromSender(event.sender))
  })

  ipcMain.on('files-dropped', (event, paths: unknown) => {
    if (!Array.isArray(paths)) return
    const files = paths.filter((item): item is string => typeof item === 'string')
    void openPaths(windowFromSender(event.sender), files, false)
  })

  ipcMain.on('open-relative', (event, payload: unknown) => {
    const win = windowFromSender(event.sender)
    if (!payload || typeof payload !== 'object') return
    const from = (payload as { from?: unknown }).from
    const href = (payload as { href?: unknown }).href
    if (typeof from !== 'string' || typeof href !== 'string') return
    const target = classifyLink(href) === 'markdown' ? resolveLocalLink(from, href) : null
    if (!target) {
      liveWindow(win)?.webContents.send('status', '只能打开相对的 Markdown 链接')
      return
    }
    if (!canonical(target)) {
      liveWindow(win)?.webContents.send('status', '链接的文件不存在')
      return
    }
    void openPaths(liveWindow(win), [target], true)
  })

  ipcMain.on('reveal-link', (event, payload: unknown) => {
    const win = windowFromSender(event.sender)
    if (!payload || typeof payload !== 'object') return
    const from = (payload as { from?: unknown }).from
    const href = (payload as { href?: unknown }).href
    if (typeof from !== 'string' || typeof href !== 'string') return
    const target = resolveLocalLink(from, href)
    revealFile(win, target ? canonical(target) : null)
  })

  ipcMain.on('reveal-path', (event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return
    revealFile(windowFromSender(event.sender), canonical(filePath))
  })

  ipcMain.on('copy-text', (_event, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text)
  })

  ipcMain.on('copy-image-at', (event, point: unknown) => {
    if (!point || typeof point !== 'object') return
    const { x, y } = point as { x?: unknown; y?: unknown }
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return
    event.sender.copyImageAt(Math.round(x), Math.round(y))
  })

  // The renderer knows what was under the pointer and sends the entries; the
  // menu itself is native. Resolves to the chosen entry's id, or null.
  ipcMain.handle('context-menu', (event, entries: unknown) => {
    const win = windowFromSender(event.sender)
    if (!win || !isMenuEntries(entries) || !entries.length) return null
    return new Promise<string | null>((resolve) => {
      const menu = Menu.buildFromTemplate(entries.map((entry) => menuItemFor(entry, resolve)))
      // The close callback can run before a click handler; give the click
      // the first chance to answer.
      menu.popup({ window: win, callback: () => setTimeout(() => resolve(null), 60) })
    })
  })

  ipcMain.on('open-external', (_event, url: unknown) => {
    if (typeof url === 'string' && isExternal(url)) void shell.openExternal(url)
  })

  ipcMain.on('remove-recent', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') return
    updateSettings({ recent: removeRecent(getSettings().recent, filePath) })
    broadcastSettings()
    refreshMenu()
  })

  ipcMain.on('set-theme', (_event, theme: unknown) => {
    if (!isTheme(theme)) return
    updateSettings({ theme })
    broadcastSettings()
    refreshMenu()
  })

  ipcMain.on('set-font-size', (_event, size: unknown) => {
    if (typeof size !== 'number' || !Number.isFinite(size)) return
    updateSettings({ fontSize: size })
    broadcastSettings()
  })

  ipcMain.on('set-content-width', (_event, width: unknown) => {
    if (typeof width !== 'number') return
    updateSettings({ contentWidth: width })
    broadcastSettings()
    refreshMenu()
  })

  ipcMain.on('set-show-toc', (_event, show: unknown) => {
    if (typeof show !== 'boolean') return
    updateSettings({ showToc: show })
    broadcastSettings()
    refreshMenu()
  })

  ipcMain.on('reload-file', (event, filePath: unknown) => {
    if (typeof filePath !== 'string' || event.sender.isDestroyed()) return
    reloadFile(event.sender, filePath)
  })

  ipcMain.on('tab-closed', (event, filePath: unknown) => {
    if (typeof filePath !== 'string' || event.sender.isDestroyed()) return
    unwatch(event.sender.id, filePath)
  })

  ipcMain.on('close-window', (event) => {
    windowFromSender(event.sender)?.close()
  })
}

function createWindow(files: string[]): BrowserWindow {
  const theme = resolvedTheme()
  const mac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: SELF_TEST ? 1440 : 1200,
    height: SELF_TEST ? 900 : 820,
    minWidth: 480,
    minHeight: 480,
    show: false,
    title: files[0] ? `${path.basename(files[0])} — 数墨` : '数墨',
    backgroundColor: windowBackgroundFor(process.platform, theme),
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    // Centered on the 34px toolbar capsules that float 16px below the top.
    trafficLightPosition: mac ? { x: 20, y: 27 } : undefined,
    // 'under-window' is the most see-through system material. 'active' keeps
    // it translucent when the window loses focus; macOS otherwise swaps in a
    // flat gray and the glass disappears whenever another app is in front.
    ...(usesGlass(process.platform) ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    icon: windowIcon(),
    webPreferences: {
      preload: path.join(here, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })
  // `closed` runs after the BrowserWindow is destroyed. The webContents id
  // has to be captured now; reading win.webContents in that handler throws
  // "Object has been destroyed".
  const contentsId = win.webContents.id
  initialByWebContents.set(contentsId, files)
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('closed', () => {
    unwatchSender(contentsId)
    initialByWebContents.delete(contentsId)
    bootstrapped.delete(contentsId)
    recoveries.delete(contentsId)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // The reader is a single page. Links are handled in the page, so any
  // navigation of the window itself is refused.
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.on('did-navigate', (_event, url) => {
    if (!isAppPage(url)) recoverPage(win, `离开了阅读页：${url}`)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) recoverPage(win, `阅读页加载失败：${description} ${url}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') recoverPage(win, `阅读页进程退出：${details.reason}`)
  })
  if (SELF_TEST) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) console.log(`RENDER ${sourceId}:${line} ${message}`)
    })
  }
  void win.loadURL(appPageUrl())
  return win
}

async function openPaths(win: BrowserWindow | null, paths: string[], explicit: boolean): Promise<void> {
  const files: string[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const item of paths) {
    const real = canonical(item)
    if (!real || seen.has(real)) {
      if (item && !real) rejected += 1
      continue
    }
    if (!explicit && !isMarkdownFile(real)) {
      rejected += 1
      continue
    }
    seen.add(real)
    files.push(real)
  }
  const target = liveWindow(win)
  if (!files.length) {
    if (rejected > 0) target?.webContents.send('status', '只能打开 .md、.markdown、.mdown、.mkd 文稿')
    return
  }
  if (!target) {
    createWindow(files)
    return
  }
  if (!bootstrapped.has(target.webContents.id)) {
    const prev = initialByWebContents.get(target.webContents.id) ?? []
    initialByWebContents.set(target.webContents.id, uniqueExisting([...prev, ...files]))
    target.show()
    target.focus()
    return
  }
  const opened: OpenedFile[] = []
  for (const file of files) {
    const item = readMarkdown(file)
    if (!item.error) {
      rememberRecent(item)
      watchFile(target.webContents, item)
    }
    opened.push(item)
  }
  target.webContents.send('open-tabs', opened)
  const first = opened.find((item) => !item.error)
  if (first) target.setTitle(`${first.name} — 数墨`)
  target.show()
  target.focus()
}

async function openDialog(win: BrowserWindow | null): Promise<void> {
  const options: Electron.OpenDialogOptions = {
    title: '打开 Markdown 文稿',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  }
  const parent = liveWindow(win)
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return
  await openPaths(liveWindow(parent), result.filePaths, true)
}

async function openRecent(filePath: string): Promise<void> {
  const win = liveWindow(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])
  if (!canonical(filePath)) {
    updateSettings({ recent: removeRecent(getSettings().recent, filePath) })
    refreshMenu()
    broadcastSettings()
    const missing = { type: 'warning' as const, message: '找不到文件' }
    if (win) await dialog.showMessageBox(win, missing)
    else await dialog.showMessageBox(missing)
    return
  }
  await openPaths(win, [filePath], true)
}

function reloadFile(wc: WebContents, filePath: string): void {
  if (wc.isDestroyed()) return
  const real = canonical(filePath) ?? filePath
  const item = readMarkdown(real)
  if (wc.isDestroyed()) return
  if (item.error) {
    wc.send('file-missing', { path: filePath, message: item.error })
    return
  }
  watchFile(wc, item)
  if (wc.isDestroyed()) return
  wc.send('file-updated', item)
}

function rememberRecent(file: OpenedFile): void {
  if (file.error) return
  const recent = [
    {
      path: file.path,
      title: guessTitle(file.content, file.path),
      hint: shortenPath(file.path),
      openedAt: Date.now()
    },
    ...removeRecent(getSettings().recent, file.path)
  ].slice(0, 10)
  updateSettings({ recent })
  broadcastSettings()
  refreshMenu()
}

function broadcastSettings(): void {
  const payload: SettingsPayload = { settings: getSettings(), resolvedTheme: resolvedTheme() }
  const color = windowBackgroundFor(process.platform, payload.resolvedTheme)
  for (const candidate of BrowserWindow.getAllWindows()) {
    const win = liveWindow(candidate)
    if (!win) continue
    win.setBackgroundColor(color)
    win.webContents.send('settings', payload)
  }
}

function refreshMenu(): void {
  const handlers: MenuHandlers = {
    open: () => {
      const win = liveWindow(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])
      void openDialog(win)
    },
    newWindow: () => {
      createWindow([])
    },
    openRecent: (filePath) => {
      void openRecent(filePath)
    },
    theme: (theme: ThemeSetting) => {
      updateSettings({ theme })
      broadcastSettings()
      refreshMenu()
    },
    width: (width) => {
      updateSettings({ contentWidth: width })
      broadcastSettings()
      refreshMenu()
    },
    action: (action: MenuAction) => {
      liveWindow(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])?.webContents.send('menu', action)
    }
  }
  installMenu(handlers, Boolean(DEV_URL))
}

function registerAppProtocol(): void {
  const root = path.resolve(here, '../renderer')
  protocol.handle('shumo', (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app') return new Response('forbidden', { status: 403 })
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const file = path.resolve(root, `.${pathname}`)
    const relative = path.relative(root, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('forbidden', { status: 403 })
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).href)
  })
}

function installCsp(): void {
  const devOrigin = DEV_URL ? new URL(DEV_URL).origin : ''
  const devWs = devOrigin.replace(/^http/, 'ws')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url
    const isApp =
      url.startsWith('shumo://') ||
      url.startsWith('file:') ||
      (devOrigin !== '' && (url.startsWith(devOrigin) || url.startsWith(devWs)))
    if (!isApp) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    const csp = devOrigin
      ? [
          `default-src 'self' ${devOrigin}`,
          `script-src 'self' ${devOrigin}`,
          `style-src 'self' 'unsafe-inline' ${devOrigin}`,
          "img-src 'self' data: blob: localimg: http: https:",
          `font-src 'self' data: ${devOrigin}`,
          `connect-src 'self' ${devOrigin} ${devWs}`,
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-src 'none'"
        ].join('; ')
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: localimg: http: https:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-src 'none'"
        ].join('; ')
    const headers = { ...(details.responseHeaders ?? {}) }
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    headers['Content-Security-Policy'] = [csp]
    callback({ responseHeaders: headers })
  })
}

function extractFiles(argv: string[]): string[] {
  const out: string[] = []
  for (const arg of argv) {
    if (!arg || arg.startsWith('-')) continue
    if (!isMarkdownFile(arg)) continue
    out.push(path.resolve(arg))
  }
  return out
}

function envFile(): string[] {
  const value = process.env.SHUMO_OPEN
  if (!value) return []
  return [path.resolve(value)]
}

function uniqueExisting(paths: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of paths) {
    const real = canonical(item)
    if (!real || seen.has(real)) continue
    seen.add(real)
    out.push(real)
  }
  return out
}

/** Absolute path a local link points at, resolved against the file it is in. */
function resolveLocalLink(fromFile: string, href: string): string | null {
  const kind = classifyLink(href)
  if (kind !== 'markdown' && kind !== 'file') return null
  if (/^file:/i.test(href.trim())) {
    try {
      return fileURLToPath(href.trim().split('#')[0] ?? '')
    } catch {
      return null
    }
  }
  return path.resolve(path.dirname(fromFile), linkPath(href.trim()))
}

const FILE_MANAGER = process.platform === 'darwin' ? '访达' : process.platform === 'win32' ? '资源管理器' : '文件管理器'

/** Shows the file selected in Finder; nothing is opened or run. */
function revealFile(win: BrowserWindow | null, real: string | null): void {
  const target = liveWindow(win)
  if (!real) {
    target?.webContents.send('status', '链接的文件不存在')
    return
  }
  shell.showItemInFolder(real)
  target?.webContents.send('status', `已在${FILE_MANAGER}中显示 ${path.basename(real)}`)
}

function menuItemFor(entry: MenuEntry, choose: (id: string) => void): Electron.MenuItemConstructorOptions {
  if ('separator' in entry) return { type: 'separator' }
  return { label: entry.label, enabled: entry.enabled !== false, click: () => choose(entry.id) }
}

function appPageUrl(): string {
  return DEV_URL || 'shumo://app/index.html'
}

/** True for the reader page itself, with or without index.html or a #hash. */
function isAppPage(url: string): boolean {
  try {
    const page = new URL(url)
    const home = new URL(appPageUrl())
    return page.origin === home.origin && page.host === home.host && ['/', '/index.html'].includes(page.pathname)
  } catch {
    return false
  }
}

const recoveries = new Map<number, number[]>()

/**
 * Loads the reader page again with the window's open files, so a page that
 * was lost (navigated away, failed to load, or crashed) never leaves a blank
 * window. Gives up after three tries in a minute to avoid a reload loop.
 */
function recoverPage(win: BrowserWindow, reason: string): void {
  const target = liveWindow(win)
  if (!target) return
  const id = target.webContents.id
  const now = Date.now()
  const recent = (recoveries.get(id) ?? []).filter((time) => now - time < 60_000)
  if (recent.length >= 3) {
    console.error(`数墨：阅读页无法恢复（${reason}）`)
    return
  }
  recoveries.set(id, [...recent, now])
  console.warn(`数墨：重新载入阅读页（${reason}）`)
  const open = watchedPaths(id)
  unwatchSender(id)
  bootstrapped.delete(id)
  initialByWebContents.set(id, open)
  void target.loadURL(appPageUrl())
}

function isExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

function liveWindow(win: BrowserWindow | null | undefined): BrowserWindow | null {
  if (!win || win.isDestroyed()) return null
  if (win.webContents.isDestroyed()) return null
  return win
}

function windowFromSender(sender: WebContents): BrowserWindow | null {
  if (sender.isDestroyed()) return null
  return liveWindow(BrowserWindow.fromWebContents(sender))
}

function isTheme(value: unknown): value is ThemeSetting {
  return value === 'system' || value === 'light' || value === 'dark'
}

function windowIcon(): string | undefined {
  const candidates = [path.join(process.resourcesPath, 'icon.png'), path.join(app.getAppPath(), 'build', 'icon.png')]
  return candidates.find((item) => fs.existsSync(item))
}

function waitForReady(timeout = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待渲染超时')), timeout)
    readyWaiters.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
