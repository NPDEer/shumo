import { Menu, type MenuItemConstructorOptions } from 'electron'
import { CONTENT_WIDTHS, type MenuAction, type ThemeSetting } from '../shared/types'
import { getSettings } from './settings'

const WIDTH_LABEL: Record<number, string> = {
  640: '较窄',
  760: '适中',
  920: '较宽',
  1100: '超宽',
  0: '全宽'
}

export type MenuHandlers = {
  open: () => void
  newWindow: () => void
  openRecent: (filePath: string) => void
  theme: (theme: ThemeSetting) => void
  width: (width: number) => void
  action: (action: MenuAction) => void
}

export function installMenu(handlers: MenuHandlers, dev: boolean): void {
  const settings = getSettings()
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = []

  if (mac) {
    template.push({
      label: '数墨',
      submenu: [
        { label: '关于数墨', role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏数墨', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '全部显示', role: 'unhide' },
        { type: 'separator' },
        { label: '退出数墨', role: 'quit' }
      ]
    })
  }

  const fileSubmenu: MenuItemConstructorOptions[] = [
    { label: '打开…', accelerator: 'CommandOrControl+O', click: () => handlers.open() },
    { label: '打开最近', submenu: recentSubmenu(handlers) },
    { type: 'separator' },
    { label: '新窗口', accelerator: 'CommandOrControl+N', click: () => handlers.newWindow() },
    { label: '关闭文稿', accelerator: 'CommandOrControl+W', click: () => handlers.action('close-tab') }
  ]
  if (!mac) {
    fileSubmenu.push({ type: 'separator' }, { label: '退出', accelerator: 'CommandOrControl+Q', role: 'quit' })
  }
  template.push({ label: '文件', submenu: fileSubmenu })

  template.push({
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' }
    ]
  })

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { label: '跟随系统', type: 'radio', checked: settings.theme === 'system', click: () => handlers.theme('system') },
    { label: '浅色', type: 'radio', checked: settings.theme === 'light', click: () => handlers.theme('light') },
    { label: '深色', type: 'radio', checked: settings.theme === 'dark', click: () => handlers.theme('dark') },
    { type: 'separator' },
    { label: '增大字号', accelerator: 'CommandOrControl+=', click: () => handlers.action('font-inc') },
    { label: '减小字号', accelerator: 'CommandOrControl+-', click: () => handlers.action('font-dec') },
    { label: '实际字号', accelerator: 'CommandOrControl+0', click: () => handlers.action('font-reset') },
    { type: 'separator' },
    ...CONTENT_WIDTHS.map((width) => ({
      label: WIDTH_LABEL[width] ?? '适中',
      type: 'radio' as const,
      checked: settings.contentWidth === width,
      click: () => handlers.width(width)
    })),
    { type: 'separator' },
    {
      label: settings.showToc ? '隐藏目录' : '显示目录',
      accelerator: 'CommandOrControl+\\',
      click: () => handlers.action('toggle-toc')
    },
    { type: 'separator' },
    { label: '从磁盘重新读取', accelerator: 'CommandOrControl+R', click: () => handlers.action('reload') },
    { label: '切换全屏', role: 'togglefullscreen' }
  ]
  if (dev) {
    viewSubmenu.push({ type: 'separator' }, { label: '开发者工具', role: 'toggleDevTools' })
  }
  template.push({ label: '视图', submenu: viewSubmenu })

  template.push({
    label: '查找',
    submenu: [
      { label: '查找', accelerator: 'CommandOrControl+F', click: () => handlers.action('find') },
      { label: '查找下一个', accelerator: 'CommandOrControl+G', click: () => handlers.action('find-next') },
      { label: '查找上一个', accelerator: 'CommandOrControl+Shift+G', click: () => handlers.action('find-prev') },
      { label: '查找下一个', accelerator: 'F3', visible: false, click: () => handlers.action('find-next') },
      { label: '查找上一个', accelerator: 'Shift+F3', visible: false, click: () => handlers.action('find-prev') }
    ]
  })

  template.push({
    label: '窗口',
    submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放', role: 'zoom' },
      ...(mac ? [{ type: 'separator' as const }, { label: '前置全部窗口', role: 'front' as const }] : []),
      { type: 'separator' },
      { label: '新窗口', click: () => handlers.newWindow() }
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function recentSubmenu(handlers: MenuHandlers): MenuItemConstructorOptions[] {
  const recent = getSettings().recent
  if (!recent.length) return [{ label: '暂无', enabled: false }]
  return recent.map((item) => ({
    label: clip(item.title || item.path),
    click: () => handlers.openRecent(item.path)
  }))
}

function clip(value: string): string {
  return value.length > 48 ? `${value.slice(0, 47)}…` : value
}
