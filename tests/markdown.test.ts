import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import createDOMPurify from 'dompurify'
import { renderMarkdown } from '../src/shared/markdown.ts'
import { lineAtOffset, linePoints, offsetForLine } from '../src/shared/scrollsync.ts'
import { markdownSanitizeConfig } from '../src/shared/sanitize.ts'
import { decodePath, encodePath, localImageUrl, resolveAgainst } from '../src/shared/pathutil.ts'
import { WINDOW_BACKGROUND, usesGlass, windowBackgroundFor, type RecentItem } from '../src/shared/types.ts'
import { removeRecent } from '../src/shared/recent.ts'
import { TOC_WIDTH_DEFAULT, clampTocWidth } from '../src/shared/layout.ts'
import { declareUndeclared } from '../scripts/pseudocode-strict.mjs'
import { classifyLink, linkPath } from '../src/shared/links.ts'
import { contextMenuItems, isMenuEntries, selectionLabel, type MenuContext, type MenuEntry } from '../src/shared/contextmenu.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sample = fs.readFileSync(path.join(root, 'samples', 'sample.md'), 'utf8')

const dom = new JSDOM('<!doctype html><body></body>')
const purify = createDOMPurify(dom.window)

/** HTML without the data-tex attributes, i.e. what the reader sees. */
function withoutTex(html: string): string {
  return html.replace(/ data-tex="[^"]*"/g, '')
}

function clean(html: string): string {
  return purify.sanitize(html, markdownSanitizeConfig)
}

