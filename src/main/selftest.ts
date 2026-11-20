import { app, ipcMain, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { updateSettings } from './settings'

type Stats = {
  katex: number
  display: number
  tables: number
  tasks: number
  footnotes: number
  mermaidText: string
  mermaidSvg: number
  code: number
  python: boolean
  images: { src: string; width: number; complete: boolean }[]
  h1: string
  toc: number
  active: string
  scripts: number
  welcomeHidden: boolean
  chinese: boolean
  escapedScript: boolean
  inlineCode: boolean
  theme: string
  font: string
  cjk: boolean
  katexFont: boolean
  title: string
  fontSize: string
  lineHeight: string
  padLeft: string
  maxWidth: string
  h1Weight: string
  h1Border: string
  frontmatter: boolean
  alert: boolean
  abstractTitle: string
  abstractMarker: boolean
  abstractMath: boolean
  exampleTitle: string
  exampleList: number
  infoCollapsed: boolean
  infoMath: boolean
  infoTable: boolean
  octicon: boolean
  ceLiteral: boolean
  katexError: boolean
  tabCount: number
  tabClose: boolean
  tabLabel: string
}

type LayoutBox = {
  innerWidth: number
  fontSize: string
  docWidth: number
  pageOverflow: number
  imgWidth: number
  imgNatural: number
  svgWidth: number
  svgHeight: number
  svgRatio: number
  boxRatio: number
  viewBoxWidth: number
  tableClient: number
  tableScroll: number
  preClient: number
  preScroll: number
  mathClient: number
  mathScroll: number
  linkWidth: number
  layout: string
  drawer: string
  scrollTop: number
  render: string
  fontRight: number
  fontVisible: boolean
  columns: string
  sourceLabel: string
  sourceRight: number
  openRight: number
  toolbarFits: boolean
  brandRight: number
  tocLeft: number
}

const STATS_JS = `(() => {
  const doc = document.getElementById('doc')
  const welcome = document.getElementById('welcome')
  const mermaid = doc?.querySelector('.mermaid-block')
  return {
    katex: doc?.querySelectorAll('.katex').length ?? 0,
    display: doc?.querySelectorAll('.katex-display').length ?? 0,
    tables: doc?.querySelectorAll('table').length ?? 0,
    tasks: doc?.querySelectorAll('.task-list-item').length ?? 0,
    footnotes: doc?.querySelectorAll('.footnote-ref, .footnote-item').length ?? 0,
    mermaidText: mermaid?.textContent ?? '',
    mermaidSvg: doc?.querySelectorAll('.mermaid-block svg').length ?? 0,
    code: doc?.querySelectorAll('pre code.hljs').length ?? 0,
    python: !!doc?.querySelector('code.language-python'),
    images: [...(doc?.querySelectorAll('img') ?? [])].map((img) => ({
      src: img.getAttribute('src') || '',
      width: img.naturalWidth,
      complete: img.complete
    })),
    h1: doc?.querySelector('h1')?.textContent ?? '',
    toc: document.querySelectorAll('#toc a').length,
    active: document.querySelector('#toc a.active')?.textContent ?? '',
    scripts: doc?.querySelectorAll('script').length ?? 0,
    welcomeHidden: welcome ? welcome.hidden : true,
    chinese: (doc?.innerText ?? '').includes('谱方法'),
    escapedScript: (doc?.innerHTML ?? '').includes('<script'),
    inlineCode: [...(doc?.querySelectorAll('code') ?? [])].some((node) => node.textContent?.includes('$not math$')),
    theme: document.documentElement.dataset.theme || '',
    font: getComputedStyle(doc || document.body).fontFamily,
    cjk: document.fonts.check('16px "Noto Serif CJK SC"'),
    katexFont: document.fonts.check('16px KaTeX_Main'),
    title: document.title,
    fontSize: getComputedStyle(doc || document.body).fontSize,
    lineHeight: getComputedStyle(doc || document.body).lineHeight,
    padLeft: getComputedStyle(document.querySelector('.sheet') || document.body).paddingLeft,
    maxWidth: getComputedStyle(document.querySelector('.sheet') || document.body).maxWidth,
    h1Weight: getComputedStyle(doc?.querySelector('h1') || document.body).fontWeight,
    h1Border: getComputedStyle(doc?.querySelector('h1') || document.body).borderBottomWidth,
    frontmatter: !!doc?.querySelector('table.frontmatter'),
    alert: !!doc?.querySelector('.markdown-alert-note'),
    abstractTitle: (doc?.querySelector('.markdown-alert-abstract .markdown-alert-title')?.textContent ?? '').trim(),
    abstractMarker: (doc?.querySelector('.markdown-alert-abstract')?.innerText ?? '').includes('[!abstract]'),
    abstractMath: !!doc?.querySelector('.markdown-alert-abstract .katex-display'),
    exampleTitle: (doc?.querySelector('.markdown-alert-example .markdown-alert-title')?.textContent ?? '').trim(),
    exampleList: doc?.querySelectorAll('.markdown-alert-example li').length ?? 0,
    infoCollapsed: (() => {
      const el = doc?.querySelector('details.markdown-alert-info')
      return !!el && el.open === false && !(el.textContent || '').includes('[!info]')
    })(),
    infoMath: !!doc?.querySelector('details.markdown-alert-info .katex-display'),
    infoTable: !!doc?.querySelector('details.markdown-alert-info table'),
    octicon: !!doc?.querySelector('.octicon-info'),
    ceLiteral: (doc?.innerHTML ?? '').includes('\\\\ce'),
    katexError: !!doc?.querySelector('.katex-error'),
    tabCount: document.querySelectorAll('#tabs .tab').length,
    tabClose: !!document.querySelector('#tabs .tab.active .tab-x'),
    tabLabel: document.querySelector('#tabs .tab.active .tab-name')?.textContent ?? ''
  }
})()`

export async function runSelfTest(win: BrowserWindow, firstReady: Promise<void>): Promise<void> {
  const shotDir = process.env.SHUMO_SHOT_DIR || path.join(process.cwd(), 'shots')
  fs.mkdirSync(shotDir, { recursive: true })
  const report: Record<string, unknown> = {}
  try {
    await firstReady
    await pause(200)
    await applyTheme(win, 'light')
    const light = await stats(win)
    report.light = light
    assertLight(light)
    await exercise(win, report)
    await win.webContents.executeJavaScript(
      `document.getElementById('scroller').scrollTop = 0; document.getElementById('finder').hidden = true;`
    )
    await pause(150)
    await shot(win, path.join(shotDir, 'shumo_v110_light.png'))
    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('code.language-python')?.closest('pre')?.scrollIntoView({ block: 'start', behavior: 'auto' })
    })()`)
    await pause(150)
    await shot(win, path.join(shotDir, 'shumo_v110_light_code.png'))
    await win.webContents.executeJavaScript(`document.getElementById('scroller').scrollTop = 0`)

    await applyTheme(win, 'dark')
    await pause(200)
    const dark = await stats(win)
    report.dark = { theme: dark.theme, mermaid: dark.mermaidText.slice(0, 40), katex: dark.katex }
    if (dark.theme !== 'dark') throw new Error(`深色主题未生效：${dark.theme}`)
    if (!dark.mermaidText.includes('Chebyshev') && !dark.mermaidText.includes('给定')) {
      throw new Error('深色模式下 Mermaid 文字丢失')
    }
    await shot(win, path.join(shotDir, 'shumo_v110_dark.png'))

    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.mermaid-block')
      el?.scrollIntoView({ block: 'center', behavior: 'auto' })
    })()`)
    await pause(200)
    await shot(win, path.join(shotDir, 'shumo_v110_dark_mermaid.png'))

    await win.webContents.executeJavaScript(`(() => {
      document.querySelector('.markdown-alert-note')?.scrollIntoView({ block: 'center', behavior: 'auto' })
    })()`)
    await pause(150)
    await shot(win, path.join(shotDir, 'shumo_v110_dark_alert.png'))
    await applyTheme(win, 'light')
    await pause(150)
    await shot(win, path.join(shotDir, 'shumo_v110_light_alert.png'))

    await win.webContents.executeJavaScript(`document.querySelector('.markdown-alert-abstract')?.scrollIntoView({ block: 'center', behavior: 'auto' })`)
    await paint(win)
    await shot(win, path.join(shotDir, 'shumo_v110_abstract_light.png'))
    await applyTheme(win, 'dark')
    await paint(win)
    await shot(win, path.join(shotDir, 'shumo_v110_abstract_dark.png'))
    await applyTheme(win, 'light')
    win.setContentSize(480, 820)
    await pause(280)
    await win.webContents.executeJavaScript(`document.querySelector('.markdown-alert-abstract')?.scrollIntoView({ block: 'center', behavior: 'auto' })`)
    await paint(win)
    const abstractFit = await win.webContents.executeJavaScript(`(() => {
      const box = document.querySelector('.markdown-alert-abstract')?.getBoundingClientRect()
      const scroller = document.getElementById('scroller')
      return {
        width: box?.width ?? 0,
        overflow: (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
        title: (document.querySelector('.markdown-alert-abstract .markdown-alert-title')?.textContent ?? '').trim(),
        math: !!document.querySelector('.markdown-alert-abstract .katex-display')
      }
    })()`)
    report.abstractNarrow = abstractFit
    if (!abstractFit.math || abstractFit.title !== '一句话总结' || abstractFit.overflow > 2 || abstractFit.width < 200) {
      throw new Error(`窄窗口摘要块异常：${JSON.stringify(abstractFit)}`)
    }
    await shot(win, path.join(shotDir, 'shumo_v110_abstract_narrow.png'))
    win.setContentSize(1440, 820)
    await pause(200)

    await win.webContents.executeJavaScript(`document.querySelector('.markdown-alert-example')?.scrollIntoView({ block: 'start', behavior: 'auto' })`)
    await paint(win)
    await shot(win, path.join(shotDir, 'shumo_v110_callout_light.png'))
    await applyTheme(win, 'dark')
    await paint(win)
    await shot(win, path.join(shotDir, 'shumo_v110_callout_dark.png'))
    await applyTheme(win, 'light')
    win.setContentSize(480, 820)
    await pause(280)
    await win.webContents.executeJavaScript(`document.querySelector('.markdown-alert-example')?.scrollIntoView({ block: 'start', behavior: 'auto' })`)
    await paint(win)
    const calloutFit = await win.webContents.executeJavaScript(`(() => {
      const example = document.querySelector('.markdown-alert-example')
      const info = document.querySelector('details.markdown-alert-info')
      const scroller = document.getElementById('scroller')
      return {
        exampleWidth: example?.getBoundingClientRect().width ?? 0,
        overflow: (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
        collapsed: !!info && info.open === false,
        summary: info?.querySelector('summary') ? true : false
      }
    })()`)
    report.calloutNarrow = calloutFit
    if (!calloutFit.collapsed || !calloutFit.summary || calloutFit.overflow > 2 || calloutFit.exampleWidth < 180) {
      throw new Error(`窄窗口提示块异常：${JSON.stringify(calloutFit)}`)
    }
    await shot(win, path.join(shotDir, 'shumo_v110_callout_narrow.png'))
    win.setContentSize(1440, 820)
    await pause(200)
    await win.webContents.executeJavaScript(`document.querySelector('.markdown-alert-example')?.scrollIntoView({ block: 'start', behavior: 'auto' })`)
    const toggled = await win.webContents.executeJavaScript(`(() => {
      const info = document.querySelector('details.markdown-alert-info')
      const summary = info?.querySelector('summary')
      if (!info || !summary) return { ok: false, reason: 'missing' }
      const before = info.open
      summary.click()
      const table = info.querySelector('table')
      const box = table?.getBoundingClientRect()
      return {
        ok: before === false && info.open === true && (box?.height ?? 0) > 8 && !!table,
        before,
        open: info.open,
        onclick: summary.getAttribute('onclick'),
        height: box?.height ?? 0
      }
    })()`)
    report.calloutToggle = toggled
    if (!toggled.ok || toggled.onclick) {
      throw new Error(`折叠信息块不能展开：${JSON.stringify(toggled)}`)
    }
    await paint(win)
    await shot(win, path.join(shotDir, 'shumo_v110_callout_open.png'))

    await exerciseSource(win, shotDir, report)

    await win.webContents.executeJavaScript(`document.getElementById('scroller').scrollTop = 480`)
    await pause(80)
    const before = await win.webContents.executeJavaScript(`({
      preview: document.getElementById('scroller').scrollTop,
      source: document.getElementById('source-pane').scrollTop,
      sourceHeight: document.getElementById('source-pane').scrollHeight,
      sync: window.shumoTest.syncLines()
    })`)
    if (Math.abs(before.sync.previewLine - before.sync.sourceLine) > 1.5) {
      throw new Error(`刷新前两侧没有对齐：${JSON.stringify(before.sync)}`)
    }
    const file = await win.webContents.executeJavaScript(`window.shumoBoot.files[0].path`)
    if (typeof file !== 'string') throw new Error('没有打开的文件路径')
    const ready = waitNext()
    fs.appendFileSync(file, '\n\n实时刷新段落：网格已更新。\n')
    await ready
    await pause(100)
    const after = await win.webContents.executeJavaScript(`({
      text: document.getElementById('doc').innerText.includes('网格已更新'),
      scroll: document.getElementById('scroller').scrollTop,
      source: document.getElementById('source-view')?.textContent.includes('网格已更新'),
      sourceScroll: document.getElementById('source-pane')?.scrollTop ?? 0,
      sourceOpen: document.getElementById('btn-source')?.getAttribute('aria-pressed')
    })`)
    report.reload = { before, after }
    if (!after.text || !after.source) throw new Error('实时刷新没有同时更新预览和源码')
    if (Math.abs(after.scroll - before.preview) > 80) {
      throw new Error(`滚动位置没有保住：${before.preview} -> ${after.scroll}`)
    }
    if (Math.abs(after.sourceScroll - before.source) > 40) {
      throw new Error(`源码滚动被重置：${before.source} -> ${after.sourceScroll}`)
    }
    const reloadedSync = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
    if (!reloadedSync.open || Math.abs(reloadedSync.previewLine - reloadedSync.sourceLine) > 1.5) {
      throw new Error(`刷新后两侧没有对齐：${JSON.stringify(reloadedSync)}`)
    }
    await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
    const sourceClosed = await win.webContents.executeJavaScript(`({
      pressed: document.getElementById('btn-source')?.getAttribute('aria-pressed'),
      hidden: document.getElementById('source-pane')?.hidden === true,
      label: document.getElementById('btn-source')?.textContent
    })`)
    if (sourceClosed.pressed !== 'false' || !sourceClosed.hidden || sourceClosed.label !== '源码') {
      throw new Error(`再次点击没有收起源码：${JSON.stringify(sourceClosed)}`)
    }

    await assertFluid(win, shotDir, report)
    await roundTripWelcome(win, shotDir, report)
    await exerciseScrollSync(win, shotDir, report)

    fs.writeFileSync(path.join(shotDir, 'selftest-report-v111.json'), JSON.stringify(report, null, 2))
    console.log('SELFTEST ok')
    finish(0)
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    fs.writeFileSync(path.join(shotDir, 'selftest-report-v111.json'), JSON.stringify({ ...report, error: message }, null, 2))
    console.error('SELFTEST fail', message)
    finish(1)
  }
}

