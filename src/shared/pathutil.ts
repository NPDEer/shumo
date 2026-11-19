import { MD_EXTENSIONS } from './types'

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.avif',
  '.tif',
  '.tiff'
])

export function extname(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot).toLowerCase()
}

export function isMarkdownFile(filePath: string): boolean {
  return (MD_EXTENSIONS as readonly string[]).includes(extname(filePath))
}

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXT.has(extname(filePath))
}

export function dirname(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (slash < 0) return ''
  if (slash === 0) return filePath[0] === '/' ? '/' : filePath.slice(0, 1)
  return filePath.slice(0, slash)
}

export function basename(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return slash < 0 ? filePath : filePath.slice(slash + 1)
}

/** Resolve a relative or absolute path against a directory, without Node's path module. */
export function resolveAgainst(baseDir: string, rel: string): string {
  let decoded = rel
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    decoded = rel
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(decoded)) return decoded
  if (decoded.startsWith('/') || decoded.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(decoded)) {
    return normalizePath(decoded)
  }
  return normalizePath(joinPath(baseDir, decoded))
}

export function joinPath(left: string, right: string): string {
  if (!left) return right
  const sep = left.includes('\\') ? '\\' : '/'
  if (left.endsWith('/') || left.endsWith('\\')) return left + right
  return left + sep + right
}

export function normalizePath(input: string): string {
  const unc = input.startsWith('\\\\')
  const drive = /^[a-zA-Z]:/.test(input)
  const abs = unc || drive || input.startsWith('/')
  const sep = input.includes('\\') ? '\\' : '/'
  const raw = input.split(/[\\/]+/)
  const out: string[] = []
  for (const part of raw) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..' && !/^[a-zA-Z]:$/.test(out[out.length - 1] ?? '')) {
        out.pop()
      } else if (!abs) out.push('..')
      continue
    }
    out.push(part)
  }
  if (unc) return `\\\\${out.join('\\')}`
  if (drive) {
    const head = out[0] ?? ''
    return `${head}\\${out.slice(1).join('\\')}`
  }
  return (abs ? sep : '') + out.join(sep)
}

export function encodePath(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodePath(input: string): string {
  try {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return ''
  }
}

export function localImageUrl(absPath: string, version: number): string {
  return `localimg://asset/${encodePath(absPath)}?v=${Math.round(version)}`
}

export function pathFromLocalImageUrl(url: string): string {
  const parsed = new URL(url)
  const encoded = parsed.pathname.replace(/^\/+/, '')
  return decodePath(encoded)
}
