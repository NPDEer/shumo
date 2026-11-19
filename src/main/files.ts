import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol, type WebContents } from 'electron'
import { isImageFile, pathFromLocalImageUrl } from '../shared/pathutil'
import type { OpenedFile } from '../shared/types'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_IMAGE = 40 * 1024 * 1024

export function canonical(filePath: string): string | null {
  try {
    const abs = path.resolve(filePath)
    if (!fs.existsSync(abs)) return null
    const stat = fs.statSync(abs)
    if (!stat.isFile()) return null
    return fs.realpathSync(abs)
  } catch {
    return null
  }
}

export function guessTitle(content: string, filePath: string): string {
  for (const line of content.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (!match?.[1]) continue
    const title = match[1]
      .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
      .replace(/\$([^$\n]+)\$/g, '$1')
      .replace(/\\[()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (title) return title.slice(0, 80)
  }
  return path.basename(filePath)
}

export function readMarkdown(filePath: string): OpenedFile {
  const name = path.basename(filePath)
  const missing: OpenedFile = {
    path: filePath,
    name,
    content: '',
    mtimeMs: 0,
    size: 0,
    error: '文件不存在或无法读取'
  }
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return { ...missing, error: '这不是文件' }
    if (stat.size > MAX_BYTES) {
      return { ...missing, mtimeMs: stat.mtimeMs, size: stat.size, error: '文件超过 20 MB，无法打开' }
    }
    const buf = fs.readFileSync(filePath)
    if (buf.includes(0)) {
      return { ...missing, mtimeMs: stat.mtimeMs, size: stat.size, error: '这不是文本 Markdown 文件' }
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch {
      return { ...missing, mtimeMs: stat.mtimeMs, size: stat.size, error: '无法按 UTF-8 读取此文件' }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return { path: filePath, name, content: text, mtimeMs: stat.mtimeMs, size: stat.size }
  } catch {
    return missing
  }
}

type Watch = {
  watcher: fs.FSWatcher
  timer?: ReturnType<typeof setTimeout>
  text: string
  mtimeMs: number
  size: number
  closed: boolean
}

const watches = new Map<string, Watch>()
let reloadPasses = 0

export function watchCount(): number {
  return watches.size
}

export function reloadPassesStarted(): number {
  return reloadPasses
}

function watchKey(id: number, filePath: string): string {
  return `${id}\n${filePath}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function watchFile(wc: WebContents, file: OpenedFile): void {
  const key = watchKey(wc.id, file.path)
  unwatchKey(key)
  let entry: Watch
  const schedule = (): void => {
    if (entry.closed) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      void publish(wc, file.path, entry)
    }, 140)
  }
  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(path.dirname(file.path), { persistent: false }, () => schedule())
  } catch {
    return
  }
  watcher.on('error', () => {
    // The folder may be renamed out from under us. The next explicit reload still works.
  })
  entry = { watcher, text: file.content, mtimeMs: file.mtimeMs, size: file.size, closed: false }
  watches.set(key, entry)
  wc.once('destroyed', () => unwatchKey(key))
}

export function unwatch(wcId: number, filePath: string): void {
  unwatchKey(watchKey(wcId, filePath))
}

export function unwatchSender(wcId: number): void {
  for (const key of [...watches.keys()]) {
    if (key.startsWith(`${wcId}\n`)) unwatchKey(key)
  }
}

function unwatchKey(key: string): void {
  const entry = watches.get(key)
  if (!entry) return
  entry.closed = true
  if (entry.timer) clearTimeout(entry.timer)
  try {
    entry.watcher.close()
  } catch {
    // already closed
  }
  watches.delete(key)
}

function skipReload(wc: WebContents, entry: Watch): boolean {
  return entry.closed || wc.isDestroyed()
}

async function publish(wc: WebContents, filePath: string, entry: Watch): Promise<void> {
  if (skipReload(wc, entry)) return
  reloadPasses += 1
  // The lifecycle test closes the window during this pause so a reload that
  // already started cannot send into a destroyed webContents.
  if (process.env.SHUMO_LIFECYCLE_TEST === '1') await delay(250)
  if (skipReload(wc, entry)) return
  const stable = await readStable(filePath)
  if (skipReload(wc, entry)) return
  if (!stable) {
    wc.send('file-missing', { path: filePath, message: '文件已被移动或删除' })
    return
  }
  if (stable.text === entry.text) {
    entry.mtimeMs = stable.mtimeMs
    entry.size = stable.size
    return
  }
  entry.text = stable.text
  entry.mtimeMs = stable.mtimeMs
  entry.size = stable.size
  if (skipReload(wc, entry)) return
  const payload: OpenedFile = {
    path: filePath,
    name: path.basename(filePath),
    content: stable.text,
    mtimeMs: stable.mtimeMs,
    size: stable.size
  }
  wc.send('file-updated', payload)
}

async function readStable(filePath: string): Promise<{ text: string; mtimeMs: number; size: number } | null> {
  let lastSize = -1
  let lastMtime = -1
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let stat: fs.Stats
    try {
      stat = await fs.promises.stat(filePath)
    } catch {
      await delay(50)
      continue
    }
    if (stat.size === lastSize && stat.mtimeMs === lastMtime) {
      const opened = readMarkdown(filePath)
      if (opened.error) return null
      return { text: opened.content, mtimeMs: opened.mtimeMs, size: opened.size }
    }
    lastSize = stat.size
    lastMtime = stat.mtimeMs
    await delay(50)
  }
  const opened = readMarkdown(filePath)
  if (opened.error) return null
  return { text: opened.content, mtimeMs: opened.mtimeMs, size: opened.size }
}

export function registerImageProtocol(): void {
  protocol.handle('localimg', async (request) => {
    try {
      const requested = pathFromLocalImageUrl(request.url)
      if (!requested || !isImageFile(requested)) return new Response('forbidden', { status: 403 })
      const real = await fs.promises.realpath(requested)
      if (!isImageFile(real)) return new Response('forbidden', { status: 403 })
      const stat = await fs.promises.stat(real)
      if (!stat.isFile() || stat.size > MAX_IMAGE || stat.size < 0) {
        return new Response('forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(real).href)
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