function finish(code: number): void {
  process.exitCode = code
  app.exit(code)
  process.exit(code)
}

function assertLight(light: Stats): void {
  if (!light.chinese) throw new Error('没有渲染中文正文')
  if (!light.h1.includes('谱方法')) throw new Error(`标题异常：${light.h1}`)
  if (light.katex < 8) throw new Error(`公式太少：${light.katex}`)
  if (light.display < 3) throw new Error(`行间公式太少：${light.display}`)
  if (light.tables < 1) throw new Error('没有表格')
  if (light.tasks < 3) throw new Error('没有任务列表')
  if (light.footnotes < 1) throw new Error('没有脚注')
  if (light.mermaidSvg < 1 || (!light.mermaidText.includes('Chebyshev') && !light.mermaidText.includes('给定'))) {
    throw new Error(`Mermaid 未渲染：${light.mermaidSvg} ${light.mermaidText.slice(0, 80)}`)
  }
  if (light.code < 2 || !light.python) throw new Error('代码高亮缺失')
  if (!light.inlineCode) throw new Error('行内代码里的美元符号被当成了公式')
  if (light.scripts > 0 || light.escapedScript) throw new Error('文稿里出现了 script 标签')
  if (light.images.length < 1 || light.images[0]!.width <= 0) {
    throw new Error(`相对图片没有加载：${JSON.stringify(light.images)}`)
  }
  if (!light.images[0]!.src.startsWith('localimg:')) throw new Error(`图片地址未改写：${light.images[0]!.src}`)
  if (light.toc < 5) throw new Error(`目录太短：${light.toc}`)
  if (!light.active) throw new Error('目录没有当前章节')
  if (!light.welcomeHidden) throw new Error('带文件启动时仍显示了欢迎页')
  if (light.welcomeHidden && light.title.includes('把笔记读清楚')) throw new Error('标题不对')
  if (!light.katexFont) throw new Error('KaTeX 字体没有加载')
  if (!light.cjk) throw new Error(`中文字体不可用：${light.font}`)
  if (light.fontSize !== '14px') throw new Error(`正文字号不是 14px：${light.fontSize}`)
  if (light.lineHeight !== '22.4px') throw new Error(`行高不是 1.6：${light.lineHeight}`)
  if (light.padLeft !== '26px') throw new Error(`左右边距不是 26px：${light.padLeft}`)
  if (light.maxWidth !== 'none' && light.maxWidth !== '100%') {
    throw new Error(`正文被限制了宽度：${light.maxWidth}`)
  }
  if (light.h1Weight !== '600') throw new Error(`标题字重不是 600：${light.h1Weight}`)
  const border = Number.parseFloat(light.h1Border)
  if (!(border > 0.5 && border <= 1)) throw new Error(`一级标题没有底边：${light.h1Border}`)
  if (!light.frontmatter) throw new Error('文首信息没有渲染成表格')
  if (!light.alert) throw new Error('GitHub 提示块没有渲染')
  if (light.abstractTitle !== '一句话总结' || light.abstractMarker || !light.abstractMath) {
    throw new Error(`摘要块没有渲染：${light.abstractTitle} marker=${light.abstractMarker} math=${light.abstractMath}`)
  }
  if (!light.exampleTitle.includes('误差曲线') || light.exampleList < 2 || !light.infoCollapsed || !light.infoMath || !light.infoTable) {
    throw new Error(`示例或折叠信息块没有渲染：${JSON.stringify({
      exampleTitle: light.exampleTitle,
      exampleList: light.exampleList,
      infoCollapsed: light.infoCollapsed,
      infoMath: light.infoMath,
      infoTable: light.infoTable
    })}`)
  }
  if (!light.octicon) throw new Error('提示块没有使用上游 octicon')
  if (light.ceLiteral || light.katexError) throw new Error('mhchem 没有渲染到同一份 KaTeX')
  if (light.tabCount !== 1 || !light.tabClose) throw new Error('单篇文稿没有显示可关闭的窗口卡')
  if (!light.tabLabel.includes('谱方法')) throw new Error(`窗口卡标题不对：${light.tabLabel}`)
}

