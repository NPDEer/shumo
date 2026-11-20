import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { reloadPassesStarted, watchCount } from './files'
import { getSettings } from './settings'

export type LifecycleHooks = {
  createWindow: (files: string[]) => BrowserWindow
  openPaths: (win: BrowserWindow | null, paths: string[], explicit: boolean) => Promise<void>
}

export async function runLifecycleTest(hooks: LifecycleHooks): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shumo-lifecycle-'))
  const fileA = path.join(dir, '甲.md')
  const fileB = path.join(dir, '乙.md')
  fs.writeFileSync(fileA, '# 甲稿\n\n甲的正文。\n')
  fs.writeFileSync(fileB, '# 乙稿\n\n乙的正文。\n')

  let win = hooks.createWindow([fileA])
  await untilReady(win)
  await assertJs(win, `document.body.innerText.includes('甲的正文')`)
  await assertJs(
    win,
    `document.querySelectorAll('#tabs .tab').length === 1 && document.querySelector('#tabs .tab-x')?.getAttribute('aria-label')?.includes('甲稿')`
  )
  expectWatches(1, '打开文稿')

  win.webContents.send('menu', 'close-tab')
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === false && document.body.innerText.includes('把笔记读清楚') && document.querySelectorAll('#tabs .tab').length === 0`
  )
  await assertJs(
    win,
    `document.getElementById('btn-source')?.disabled === true && document.getElementById('btn-source')?.getAttribute('aria-pressed') === 'false' && document.getElementById('source-view')?.textContent === '' && document.getElementById('source-pane')?.hidden === true`
  )
  expectWindows(1, '关闭最后一篇')
  expectWatches(0, '关闭最后一篇')
  fs.appendFileSync(fileA, '\n关闭之后的写入。\n')
  await delay(500)
  expectWatches(0, '欢迎页上的写入')

  await hooks.openPaths(win, [fileA], true)
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === true && document.body.innerText.includes('甲的正文') && document.querySelectorAll('#tabs .tab').length === 1`
  )
  expectWatches(1, '从欢迎页重新打开')

  win.show()
  win.focus()
  win.webContents.focus()
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === false && document.querySelectorAll('#tabs .tab').length === 1 && document.querySelectorAll('#tabs .tab.active').length === 0 && document.getElementById('doc')?.hidden === true && document.getElementById('btn-source')?.disabled === true && document.getElementById('btn-home')?.getAttribute('aria-label') === '返回首页'`
  )
  expectWindows(1, '键盘返回首页')
  expectWatches(1, '键盘返回首页')
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  await assertJs(
    win,
    `document.getElementById('welcome')?.hidden === false && document.querySelectorAll('#tabs .tab').length === 1 && document.getElementById('source-view')?.textContent === ''`
  )
  await hooks.openPaths(win, [fileA], true)
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === true && document.body.innerText.includes('甲的正文') && document.querySelectorAll('#tabs .tab').length === 1 && document.querySelector('#tabs .tab.active')`
  )
  expectWatches(1, '从首页再打开同一篇')

  await hooks.openPaths(win, [fileB], true)
  await poll(win, `document.querySelectorAll('#tabs .tab').length === 2 && document.body.innerText.includes('乙的正文')`)
  expectWatches(2, '两个标签')
  await win.webContents.executeJavaScript(`document.getElementById('btn-source').click()`)
  await poll(
    win,
    `document.getElementById('btn-source')?.getAttribute('aria-pressed') === 'true' && document.getElementById('source-view')?.textContent === '# 乙稿\\n\\n乙的正文。\\n'`
  )
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab:not(.active) .tab-name').click()`)
  await poll(
    win,
    `document.getElementById('source-view')?.textContent.includes('# 甲稿') && !document.getElementById('source-view').textContent.includes('乙的正文')`
  )
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab:not(.active) .tab-name').click()`)
  await poll(
    win,
    `document.getElementById('source-view')?.textContent === '# 乙稿\\n\\n乙的正文。\\n' && document.body.innerText.includes('乙的正文')`
  )
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === false && document.querySelectorAll('#tabs .tab').length === 2 && document.querySelectorAll('#tabs .tab.active').length === 0 && document.getElementById('doc')?.hidden === true && document.getElementById('source-pane')?.hidden === true && document.getElementById('source-view')?.textContent === '' && document.getElementById('finder')?.hidden !== false && document.querySelectorAll('#toc a').length === 0`
  )
  expectWindows(1, '两篇时返回首页')
  expectWatches(2, '两篇时返回首页')
  await win.webContents.executeJavaScript(`document.getElementById('btn-home').click()`)
  await assertJs(
    win,
    `document.querySelectorAll('#tabs .tab').length === 2 && document.getElementById('welcome')?.hidden === false`
  )
  await win.webContents.executeJavaScript(`[...document.querySelectorAll('#tabs .tab-name')].find((button) => button.textContent.includes('乙稿')).click()`)
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === true && document.body.innerText.includes('乙的正文') && document.querySelector('#tabs .tab.active .tab-name')?.textContent.includes('乙稿')`
  )
  win.webContents.send('menu', 'close-tab')
  await poll(
    win,
    `document.querySelectorAll('#tabs .tab').length === 1 && document.body.innerText.includes('甲的正文') && document.getElementById('source-view')?.textContent.includes('# 甲稿') && !document.getElementById('source-view').textContent.includes('乙的正文')`
  )
  expectWindows(1, '关掉其中一个标签')
  expectWatches(1, '关掉其中一个标签')

  const passes = reloadPassesStarted()
  fs.appendFileSync(fileA, '\n甲的再追加。\n')
  await waitUntil(() => reloadPassesStarted() > passes, '延迟刷新没有开始')
  const closedInflight = whenClosed(win)
  win.close()
  await closedInflight
  await delay(800)
  expectWindows(0, '刷新过程中关闭窗口')
  expectWatches(0, '刷新过程中关闭窗口')

  app.emit('activate')
  win = onlyWindow('激活')
  await untilReady(win)
  await assertJs(win, `document.body.innerText.includes('把笔记读清楚')`)
  const closedWelcome = whenClosed(win)
  win.close()
  await closedWelcome
  expectWindows(0, '关掉欢迎窗口')

  app.emit('activate')
  win = onlyWindow('再次激活')
  await untilReady(win)
  await hooks.openPaths(win, [fileA, fileB], true)
  await poll(win, `document.querySelectorAll('#tabs .tab').length === 2`)
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab.active .tab-x').click()`)
  await poll(win, `document.querySelectorAll('#tabs .tab').length === 1 && document.body.innerText.includes('甲的正文')`)
  expectWindows(1, '点关闭按钮')
  await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab-x').click()`)
  await poll(
    win,
    `document.getElementById('welcome')?.hidden === false && document.querySelectorAll('#tabs .tab').length === 0 && document.getElementById('source-view')?.textContent === '' && document.getElementById('btn-source')?.disabled === true`
  )
  expectWindows(1, '点关闭按钮回到欢迎页')
  expectWatches(0, '点关闭按钮回到欢迎页')

  const realB = fs.realpathSync(fileB)
  const recentBefore = getSettings().recent.length
  if (!getSettings().recent.some((item) => item.path === realB)) throw new Error('乙稿没有记进最近打开')
  await assertJs(win, `document.querySelectorAll('#recent-list .recent-row').length === ${recentBefore}`)
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('#recent-list .recent-row')].find((row) => row.textContent.includes('乙稿')).querySelector('.recent-remove').click()`
  )
  await poll(
    win,
    `document.querySelectorAll('#recent-list .recent-row').length === ${recentBefore - 1} && ![...document.querySelectorAll('#recent-list .recent-name')].some((node) => node.textContent.includes('乙稿'))`
  )
  if (getSettings().recent.some((item) => item.path === realB)) throw new Error('移除后设置里仍有乙稿')
  if (getSettings().recent.length !== recentBefore - 1) throw new Error('移除最近打开时误删了其他条目')

  // Five recent files: the home list shows four and scrolls to the fifth.
  const extra = ['丙', '丁', '戊', '己'].map((name) => {
    const file = path.join(dir, `${name}.md`)
    fs.writeFileSync(file, `# ${name}稿\n\n${name}的正文。\n`)
    return file
  })
  await hooks.openPaths(win, extra, true)
  await poll(win, `document.querySelectorAll('#tabs .tab').length === ${extra.length}`)
  for (let left = extra.length; left > 0; left -= 1) {
    await win.webContents.executeJavaScript(`document.querySelector('#tabs .tab-x').click()`)
    await poll(win, `document.querySelectorAll('#tabs .tab').length === ${left - 1}`)
  }
  await poll(win, `document.getElementById('welcome')?.hidden === false`)
  const recentCount = getSettings().recent.length
  if (recentCount < 5) throw new Error(`最近打开只有 ${recentCount} 条，无法检查滚动窗口`)
  const windowed = await win.webContents.executeJavaScript(`(() => {
    const list = document.getElementById('recent-list')
    const box = list.getBoundingClientRect()
    const rows = [...list.querySelectorAll('.recent-row')].map((row) => row.getBoundingClientRect())
    const visible = rows.filter((rect) => rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1).length
    return { rows: rows.length, visible, scrolls: list.scrollHeight > list.clientHeight + 4, more: list.dataset.more }
  })()`)
  if (windowed.rows !== recentCount || windowed.visible !== 4 || !windowed.scrolls || windowed.more !== 'true') {
    throw new Error(`最近打开没有显示成 4 条的滚动窗口：${JSON.stringify(windowed)}`)
  }
  await win.webContents.executeJavaScript(`(() => {
    const list = document.getElementById('recent-list')
    list.scrollTop = list.scrollHeight
    list.dispatchEvent(new Event('scroll'))
  })()`)
  await poll(win, `document.getElementById('recent-list').dataset.more === 'false'`)

  app.once('will-quit', () => {
    console.log('LIFECYCLE ok')
  })
  app.quit()
}

