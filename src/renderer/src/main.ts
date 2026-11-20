import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import 'markdown-it-github-alerts/styles/github-base.css'
import 'markdown-it-github-alerts/styles/github-colors-light.css'
import 'markdown-it-github-alerts/styles/github-colors-dark-class.css'
import './styles.css'
import './preview.css'
import { renderMarkdown } from '../../shared/markdown'
import { lineAtOffset, offsetForLine, type LinePoint } from '../../shared/scrollsync'
import { markdownSanitizeConfig } from '../../shared/sanitize'
import { dirname, localImageUrl, resolveAgainst } from '../../shared/pathutil'
import {
  CONTENT_WIDTHS,
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  usesGlass,
  windowBackgroundFor,
  type Heading,
  type OpenedFile,
  type ResolvedTheme,
  type Settings
} from '../../shared/types'
import { renderDiagrams } from './mermaid'
import { icons, toolContent } from './icons'
import appIconUrl from '../../../build/icon.png'

const boot = window.shumoBoot
const api = window.shumo

type Tab = OpenedFile & { scrollTop: number; sourceScroll: number }

const WIDTH_LABEL: Record<number, string> = {
  0: '全宽',
  640: '较窄',
  760: '适中',
  920: '较宽',
  1100: '超宽'
}

let settings: Settings = boot.settings
let theme: ResolvedTheme = boot.resolvedTheme
let tabs: Tab[] = []
let active = -1
let findQuery = ''
let findIndex = 0
let statusTimer = 0
let renderToken = 0
let started = false
let sawTocSetting = false
const narrowMedia = window.matchMedia('(max-width: 759px)')

const appRoot = document.querySelector('#app')
if (!appRoot || !boot || !api) {
  document.body.textContent = '数墨无法启动。'
  throw new Error('missing bootstrap')
}

const shell = appRoot

appRoot.innerHTML = `
  <div class="workspace">
    <aside class="sidebar glass" aria-label="侧栏">
      <div class="sidebar-head" aria-hidden="true"></div>
      <nav id="toc" class="toc" aria-label="目录"></nav>
    </aside>
    <main class="pane">
      <div id="reader" class="reader">
        <div id="scroller" class="scroller">
          <div id="welcome" class="welcome" hidden></div>
          <div class="sheet"><article id="doc" hidden></article></div>
        </div>
        <div id="source-split" class="source-split" hidden role="separator" aria-orientation="vertical" aria-label="调整预览与源码的宽度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="62" tabindex="0"></div>
        <div id="source-pane" class="source-pane" hidden>
          <pre id="source-view" class="source-view" tabindex="0" aria-label="文稿源码"></pre>
        </div>
      </div>
      <header class="topbar">
        <div class="capsule glass capsule-docs">
          <button type="button" id="btn-home" class="brand" title="返回首页" aria-label="返回首页">${icons.brand}<span class="brand-text">数墨</span></button>
          <div id="doc-title" class="doc-title" hidden></div>
          <div id="tabs" class="tabs" role="tablist" aria-label="打开的文稿" hidden></div>
        </div>
        <div class="topbar-spacer" aria-hidden="true"></div>
        <div class="actions">
          <div class="capsule glass" role="group" aria-label="显示">
            <button type="button" id="btn-toc" class="tool">${toolContent(icons.sidebar, '目录')}</button>
            <div class="tool-group" role="group" aria-label="字号">
              <button type="button" id="btn-font-dec" class="tool" aria-label="减小字号" title="减小字号">${icons.textSmaller}</button>
              <span id="font-label" class="font-label" title="当前字号">16</span>
              <button type="button" id="btn-font-inc" class="tool" aria-label="增大字号" title="增大字号">${icons.textLarger}</button>
            </div>
            <button type="button" id="btn-width" class="tool" title="切换版心宽度">${toolContent(icons.width, '适中')}</button>
            <button type="button" id="btn-theme" class="tool">${toolContent(icons.sun, '浅色')}</button>
          </div>
          <div class="capsule glass" role="group" aria-label="文稿">
            <button type="button" id="btn-source" class="tool" aria-pressed="false" aria-label="源码" title="显示源码" disabled>${toolContent(icons.code, '源码')}</button>
            <button type="button" id="btn-open" class="tool accent" title="打开文稿">${toolContent(icons.folder, '打开')}</button>
          </div>
        </div>
      </header>
      <footer class="status glass">
        <span id="status-path" class="status-path"></span>
        <span id="status-state" class="status-state" role="status"></span>
      </footer>
      <form id="finder" class="finder glass" hidden role="search">
        <label class="finder-field">${icons.search}<input id="find-input" type="search" placeholder="在文稿中查找" aria-label="在文稿中查找" /></label>
        <span id="find-count" class="find-count"></span>
        <button type="button" id="find-prev" title="上一个" aria-label="上一个">${icons.chevronUp}</button>
        <button type="button" id="find-next" title="下一个" aria-label="下一个">${icons.chevronDown}</button>
        <button type="button" id="find-close" title="关闭查找" aria-label="关闭查找">${icons.close}</button>
      </form>
    </main>
  </div>
  <div class="drop" aria-hidden="true">松开以打开文稿</div>
`