async function exercise(win: BrowserWindow, report: Record<string, unknown>): Promise<void> {
  await win.webContents.executeJavaScript(`window.shumoTest.openFind()`)
  await win.webContents.executeJavaScript(`window.shumoTest.search('Chebyshev')`)
  const hits = await win.webContents.executeJavaScript(`document.querySelectorAll('mark.search-hit').length`)
  report.search = hits
  if (typeof hits !== 'number' || hits < 1) throw new Error('文内查找没有命中 Chebyshev')
  await win.webContents.executeJavaScript(`window.shumoTest.closeFind()`)

  const jump = await win.webContents.executeJavaScript(`window.shumoTest.jumpToc('节点分布')`)
  report.jump = jump
  if (!jump || typeof jump !== 'object' || !(jump as { moved?: boolean }).moved) {
    throw new Error(`目录跳转失败：${JSON.stringify(jump)}`)
  }
}

async function applyTheme(win: BrowserWindow, theme: 'light' | 'dark'): Promise<void> {
  const current = await win.webContents.executeJavaScript(`document.documentElement.dataset.theme`)
  if (current === theme) return
  const pending = waitNext()
  const settings = updateSettings({ theme })
  win.webContents.send('settings', { settings, resolvedTheme: theme })
  await pending
}

async function stats(win: BrowserWindow): Promise<Stats> {
  return win.webContents.executeJavaScript(STATS_JS) as Promise<Stats>
}

async function paint(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await pause(200)
}

async function shot(win: BrowserWindow, file: string): Promise<void> {
  const image = await win.webContents.capturePage()
  fs.writeFileSync(file, image.toPNG())
  const size = image.getSize()
  console.log('SHOT', file, size.width, size.height)
  if (size.width < 300 || size.height < 300) throw new Error(`截图尺寸异常 ${size.width}x${size.height}`)
}