test('sample renders math, chinese, table, mermaid and code', () => {
  const { html, headings } = renderMarkdown(sample)
  const safe = clean(html)
  assert.ok(safe.includes('在有界区域'))
  assert.ok(safe.includes('class="katex"'))
  assert.ok(safe.includes('katex-display'))
  assert.ok(safe.includes('<table>'))
  assert.ok(safe.includes('task-list-item'))
  assert.ok(safe.includes('footnote'))
  assert.ok(safe.includes('<s>') || safe.includes('<del>'))
  assert.ok(safe.includes('https://katex.org'))
  assert.ok(safe.includes('language-python'))
  assert.ok(safe.includes('hljs-keyword') || safe.includes('hljs-title'))
  assert.ok(safe.includes('class="mermaid"'))
  assert.ok(safe.includes('figures/nodes.svg'))
  assert.ok(safe.includes('$not math$'))
  assert.ok(safe.includes('class="frontmatter'))
  assert.ok(safe.includes('谱方法笔记'))
  assert.ok(safe.includes('markdown-alert-note'))
  assert.ok(safe.includes('markdown-alert-abstract'))
  assert.ok(safe.includes('一句话总结'))
  assert.equal(safe.includes('[!abstract]'), false)
  assert.ok(safe.includes('markdown-alert-example'))
  assert.ok(safe.includes('怎么看误差曲线'))
  assert.match(safe, /<details class="markdown-alert markdown-alert-info/)
  assert.equal(/<details class="markdown-alert markdown-alert-info"[^>]* open/.test(safe), false)
  assert.ok(safe.includes('随体导数'))
  assert.ok(safe.includes('octicon-info'))
  assert.match(safe, /mathrm">H</)
  assert.match(safe, /x-arrow/)
  assert.equal(withoutTex(safe).includes('\\ce'), false)
  assert.equal(safe.includes('( a(u,v)=(f,v) )'), false)
  assert.match(safe, /弱形式写成[\s\S]{0,120}class="katex"/)
  assert.equal(safe.includes('katex-error'), false)
  assert.ok(safe.includes('task-list-item-checkbox'))
  assert.equal(safe.includes('task-list-item-checkbox" disabled'), false)
  assert.equal(safe.includes('<script'), false)
  const withoutCode = withoutTex(safe)
    .replace(/\saria-label="[^"]*"/g, '')
    .replace(/<pre[\s\S]*?<\/pre>/g, '')
  assert.equal(withoutCode.includes('\\begin{align}'), false)
  assert.ok(safe.includes('katex-display'))
  assert.ok(headings.some((heading) => heading.text.includes('节点分布')))
  assert.ok(headings.some((heading) => heading.text.includes('谱方法')))
})

test('inline code and fences do not become math', () => {
  const { html } = renderMarkdown('价格是 `$5` 而公式是 $x$。\n\n```latex\n\\begin{align}\na&=b\n\\end{align}\n```\n')
  assert.match(html, /<code>\$5<\/code>/)
  assert.ok(html.includes('class="katex"'))
  const code = html.slice(html.indexOf('<pre class="hljs'))
  assert.match(code, /\\begin/)
  assert.match(code, /\{align\}/)
  assert.equal(code.includes('katex'), false)
})

test('raw html is escaped and javascript links are dropped', () => {
  const { html } = renderMarkdown('你好 <script>alert(1)</script>\n\n[点我](javascript:alert(1))\n')
  const safe = clean(html)
  assert.equal(safe.includes('<script'), false)
  assert.match(safe, /&lt;script&gt;/)
  assert.equal(/href\s*=\s*["']javascript:/i.test(safe), false)
  assert.equal(safe.includes('<a'), false)
})

test('chinese stays next to inline and display math', () => {
  const { html } = renderMarkdown('设 $f(x)=x^2$ 在区间上。\n\n\\[\n\\text{误差} = O(e^{-N})\n\\]\n')
  const at = html.indexOf('设')
  assert.ok(at >= 0)
  assert.ok(html.slice(at, at + 400).includes('katex'))
  assert.ok(html.includes('误差'))
  assert.ok(html.includes('katex-display'))
})

test('upstream plugin stack renders the shared preview fixtures', () => {
  const source = [
    '- 第一项',
    '- [x] 已完成',
    '',
    '| 甲 | 乙 |',
    '| --- | --- |',
    '| 中文 | 1 |',
    '',
    '行内 $a^2$ 与化学 $\\ce{H2O}$。',
    '',
    '$$',
    'b=c',
    '$$',
    '',
    '```py3',
    'print(1)',
    '```',
    '',
    '```shell',
    'echo 你好',
    '```',
    '',
    '> [!note] <img src=x onerror=alert(1)>',
    '> 提示正文',
    '',
    '![节点](figures/nodes.svg)'
  ].join('\n')
  const safe = clean(renderMarkdown(source).html)
  assert.match(safe, /<ul[\s\S]*第一项/)
  assert.match(safe, /task-list-item/)
  assert.match(safe, /<table>[\s\S]*中文/)
  assert.match(safe, /class="katex"/)
  assert.match(safe, /katex-display/)
  assert.equal(safe.includes('katex-error'), false)
  assert.match(safe, /language-py3[\s\S]*hljs-/)
  assert.match(safe, /language-shell[\s\S]*hljs-built_in/)
  assert.match(safe, /mathrm">H</)
  assert.match(safe, /mathrm">O</)
  assert.equal(withoutTex(safe).includes('\\ce'), false)
  assert.match(safe, /markdown-alert-note/)
  assert.match(safe, /<svg[\s\S]*octicon-info/)
  assert.equal(safe.includes('onerror'), false)
  assert.match(safe, /figures\/nodes\.svg/)
  assert.equal(safe.includes('<script'), false)
})

test('obsidian abstract callout keeps math, lists and a custom title', () => {
  const source = [
    '> [!abstract] 一句话总结',
    '>',
    '> $$',
    '> \\partial_t u = \\nu \\Delta u - \\nabla p',
    '> $$',
    '>',
    '> 时间离散的 Stokes 流占半平面 $x < 0$，界面只做法向运动。这时流体 DtN 符号是',
    '>',
    '> - 半平面',
    '> - 法向运动',
    '>',
    '> 代码 `DtN` 与 [说明](https://example.com/dtn)。',
    '',
    '> [!ABSTRACT]',
    '> 默认标题',
    '',
    '> [!Summary] 另一标题',
    '> 别名正文',
    '',
    '> [!tldr]- 先看这里',
    '> 折叠也展开',
    '',
    '> [!NOTE]',
    '> 仍是提示',
    '',
    '> [!WARNING]',
    '> 紧挨着的警告',
    '',
    '行内 [!abstract] 保持原文。',
    '',
    '`[!abstract]`',
    '',
    '```md',
    '> [!abstract] 示例',
    '```',
    '',
    '> 引用里提到 [!abstract] 但不是开头',
    '',
    '> [!abstract] <img src=x onerror=alert(1)>',
    '> 标题被转义',
    '',
    '- 列表里',
    '  > [!summary] 列表中的摘要',
    '  > 仍在列表里'
  ].join('\n')
  const safe = clean(renderMarkdown(source).html)
  const doc = new JSDOM(`<!doctype html><body>${safe}</body>`).window.document
  const abstracts = [...doc.querySelectorAll('.markdown-alert-abstract')]
  assert.equal(abstracts.length, 6)
  const first = abstracts[0]
  assert.ok(first)
  assert.equal(first.querySelector('.markdown-alert-title')?.textContent, '一句话总结')
  assert.equal(first.textContent?.includes('[!abstract]'), false)
  assert.equal(first.textContent?.includes('[!ABSTRACT]'), false)
  assert.ok(first.querySelector('.katex-display'))
  assert.match(first.textContent ?? '', /时间离散的 Stokes 流/)
  assert.equal(first.querySelectorAll('li').length, 2)
  assert.match(first.querySelector('code')?.textContent ?? '', /DtN/)
  assert.equal(first.querySelector('a')?.getAttribute('href'), 'https://example.com/dtn')
  assert.equal(first.getAttribute('role'), 'note')
  assert.equal(abstracts[1]?.querySelector('.markdown-alert-title')?.textContent, '摘要')
  assert.match(abstracts[1]?.textContent ?? '', /默认标题/)
  assert.equal(abstracts[2]?.querySelector('.markdown-alert-title')?.textContent, '另一标题')
  assert.match(abstracts[2]?.textContent ?? '', /别名正文/)
  assert.equal(abstracts[2]?.classList.contains('markdown-alert-summary'), false)
  assert.equal(abstracts[3]?.querySelector('.markdown-alert-title')?.textContent, '先看这里')
  assert.match(abstracts[3]?.textContent ?? '', /折叠也展开/)
  assert.equal(abstracts[3]?.textContent?.includes('[!tldr]'), false)
  const hostile = abstracts[4]
  assert.equal(hostile?.querySelector('img'), null)
  assert.equal(hostile?.innerHTML.includes('<img'), false)
  assert.match(hostile?.querySelector('.markdown-alert-title')?.innerHTML ?? '', /&lt;img/)
  assert.match(hostile?.textContent ?? '', /标题被转义/)
  const listed = abstracts[5]
  assert.equal(listed?.querySelector('.markdown-alert-title')?.textContent, '列表中的摘要')
  assert.ok(listed?.closest('li'))
  assert.equal(doc.querySelectorAll('.markdown-alert-note').length, 1)
  assert.equal(doc.querySelectorAll('.markdown-alert-warning').length, 1)
  assert.match(doc.body.textContent ?? '', /行内 \[!abstract\] 保持原文/)
  const markerCode = [...doc.querySelectorAll('code')].find((node) => !node.closest('pre') && node.textContent?.includes('[!abstract]'))
  assert.ok(markerCode)
  const fence = [...doc.querySelectorAll('pre code')].map((node) => node.textContent ?? '').join('\n')
  assert.match(fence, /> \[!abstract\] 示例/)
  const quote = [...doc.querySelectorAll('blockquote')].find((node) => node.textContent?.includes('不是开头'))
  assert.ok(quote)
  assert.equal(quote?.querySelector('.markdown-alert'), null)
  assert.equal(safe.includes('<script'), false)
})

test('obsidian callout types, aliases, folding and nested bodies', () => {
  const source = [
    '> [!IMPORTANT]',
    '> 关键',
    '',
    '> [!CAUTION]',
    '> 小心',
    '',
    '> [!hint] 提示别名',
    '> 提示正文',
    '',
    '> [!attention]',
    '> 注意正文',
    '',
    '> [!EXAMPLE] 大写示例',
    '> - 一项 $a^2$',
    '> - **加粗**',
    '',
    '> [!info]- 折叠标题 $x$',
    '>',
    '> 速度满足下面的式子。',
    '>',
    '> $$',
    '> y=x',
    '> $$',
    '>',
    '> | 甲 | 乙 |',
    '> | --- | --- |',
    '> | $1$ | 2 |',
    '>',
    '> ```',
    '> e = 1 / N',
    '> ```',
    '',
    '> [!tip]+ 默认展开',
    '> 看得见',
    '',
    '> [!check] 完成别名',
    '> 做完了',
    '',
    '> [!error]',
    '> 危险别名',
    '',
    '> [!cite] 引文别名',
    '> 一段引文',
    '',
    '> [!hypothesis] 未知类型',
    '> 仍然读得到',
    '',
    '> [!example] 外层',
    '>',
    '> > [!info] 内层',
    '> > 嵌套正文',
    '>',
    '> 外层结尾',
    '',
    '行内 [!example] 不是',
    '',
    '`[!info]`',
    '',
    '```md',
    '> [!bug] 围栏',
    '```',
    '',
    '> 引用里提到 [!info] 但不是开头'
  ].join('\n')
  const safe = clean(renderMarkdown(source).html)
  const doc = new JSDOM(`<!doctype html><body>${safe}</body>`).window.document
  const important = doc.querySelector('.markdown-alert-important')
  assert.ok(important)
  assert.equal(important?.tagName, 'DIV')
  assert.ok(important?.querySelector('.octicon-report'))
  assert.equal(important?.classList.contains('markdown-alert-tip'), false)
  const caution = doc.querySelector('.markdown-alert-caution')
  assert.ok(caution?.querySelector('.octicon-stop'))
  assert.equal(doc.querySelector('.markdown-alert-hint'), null)
  const hint = [...doc.querySelectorAll('.markdown-alert-tip')].find((node) => node.textContent?.includes('提示别名'))
  assert.equal(hint?.tagName, 'DIV')
  assert.match(hint?.textContent ?? '', /提示正文/)
  const attention = [...doc.querySelectorAll('.markdown-alert-warning')].find((node) => node.textContent?.includes('注意正文'))
  assert.match(attention?.querySelector('.markdown-alert-title')?.textContent ?? '', /Warning/)
  assert.equal(attention?.querySelector('.octicon-alert') !== null, true)
  const example = [...doc.querySelectorAll('.markdown-alert-example')].find((node) => node.textContent?.includes('大写示例'))
  assert.equal(example?.tagName, 'DIV')
  assert.equal(example?.querySelectorAll('li').length, 2)
  assert.ok(example?.querySelector('.katex'))
  assert.ok(example?.querySelector('strong'))
  const folded = doc.querySelector('details.markdown-alert-info')
  assert.ok(folded)
  assert.equal(folded?.hasAttribute('open'), false)
  assert.equal(folded?.querySelector('summary')?.tagName, 'SUMMARY')
  assert.ok(folded?.querySelector('.markdown-alert-title .katex'))
  assert.ok(folded?.querySelector('.katex-display'))
  assert.ok(folded?.querySelector('table'))
  assert.match(folded?.querySelector('pre code')?.textContent ?? '', /e = 1 \/ N/)
  assert.equal(folded?.textContent?.includes('[!info]'), false)
  const opened = doc.querySelector('details.markdown-alert-tip')
  assert.equal(opened?.hasAttribute('open'), true)
  assert.match(opened?.textContent ?? '', /看得见/)
  assert.match(doc.querySelector('.markdown-alert-success')?.textContent ?? '', /完成别名/)
  assert.match(doc.querySelector('.markdown-alert-danger')?.textContent ?? '', /危险别名/)
  assert.match(doc.querySelector('.markdown-alert-quote')?.textContent ?? '', /引文别名/)
  const unknown = doc.querySelector('.markdown-alert-unknown')
  assert.match(unknown?.textContent ?? '', /未知类型/)
  assert.match(unknown?.textContent ?? '', /仍然读得到/)
  assert.equal(unknown?.textContent?.includes('[!hypothesis]'), false)
  const nested = [...doc.querySelectorAll('.markdown-alert-example')].find((node) => node.textContent?.includes('外层结尾'))
  const inner = nested?.querySelector('.markdown-alert-info')
  assert.match(inner?.textContent ?? '', /嵌套正文/)
  assert.equal(inner?.textContent?.includes('[!info]'), false)
  assert.match(doc.body.textContent ?? '', /行内 \[!example\] 不是/)
  const markerCode = [...doc.querySelectorAll('code')].find((node) => !node.closest('pre') && node.textContent?.includes('[!info]'))
  assert.ok(markerCode)
  const fence = [...doc.querySelectorAll('pre code')].map((node) => node.textContent ?? '').join('\n')
  assert.match(fence, /> \[!bug\] 围栏/)
  const quote = [...doc.querySelectorAll('blockquote')].find((node) => node.textContent?.includes('不是开头'))
  assert.ok(quote)
  assert.equal(safe.includes('onclick'), false)
  assert.equal(safe.includes('<script'), false)
  assert.equal(safe.includes('<img'), false)
})

test('block elements keep the source line used for scroll sync', () => {
  const { html } = renderMarkdown(sample)
  const safe = clean(html)
  const doc = new JSDOM(safe).window.document
  const lines = sample.split('\n')
  const at = (prefix: string) => lines.findIndex((line) => line.startsWith(prefix))
  assert.equal(doc.querySelector('h1')?.getAttribute('data-line'), String(at('# 谱方法')))
  assert.equal(doc.querySelector('h1')?.classList.contains('code-line'), true)
  const display = doc.querySelector('.katex-display')?.closest('[data-line]')
  assert.equal(display?.getAttribute('data-line'), String(at('$$')))
  const python = doc.querySelector('code.language-python')?.closest('pre')
  assert.equal(python?.getAttribute('data-line'), String(at('```python')))
  assert.equal(doc.querySelector('.mermaid-block')?.getAttribute('data-line'), String(at('```mermaid')))
  assert.equal(doc.querySelector('.table-wrap')?.getAttribute('data-line'), String(lines.findIndex((line) => line.startsWith('| $N$'))))
  const image = [...doc.querySelectorAll('img')].find((node) => node.getAttribute('src')?.includes('nodes.svg'))
  assert.equal(image?.closest('[data-line]')?.getAttribute('data-line'), String(at('![')))
  assert.equal(doc.querySelector('.markdown-alert-note')?.getAttribute('data-line'), String(at('> [!NOTE]')))
  assert.equal(doc.querySelector('.markdown-alert-example')?.getAttribute('data-line'), String(at('> [!example]')))
  assert.equal(doc.querySelector('details.markdown-alert-info')?.getAttribute('data-line'), String(at('> [!info]-')))
  assert.equal(doc.querySelector('.markdown-alert-abstract')?.getAttribute('data-line'), String(at('> [!abstract]')))
  const item = doc.querySelector('li')
  assert.ok(item?.hasAttribute('data-line'))
  const front = doc.querySelector('table.frontmatter')
  assert.equal(front?.getAttribute('data-line'), '0')
  const footnote = [...doc.querySelectorAll('p')].find((node) => node.textContent?.includes('Lloyd N. Trefethen'))
  assert.equal(footnote?.getAttribute('data-line'), String(at('[^trefethen]:')))
  assert.ok(doc.querySelectorAll('[data-line]').length > 12)
})

test('scroll sync interpolates between source lines instead of using a percentage', () => {
  const anchors = [
    { line: 0, top: 20 },
    { line: 0, top: 40 },
    { line: 4, top: 20 },
    { line: 10, top: 200 },
    { line: 18, top: 180 }
  ]
  const points = linePoints(anchors, 500, 30)
  assert.deepEqual(points.map((point) => point.line), [0, 10, 29])
  assert.equal(lineAtOffset(anchors, 0, 500, 30), 0)
  assert.equal(lineAtOffset(anchors, 20, 500, 30), 0)
  assert.equal(lineAtOffset(anchors, 110, 500, 30), 5)
  assert.equal(offsetForLine(anchors, 5, 500, 30), 110)
  const hidden = [
    { line: 2, top: 40 },
    { line: 8, top: 0 },
    { line: 14, top: 240 }
  ]
  assert.deepEqual(linePoints(hidden, 400, 20).map((point) => point.line), [2, 14, 19])
  const y = 80
  const line = lineAtOffset(anchors, y, 500, 30)
  assert.ok(Math.abs(offsetForLine(anchors, line, 500, 30) - y) < 0.001)
})

test('path helpers keep unicode and parent directories', () => {
  assert.equal(resolveAgainst('/笔记/章', 'figures/nodes.svg'), '/笔记/章/figures/nodes.svg')
  assert.equal(resolveAgainst('/笔记/章', '../图/a.png'), '/笔记/图/a.png')
  const encoded = encodePath('/笔记/图.png')
  assert.equal(decodePath(encoded), '/笔记/图.png')
  const url = localImageUrl('/笔记/图.png', 12)
  assert.ok(url.startsWith('localimg://asset/'))
  assert.ok(url.includes('?v=12'))
})

test('window background matches the stylesheet editor background in both themes', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'src', 'styles.css'), 'utf8')
  const pageBackground = (selector: string): string | undefined => {
    const start = css.indexOf(`${selector} {`)
    const block = start < 0 ? '' : css.slice(start, css.indexOf('}', start))
    return /--bg:\s*(#[0-9a-fA-F]{3,8})/.exec(block)?.[1]?.toLowerCase()
  }
  assert.deepEqual(WINDOW_BACKGROUND, {
    light: pageBackground(':root'),
    dark: pageBackground('html[data-theme="dark"]')
  })
})

test('macOS windows are transparent so the system glass shows through', () => {
  assert.equal(usesGlass('darwin'), true)
  assert.equal(windowBackgroundFor('darwin', 'light'), '#00000000')
  assert.equal(windowBackgroundFor('darwin', 'dark'), '#00000000')
})

test('other platforms keep an opaque window background', () => {
  assert.equal(usesGlass('win32'), false)
  assert.equal(windowBackgroundFor('win32', 'dark'), WINDOW_BACKGROUND.dark)
  assert.equal(windowBackgroundFor('linux', 'light'), WINDOW_BACKGROUND.light)
})

function recentItem(filePath: string): RecentItem {
  return { path: filePath, title: filePath, hint: filePath, openedAt: 1 }
}

test('removing a recent file drops only that entry and keeps the order', () => {
  const list = [recentItem('/a.md'), recentItem('/b.md'), recentItem('/c.md')]
  assert.deepEqual(removeRecent(list, '/b.md').map((item) => item.path), ['/a.md', '/c.md'])
})

test('removing a path that is not in the recent list changes nothing', () => {
  const list = [recentItem('/a.md')]
  assert.deepEqual(removeRecent(list, '/missing.md'), list)
})

test('sidebar width keeps a dragged value inside the allowed range', () => {
  assert.equal(clampTocWidth(300, 1440), 300)
})

test('sidebar width never drops below its minimum', () => {
  assert.equal(clampTocWidth(40, 1440), 180)
})

test('sidebar width is capped by 420px and by 40% of the window', () => {
  assert.equal(clampTocWidth(900, 1440), 420)
  assert.equal(clampTocWidth(400, 800), 320)
})

test('sidebar width falls back to the default for unusable values', () => {
  assert.equal(clampTocWidth(Number.NaN, 1440), TOC_WIDTH_DEFAULT)
})

const algorithmFence = [
  '```latex',
  '% 需要：\\usepackage{algorithm} \\usepackage{algpseudocode}',
  '\\begin{algorithm}[H]',
  '\\caption{精确瞬时 Jacobian}',
  '\\begin{algorithmic}[1]',
  '\\Require 流体网格；$\\mathbf u^\\ast=\\mathbf 0$',
  '\\For{$j=1,\\dots,N_\\Sigma$} \\Comment{$N_\\Sigma=1924$ 个界面自由度}',
  '    \\State $J_{:,j}\\gets\\boldsymbol\\lambda$ \\Comment{$\\boldsymbol\\lambda=J\\mathbf u+(\\text{与 }\\mathbf u\\text{ 无关的部分})$}',
  '\\EndFor',
  '\\Ensure $J,\\ M_\\Sigma$',
  '\\end{algorithmic}',
  '\\end{algorithm}',
  '```'
].join('\n')

test('latex fence with algorithmic is typeset as an algorithm', () => {
  const safe = clean(renderMarkdown(algorithmFence).html)
  assert.match(safe, /class="algorithm-block code-line" data-line="0"/)
  assert.match(safe, /算法 1 [\s\S]*精确瞬时 Jacobian/)
  assert.match(safe, /ps-keyword">Require/)
  assert.match(safe, /ps-keyword">for /)
  assert.match(safe, /ps-comment">▷ [\s\S]*个界面自由度/)
  assert.match(safe, /ps-linenum"[^>]*>1</)
  assert.match(safe, /无关的部分/)
  assert.equal(safe.includes('katex-error'), false)
  assert.equal(safe.includes('\\usepackage'), false)
  assert.equal(safe.includes('language-latex'), false)
})

test('algorithm captions number through the document', () => {
  const twoBlocks = `${algorithmFence}\n\n${algorithmFence.replace('精确瞬时 Jacobian', '训练数据生成')}`
  const safe = clean(renderMarkdown(twoBlocks).html)
  assert.match(safe, /算法 2 [\s\S]*训练数据生成/)
})

test('algorithm numbering restarts for each document', () => {
  renderMarkdown(algorithmFence)
  assert.match(clean(renderMarkdown(algorithmFence).html), /算法 1 /)
})

test('latex fence without algorithmic stays highlighted source', () => {
  const safe = clean(renderMarkdown('```latex\n\\begin{equation} x \\end{equation}\n```').html)
  assert.ok(safe.includes('language-latex'))
})

test('unparsable algorithm falls back to highlighted source', () => {
  const broken = '```latex\n\\begin{algorithmic}\n\\For{$i$}\n\\State x\n\\end{algorithmic}\n```'
  const safe = clean(renderMarkdown(broken).html)
  assert.ok(safe.includes('language-latex'))
  assert.equal(safe.includes('ps-root'), false)
})

test('algorithm text is escaped', () => {
  const hostile = '```latex\n\\begin{algorithmic}\n\\State <img src=x onerror=alert(1)>\n\\end{algorithmic}\n```'
  const html = renderMarkdown(hostile).html
  assert.ok(html.includes('ps-root'))
  assert.equal(html.includes('<img'), false)
})

test('typesetting leaves no global katex behind', () => {
  renderMarkdown(algorithmFence)
  assert.equal('katex' in globalThis, false)
})

function algorithmHtml(body: string): string {
  return clean(renderMarkdown(`\`\`\`latex\n\\begin{algorithmic}[1]\n${body}\n\\end{algorithmic}\n\`\`\``).html)
}

test('statex lines are typeset without a line number', () => {
  const safe = algorithmHtml('\\State a\n\\Statex \\textit{(2) 子迭代}\n\\State b')
  const numbers = [...safe.matchAll(/ps-linenum"[^>]*>(\d*)</g)].map((m) => m[1])
  assert.deepEqual(numbers, ['1', '', '2'])
})

test('text-mode phantom and quad move into math', () => {
  const safe = algorithmHtml('\\State \\phantom{目标：}$x$\n\\State $a$，\\quad $b$')
  assert.ok(safe.includes('ps-root'))
  assert.equal(safe.includes('phantom'), false)
})

test('text straight after an if header becomes a statement', () => {
  const safe = algorithmHtml('\\For{$k=0,1,\\dots$}\n\\If{$r<10^{-6}$} \\textbf{break} \\EndIf\n\\EndFor')
  assert.match(safe, /font-weight:bold;?">break/)
})

test('double and triple hyphens become dashes outside math', () => {
  const safe = algorithmHtml('\\State 误差 41--285\\% --- 发散')
  assert.ok(safe.includes('41–285'))
  assert.ok(safe.includes('— 发散'))
})

type Pseudocode = { renderToString: (input: string, options?: Record<string, unknown>) => string }

/** pseudocode.js loaded as strict code, the way it runs inside the renderer bundle. */
function strictPseudocode(fix: (code: string) => string): Pseudocode {
  const cache = new Map<string, { exports: unknown }>()
  const load = (file: string): unknown => {
    const cached = cache.get(file)
    if (cached) return cached.exports
    const module = { exports: {} as unknown }
    cache.set(file, module)
    let code = fs.readFileSync(file, 'utf8')
    if (file.endsWith(`${path.sep}Renderer.js`)) code = fix(code)
    const localRequire = (id: string): unknown => {
      if (!id.startsWith('.')) throw new Error(`not bundled: ${id}`)
      const target = path.resolve(path.dirname(file), id)
      return load(target.endsWith('.js') ? target : `${target}.js`)
    }
    new Function('module', 'exports', 'require', `'use strict';\n${code}`)(module, module.exports, localRequire)
    return module.exports
  }
  return load(path.join(root, 'node_modules', 'pseudocode', 'pseudocode.js')) as Pseudocode
}

const everyConstruct = [
  '\\begin{algorithm}',
  '\\caption{全部写法}',
  '\\begin{algorithmic}',
  '\\State \\textbf{粗体} $x$',
  '\\If{$a$} \\State b \\ElsIf{$c$} \\State d \\Else \\State e \\EndIf',
  '\\While{$w$} \\State f \\EndWhile',
  '\\Upon{$u$} \\State g \\EndUpon',
  '\\end{algorithmic}',
  '\\end{algorithm}'
].join('\n')

function renderStrict(fix: (code: string) => string): string {
  const scope = globalThis as { katex?: unknown }
  scope.katex = { renderToString: (text: string) => text }
  try {
    return strictPseudocode(fix).renderToString(everyConstruct, { lineNumber: true })
  } finally {
    delete scope.katex
  }
}

test('pseudocode.js renders every construct in strict mode once fixed', () => {
  assert.ok(renderStrict(declareUndeclared).includes('ps-root'))
})

test('pseudocode.js still needs the strict-mode fix', () => {
  assert.throws(() => renderStrict((code) => code), ReferenceError)
})

test('links to anchors, the web, notes and other files are told apart', () => {
  const kinds = ['#收敛', 'https://katex.org', 'mailto:a@b.c', 'notes/a.md#x', '../b.markdown', 'export_jacobian.py', 'rrfsi/coupling.py', 'file:///tmp/a.pdf', 'C:\\notes\\c.md']
  assert.deepEqual(kinds.map(classifyLink), ['anchor', 'external', 'external', 'markdown', 'markdown', 'file', 'file', 'file', 'markdown'])
})

test('script and data links are not followed', () => {
  assert.deepEqual(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '', '?q=1'].map(classifyLink), [
    'unsupported',
    'unsupported',
    'unsupported',
    'unsupported',
    'unsupported'
  ])
})

test('link path drops fragment and query and decodes', () => {
  assert.equal(linkPath('%E7%AC%94%E8%AE%B0/a%20b.py?x=1#L3'), '笔记/a b.py')
})

const view = { atTop: false, tocShown: true, sourceShown: false, theme: 'light' as const }

function ids(context: MenuContext): string[] {
  return contextMenuItems(context).map((entry: MenuEntry) => ('separator' in entry ? '|' : entry.id))
}

test('blank document menu offers view and file commands only', () => {
  assert.deepEqual(ids({ area: 'doc', selection: '', view }), [
    'scroll-top',
    'toggle-toc',
    'toggle-source',
    'toggle-theme',
    '|',
    'reveal-file',
    'copy-path'
  ])
})

test('selected text comes first with copy and find', () => {
  assert.deepEqual(ids({ area: 'doc', selection: '附加质量', view }).slice(0, 3), ['copy', 'find-selection', '|'])
})

test('a link to a code file is revealed, never opened', () => {
  const entries = ids({ area: 'doc', selection: '', link: { href: 'train.py', kind: 'file' }, view })
  assert.deepEqual(entries.slice(0, 3), ['reveal-link', 'copy-link', '|'])
})

test('a markdown link opens in a tab', () => {
  const entries = ids({ area: 'doc', selection: '', link: { href: 'b.md', kind: 'markdown' }, view })
  assert.deepEqual(entries.slice(0, 3), ['open-link', 'reveal-link', 'copy-link'])
})

test('a formula offers its latex source', () => {
  assert.equal(ids({ area: 'doc', selection: '', tex: 'x^2', view })[0], 'copy-tex')
})

test('an algorithm block offers its latex source', () => {
  const entries = contextMenuItems({ area: 'doc', selection: '', code: 'algorithm', view })
  assert.deepEqual(entries[0], { id: 'copy-code', label: '拷贝算法的 LaTeX 源码' })
})

test('back to top is disabled at the top', () => {
  const entries = contextMenuItems({ area: 'doc', selection: '', view: { ...view, atTop: true } })
  assert.deepEqual(entries[0], { id: 'scroll-top', label: '回到顶部', enabled: false })
})

test('closing other tabs needs another tab', () => {
  const entries = contextMenuItems({ area: 'tab', tabCount: 1 })
  assert.deepEqual(entries[1], { id: 'close-other-tabs', label: '关闭其他标签页', enabled: false })
})

test('source menu names the clicked line', () => {
  const entries = contextMenuItems({ area: 'source', selection: '', line: 11 })
  assert.deepEqual(entries.at(-1), { id: 'copy-line-ref', label: '拷贝路径和行号（第 12 行）' })
})

test('long selections are shortened in the menu label', () => {
  assert.equal(selectionLabel('一二三四五六七八九十甲乙丙丁'), '一二三四五六七八九十甲乙…')
})

test('menu entries from the page are checked before use', () => {
  assert.equal(isMenuEntries(contextMenuItems({ area: 'recent' })), true)
  assert.equal(isMenuEntries([{ id: 'run-shell', label: 'x' }]), false)
  assert.equal(isMenuEntries([{ separator: true, id: 'copy' }]), false)
})

test('inline and display formulas keep their tex source', () => {
  const safe = clean(renderMarkdown('设 $a<b$。\n\n$$\n\\int_0^1 f\\,dx\n$$').html)
  assert.match(safe, /class="katex" data-tex="a&lt;b"/)
  assert.match(safe, /class="katex-display" data-tex="\\int_0\^1 f\\,dx"/)
})

test('algorithm block keeps its latex source', () => {
  const safe = clean(renderMarkdown(algorithmFence).html)
  assert.match(safe, /class="algorithm-block[^"]*"[^>]*data-source="/)
})