const docTitle = must('#doc-title')
const tabBar = must('#tabs')
const toc = must('#toc')
const scroller = must('#scroller')
const welcome = must('#welcome')
const doc = must('#doc')
const statusPath = must('#status-path')
const statusState = must('#status-state')
const finder = must('#finder')
const findInput = must('#find-input') as HTMLInputElement
const findCount = must('#find-count')
const fontLabel = must('#font-label')
const themeButton = must('#btn-theme') as HTMLButtonElement
const widthButton = must('#btn-width') as HTMLButtonElement
const tocButton = must('#btn-toc') as HTMLButtonElement
const homeButton = must('#btn-home') as HTMLButtonElement
const sourceButton = must('#btn-source') as HTMLButtonElement
const reader = must('#reader')
const sourceSplit = must('#source-split')
const sourcePane = must('#source-pane')
const sourceView = must('#source-view') as HTMLPreElement

const SOURCE_RATIO_KEY = 'shumo.sourceRatio'
const SOURCE_MIN = 120
const SOURCE_SPLIT = 8
let sourceOpen = false
let sourceRatio = loadSourceRatio()
let sourceDrag: { pointerId: number; stop: () => void } | null = null
let syncOwner: 'preview' | 'source' | 'lock' | null = null
let syncRelease = 0
let pendingFollow: 'preview' | 'source' | null = null
// True while showActive is laying out a document. Fonts, diagrams and images
// change heights during that time, so scroll events are transient: they must
// neither drive the other pane nor overwrite the remembered positions.
let rendering = false
let stickSource = false
let sourceMeasure: { key: string; origin: number; lh: number } | null = null

applyChrome()
welcome.innerHTML = welcomeHtml()
document.querySelector('#welcome-open')?.addEventListener('click', () => api.openDialog())

must('#btn-open').addEventListener('click', () => api.openDialog())
must('#btn-home').addEventListener('click', () => goHome())
sourceButton.addEventListener('click', () => {
  if (sourceButton.disabled) return
  sourceOpen = !sourceOpen
  applySourceSplit()
  paintSourceButton()
  if (sourceOpen) requestAnimationFrame(() => alignSourceToPreview())
})
sourceSplit.addEventListener('pointerdown', startSourceDrag)
sourceSplit.addEventListener('keydown', onSourceSplitKey)
window.addEventListener('resize', () => {
  sourceMeasure = null
  stickSource = false
  if (!sourceOpen) return
  applySourceSplit()
  requestAnimationFrame(() => alignSourceToPreview())
})
new ResizeObserver(() => {
  sourceMeasure = null
  if (!sourceOpen || welcomeVisible() || rendering || syncOwner === 'source' || syncOwner === 'lock') return
  requestAnimationFrame(() => {
    if (rendering || syncOwner === 'source' || syncOwner === 'lock') return
    alignSourceToPreview()
  })
}).observe(doc)
must('#btn-font-dec').addEventListener('click', () => api.setFontSize(settings.fontSize - 1))
must('#btn-font-inc').addEventListener('click', () => api.setFontSize(settings.fontSize + 1))
themeButton.addEventListener('click', () => api.setTheme(theme === 'dark' ? 'light' : 'dark'))
widthButton.addEventListener('click', () => api.setContentWidth(nextWidth(settings.contentWidth)))
tocButton.addEventListener('click', () => {
  const root = document.documentElement
  if (root.dataset.layout === 'narrow') {
    const open = root.dataset.drawer === 'open'
    root.dataset.drawer = open ? 'closed' : 'open'
    if (open) api.setShowToc(false)
    else if (!settings.showToc) api.setShowToc(true)
    paintTocButton()
    return
  }
  api.setShowToc(root.dataset.toc !== 'on')
})
narrowMedia.addEventListener('change', () => {
  const root = document.documentElement
  root.dataset.layout = narrowMedia.matches ? 'narrow' : 'wide'
  if (narrowMedia.matches) root.dataset.drawer = 'closed'
  paintTocButton()
})

finder.addEventListener('submit', (event) => {
  event.preventDefault()
  stepFind(1)
})
findInput.addEventListener('input', () => {
  findQuery = findInput.value
  findIndex = 0
  runSearch(true)
})
findInput.addEventListener('keydown', (event) => {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    stepFind(event.shiftKey ? -1 : 1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeFinder()
  }
})
must('#find-next').addEventListener('click', () => stepFind(1))
must('#find-prev').addEventListener('click', () => stepFind(-1))
must('#find-close').addEventListener('click', () => closeFinder())

doc.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement | null)?.closest('a')
  if (!anchor || !doc.contains(anchor)) return
  const href = anchor.getAttribute('href') || ''
  if (!href) return
  if (href.startsWith('#')) {
    event.preventDefault()
    const id = decodeURIComponent(href.slice(1))
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    event.preventDefault()
    api.openExternal(href)
    return
  }
  const bare = href.split('#')[0]?.split('?')[0] ?? ''
  if (/\.(md|markdown|mdown|mkd)$/i.test(bare)) {
    event.preventDefault()
    const tab = tabs[active]
    if (tab) api.openRelative(tab.path, href)
  }
})