const LAYOUT_JS = `(() => {
  const doc = document.getElementById('doc')
  const scroller = document.getElementById('scroller')
  const widest = (selector) => [...(doc?.querySelectorAll(selector) ?? [])].sort((a, b) => b.scrollWidth - a.scrollWidth)[0]
  const img = doc?.querySelector('img')
  const svg = doc?.querySelector('.mermaid-block svg')
  const table = widest('.table-wrap')
  const pre = widest('pre.hljs')
  const math = widest('.katex-display')
  const link = [...(doc?.querySelectorAll('a') ?? [])].sort((a, b) => (b.textContent || '').length - (a.textContent || '').length)[0]
  const viewBox = svg?.viewBox?.baseVal
  const svgBox = svg?.getBoundingClientRect()
  const font = document.getElementById('btn-font-inc')?.getBoundingClientRect()
  const sourceBtn = document.getElementById('btn-source')?.getBoundingClientRect()
  const openBtn = document.getElementById('btn-open')?.getBoundingClientRect()
  const brand = document.querySelector('.brand')?.getBoundingClientRect()
  const tocBtn = document.getElementById('btn-toc')?.getBoundingClientRect()
  return {
    innerWidth: window.innerWidth,
    fontSize: getComputedStyle(doc || document.body).fontSize,
    docWidth: doc?.getBoundingClientRect().width ?? 0,
    pageOverflow: (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
    imgWidth: img?.getBoundingClientRect().width ?? 0,
    imgNatural: img?.naturalWidth ?? 0,
    svgWidth: svgBox?.width ?? 0,
    svgHeight: svgBox?.height ?? 0,
    svgRatio: svgBox && svgBox.height ? svgBox.width / svgBox.height : 0,
    boxRatio: viewBox && viewBox.height ? viewBox.width / viewBox.height : 0,
    viewBoxWidth: viewBox?.width ?? 0,
    tableClient: table?.clientWidth ?? 0,
    tableScroll: table?.scrollWidth ?? 0,
    preClient: pre?.clientWidth ?? 0,
    preScroll: pre?.scrollWidth ?? 0,
    mathClient: math?.clientWidth ?? 0,
    mathScroll: math?.scrollWidth ?? 0,
    linkWidth: link?.getBoundingClientRect().width ?? 0,
    layout: document.documentElement.dataset.layout || '',
    drawer: document.documentElement.dataset.drawer || '',
    scrollTop: scroller?.scrollTop ?? 0,
    render: doc?.dataset.render || '',
    fontRight: font?.right ?? 0,
    fontVisible: !!font && font.width > 8 && font.right <= window.innerWidth + 1 && font.bottom > 0,
    columns: getComputedStyle(document.querySelector('.workspace') || document.body).gridTemplateColumns,
    sourceLabel: document.getElementById('btn-source')?.textContent ?? '',
    sourceRight: sourceBtn?.right ?? 0,
    openRight: openBtn?.right ?? 0,
    toolbarFits: !!sourceBtn && !!openBtn && sourceBtn.width > 8 && openBtn.width > 8 && sourceBtn.left >= 0 && openBtn.right <= window.innerWidth + 1 && sourceBtn.top >= 0 && openBtn.bottom < 80,
    brandRight: brand?.right ?? 0,
    tocLeft: tocBtn?.left ?? 0
  }
})()`

async function exerciseSource(win: BrowserWindow, shotDir: string, report: Record<string, unknown>): Promise<void> {
  await applyTheme(win, 'light')
  win.setContentSize(1440, 820)
  await pause(200)
  await win.webContents.executeJavaScript(`document.getElementById('scroller').scrollTop = 0`)
  const file = await win.webContents.executeJavaScript(`window.shumoBoot.files[0].path`)
  if (typeof file !== 'string') throw new Error('没有打开的文件路径')
  const disk = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
  await paint(win)
  const opened = await win.webContents.executeJavaScript(`(() => {
    const view = document.getElementById('source-view')
    const pane = document.getElementById('source-pane')
    const preview = document.getElementById('scroller')
    const previewBox = preview.getBoundingClientRect()
    const sourceBox = pane.getBoundingClientRect()
    return {
      label: document.getElementById('btn-source')?.textContent,
      pressed: document.getElementById('btn-source')?.getAttribute('aria-pressed'),
      hidden: pane.hidden,
      children: view.children.length,
      whiteSpace: getComputedStyle(view).whiteSpace,
      text: view.textContent,
      previewLeft: previewBox.left,
      sourceLeft: sourceBox.left,
      previewRight: previewBox.right,
      sourceRight: sourceBox.right
    }
  })()`)
  if (opened.label !== '源码' || opened.pressed !== 'true' || opened.hidden || opened.children !== 0 || opened.whiteSpace !== 'pre') {
    throw new Error(`源码窗格没有打开：${JSON.stringify({ ...opened, text: opened.text?.slice?.(0, 40) })}`)
  }
  if (opened.text !== disk) throw new Error(`源码与原文不一致：${opened.text?.length} vs ${disk.length}`)
  if (!opened.text.includes('title: 谱方法笔记') || !opened.text.includes('> [!example]') || !opened.text.includes('> [!info]-')) {
    throw new Error('源码缺少原文中的 YAML 或提示块标记')
  }
  if (!(opened.previewRight <= opened.sourceLeft + 2) || !(opened.previewLeft < opened.sourceLeft)) {
    throw new Error(`源码没有在预览右侧：${opened.previewRight} / ${opened.sourceLeft}`)
  }
  await shot(win, path.join(shotDir, 'shumo_v110_source_light.png'))

  const split = await win.webContents.executeJavaScript(`(() => {
    const reader = document.getElementById('reader')
    const split = document.getElementById('source-split')
    const preview = () => document.getElementById('scroller').getBoundingClientRect().width
    const source = () => document.getElementById('source-pane').getBoundingClientRect().width
    const box = reader.getBoundingClientRect()
    const drag = (x) => {
      const init = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: x, clientY: box.top + 20 }
      split.dispatchEvent(new PointerEvent('pointerdown', init))
      split.dispatchEvent(new PointerEvent('pointermove', init))
      split.dispatchEvent(new PointerEvent('pointerup', init))
    }
    drag(box.left + box.width * 0.36)
    const mid = { preview: preview(), source: source(), now: split.getAttribute('aria-valuenow') }
    drag(box.left - 600)
    const left = { preview: preview(), source: source() }
    const stuck = preview()
    split.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, button: 0, clientX: box.right, clientY: box.top + 20 }))
    const afterRelease = preview()
    drag(box.right + 600)
    const right = { preview: preview(), source: source() }
    const beforeKey = Number(split.getAttribute('aria-valuenow'))
    split.focus()
    split.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
    const afterLeft = Number(split.getAttribute('aria-valuenow'))
    split.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', shiftKey: true }))
    const afterRight = Number(split.getAttribute('aria-valuenow'))
    drag(box.left + box.width * 0.42)
    return {
      mid, left, right, beforeKey, afterLeft, afterRight, afterRelease, stuck,
      stored: localStorage.getItem('shumo.sourceRatio'),
      reader: box.width
    }
  })()`)
  report.sourceSplit = split
  const stored = Number(split.stored)
  if (split.left.preview < 100 || split.left.preview > 150 || split.left.source < 200) {
    throw new Error(`分隔拖到左端没有停住：${JSON.stringify(split.left)}`)
  }
  if (split.right.source < 100 || split.right.source > 150 || split.right.preview < 200) {
    throw new Error(`分隔拖到右端没有停住：${JSON.stringify(split.right)}`)
  }
  if (split.afterRelease !== split.stuck) throw new Error('松开后分隔仍在跟随指针')
  if (!(split.afterLeft < split.beforeKey) || !(split.afterRight > split.afterLeft)) {
    throw new Error(`方向键没有调整分隔：${split.beforeKey} -> ${split.afterLeft} -> ${split.afterRight}`)
  }
  if (!Number.isFinite(stored) || stored < 0.15 || stored > 0.85) {
    throw new Error(`分隔比例没有记住：${split.stored}`)
  }
  await paint(win)
  await shot(win, path.join(shotDir, 'shumo_v110_source_split.png'))
  await applyTheme(win, 'dark')
  await paint(win)
  await shot(win, path.join(shotDir, 'shumo_v110_source_dark.png'))
  await applyTheme(win, 'light')

  win.setContentSize(480, 820)
  await pause(280)
  const narrow = await win.webContents.executeJavaScript(`(() => {
    const scroller = document.getElementById('scroller')
    const reader = document.getElementById('reader')
    const sourceBtn = document.getElementById('btn-source').getBoundingClientRect()
    const openBtn = document.getElementById('btn-open').getBoundingClientRect()
    const preview = scroller.getBoundingClientRect().width
    const source = document.getElementById('source-pane').getBoundingClientRect().width
    return {
      overflow: scroller.scrollWidth - scroller.clientWidth,
      readerOverflow: reader.scrollWidth - reader.clientWidth,
      preview, source,
      sourceRight: sourceBtn.right,
      openRight: openBtn.right,
      innerWidth: window.innerWidth,
      pressed: document.getElementById('btn-source').getAttribute('aria-pressed')
    }
  })()`)
  report.sourceNarrow = narrow
  if (narrow.overflow > 2 || narrow.readerOverflow > 2 || narrow.preview < 100 || narrow.source < 100) {
    throw new Error(`窄窗口源码窗格溢出：${JSON.stringify(narrow)}`)
  }
  if (narrow.openRight > narrow.innerWidth + 1 || narrow.sourceRight > narrow.innerWidth + 1 || narrow.pressed !== 'true') {
    throw new Error(`窄窗口工具栏被挤出：${JSON.stringify(narrow)}`)
  }
  await paint(win)
  await shot(win, path.join(shotDir, 'shumo_v110_source_narrow.png'))

  win.setContentSize(1440, 820)
  await pause(200)
  await win.webContents.executeJavaScript(`(() => {
    const pane = document.getElementById('source-pane')
    pane.scrollTop = 160
  })()`)
  await pause(40)
}