function onlyWindow(where: string): BrowserWindow {
  const windows = BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed())
  if (windows.length !== 1) throw new Error(`${where} 时期望 1 个窗口，实际 ${windows.length}`)
  return windows[0]!
}

function expectWindows(count: number, where: string): void {
  const live = BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed()).length
  if (live !== count) throw new Error(`${where} 时期望 ${count} 个窗口，实际 ${live}`)
}

function expectWatches(count: number, where: string): void {
  if (watchCount() !== count) throw new Error(`${where} 时期望监视 ${count} 个文件，实际 ${watchCount()}`)
}

function whenClosed(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => win.once('closed', () => resolve()))
}

async function untilReady(win: BrowserWindow): Promise<void> {
  await poll(
    win,
    `Boolean(window.shumoBoot && (document.getElementById('welcome') || document.getElementById('doc')))`
  )
}

async function assertJs(win: BrowserWindow, expr: string): Promise<void> {
  if (win.isDestroyed()) throw new Error(`窗口已销毁，无法检查 ${expr}`)
  const ok = await win.webContents.executeJavaScript(`Boolean(${expr})`)
  if (!ok) throw new Error(`断言失败: ${expr}`)
}

async function poll(win: BrowserWindow, expr: string): Promise<void> {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (win.isDestroyed()) throw new Error(`窗口已销毁，无法等待 ${expr}`)
    const ok = await win.webContents.executeJavaScript(`Boolean(${expr})`).catch(() => false)
    if (ok) return
    await delay(40)
  }
  throw new Error(`等待超时: ${expr}`)
}

async function waitUntil(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (check()) return
    await delay(20)
  }
  throw new Error(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