scroller.addEventListener(
  'scroll',
  () => {
    if (rendering) return
    const tab = tabs[active]
    if (tab && !welcomeVisible()) {
      tab.scrollTop = scroller.scrollTop
      tab.sourceScroll = sourcePane.scrollTop
    }
    markActiveHeading()
    if (!sourceOpen) return
    if (syncOwner === 'source' || syncOwner === 'lock') {
      pendingFollow = 'preview'
      return
    }
    stickSource = false
    alignSourceToPreview()
  },
  { passive: true }
)
sourcePane.addEventListener(
  'scroll',
  () => {
    if (rendering) return
    const tab = tabs[active]
    if (tab && !welcomeVisible()) tab.sourceScroll = sourcePane.scrollTop
    if (!sourceOpen || syncOwner === 'preview' || syncOwner === 'lock') return
    alignPreviewToSource()
  },
  { passive: true }
)
doc.addEventListener('dblclick', (event) => {
  if (welcomeVisible()) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('a, button, summary, input, label')) return
  const line = lineAtClientY(event.clientY)
  if (!Number.isFinite(line)) return
  if (!sourceOpen) {
    sourceOpen = true
    applySourceSplit()
    paintSourceButton()
  }
  requestAnimationFrame(() => revealLine(line))
})

api.onOpenTabs((files) => {
  let focus = active
  for (const file of files) {
    const index = upsert(file)
    focus = index
  }
  if (focus >= 0) {
    active = focus
    void showActive(true)
  }
})
api.onFileUpdated((file) => {
  const tab = tabs.find((item) => item.path === file.path)
  if (!tab) return
  const viewing = tab === tabs[active] && !welcomeVisible()
  // A save that lands mid-layout keeps the position the reader had before.
  if (viewing && !rendering) {
    tab.scrollTop = scroller.scrollTop
    tab.sourceScroll = sourcePane.scrollTop
  }
  tab.content = file.content
  tab.mtimeMs = file.mtimeMs
  tab.size = file.size
  tab.error = undefined
  tab.name = file.name
  if (viewing) {
    setStatus('已刷新')
    void showActive(false)
  }
})
api.onFileMissing((payload) => {
  const tab = tabs.find((item) => item.path === payload.path)
  if (!tab) return
  tab.error = payload.message
  if (tab === tabs[active] && !welcomeVisible()) void showActive(false)
})
api.onSettings((payload) => {
  settings = payload.settings
  const themeChanged = theme !== payload.resolvedTheme
  theme = payload.resolvedTheme
  applyChrome()
  if (welcomeVisible()) renderWelcome()
  if (!started) return
  if (themeChanged && !welcomeVisible() && tabs[active] && !tabs[active]?.error) {
    void renderDiagrams(doc, theme).finally(() => api.notifyReady())
  } else api.notifyReady()
})
api.onMenu((action) => {
  if (action === 'find') openFinder()
  else if (action === 'find-next') {
    openFinder()
    stepFind(1)
  } else if (action === 'find-prev') {
    openFinder()
    stepFind(-1)
  } else if (action === 'font-inc') api.setFontSize(settings.fontSize + 1)
  else if (action === 'font-dec') api.setFontSize(settings.fontSize - 1)
  else if (action === 'font-reset') api.setFontSize(FONT_DEFAULT)
  else if (action === 'reload') {
    const tab = tabs[active]
    if (tab) api.reloadFile(tab.path)
  } else if (action === 'toggle-toc') {
    if (document.documentElement.dataset.layout === 'narrow') tocButton.click()
    else api.setShowToc(document.documentElement.dataset.toc !== 'on')
  }
  else if (action === 'close-tab') closeActive()
})
api.onStatus((message) => setStatus(message))

window.shumoTest = {
  openFind: () => openFinder(),
  search: (query: string) => {
    findInput.value = query
    findQuery = query
    findIndex = 0
    runSearch(true)
  },
  closeFind: () => closeFinder(),
  syncLines: () => ({
    open: sourceOpen,
    previewLine: welcomeVisible() ? 0 : lineFromPreview(),
    sourceLine: lineFromSource(),
    lineCount: sourceLineCount()
  }),
  jumpToc: (label: string) =>
    new Promise((resolve) => {
      const link = [...toc.querySelectorAll('a')].find((item) => item.textContent?.includes(label))
      const before = scroller.scrollTop
      if (!link) {
        resolve({ moved: false, before, after: before })
        return
      }
      const id = link.getAttribute('href')?.slice(1) ?? ''
      document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' })
      requestAnimationFrame(() => {
        resolve({ moved: Math.abs(scroller.scrollTop - before) > 20, before, after: scroller.scrollTop })
      })
    })
}

if (boot.files.length) {
  tabs = boot.files.map((file) => ({ ...file, scrollTop: 0, sourceScroll: 0 }))
  active = 0
  void showActive(true)
} else {
  showWelcome()
}

function must(selector: string): HTMLElement {
  const node = shell.querySelector(selector)
  if (!node) throw new Error(`缺少 ${selector}`)
  return node as HTMLElement
}

function loadSourceRatio(): number {
  try {
    const raw = Number(localStorage.getItem(SOURCE_RATIO_KEY))
    if (Number.isFinite(raw)) return Math.min(0.85, Math.max(0.15, raw))
  } catch {
    // Private mode or a blocked store still opens the pane at the default split.
  }
  return 0.62
}