async function assertFluid(win: BrowserWindow, shotDir: string, report: Record<string, unknown>): Promise<void> {
  await win.webContents.executeJavaScript(`(() => {
    const heading = document.getElementById('窄窗口')
    heading?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })()`)
  await pause(120)
  const before = await win.webContents.executeJavaScript(`({
    render: document.getElementById('doc').dataset.render,
    scroll: document.getElementById('scroller').scrollTop
  })`)
  const samples: Array<LayoutBox & { theme: string; requested: number }> = []
  for (const requested of [1440, 1000, 700, 480]) {
    win.setContentSize(requested, 820)
    await pause(280)
    await applyTheme(win, 'light')
    await pause(80)
    const light = (await win.webContents.executeJavaScript(LAYOUT_JS)) as LayoutBox
    assertLayout(light, requested)
    samples.push({ theme: 'light', requested, ...light })
    await shot(win, path.join(shotDir, `shumo_v110_w${requested}_light.png`))
    await applyTheme(win, 'dark')
    await pause(160)
    const dark = (await win.webContents.executeJavaScript(LAYOUT_JS)) as LayoutBox
    assertLayout(dark, requested)
    samples.push({ theme: 'dark', requested, ...dark })
    await shot(win, path.join(shotDir, `shumo_v110_w${requested}_dark.png`))
    await applyTheme(win, 'light')
  }
  win.setContentSize(480, 820)
  await pause(200)
  await win.webContents.executeJavaScript(`document.querySelector('.mermaid-block')?.scrollIntoView({ block: 'center', behavior: 'auto' })`)
  await pause(150)
  await shot(win, path.join(shotDir, 'shumo_v110_w480_diagram.png'))
  const after = await win.webContents.executeJavaScript(`({
    render: document.getElementById('doc').dataset.render,
    scroll: document.getElementById('scroller').scrollTop,
    text: document.getElementById('doc').innerText.includes('chebyshev-differentiation-matrix')
  })`)
  if (!before?.render || before.render !== after.render) {
    throw new Error(`改变窗口时重新渲染了正文：${before?.render} -> ${after.render}`)
  }
  if (!after.text) throw new Error('窄窗口示例在缩放后丢失')
  if (before.scroll > 80 && after.scroll < 20) {
    throw new Error(`缩放后滚动被重置：${before.scroll} -> ${after.scroll}`)
  }
  const lightWidths = samples.filter((item) => item.theme === 'light').map((item) => item.docWidth)
  for (let i = 1; i < lightWidths.length; i += 1) {
    if (lightWidths[i]! >= lightWidths[i - 1]! - 1) {
      throw new Error(`正文没有随窗口变窄：${lightWidths.join(' -> ')}`)
    }
  }
  report.fluid = samples.map((item) => ({
    theme: item.theme,
    requested: item.requested,
    innerWidth: item.innerWidth,
    fontSize: item.fontSize,
    docWidth: Math.round(item.docWidth),
    pageOverflow: item.pageOverflow,
    imgWidth: Math.round(item.imgWidth),
    svg: `${Math.round(item.svgWidth)}x${Math.round(item.svgHeight)}`,
    table: `${item.tableClient}/${item.tableScroll}`,
    code: `${item.preClient}/${item.preScroll}`,
    math: `${item.mathClient}/${item.mathScroll}`,
    linkWidth: Math.round(item.linkWidth),
    layout: item.layout,
    drawer: item.drawer,
    fontVisible: item.fontVisible
  }))
  report.resize = { before, after }
}

const TOOLBAR_JS = `(() => {
  const brand = document.querySelector('.brand').getBoundingClientRect()
  const open = document.getElementById('btn-open').getBoundingClientRect()
  const toc = document.getElementById('btn-toc').getBoundingClientRect()
  const scroller = document.getElementById('scroller')
  const panel = document.querySelector('.welcome-panel')
  const columns = panel ? getComputedStyle(panel).gridTemplateColumns : ''
  const recent = document.querySelector('.recent-item')
  return {
    innerWidth: window.innerWidth,
    brandRight: brand.right,
    openRight: open.right,
    tocLeft: toc.left,
    overflow: (scroller?.scrollWidth ?? 0) - (scroller?.clientWidth ?? 0),
    panelWidth: panel?.getBoundingClientRect().width ?? 0,
    columns: columns.split(' ').filter(Boolean).length,
    recentTitle: recent?.querySelector('.recent-name')?.textContent ?? '',
    recentPath: recent?.querySelector('.recent-hint')?.textContent ?? '',
    recentTip: recent?.getAttribute('title') ?? ''
  }
})()`

function assertToolbarAligned(box: { innerWidth: number; openRight: number; tocLeft: number; brandRight: number; overflow: number }, where: string): void {
  if (box.openRight < box.innerWidth - 22 || box.openRight > box.innerWidth + 1) {
    throw new Error(`${where} 打开按钮没有靠右：${Math.round(box.openRight)} / ${box.innerWidth}`)
  }
  if (box.tocLeft < box.brandRight + 8) {
    throw new Error(`${where} 工具栏贴在名称后面：${Math.round(box.tocLeft)} / ${Math.round(box.brandRight)}`)
  }
  if (box.overflow > 2) throw new Error(`${where} 欢迎页横向溢出 ${box.overflow}px`)
}

