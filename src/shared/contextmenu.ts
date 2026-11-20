import type { LinkKind } from './links'

/**
 * Right-click menus. The page describes what was under the pointer as a
 * MenuContext, contextMenuItems turns it into entries, the main process shows
 * them as a native menu, and the page runs the chosen command. Nothing here
 * edits a document: 数墨 stays read-only.
 */

export type MenuCommand =
  | 'copy'
  | 'find-selection'
  | 'open-link'
  | 'reveal-link'
  | 'copy-link'
  | 'copy-tex'
  | 'copy-code'
  | 'select-block'
  | 'copy-image'
  | 'reveal-image'
  | 'copy-heading-link'
  | 'scroll-top'
  | 'toggle-toc'
  | 'toggle-source'
  | 'toggle-theme'
  | 'reveal-file'
  | 'copy-path'
  | 'select-all'
  | 'copy-line-ref'
  | 'close-tab'
  | 'close-other-tabs'
  | 'open-recent'
  | 'remove-recent'
  | 'open-dialog'

export type MenuEntry = { id: MenuCommand; label: string; enabled?: boolean } | { separator: true }

/** The kind of block under the pointer whose source can be copied. */
export type CodeKind = 'code' | 'algorithm' | 'mermaid'

export type MenuContext =
  | {
      area: 'doc'
      selection: string
      link?: { href: string; kind: LinkKind }
      tex?: string
      code?: CodeKind
      image?: { local: boolean }
      heading?: string
      view: ViewState
    }
  | { area: 'source'; selection: string; line?: number }
  | { area: 'tab'; tabCount: number }
  | { area: 'recent' }
  | { area: 'home'; theme: 'light' | 'dark' }

export type ViewState = {
  atTop: boolean
  tocShown: boolean
  sourceShown: boolean
  theme: 'light' | 'dark'
}

const FIND_PREVIEW = 12

/** The selection as shown in a menu label: one line, at most 12 characters. */
export function selectionLabel(selection: string): string {
  const flat = selection.replace(/\s+/g, ' ').trim()
  const chars = [...flat]
  return chars.length > FIND_PREVIEW ? `${chars.slice(0, FIND_PREVIEW).join('')}…` : flat
}

function joinGroups(groups: MenuEntry[][]): MenuEntry[] {
  const entries: MenuEntry[] = []
  for (const group of groups) {
    if (!group.length) continue
    if (entries.length) entries.push({ separator: true })
    entries.push(...group)
  }
  return entries
}

function linkGroup(link: { href: string; kind: LinkKind }, fileManager: string): MenuEntry[] {
  const copy: MenuEntry = { id: 'copy-link', label: '拷贝链接地址' }
  if (link.kind === 'anchor') return [{ id: 'open-link', label: '跳到链接位置' }, copy]
  if (link.kind === 'markdown') {
    return [{ id: 'open-link', label: '在新标签页打开' }, { id: 'reveal-link', label: `在${fileManager}中显示` }, copy]
  }
  if (link.kind === 'file') return [{ id: 'reveal-link', label: `在${fileManager}中显示` }, copy]
  if (link.kind === 'external') {
    const mail = /^mailto:/i.test(link.href)
    return [{ id: 'open-link', label: mail ? '用邮件 App 打开' : '在浏览器中打开' }, copy]
  }
  return [copy]
}

const CODE_LABEL: Record<CodeKind, string> = {
  code: '拷贝代码',
  algorithm: '拷贝算法的 LaTeX 源码',
  mermaid: '拷贝 Mermaid 源码'
}

export function contextMenuItems(context: MenuContext, fileManager = '访达'): MenuEntry[] {
  switch (context.area) {
    case 'doc': {
      const view = context.view
      const selection = context.selection.trim()
      return joinGroups([
        selection
          ? [
              { id: 'copy', label: '拷贝' },
              { id: 'find-selection', label: `在文中查找「${selectionLabel(selection)}」` }
            ]
          : [],
        context.link ? linkGroup(context.link, fileManager) : [],
        context.tex ? [{ id: 'copy-tex', label: '拷贝 LaTeX 源码' }] : [],
        context.code
          ? [
              { id: 'copy-code', label: CODE_LABEL[context.code] },
              ...(context.code === 'code' ? [{ id: 'select-block' as const, label: '选中整段代码' }] : [])
            ]
          : [],
        context.image
          ? [
              { id: 'copy-image', label: '拷贝图片' },
              ...(context.image.local ? [{ id: 'reveal-image' as const, label: `在${fileManager}中显示图片` }] : [])
            ]
          : [],
        context.heading ? [{ id: 'copy-heading-link', label: '拷贝标题链接' }] : [],
        [
          { id: 'scroll-top', label: '回到顶部', enabled: !view.atTop },
          { id: 'toggle-toc', label: view.tocShown ? '隐藏目录' : '显示目录' },
          { id: 'toggle-source', label: view.sourceShown ? '隐藏源码' : '显示源码' },
          { id: 'toggle-theme', label: view.theme === 'dark' ? '切换到浅色' : '切换到深色' }
        ],
        [
          { id: 'reveal-file', label: `在${fileManager}中显示本文稿` },
          { id: 'copy-path', label: '拷贝文稿路径' }
        ]
      ])
    }
    case 'source':
      return joinGroups([
        [
          { id: 'copy', label: '拷贝', enabled: context.selection.length > 0 },
          { id: 'select-all', label: '全选源码' }
        ],
        context.line === undefined ? [] : [{ id: 'copy-line-ref', label: `拷贝路径和行号（第 ${context.line + 1} 行）` }]
      ])
    case 'tab':
      return joinGroups([
        [
          { id: 'close-tab', label: '关闭标签页' },
          { id: 'close-other-tabs', label: '关闭其他标签页', enabled: context.tabCount > 1 }
        ],
        [
          { id: 'reveal-file', label: `在${fileManager}中显示` },
          { id: 'copy-path', label: '拷贝文稿路径' }
        ]
      ])
    case 'recent':
      return joinGroups([
        [
          { id: 'open-recent', label: '打开' },
          { id: 'reveal-file', label: `在${fileManager}中显示` },
          { id: 'copy-path', label: '拷贝文稿路径' }
        ],
        [{ id: 'remove-recent', label: '从最近打开中移除' }]
      ])
    case 'home':
      return [
        { id: 'open-dialog', label: '打开文稿…' },
        { id: 'toggle-theme', label: context.theme === 'dark' ? '切换到浅色' : '切换到深色' }
      ]
  }
}

const COMMANDS = new Set<string>([
  'copy',
  'find-selection',
  'open-link',
  'reveal-link',
  'copy-link',
  'copy-tex',
  'copy-code',
  'select-block',
  'copy-image',
  'reveal-image',
  'copy-heading-link',
  'scroll-top',
  'toggle-toc',
  'toggle-source',
  'toggle-theme',
  'reveal-file',
  'copy-path',
  'select-all',
  'copy-line-ref',
  'close-tab',
  'close-other-tabs',
  'open-recent',
  'remove-recent',
  'open-dialog'
] satisfies MenuCommand[])

/** Checks entries that arrive over IPC before they become a native menu. */
export function isMenuEntries(value: unknown): value is MenuEntry[] {
  if (!Array.isArray(value) || value.length > 40) return false
  return value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const item = entry as Record<string, unknown>
    if (item.separator === true) return Object.keys(item).length === 1
    return (
      typeof item.id === 'string' &&
      COMMANDS.has(item.id) &&
      typeof item.label === 'string' &&
      item.label.length <= 80 &&
      (item.enabled === undefined || typeof item.enabled === 'boolean')
    )
  })
}