function saveSourceRatio(): void {
  try {
    localStorage.setItem(SOURCE_RATIO_KEY, String(sourceRatio))
  } catch {
    // The split still applies for this window.
  }
}

function applySourceSplit(): void {
  const open = sourceOpen && active >= 0 && !!tabs[active]
  sourceSplit.hidden = !open
  sourcePane.hidden = !open
  document.documentElement.dataset.source = open ? 'on' : 'off'
  if (!open) {
    reader.style.gridTemplateColumns = 'minmax(0, 1fr)'
    return
  }
  const available = Math.max(reader.clientWidth - SOURCE_SPLIT, SOURCE_MIN * 2)
  const maxLeft = available - SOURCE_MIN
  const left = Math.min(maxLeft, Math.max(SOURCE_MIN, available * sourceRatio))
  reader.style.gridTemplateColumns = `${Math.round(left)}px ${SOURCE_SPLIT}px minmax(0, 1fr)`
  const percent = Math.round((left / available) * 100)
  sourceSplit.setAttribute('aria-valuemin', '0')
  sourceSplit.setAttribute('aria-valuemax', '100')
  sourceSplit.setAttribute('aria-valuenow', String(percent))
  sourceSplit.setAttribute('aria-valuetext', `预览占 ${percent}%`)
}

function paintSourceButton(): void {
  const hasDoc = active >= 0 && !!tabs[active] && !welcomeVisible()
  if (!hasDoc) sourceOpen = false
  sourceButton.disabled = !hasDoc
  sourceButton.setAttribute('aria-pressed', sourceOpen ? 'true' : 'false')
  sourceButton.classList.toggle('on', sourceOpen)
  sourceButton.title = !hasDoc ? '打开文稿后可查看源码' : sourceOpen ? '隐藏源码' : '显示源码'
  sourceButton.setAttribute('aria-label', '源码')
  applySourceSplit()
}

function syncSource(tab: Tab): void {
  const same = sourceView.dataset.path === tab.path
  if (!same || sourceView.textContent !== tab.content) {
    const keep = same ? sourcePane.scrollTop : tab.sourceScroll
    sourceView.textContent = tab.content
    sourceView.dataset.path = tab.path
    sourceMeasure = null
    sourcePane.scrollTop = keep
    tab.sourceScroll = keep
    window.requestAnimationFrame(() => {
      if (sourceView.dataset.path === tab.path) sourcePane.scrollTop = tab.sourceScroll
    })
  }
  paintSourceButton()
}

function clearSource(): void {
  endSourceDrag()
  sourceOpen = false
  sourceView.textContent = ''
  delete sourceView.dataset.path
  sourcePane.scrollTop = 0
  sourceMeasure = null
  stickSource = false
  paintSourceButton()
}

function holdSync(owner: 'preview' | 'source' | 'lock'): void {
  syncOwner = owner
  window.clearTimeout(syncRelease)
  // Programmatic scrollTop can emit a second event on the next frame.
  // A scroll that arrives while locked is applied once, after the echo.
  syncRelease = window.setTimeout(() => {
    requestAnimationFrame(() => {
      if (syncOwner !== owner) return
      syncOwner = null
      const follow = pendingFollow
      pendingFollow = null
      if (follow === 'preview') alignSourceToPreview()
      else if (follow === 'source') alignPreviewToSource()
    })
  }, 40)
}

function sourceLineCount(): number {
  const text = sourceView.textContent ?? ''
  if (!text) return 1
  return text.split('\n').length
}

function sourceMetrics(): { origin: number; lh: number } {
  const text = sourceView.textContent ?? ''
  const style = getComputedStyle(sourceView)
  const key = `${text.length}:${sourcePane.clientWidth}:${style.fontSize}:${style.lineHeight}:${style.paddingTop}`
  if (sourceMeasure?.key === key) return sourceMeasure
  const pad = Number.parseFloat(style.paddingTop) || 0
  let lh = Number.parseFloat(style.lineHeight)
  if (!Number.isFinite(lh) || lh <= 0) lh = (Number.parseFloat(style.fontSize) || 13) * 1.55
  let origin = pad
  const node = sourceView.firstChild
  if (sourcePane.hidden || sourceView.getClientRects().length === 0) return { origin, lh }
  if (node && node.nodeType === Node.TEXT_NODE && text.includes('\n')) {
    const range = document.createRange()
    const firstBreak = text.indexOf('\n')
    const secondBreak = text.indexOf('\n', firstBreak + 1)
    range.setStart(node, 0)
    range.setEnd(node, Math.max(firstBreak, 0))
    const first = range.getBoundingClientRect()
    const end = secondBreak < 0 ? text.length : secondBreak
    if (end > firstBreak + 1) {
      range.setStart(node, firstBreak + 1)
      range.setEnd(node, end)
      const second = range.getBoundingClientRect()
      if (second.top > first.top + 0.5) lh = second.top - first.top
    }
    origin = first.top - sourceView.getBoundingClientRect().top
    if (!Number.isFinite(origin) || origin < 0) origin = pad
  }
  sourceMeasure = { key, origin, lh }
  return sourceMeasure
}