async function roundTripWelcome(win: BrowserWindow, shotDir: string, report: Record<string, unknown>): Promise<void> {
  await applyTheme(win, 'light')
  win.setContentSize(1440, 820)
  await win.webContents.executeJavaScript(`document.getElementById('scroller').scrollTop = 0`)
  await pause(150)
  const documentBar = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(documentBar, '文稿宽窗')
  await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
  await pause(40)
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  await pause(80)
  const home = await win.webContents.executeJavaScript(`(() => {
    const brand = document.getElementById('btn-home')
    return {
      welcome: document.getElementById('welcome')?.hidden === false,
      tabs: document.querySelectorAll('#tabs .tab').length,
      selected: document.querySelectorAll('#tabs .tab.active').length,
      docHidden: document.getElementById('doc')?.hidden === true,
      docText: document.getElementById('doc')?.innerText ?? '',
      sourceDisabled: document.getElementById('btn-source')?.disabled === true,
      sourcePressed: document.getElementById('btn-source')?.getAttribute('aria-pressed'),
      sourceHidden: document.getElementById('source-pane')?.hidden === true,
      sourceText: document.getElementById('source-view')?.textContent ?? '',
      finderHidden: document.getElementById('finder')?.hidden === true,
      tocLinks: document.querySelectorAll('#toc a').length,
      label: brand?.getAttribute('aria-label'),
      title: brand?.getAttribute('title'),
      tag: brand?.tagName,
      region: getComputedStyle(brand).webkitAppRegion || getComputedStyle(brand).getPropertyValue('-webkit-app-region')
    }
  })()`)
  report.home = home
  if (!home.welcome || home.tabs !== 1 || home.selected !== 0 || !home.docHidden || home.docText.includes('谱方法') || !home.sourceDisabled || home.sourcePressed !== 'false' || !home.sourceHidden || home.sourceText !== '' || !home.finderHidden || home.tocLinks !== 0) {
    throw new Error(`返回首页没有保留标签：${JSON.stringify(home)}`)
  }
  if (home.label !== '返回首页' || home.title !== '返回首页' || home.tag !== 'BUTTON' || home.region !== 'no-drag') {
    throw new Error(`首页按钮不可用：${JSON.stringify(home)}`)
  }
  const homeBar = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(homeBar, '首页宽窗')
  if (Math.abs(homeBar.openRight - documentBar.openRight) > 2) {
    throw new Error(`回首页后工具栏跳动：文稿 ${documentBar.openRight} 首页 ${homeBar.openRight}`)
  }
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  const homeAgain = await win.webContents.executeJavaScript(`document.querySelectorAll('#tabs .tab').length === 1 && document.getElementById('welcome')?.hidden === false`)
  if (!homeAgain) throw new Error('再次点击首页改动了文稿')
  await shot(win, path.join(shotDir, 'shumo_v110_home.png'))
  await applyTheme(win, 'dark')
  await pause(160)
  const homeDark = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(homeDark, '首页深色')
  await shot(win, path.join(shotDir, 'shumo_v110_home_dark.png'))
  await applyTheme(win, 'light')
  win.setContentSize(480, 820)
  await pause(280)
  const homeNarrow = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(homeNarrow, '首页窄窗')
  await shot(win, path.join(shotDir, 'shumo_v110_home_narrow.png'))
  win.setContentSize(1440, 820)
  await pause(200)
  await applyTheme(win, 'light')
  const backFromTab = waitNext()
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab-name').click()`)
  await backFromTab
  await pause(120)
  const restored = await win.webContents.executeJavaScript(`({
    welcomeHidden: document.getElementById('welcome')?.hidden === true,
    text: document.body.innerText.includes('谱方法'),
    selected: document.querySelector('#tabs .tab.active .tab-name')?.textContent ?? '',
    sourcePressed: document.getElementById('btn-source')?.getAttribute('aria-pressed')
  })`)
  if (!restored.welcomeHidden || !restored.text || !String(restored.selected).includes('谱方法') || restored.sourcePressed !== 'false') {
    throw new Error(`从首页点标签没有回到预览：${JSON.stringify(restored)}`)
  }
  await shot(win, path.join(shotDir, 'shumo_v110_home_back.png'))
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  await pause(80)
  const backFromRecent = waitNext()
  const recentClicked = await win.webContents.executeJavaScript(`(() => {
    const item = document.querySelector('.recent-item')
    if (!item) return false
    item.click()
    return true
  })()`)
  if (!recentClicked) throw new Error('首页没有最近文稿')
  await backFromRecent
  await pause(120)
  const fromRecent = await win.webContents.executeJavaScript(`document.getElementById('welcome')?.hidden === true && document.body.innerText.includes('谱方法')`)
  if (!fromRecent) throw new Error('从首页点最近文稿没有回到预览')
  const welcomeReady = waitNext()
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab.active .tab-x').click()`)
  await welcomeReady
  const welcome = await win.webContents.executeJavaScript(`({
    visible: document.getElementById('welcome')?.hidden === false,
    text: document.body.innerText.includes('把笔记读清楚'),
    tabs: document.querySelectorAll('#tabs .tab').length,
    docHidden: document.getElementById('doc')?.hidden === true,
    sourceEmpty: document.getElementById('source-view')?.textContent === '',
    sourceHidden: document.getElementById('source-pane')?.hidden === true,
    sourceDisabled: document.getElementById('btn-source')?.disabled === true,
    sourcePressed: document.getElementById('btn-source')?.getAttribute('aria-pressed')
  })`)
  report.welcome = welcome
  if (!welcome.visible || !welcome.text || welcome.tabs !== 0 || !welcome.docHidden || !welcome.sourceEmpty || !welcome.sourceHidden || !welcome.sourceDisabled || welcome.sourcePressed !== 'false') {
    throw new Error(`关闭最后一篇没有回到欢迎页：${JSON.stringify(welcome)}`)
  }
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await pause(250)
  const welcomeBar = await win.webContents.executeJavaScript(TOOLBAR_JS)
  report.toolbar = { document: documentBar, welcome: welcomeBar }
  assertToolbarAligned(welcomeBar, '欢迎页宽窗')
  if (Math.abs(welcomeBar.openRight - documentBar.openRight) > 2) {
    throw new Error(`关闭文稿后工具栏跳动：文稿 ${documentBar.openRight} 欢迎 ${welcomeBar.openRight}`)
  }
  if (welcomeBar.columns < 2 || welcomeBar.panelWidth < 700) {
    throw new Error(`宽窗欢迎页仍然挤在中间：${welcomeBar.panelWidth} / ${welcomeBar.columns}`)
  }
  if (!welcomeBar.recentTitle || !welcomeBar.recentPath || !welcomeBar.recentTip.includes('/')) {
    throw new Error(`最近文稿没有同时给出标题和路径：${JSON.stringify(welcomeBar)}`)
  }
  await shot(win, path.join(shotDir, 'shumo_v110_welcome.png'))
  await applyTheme(win, 'dark')
  await pause(180)
  const welcomeDark = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(welcomeDark, '欢迎页深色')
  await shot(win, path.join(shotDir, 'shumo_v110_welcome_dark.png'))
  await applyTheme(win, 'light')
  win.setContentSize(480, 820)
  await pause(280)
  const welcomeNarrow = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(welcomeNarrow, '欢迎页窄窗')
  if (welcomeNarrow.columns !== 1 || welcomeNarrow.panelWidth < welcomeNarrow.innerWidth * 0.7) {
    throw new Error(`窄窗欢迎页没有铺开：${JSON.stringify(welcomeNarrow)}`)
  }
  await shot(win, path.join(shotDir, 'shumo_v110_welcome_narrow.png'))
  await applyTheme(win, 'light')
  win.setContentSize(1440, 820)
  await pause(200)
  const reopenReady = waitNext()
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const item = document.querySelector('.recent-item')
    if (!item) return false
    item.click()
    return true
  })()`)
  if (!clicked) throw new Error('欢迎页没有最近文稿，无法重新打开')
  await reopenReady
  await pause(200)
  const back = await win.webContents.executeJavaScript(`({
    welcomeHidden: document.getElementById('welcome')?.hidden === true,
    text: document.body.innerText.includes('谱方法'),
    tabs: document.querySelectorAll('#tabs .tab').length,
    label: document.querySelector('#tabs .tab.active .tab-name')?.textContent ?? '',
    sourcePressed: document.getElementById('btn-source')?.getAttribute('aria-pressed'),
    sourceDisabled: document.getElementById('btn-source')?.disabled === true,
    sourceHidden: document.getElementById('source-pane')?.hidden === true,
    sourceText: document.getElementById('source-view')?.textContent.includes('title: 谱方法笔记')
  })`)
  report.reopen = back
  if (!back.welcomeHidden || !back.text || back.tabs !== 1 || !String(back.label).includes('谱方法') || back.sourcePressed !== 'false' || back.sourceDisabled || !back.sourceHidden || !back.sourceText) {
    throw new Error(`从欢迎页重新打开失败：${JSON.stringify(back)}`)
  }
  await win.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await pause(250)
  const reopenedBar = await win.webContents.executeJavaScript(TOOLBAR_JS)
  assertToolbarAligned(reopenedBar, '重新打开')
  if (Math.abs(reopenedBar.openRight - welcomeBar.openRight) > 2) {
    throw new Error(`重新打开后工具栏跳动：欢迎 ${welcomeBar.openRight} 文稿 ${reopenedBar.openRight}`)
  }
  report.toolbarReopen = reopenedBar
  await shot(win, path.join(shotDir, 'shumo_v110_reopen.png'))
}

function assertLayout(box: LayoutBox, requested: number): void {
  const where = `${requested}/${box.innerWidth}`
  if (Math.abs(box.innerWidth - requested) > 80) {
    throw new Error(`窗口没有缩到 ${requested}：实际 ${box.innerWidth}`)
  }
  if (box.fontSize !== '14px') throw new Error(`${where} 字号变了：${box.fontSize}`)
  if (box.pageOverflow > 2) throw new Error(`${where} 整页横向溢出 ${box.pageOverflow}px`)
  if (box.docWidth < box.innerWidth * 0.55) {
    throw new Error(`${where} 正文太窄：${Math.round(box.docWidth)}`)
  }
  if (!box.fontVisible || box.fontRight > box.innerWidth + 1) {
    throw new Error(`${where} 字号按钮不可用`)
  }
  if (box.sourceLabel !== '源码' || !box.toolbarFits) {
    throw new Error(`${where} 工具栏被挤出窗口：源码 ${box.sourceRight} 打开 ${box.openRight}`)
  }
  if (box.openRight < box.innerWidth - 22 || box.tocLeft < box.brandRight + 8) {
    throw new Error(`${where} 工具栏没有靠右：打开 ${Math.round(box.openRight)} 目录 ${Math.round(box.tocLeft)} 名称 ${Math.round(box.brandRight)}`)
  }
  if (box.imgWidth > box.docWidth + 1) throw new Error(`${where} 图片超出正文 ${box.imgWidth}`)
  if (box.imgNatural > box.docWidth + 8 && box.imgWidth < box.docWidth - 28) {
    throw new Error(`${where} 图片没有缩进正文 ${Math.round(box.imgWidth)} / ${Math.round(box.docWidth)}`)
  }
  if (box.svgWidth > box.docWidth + 1 || box.svgWidth < 40 || box.svgHeight < 40) {
    throw new Error(`${where} 流程图尺寸异常 ${box.svgWidth}x${box.svgHeight}`)
  }
  if (box.viewBoxWidth > 0 && box.svgWidth > box.viewBoxWidth + 8) {
    throw new Error(`${where} 流程图被放大了 ${Math.round(box.svgWidth)} > ${Math.round(box.viewBoxWidth)}`)
  }
  if (box.viewBoxWidth > box.docWidth + 8 && box.svgWidth < box.docWidth - 28) {
    throw new Error(`${where} 流程图没有缩进正文 ${Math.round(box.svgWidth)} / ${Math.round(box.docWidth)}`)
  }
  if (box.boxRatio > 0 && Math.abs(box.svgRatio - box.boxRatio) / box.boxRatio > 0.12) {
    throw new Error(`${where} 流程图纵横比变了 ${box.svgRatio.toFixed(3)} vs ${box.boxRatio.toFixed(3)}`)
  }
  if (box.linkWidth > box.docWidth + 1) throw new Error(`${where} 长链接撑出正文 ${Math.round(box.linkWidth)}`)
  if (box.preClient > box.docWidth + 1) throw new Error(`${where} 代码块超出正文`)
  if (box.mathClient > box.docWidth + 1) throw new Error(`${where} 公式块超出正文`)
  if (box.tableClient > box.docWidth + 1) throw new Error(`${where} 表格超出正文`)
  if (box.innerWidth <= 759) {
    if (box.layout !== 'narrow') throw new Error(`${where} 窄窗布局未生效：${box.layout}`)
    if (box.drawer === 'open') throw new Error(`${where} 目录抽屉盖住了正文`)
    if (box.preScroll <= box.preClient + 8) {
      throw new Error(`${where} 长代码没有在代码块内滚动 ${box.preScroll}/${box.preClient}`)
    }
    if (box.mathScroll <= box.mathClient + 8) {
      throw new Error(`${where} 长公式没有在公式块内滚动 ${box.mathScroll}/${box.mathClient}`)
    }
    if (box.innerWidth <= 520 && box.tableScroll <= box.tableClient + 8) {
      throw new Error(`${where} 宽表格没有在表格内滚动 ${box.tableScroll}/${box.tableClient}`)
    }
  } else if (box.layout !== 'wide') {
    throw new Error(`${where} 宽窗布局未生效：${box.layout} ${box.columns}`)
  }
}

function longScrollDoc(): string {
  const parts = ['# 长文滚动对照\n\n打开源码后，左侧预览和右侧原文按同一行对齐。\n']
  for (let i = 1; i <= 18; i += 1) {
    parts.push(`\n## 第 ${i} 节\n\n`)
    parts.push(`第 ${i} 节从这一行开始。未知量 $u_{${i}}(x)$ 满足下面的估计。\n\n`)
    parts.push(`$$\n\\|e_{${i}}\\| \\le C_{${i}} e^{-${i} N}.\n$$\n\n`)
    parts.push('```python\n')
    for (let k = 0; k < 12; k += 1) parts.push(`term_${i}_${k} = ${i * 10 + k}\n`)
    parts.push('```\n\n')
    parts.push(`![第 ${i} 节的节点](figures/nodes.svg)\n\n`)
    if (i % 4 === 0) {
      parts.push(`> [!note]- 折叠的第 ${i} 节\n>\n> 收起时公式 $a_{${i}}$ 不占高度。\n>\n> | 项 | 值 |\n> | --- | --- |\n> | ${i} | ${i * i} |\n\n`)
    }
    if (i % 6 === 0) parts.push('```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```\n\n')
  }
  parts.push('\n## 文末\n\n最后一行用来确认滚到后段时仍落在同一段。\n')
  return parts.join('')
}

