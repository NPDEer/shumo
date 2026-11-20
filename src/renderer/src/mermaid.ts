import DOMPurify from 'dompurify'
import { decodePath } from '../../shared/pathutil'
import { WINDOW_BACKGROUND, type ResolvedTheme } from '../../shared/types'

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let api: MermaidApi | null = null
let themeKey = ''
let sequence = 0

export async function renderDiagrams(root: ParentNode, theme: ResolvedTheme): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('.mermaid-block')]
  if (!blocks.length) return
  if (!api) {
    const mod = await import('mermaid')
    api = mod.default
  }
  if (themeKey !== theme) {
    themeKey = theme
    api.initialize(configFor(theme))
  }
  for (const block of blocks) {
    const source = decodePath(block.dataset.source || '') || block.querySelector('pre')?.textContent || ''
    const id = `mmd${Date.now().toString(36)}${sequence++}`
    try {
      const { svg: markup } = await api.render(id, source)
      const clean = DOMPurify.sanitize(markup, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ['foreignObject']
      })
      if (!clean.includes('<svg')) throw new Error('empty svg')
      block.innerHTML = clean
      const diagram = block.querySelector('svg')
      if (diagram) fitDiagram(diagram)
    } catch {
      const note = document.createElement('p')
      note.className = 'diagram-error'
      note.textContent = '这张图无法渲染'
      const pre = document.createElement('pre')
      pre.textContent = source
      block.replaceChildren(note, pre)
    } finally {
      document.getElementById(`d${id}`)?.remove()
      document.getElementById(`i${id}`)?.remove()
    }
  }
}

function cssPx(value: string | null): number {
  if (!value || /%/.test(value)) return 0
  const size = Number.parseFloat(value)
  return Number.isFinite(size) ? size : 0
}

function fitDiagram(svg: SVGElement): void {
  let width = cssPx(svg.getAttribute('width'))
  let height = cssPx(svg.getAttribute('height'))
  const view = svg.getAttribute('viewBox')
  if (view) {
    const parts = view.trim().split(/[\s,]+/).map(Number)
    const viewWidth = parts[2] ?? 0
    const viewHeight = parts[3] ?? 0
    if (!(width > 0) && viewWidth > 0) width = viewWidth
    if (!(height > 0) && viewHeight > 0) height = viewHeight
  } else if (width > 0 && height > 0) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  if (width > 0) svg.setAttribute('width', String(width))
  if (height > 0) svg.setAttribute('height', String(height))
  const style = svg.getAttribute('style')
  if (style) {
    svg.setAttribute('style', style.replace(/(?:^|;)\s*(?:width|height|max-width)\s*:[^;]*/gi, ''))
  }
  svg.style.maxWidth = '100%'
  svg.style.height = 'auto'
  if (!svg.getAttribute('preserveAspectRatio')) svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
}

function configFor(theme: ResolvedTheme): Record<string, unknown> {
  const dark = theme === 'dark'
  const ink = dark ? '#f5f5f7' : '#1d1d1f'
  const border = dark ? '#0a84ff' : '#007aff'
  const line = dark ? '#8e8e93' : '#86868b'
  const paper = dark ? '#2c2c2e' : '#f5f5f7'
  const page = WINDOW_BACKGROUND[theme]
  const font = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: font,
    flowchart: { htmlLabels: false, curve: 'basis', padding: 14, nodeSpacing: 28, rankSpacing: 32 },
    themeVariables: {
      background: 'transparent',
      fontFamily: font,
      primaryColor: paper,
      primaryTextColor: ink,
      primaryBorderColor: border,
      lineColor: line,
      secondaryColor: dark ? '#3a3a3c' : '#e8e8ed',
      tertiaryColor: page,
      textColor: ink,
      nodeTextColor: ink,
      mainBkg: paper,
      clusterBkg: dark ? '#242426' : '#fafafa',
      titleColor: ink,
      edgeLabelBackground: page
    }
  }
}
