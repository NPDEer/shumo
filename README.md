# 数墨

只读 Markdown 阅读器，给计算数学笔记用。双击 `.md` 打开后直接看到排好的正文。工具栏的「源码」在预览右侧打开同一份原文，只读、可选中复制，中间的分隔可以拖动。打开之后两侧按源码行号一起滚动：滚预览，源码跟到同一行；滚源码，预览也跟着。双击预览里的一块，源码会跳到对应行。语法插件和 Markdown All in One 挂进 VS Code 预览的是同一组；界面仿 macOS 26 的 Liquid Glass：侧栏是悬浮的玻璃板，工具栏拆成几颗胶囊浮在正文上方，正文从玻璃下滚过。macOS 上窗口透明并使用系统毛玻璃材质（vibrancy）；Electron 没有提供系统液态玻璃的接口，胶囊的玻璃质感由 CSS 模糊、饱和度和高光模拟，Windows 与 Linux 上退回不透明底色。正文面板保持不透明：系统无衬线、默认 16px、1.75 倍行高、版心 760px（「视图」里可改成全宽），浅色与深色各一套系统配色。窗口变窄时正文重排，字号不变；图片和 Mermaid 按比例缩进可用宽度，过宽的表格、代码和公式在各自区域内横向滚动。

## 预览从哪来

