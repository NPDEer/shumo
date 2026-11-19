import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import 'markdown-it-github-alerts/styles/github-base.css'
import 'markdown-it-github-alerts/styles/github-colors-light.css'
import 'markdown-it-github-alerts/styles/github-colors-dark-class.css'
import './styles.css'
import './preview.css'
import { renderMarkdown } from '../../shared/markdown'
import { markdownSanitizeConfig } from '../../shared/sanitize'
import { dirname, localImageUrl, resolveAgainst } from '../../shared/pathutil'
import {
  CONTENT_WIDTHS,
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  type Heading,
  type OpenedFile,
  type ResolvedTheme,
  type Settings
} from '../../shared/types'
import { renderDiagrams } from './mermaid'

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
  <header class="topbar">
    <button type="button" id="btn-home" class="brand" title="返回首页" aria-label="返回首页">数墨</button>
    <div id="doc-title" class="doc-title" hidden></div>
    <div id="tabs" class="tabs" role="tablist" aria-label="打开的文稿" hidden></div>
    <div class="topbar-spacer" aria-hidden="true"></div>
    <div class="actions">
      <button type="button" id="btn-toc" class="text-btn">目录</button>
      <button type="button" id="btn-theme" class="text-btn">浅色</button>
      <button type="button" id="btn-font-dec" class="text-btn" aria-label="减小字号" title="减小字号">A−</button>
      <span id="font-label" class="font-label">18</span>
      <button type="button" id="btn-font-inc" class="text-btn" aria-label="增大字号" title="增大字号">A+</button>
      <button type="button" id="btn-width" class="text-btn" title="切换版心宽度">适中</button>
      <button type="button" id="btn-source" class="text-btn" aria-pressed="false" aria-label="源码" title="显示源码" disabled>源码</button>
      <button type="button" id="btn-open" class="text-btn accent" title="打开文稿">打开</button>
    </div>
  </header>
  <div class="workspace">
    <nav id="toc" class="toc" aria-label="目录"></nav>
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
  </div>
  <footer class="status">
    <span id="status-path" class="status-path"></span>
    <span id="status-state" class="status-state" role="status"></span>
  </footer>
  <form id="finder" class="finder" hidden role="search">
    <input id="find-input" type="search" placeholder="在文稿中查找" aria-label="在文稿中查找" />
    <span id="find-count" class="find-count"></span>
    <button type="button" id="find-prev">上一个</button>
    <button type="button" id="find-next">下一个</button>
    <button type="button" id="find-close" aria-label="关闭查找">关闭</button>
  </form>
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
})
sourceSplit.addEventListener('pointerdown', startSourceDrag)
sourceSplit.addEventListener('keydown', onSourceSplitKey)
window.addEventListener('resize', () => {
  if (sourceOpen) applySourceSplit()
})
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
    const tab = tabs[active]
    if (tab && !welcomeVisible()) {
      tab.scrollTop = scroller.scrollTop
      tab.sourceScroll = sourcePane.scrollTop
    }
    markActiveHeading()
  },
  { passive: true }
)

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
  if (viewing) {
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
  paintSourceButton()
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
  const mod = boot.platform === 'darwin' ? '⌘' : 'Ctrl'
  return `
    <div class="welcome-panel">
      <div class="welcome-intro">
        <p class="eyebrow">只读 · 公式 · 中文</p>
        <h1>把笔记读清楚</h1>
        <p class="lede">数墨渲染 GitHub 风味 Markdown 与 LaTeX。计算数学笔记里的表格、代码、流程图和中文夹公式，打开就能读。</p>
        <button type="button" class="primary" id="welcome-open" title="选择要阅读的 Markdown 文件">打开文稿</button>
        <p class="hint">把 .md 拖进窗口，或在访达里直接双击。${mod}O 打开，${mod}W 关闭当前文稿。点左上角「数墨」回到这里，已打开的文稿仍留在标签上。</p>
      </div>
      <section class="recent" aria-labelledby="recent-heading">
        <h2 id="recent-heading">最近打开</h2>
        <div id="recent-list"></div>
      </section>
    </div>
  `
}

function showWelcome(): void {
  renderToken += 1
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
  if (!settings.recent.length) {
    const empty = document.createElement('p')
    empty.className = 'recent-empty'
    empty.textContent = '还没有最近文件。'
    list.append(empty)
    return
  }
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
    button.append(name, hint)
    button.addEventListener('click', () => api.openRelative(item.path, item.path))
    list.append(button)
  }
}

async function showActive(jumpToFind: boolean): Promise<void> {
  const token = ++renderToken
  const tab = tabs[active]
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
  doc.innerHTML = clean
  rewriteImages(tab)
  renderToc(rendered.headings)
  scroller.scrollTop = tab.scrollTop
  sourcePane.scrollTop = tab.sourceScroll
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
  scroller.scrollTop = tab.scrollTop
  sourcePane.scrollTop = tab.sourceScroll
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
  const title = document.createElement('h2')
  title.textContent = '目录'
  toc.append(title)
  if (!headings.length) {
    const empty = document.createElement('p')
    empty.className = 'toc-empty'
    empty.textContent = tabs[active] && !welcomeVisible() ? '这篇文稿没有标题。' : '打开文稿后，这里会列出标题。'
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
    close.textContent = '×'
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
  root.style.background = theme === 'dark' ? '#1e1e1e' : '#ffffff'
  fontLabel.textContent = String(clampFont(settings.fontSize))
  themeButton.textContent = theme === 'dark' ? '深色' : '浅色'
  themeButton.title = theme === 'dark' ? '当前为深色，点击改为浅色' : '当前为浅色，点击改为深色'
  widthButton.textContent = WIDTH_LABEL[settings.contentWidth] ?? '适中'
  widthButton.title = `版心${widthButton.textContent}，点击切换`
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