function previewAnchors(): LinePoint[] {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop
  const points: LinePoint[] = []
  for (const node of doc.querySelectorAll<HTMLElement>('[data-line]')) {
    if (node.getClientRects().length === 0) continue
    const rect = node.getBoundingClientRect()
    if (rect.height < 1) continue
    // A closed callout keeps its summary, but Chromium can still report a
    // box for the hidden table. That box sits on the next heading and
    // would steal its source line.
    const closed = node.closest('details:not([open])')
    if (closed && closed !== node) continue
    const line = Number(node.dataset.line)
    if (!Number.isFinite(line)) continue
    points.push({ line, top: rect.top - base })
  }
  return points
}

function lineFromPreview(): number {
  return lineAtOffset(previewAnchors(), scroller.scrollTop, scroller.scrollHeight, sourceLineCount())
}

function lineFromSource(): number {
  const { origin, lh } = sourceMetrics()
  if (lh <= 0) return 0
  return Math.max(0, (sourcePane.scrollTop - origin) / lh)
}

function lineAtClientY(clientY: number): number {
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop
  return lineAtOffset(previewAnchors(), clientY - base, scroller.scrollHeight, sourceLineCount())
}

function scrollSourceToLine(line: number): void {
  const { origin, lh } = sourceMetrics()
  const next = Math.max(0, origin + line * lh)
  const max = Math.max(0, sourcePane.scrollHeight - sourcePane.clientHeight)
  const clamped = Math.min(max, next)
  if (Math.abs(clamped - sourcePane.scrollTop) < 1) return
  holdSync('preview')
  sourcePane.scrollTop = clamped
}

function scrollPreviewToLine(line: number): void {
  const next = offsetForLine(previewAnchors(), line, scroller.scrollHeight, sourceLineCount())
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const clamped = Math.min(max, Math.max(0, next))
  if (Math.abs(clamped - scroller.scrollTop) < 1) return
  holdSync('source')
  scroller.scrollTop = clamped
}

function alignSourceToPreview(): void {
  if (!sourceOpen || welcomeVisible() || stickSource) return
  scrollSourceToLine(lineFromPreview())
}

function alignPreviewToSource(): void {
  if (!sourceOpen || welcomeVisible()) return
  scrollPreviewToLine(lineFromSource())
}

function revealLine(line: number): void {
  if (!sourceOpen || welcomeVisible()) return
  // Keep the preview where the reader clicked. A layout pass from opening
  // the split would otherwise pull the source back to the old viewport.
  stickSource = true
  scrollSourceToLine(line)
}

function setRatioFromClientX(clientX: number): void {
  const bounds = reader.getBoundingClientRect()
  const available = Math.max(bounds.width - SOURCE_SPLIT, SOURCE_MIN * 2)
  const x = clientX - bounds.left
  const left = Math.min(available - SOURCE_MIN, Math.max(SOURCE_MIN, x))
  sourceRatio = left / available
  saveSourceRatio()
  applySourceSplit()
}

function endSourceDrag(event?: PointerEvent): void {
  if (!sourceDrag) return
  sourceDrag.stop()
  if (event) {
    try {
      if (sourceSplit.hasPointerCapture(event.pointerId)) sourceSplit.releasePointerCapture(event.pointerId)
    } catch {
      // The pointer may already have been released.
    }
  }
  sourceDrag = null
  document.body.classList.remove('source-dragging')
}

function startSourceDrag(event: PointerEvent): void {
  if (!sourceOpen || event.button !== 0) return
  event.preventDefault()
  endSourceDrag()
  const pointerId = event.pointerId
  try {
    sourceSplit.setPointerCapture(pointerId)
  } catch {
    // Untrusted test events still move the separator through the listeners below.
  }
  document.body.classList.add('source-dragging')
  const move = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId) return
    setRatioFromClientX(ev.clientX)
  }
  const up = (ev: PointerEvent): void => {
    if (ev.pointerId !== pointerId) return
    endSourceDrag(ev)
  }
  sourceSplit.addEventListener('pointermove', move)
  sourceSplit.addEventListener('pointerup', up)
  sourceSplit.addEventListener('pointercancel', up)
  sourceDrag = {
    pointerId,
    stop: () => {
      sourceSplit.removeEventListener('pointermove', move)
      sourceSplit.removeEventListener('pointerup', up)
      sourceSplit.removeEventListener('pointercancel', up)
    }
  }
}

function onSourceSplitKey(event: KeyboardEvent): void {
  if (!sourceOpen || event.isComposing) return
  const available = Math.max(reader.clientWidth - SOURCE_SPLIT, SOURCE_MIN * 2)
  const step = (event.shiftKey ? 0.1 : 0.04) * available
  const current = available * sourceRatio
  let left = current
  if (event.key === 'ArrowLeft') left -= step
  else if (event.key === 'ArrowRight') left += step
  else if (event.key === 'Home') left = SOURCE_MIN
  else if (event.key === 'End') left = available - SOURCE_MIN
  else return
  event.preventDefault()
  left = Math.min(available - SOURCE_MIN, Math.max(SOURCE_MIN, left))
  sourceRatio = left / available
  saveSourceRatio()
  applySourceSplit()
}