Markdown All in One（[yzhang-gh/vscode-markdown](https://github.com/yzhang-gh/vscode-markdown) 3.6.3，MIT，Copyright (c) 2017 张宇）**自己不绘制预览**。它的说明写明：VS Code 已经自带 Markdown 预览，这个扩展用 `extendMarkdownIt` 把语法插件挂进去。数墨没有嵌入 VS Code，也没有运行这个扩展。扩展宿主、webview 消息桥和 `vscode://` 资源地址都留在编辑器里，搬进来既不能独立预览，也会放开本应用故意关掉的原始 HTML。

实际接进渲染的是它 `src/markdown-it-plugin-provider.ts` 里的同一条配置：

| 来源 | 版本 | 许可证 | 数墨里怎么用 |
| --- | --- | --- | --- |
| `@neilsustc/markdown-it-katex` | 1.0.0（git `20eca673`） | MIT，Yu Zhang | `$` / `$$` 交给这个包渲染，`throwOnError: false` |
| `katex` 与 `katex/contrib/mhchem` | 0.19.1 | MIT，Khan Academy | 插件源码是 `require("katex")`。打包时把这个名字指到 `katex/dist/katex.mjs`，和 mhchem 的 ESM 入口是同一份 KaTeX。单元测试不经过打包器，启动前用 CommonJS 入口先加载 mhchem。0.19 不再输出 `mhchem` 类名，化学式成功时源码里的 `\ce` 不会留在 HTML 里。All in One 声明的是 `katex ^0.16.4`，这里保持已经验证过中文公式的 0.19 |
| `markdown-it-github-alerts` | 0.3.1 | MIT，Anthony Fu | `{ matchCaseSensitive: false }`，样式用包内 `styles/github-base.css`、`github-colors-light.css`、`github-colors-dark-class.css`。只覆盖没有折叠记号的 note / tip / important / warning / caution |
| `markdown-it-task-lists` | 2.1.1 | ISC | `{ enabled: true }`，勾选框样式沿用 All in One 的 `media/checkbox.css` |
| `markdown-it` | 15 | MIT | All in One 声明 `^13`，VS Code 主线预览声明 `^14`。插件声明兼容 `markdown-it >= 13`，所以数墨留在 15 |
| VS Code `markdown.css` | 主线 `extensions/markdown-language-features/media` | MIT，Microsoft | `src/renderer/src/preview.css` 最初从这里改写，块间距、表格与代码的溢出处理、文首表格等结构规则沿用至今，文件头保留版权声明。字号、间距和配色已重新设计；语法色改为接近 Xcode 默认主题的自绘配色，不再使用 `highlight.css` |
| `pseudocode`（pseudocode.js） | 2.4.1 | MIT，Saswat Padhi | ` ```latex ` 围栏里有 `\begin{algorithmic}` 时排成算法框（`src/shared/algorithm.ts`）。先删去整行 `%` 注释和 `[H]`、`[1]` 这类环境选项；写了 `[1]` 才编号。公式交给数墨的 KaTeX、带同样的选项。包里的 `require('mathjax')` 在打包时换成会报错的空模块，2.4.1 里未声明的 `attrVal` 在严格模式的打包结果里会抛错，由 `electron.vite.config.ts` 的插件补上 `var`。样式是数墨自己写的，不用包里的 CSS。解析失败时退回语法高亮的源码 |
| `normalizeHighlightLang` | 同目录 `markdownEngine.ts` | MIT，Microsoft | `shell`→`sh`、`py3`→`python`、`tsx`→`jsx`、`jsonc`→`json`、`csharp`→`cs`。本构建没有单独的 jsx 语法，所以 `jsx` 这个名字登记的是 TypeScript 语法 |

和在 VS Code 里打开 All in One 相比，这些是故意留下的差别：

- 原始 HTML 关闭，渲染结果再过 DOMPurify。提示块标题会被插件原样拼进 HTML，过滤会去掉脚本和事件属性；图标 SVG 只放行 `svg` 和 `path`。
- KaTeX 额外固定 `trust: false`、`output: "html"`、`strict: "ignore"`。All in One 只传了 `throwOnError: false`，`trust` 的默认值本来就是 false。
- `$` 和 `$$` 完全走上游插件。`\(...\)`、`\[...\]` 以及 `align` / `equation` / `pmatrix` 这类环境是数墨加的分隔符，仍交给同一个 KaTeX 渲染函数。上游插件本身不认这些写法。
- 文首 `---` 表格对应 VS Code 预览设置 `markdown.preview.frontMatter = table` 的行为，不是把依赖 `vscode` API 的 `yamlPreamble.ts` 原文件搬进来。
- 脚注、Mermaid、算法框、本机图片协议、目录、文内查找和窄窗口滚动是数墨自己的。VS Code 预览和 All in One 都不负责这些。
- Markdown All in One 3.6.3 的 `extendMarkdownIt` 只调用 `markdown-it-github-alerts`。它没有 `example`、`info`，也没有 `[!type]+` / `[!type]-` 折叠。`markdown-it-obsidian-callouts` 0.3.5（Apache-2.0）能认 Obsidian 类型和 `<details>`，但没有直接采用：它把 `important` 并进 tip、把 `caution` 并进 warning，会换掉现有的五种 GitHub 提示；它还会改写 `ad-` 开头的围栏，并把围栏里的 `icon:` 原文插进 HTML；图标是 Lucide 的 `rect` / `line` / `circle`，过不了这里只放行 `svg` 和 `path` 的过滤。折叠和其余类型因此做在数墨自己的块级 token 上。
- 支持的类型是 note、abstract（summary、tldr）、info、todo、tip（hint）、important、success（check、done）、question（help、faq）、warning（attention）、caution、failure（fail、missing）、danger（error）、bug、example、quote（cite）。`[!important]` 和 `[!caution]` 仍是 GitHub 的那两种，不按 Obsidian 别名合并。没写标题时，摘要默认是「摘要」，示例默认是「示例」，信息默认是「信息」；五种 GitHub 提示仍用 Note、Tip、Important、Warning、Caution。自定义标题按行内 Markdown 渲染，可以含公式，不插入原始 HTML。
- 没有 `+` / `-` 的提示块不能折叠。`[!info]+` 用 `<details open>`，默认展开；`[!info]-` 用没有 `open` 的 `<details>`，默认收起。开关是 `<summary>` 自己的键盘行为，没有内联事件。不认识的 `[!名字]` 收成中性提示块，正文照常渲染。标记必须在引用第一行开头；行内、代码和围栏里的同名文字保持原文。
- 块级元素带 `data-line`，预览和源码按这些行号插值对齐，而不是按滚动百分比。图片仍走本应用的 `localimg` 协议，不改写成 `vscode-webview-resource`。

主要目标是 macOS。在访达里双击文稿，会直接进入渲染结果，不会先停在欢迎页。

## 开发

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
npm run dev -- samples/sample.md
```

第二条会带着示例文稿启动。示例在 `samples/sample.md`，里面有中文、行内与行间公式、对齐环境、矩阵、分段函数、表格、任务列表、脚注、代码和一张流程图，配图在 `samples/figures/nodes.svg`。

```bash
npm test
npm run typecheck
npm run build
```

`npm run selftest` 会启动打包前的应用，打开示例，检查公式、目录、查找和实时刷新，并在 `shots/` 写下浅色与深色截图。无图形界面时：

```bash
SHUMO_SHOT_DIR=./shots SHUMO_NO_SANDBOX=1 xvfb-run -a npm run selftest
```

## 在 Mac 上打包

一条命令，产物是通用二进制（Apple 芯片与 Intel）的磁盘映像：

```bash
npm run dist:mac
```

完成后看 `release/` 里的 `.dmg`。打开映像，把「数墨」拖进「应用程序」。应用名称是 **数墨.app**。

在本机直接更新已安装的数墨：

```bash
npm run install:mac
```

它会打包，正常退出正在运行的数墨，把 `/Applications/数墨.app` 旧版移到废纸篓（可「放回原处」），装上新版，原来开着的话再重新打开。整台电脑只保留一个数墨。

这台开发机是 Linux，签不出 macOS 安装包。仓库里的 GitHub Actions（`.github/workflows/build.yml`）会在 `macos-latest` 上跑同一条命令。推送形如 `v1.0.0` 的标签，或在 Actions 页手动运行 **Build**，即可下载 `shumo-macos` 里的 `.dmg`。流水线没有签名证书，产物未签名。

### 把数墨设成 .md 的默认应用

1. 在访达中选中任意 `.md`、`.markdown`、`.mdown` 或 `.mkd` 文件。
2. 菜单「文件 → 显示简介」，或按 `⌘I`。
3. 展开「打开方式」，选 **数墨**。
4. 点「全部更改…」，确认。

之后在访达里双击这些文稿，会直接用数墨打开并显示渲染结果。应用已注册 UTI `net.daringfireball.markdown`，角色是 Viewer，所以会出现在「打开方式」里。

数墨已经在运行时，再双击另一份文稿，会在当前窗口新开一个标签。菜单「文件 → 新窗口」可以再开一扇窗口。

### 未签名应用与 Gatekeeper

第一次打开，系统可能提示「无法验证开发者」：

- 在「应用程序」里对「数墨」按住 Control 再点按（或右键），选「打开」，在对话框里再点「打开」。
- 或在终端执行：

```bash
xattr -cr /Applications/数墨.app
```

然后再双击打开。

## Windows 与 Linux

```bash
npm run dist:linux   # release/ 下的 AppImage
npm run dist:win     # release/ 下的 NSIS 安装包
```

Windows 安装包按每台机器安装，才能写入 `.md` 文件关联。Linux 的 AppImage 会声明 `text/markdown`。这两类安装包也会由上面的 GitHub Actions 在对应系统上构建。

## 公式怎么写

`$...$` 和 `$$...$$` 由 `@neilsustc/markdown-it-katex` 识别。`\(...\)`、`\[...\]` 以及独占一块的 `align`、`equation`、`gather`、`pmatrix`、`cases` 是数墨额外加上的分隔符，渲染仍走这个插件的 KaTeX。`\text{中文}` 可以写在公式里面。

行内代码和围栏代码里的美元符号保持原样，不会变成公式。代码围栏里的 `\begin{align}` 也保持为代码。

文稿请存成 UTF-8。原始 HTML 会按文本显示，不会执行。单独一个换行不会强制折行，空一行才是新段落。相对路径的图片按文稿所在文件夹解析，只打开本机的常见图片格式。

## 阅读

- 左侧目录来自标题，点击跳转，滚动时标出当前章节。
- 文稿在磁盘上被保存后自动刷新，并尽量留在原来的滚动位置。
- 主题默认跟随系统，也可在「视图」里固定浅色或深色。字号、页宽也可以改。
- `⌘F` / `Ctrl+F` 在文内查找。外部的 http、https、mailto 链接用系统浏览器打开。
- 最近打开过的文稿在「文件 → 打开最近」和欢迎页里。
- 左上角「数墨」回到首页，不关闭窗口，已打开的文稿留在标签上。关掉标签上的 × 或按 `⌘W` / `Ctrl+W` 才会关闭那一篇；最后一篇关掉后也回到首页。

## 安全

渲染进程没有 Node，页面在沙箱里。Markdown 里的 HTML 被转义，再经 DOMPurify 过滤。KaTeX 关闭了 `trust`。Mermaid 使用严格安全级别。除本机图片协议外，不加载远程内容。