async function exerciseScrollSync(win: BrowserWindow, shotDir: string, report: Record<string, unknown>): Promise<void> {
  await applyTheme(win, 'light')
  win.setContentSize(1440, 860)
  await pause(200)
  const samplePath = await win.webContents.executeJavaScript(`window.shumoBoot.files[0].path`)
  if (typeof samplePath !== 'string' || !samplePath.endsWith('.md')) throw new Error('没有可对照的文稿路径')
  const scrollPath = path.join(path.dirname(samplePath), 'scroll.md')
  fs.writeFileSync(scrollPath, longScrollDoc())
  const ready = waitNext()
  await win.webContents.executeJavaScript(`window.shumo.openRelative(${JSON.stringify(samplePath)}, 'scroll.md')`)
  await ready
  await pause(400)
  const loaded = await win.webContents.executeJavaScript(`({
    title: document.body.innerText.includes('长文滚动对照'),
    math: document.querySelectorAll('.katex-display').length,
    images: document.querySelectorAll('#doc img').length,
    folded: document.querySelectorAll('details.markdown-alert').length,
    mermaid: document.querySelectorAll('.mermaid-block').length,
    code: document.querySelectorAll('pre.hljs').length,
    lines: document.querySelectorAll('#doc [data-line]').length
  })`)
  if (!loaded.title || loaded.math < 10 || loaded.images < 10 || loaded.folded < 2 || loaded.mermaid < 1 || loaded.code < 10 || loaded.lines < 20) {
    throw new Error(`长文没有渲染完整：${JSON.stringify(loaded)}`)
  }
  await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
  await paint(win)
  const opened = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
  if (!opened.open || Math.abs(opened.previewLine - opened.sourceLine) > 1.5) {
    throw new Error(`打开源码时没有跟到预览位置：${JSON.stringify(opened)}`)
  }

  const places = [
    { name: 'top', heading: '第 1 节' },
    { name: 'mid', heading: '第 9 节' },
    { name: 'low', heading: '第 16 节' }
  ]
  const samples: unknown[] = []
  for (const place of places) {
    const park = `(() => {
      const heading = [...document.querySelectorAll('#doc h2')].find((node) => (node.textContent || '').trim() === ${JSON.stringify(place.heading)})
      const scroller = document.getElementById('scroller')
      if (!heading) return null
      const top = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      scroller.scrollTop = top
      return Number(heading.getAttribute('data-line'))
    })()`
    if ((await win.webContents.executeJavaScript(park)) == null) throw new Error(`找不到${place.heading}`)
    await paint(win)
    const moved = await win.webContents.executeJavaScript(park)
    if (typeof moved !== 'number') throw new Error(`找不到${place.heading}`)
    await pause(80)
    const sync = await win.webContents.executeJavaScript(`(() => {
      const sync = window.shumoTest.syncLines()
      const scroller = document.getElementById('scroller')
      const pane = document.getElementById('source-pane')
      const view = document.getElementById('source-view')
      const y = scroller.getBoundingClientRect().top + 8
      const nodes = [...document.querySelectorAll('#doc [data-line]')].filter((el) => {
        if (!el.getClientRects().length || el.getBoundingClientRect().height < 1) return false
        const closed = el.closest('details:not([open])')
        return !closed || closed === el
      })
      let block = null
      for (const el of nodes) {
        const box = el.getBoundingClientRect()
        if (box.top <= y && box.bottom > y) { block = el; break }
      }
      const node = view.firstChild
      const text = node && node.textContent ? node.textContent : ''
      const target = pane.getBoundingClientRect().top + 4
      const range = document.createRange()
      let lo = 0
      let hi = text.length
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        range.setStart(node, Math.min(mid, text.length))
        range.setEnd(node, Math.min(text.length, mid + 1))
        if (range.getBoundingClientRect().top <= target) lo = mid
        else hi = mid - 1
      }
      const sourceLine = text.slice(0, lo).split('\\n').length - 1
      const heading = [...document.querySelectorAll('#doc h2')].find((node) => (node.textContent || '').trim() === ${JSON.stringify(place.heading)})
      const gap = heading ? heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null
      return { sync, blockLine: block ? Number(block.getAttribute('data-line')) : null, sourceLine, gap }
    })()`)
    samples.push({ place: place.name, headingLine: moved, ...sync })
    if (Math.abs(sync.sync.previewLine - sync.sync.sourceLine) > 1.5) {
      throw new Error(`${place.heading} 同步行号差太多：${JSON.stringify(sync)}`)
    }
    if (sync.blockLine == null || Math.abs(sync.sourceLine - moved) > 2 || Math.abs(sync.blockLine - moved) > 2) {
      throw new Error(`${place.heading} 两侧顶部没有落在同一行：${JSON.stringify(sync)}`)
    }
    await shot(win, path.join(shotDir, `shumo_v111_sync_${place.name}.png`))
  }

  const code = await win.webContents.executeJavaScript(`(() => {
    const pre = document.querySelector('pre.hljs')
    const scroller = document.getElementById('scroller')
    const start = Number(pre.getAttribute('data-line'))
    const top = pre.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTop = top + pre.getBoundingClientRect().height * 0.55
    return { start, height: pre.getBoundingClientRect().height }
  })()`)
  await paint(win)
  const throughCode = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
  if (throughCode.previewLine <= code.start + 1 || throughCode.previewLine > code.start + 14) {
    throw new Error(`代码块内部没有按行插值：${JSON.stringify({ code, throughCode })}`)
  }
  if (Math.abs(throughCode.previewLine - throughCode.sourceLine) > 1.5) {
    throw new Error(`代码块中间两侧分开了：${JSON.stringify(throughCode)}`)
  }

  const fromSource = await win.webContents.executeJavaScript(`(() => {
    const pane = document.getElementById('source-pane')
    const before = pane.scrollTop
    pane.scrollTop = Math.min(pane.scrollHeight - pane.clientHeight, before + 640)
    return { before, after: pane.scrollTop }
  })()`)
  await paint(win)
  const sourceLed = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
  if (fromSource.after <= fromSource.before + 100 || Math.abs(sourceLed.previewLine - sourceLed.sourceLine) > 1.5) {
    throw new Error(`滚动源码没有带动预览：${JSON.stringify({ fromSource, sourceLed })}`)
  }

  const folded = await win.webContents.executeJavaScript(`(() => {
    const details = document.querySelector('details.markdown-alert')
    const scroller = document.getElementById('scroller')
    const line = Number(details.getAttribute('data-line'))
    const top = details.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    scroller.scrollTop = top
    const hidden = details.querySelector('table')
    const hiddenRect = hidden ? hidden.getClientRects().length : -1
    return { line, open: details.open, hiddenRect }
  })()`)
  await paint(win)
  const foldedSync = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
  // Chromium still reports a box for the table inside a closed details.
  // Alignment has to follow the details row, not that hidden table.
  if (folded.open || folded.hiddenRect < 1 || Math.abs(foldedSync.previewLine - folded.line) > 1.5 || Math.abs(foldedSync.sourceLine - folded.line) > 1.5) {
    throw new Error(`折叠提示块没有按自身行号对齐：${JSON.stringify({ folded, foldedSync })}`)
  }

  win.setContentSize(1020, 760)
  await pause(280)
  const resized = await win.webContents.executeJavaScript(`window.shumoTest.syncLines()`)
  if (Math.abs(resized.previewLine - resized.sourceLine) > 1.5) {
    throw new Error(`改变窗口后两侧分开了：${JSON.stringify(resized)}`)
  }
  win.setContentSize(1440, 860)
  await pause(240)

  await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
  await pause(40)
  const jump = await win.webContents.executeJavaScript(`(() => {
    const heading = [...document.querySelectorAll('#doc h2')].find((node) => node.textContent.includes('第 12 节'))
    const before = window.shumoTest.syncLines().previewLine
    const rect = heading.getBoundingClientRect()
    heading.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: rect.left + 12, clientY: rect.top + 10 }))
    return { line: Number(heading.getAttribute('data-line')), before }
  })()`)
  await paint(win)
  const jumped = await win.webContents.executeJavaScript(`(() => {
    const sync = window.shumoTest.syncLines()
    return { sync, pressed: document.getElementById('btn-source').getAttribute('aria-pressed') }
  })()`)
  // Opening the split reflows the column, so the preview pixel moves while
  // the source line stays put. The source should land on the heading.
  if (jumped.pressed !== 'true' || Math.abs(jumped.sync.sourceLine - jump.line) > 2 || Math.abs(jumped.sync.previewLine - jump.before) > 8) {
    throw new Error(`双击没有把源码跳到对应行：${JSON.stringify({ jump, jumped })}`)
  }

  report.scrollSync = { loaded, samples, throughCode, sourceLed, foldedSync, resized, jumped: jumped.sync }
}

function waitNext(timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待下一次渲染超时')), timeout)
    const onReady = (): void => {
      clearTimeout(timer)
      ipcMain.removeListener('content-ready', onReady)
      resolve()
    }
    ipcMain.on('content-ready', onReady)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