function welcomeHtml(): string {
  const mod = boot.platform === 'darwin' ? '⌘' : 'Ctrl+'
  return `
    <div class="welcome-panel">
      <img class="app-icon" src="${appIconUrl}" alt="" width="88" height="88" />
      <h1>数墨</h1>
      <p class="lede">把笔记读清楚</p>
      <button type="button" class="primary" id="welcome-open" title="${mod}O，或把 .md 拖进窗口">${icons.folder}打开文稿</button>
      <section class="recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">最近打开</h2>
        <div id="recent-list"></div>
      </section>
    </div>
  `
}

function showWelcome(): void {
  renderToken += 1
  rendering = false
  welcome.hidden = false
  doc.hidden = true
  doc.innerHTML = ''
  delete doc.dataset.render
  scroller.scrollTop = 0
  closeFinder()
  docTitle.textContent = ''
  docTitle.hidden = true
  paintTabs()
  statusPath.textContent = tabs.length ? '首页' : '未打开文稿'
  statusState.textContent = ''
  document.title = '数墨'
  homeButton.setAttribute('aria-current', 'page')
  clearSource()
  renderToc([])
  renderWelcome()
  started = true
  api.notifyReady()
}

function renderWelcome(): void {
  const list = document.querySelector('#recent-list')
  if (!list) return
  list.replaceChildren()
  const section = list.closest<HTMLElement>('.recent')
  if (section) section.hidden = settings.recent.length === 0
  if (!settings.recent.length) return
  for (const item of settings.recent) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'recent-item'
    button.title = item.path
    button.setAttribute('aria-label', `${item.title}，${item.hint}`)
    const name = document.createElement('span')
    name.className = 'recent-name'
    name.textContent = item.title
    name.title = item.title
    const hint = document.createElement('span')
    hint.className = 'recent-hint'
    hint.textContent = item.hint
    hint.title = item.path
    button.insertAdjacentHTML('afterbegin', icons.doc)
    button.append(name, hint)
    button.addEventListener('click', () => api.openRelative(item.path, item.path))
    // A sibling, not a child: a button cannot contain another button.
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'recent-remove'
    remove.title = '从最近打开中移除'
    remove.setAttribute('aria-label', `从最近打开中移除 ${item.title}`)
    remove.innerHTML = icons.close
    // The list re-renders from the settings broadcast that follows.
    remove.addEventListener('click', () => api.removeRecent(item.path))
    const row = document.createElement('div')
    row.className = 'recent-row'
    row.append(button, remove)
    list.append(row)
  }
}

async function showActive(jumpToFind: boolean): Promise<void> {
  const token = ++renderToken
  const tab = tabs[active]
  rendering = false
  if (!tab) {
    showWelcome()
    return
  }
  welcome.hidden = true
  doc.hidden = false
  homeButton.removeAttribute('aria-current')
  syncSource(tab)
  paintTabs()
  docTitle.hidden = true
  document.title = `${tabLabel(tab)} — 数墨`
  statusPath.textContent = tab.path
  statusPath.title = tab.path
  if (tab.error) {
    doc.innerHTML = `<div class="doc-error"><h1>无法打开</h1><p>${escapeText(tab.error)}</p><p class="error-path">${escapeText(tab.path)}</p></div>`
    renderToc([])
    statusState.textContent = tab.error
    started = true
    api.notifyReady()
    return
  }
  if (!tab.content.trim()) {
    doc.innerHTML = `<div class="doc-error"><h1>空白文稿</h1><p>这份文件还没有内容。保存之后，这里会自动刷新。</p></div>`
    renderToc([])
    statusState.textContent = '监视中'
    started = true
    api.notifyReady()
    return
  }
  let rendered: { html: string; headings: Heading[] }
  try {
    rendered = renderMarkdown(tab.content)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    doc.innerHTML = `<div class="doc-error"><h1>渲染失败</h1><p>${escapeText(message)}</p></div>`
    renderToc([])
    started = true
    api.notifyReady()
    return
  }
  const clean = DOMPurify.sanitize(rendered.html, markdownSanitizeConfig)
  const keepPreview = tab.scrollTop
  const keepSource = tab.sourceScroll
  rendering = true
  doc.innerHTML = clean
  rewriteImages(tab)
  renderToc(rendered.headings)
  scroller.scrollTop = keepPreview
  sourcePane.scrollTop = keepSource
  if (!finder.hidden && findQuery) runSearch(jumpToFind)
  try {
    await document.fonts.ready
    await renderDiagrams(doc, theme)
    await waitImages(doc)
  } catch {
    // Diagrams and images are best-effort; the prose is already on the page.
  }
  if (token !== renderToken) {
    if (welcomeVisible()) doc.innerHTML = ''
    return
  }
  doc.dataset.render = String(token)
  scroller.scrollTop = keepPreview
  sourcePane.scrollTop = keepSource
  rendering = false
  tab.scrollTop = scroller.scrollTop
  tab.sourceScroll = sourcePane.scrollTop
  if (sourceOpen) alignSourceToPreview()
  markActiveHeading()
  if (!statusState.textContent || statusState.textContent === '已刷新') {
    statusState.textContent = '保存后自动刷新'
  } else if (!tab.error) statusState.textContent = '保存后自动刷新'
  started = true
  api.notifyReady()
}

function rewriteImages(tab: Tab): void {
  const baseDir = dirname(tab.path)
  for (const image of doc.querySelectorAll('img')) {
    const src = image.getAttribute('src') || ''
    if (!src || /^(https?:|data:|localimg:)/i.test(src)) continue
    const abs = resolveAgainst(baseDir, src)
    image.src = localImageUrl(abs, tab.mtimeMs)
    image.addEventListener('error', () => {
      const note = document.createElement('p')
      note.className = 'img-fallback'
      note.textContent = `图片无法加载：${image.alt || src}`
      image.replaceWith(note)
    })
  }
}

function waitImages(root: ParentNode): Promise<void> {
  const images = [...root.querySelectorAll('img')]
  return new Promise((resolve) => {
    let pending = images.length
    const timer = window.setTimeout(resolve, 2500)
    const done = (): void => {
      pending -= 1
      if (pending <= 0) {
        window.clearTimeout(timer)
        resolve()
      }
    }
    if (!images.length) {
      window.clearTimeout(timer)
      resolve()
      return
    }
    for (const image of images) {
      if (image.complete) done()
      else {
        image.addEventListener('load', done, { once: true })
        image.addEventListener('error', done, { once: true })
      }
    }
  })
}

function renderToc(headings: Heading[]): void {
  toc.replaceChildren()
  // The home page has nothing to list; leave the sidebar empty.
  if (!headings.length && (!tabs[active] || welcomeVisible())) return
  const title = document.createElement('h2')
  title.textContent = '目录'
  toc.append(title)
  if (!headings.length) {
    const empty = document.createElement('p')
    empty.className = 'toc-empty'
    empty.textContent = '这篇文稿没有标题。'
    toc.append(empty)
    return
  }
  for (const heading of headings) {
    const link = document.createElement('a')
    link.href = `#${heading.id}`
    link.className = `l${heading.level}`
    link.textContent = heading.text
    link.addEventListener('click', (event) => {
      event.preventDefault()
      document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (document.documentElement.dataset.layout === 'narrow') {
        document.documentElement.dataset.drawer = 'closed'
        paintTocButton()
      }
    })
    toc.append(link)
  }
  markActiveHeading()
}

function markActiveHeading(): void {
  const links = [...toc.querySelectorAll('a')]
  if (!links.length) return
  const box = scroller.getBoundingClientRect()
  let current = links[0]!
  for (const link of links) {
    const id = link.getAttribute('href')?.slice(1) ?? ''
    const heading = document.getElementById(id)
    if (!heading) continue
    if (heading.getBoundingClientRect().top - box.top <= 88) current = link
  }
  for (const link of links) link.classList.toggle('active', link === current)
}

function tabLabel(tab: Tab): string {
  const raw = /^#\s+(.+?)\s*$/m.exec(tab.content)?.[1]
  if (!raw) return tab.name
  const title = raw
    .replace(/\$\$[\s\S]+?\$\$/g, '')
    .replace(/\$[^$\n]+\$/g, '')
    .replace(/\\[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return title || tab.name
}

function paintTabs(): void {
  const open = tabs.length > 0
  tabBar.hidden = !open
  tabBar.replaceChildren()
  if (!open) return
  tabs.forEach((tab, index) => {
    const label = tabLabel(tab)
    const selected = index === active && !welcomeVisible()
    const card = document.createElement('div')
    card.className = `tab${selected ? ' active' : ''}`
    card.setAttribute('role', 'tab')
    card.setAttribute('aria-selected', selected ? 'true' : 'false')
    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'tab-name'
    name.textContent = label
    name.title = tab.path
    name.addEventListener('click', () => {
      if (active === index && !welcomeVisible()) return
      const current = tabs[active]
      if (current && !welcomeVisible()) {
        current.scrollTop = scroller.scrollTop
        current.sourceScroll = sourcePane.scrollTop
      }
      active = index
      void showActive(false)
    })
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'tab-x'
    close.innerHTML = icons.close
    close.title = '关闭文稿'
    close.setAttribute('aria-label', `关闭 ${label}`)
    close.addEventListener('click', () => closeIndex(index))
    card.append(name, close)
    tabBar.append(card)
  })
}

function upsert(file: OpenedFile): number {
  const index = tabs.findIndex((item) => item.path === file.path)
  if (index >= 0) {
    const prev = tabs[index]!
    tabs[index] = { ...file, scrollTop: prev.scrollTop, sourceScroll: prev.sourceScroll }
    return index
  }
  tabs.push({ ...file, scrollTop: 0, sourceScroll: 0 })
  return tabs.length - 1
}

function goHome(): void {
  if (welcomeVisible()) return
  const tab = tabs[active]
  if (tab) {
    tab.scrollTop = scroller.scrollTop
    tab.sourceScroll = sourcePane.scrollTop
  }
  showWelcome()
}

function closeActive(): void {
  if (active < 0 || !tabs[active]) return
  closeIndex(active)
}

function closeIndex(index: number): void {
  const tab = tabs[index]
  if (!tab) return
  api.tabClosed(tab.path)
  tabs.splice(index, 1)
  if (!tabs.length) {
    active = -1
    showWelcome()
    return
  }
  if (active >= tabs.length) active = tabs.length - 1
  else if (index < active) active -= 1
  else if (index === active) active = Math.min(index, tabs.length - 1)
  void showActive(false)
}

function openFinder(): void {
  if (welcomeVisible()) return
  finder.hidden = false
  findInput.focus()
  findInput.select()
  if (findQuery) runSearch(true)
}

function closeFinder(): void {
  finder.hidden = true
  findQuery = ''
  findInput.value = ''
  findCount.textContent = ''
  clearHits()
}

function stepFind(delta: number): void {
  const hits = [...doc.querySelectorAll<HTMLElement>('mark.search-hit')]
  if (!hits.length) return
  findIndex = (findIndex + delta + hits.length) % hits.length
  hits.forEach((hit, index) => hit.classList.toggle('current', index === findIndex))
  hits[findIndex]?.scrollIntoView({ behavior: 'auto', block: 'center' })
  findCount.textContent = `${findIndex + 1} / ${hits.length}`
}

function runSearch(jump: boolean): void {
  clearHits()
  const query = findQuery.trim()
  if (!query) {
    findCount.textContent = ''
    return
  }
  const q = query.toLowerCase()
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('.katex, script, style')) return NodeFilter.FILTER_REJECT
      if (!node.nodeValue?.toLowerCase().includes(q)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    const lower = text.toLowerCase()
    const frag = document.createDocumentFragment()
    let cursor = 0
    let at = lower.indexOf(q)
    while (at !== -1) {
      if (at > cursor) frag.append(text.slice(cursor, at))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = text.slice(at, at + q.length)
      frag.append(mark)
      cursor = at + q.length
      at = lower.indexOf(q, cursor)
    }
    if (cursor < text.length) frag.append(text.slice(cursor))
    node.parentNode?.replaceChild(frag, node)
  }
  const hits = doc.querySelectorAll('mark.search-hit')
  if (!hits.length) {
    findCount.textContent = '无匹配'
    return
  }
  findIndex = Math.min(findIndex, hits.length - 1)
  if (jump) stepFind(0)
  else findCount.textContent = `${findIndex + 1} / ${hits.length}`
}

function clearHits(): void {
  for (const mark of [...doc.querySelectorAll('mark.search-hit')]) {
    const parent = mark.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
    parent.normalize()
  }
}

function applyChrome(): void {
  const root = document.documentElement
  const previousToc = root.dataset.toc
  root.dataset.theme = theme
  root.dataset.toc = settings.showToc ? 'on' : 'off'
  root.dataset.layout = narrowMedia.matches ? 'narrow' : 'wide'
  if (!root.dataset.drawer) root.dataset.drawer = 'closed'
  if (sawTocSetting && previousToc !== root.dataset.toc && root.dataset.layout === 'narrow') {
    root.dataset.drawer = settings.showToc ? 'open' : 'closed'
  }
  sawTocSetting = true
  root.dataset.width = settings.contentWidth === 0 ? 'full' : 'fixed'
  root.style.setProperty('--reading-size', `${clampFont(settings.fontSize)}px`)
  root.style.setProperty('--reading-width', settings.contentWidth === 0 ? '100%' : `${settings.contentWidth}px`)
  root.classList.toggle('vscode-dark', theme === 'dark')
  root.classList.toggle('vscode-light', theme !== 'dark')
  root.classList.toggle('dark', theme === 'dark')
  root.style.background = usesGlass(boot.platform) ? 'transparent' : windowBackgroundFor(boot.platform, theme)
  fontLabel.textContent = String(clampFont(settings.fontSize))
  themeButton.innerHTML = toolContent(theme === 'dark' ? icons.moon : icons.sun, theme === 'dark' ? '深色' : '浅色')
  themeButton.title = theme === 'dark' ? '当前为深色，点击改为浅色' : '当前为浅色，点击改为深色'
  const widthLabel = WIDTH_LABEL[settings.contentWidth] ?? '适中'
  widthButton.innerHTML = toolContent(icons.width, widthLabel)
  widthButton.title = `版心${widthLabel}，点击切换`
  paintTocButton()
  paintSourceButton()
}

function paintTocButton(): void {
  const root = document.documentElement
  const open = root.dataset.layout === 'narrow' ? root.dataset.drawer === 'open' : settings.showToc
  tocButton.classList.toggle('on', open)
  tocButton.title = open ? '隐藏目录' : '显示目录'
}

function nextWidth(current: number): number {
  const values = CONTENT_WIDTHS as readonly number[]
  const index = values.indexOf(current)
  return values[(index + 1) % values.length] ?? 760
}

function clampFont(size: number): number {
  if (!Number.isFinite(size)) return FONT_DEFAULT
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)))
}

function setStatus(message: string): void {
  statusState.textContent = message
  window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => {
    if (tabs[active] && !tabs[active]?.error) statusState.textContent = '保存后自动刷新'
  }, 2400)
}

function welcomeVisible(): boolean {
  return !welcome.hidden
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
