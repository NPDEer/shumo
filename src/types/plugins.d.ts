declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it'
  const plugin: PluginSimple
  export default plugin
}

declare module '@neilsustc/markdown-it-katex' {
  import type { PluginWithOptions } from 'markdown-it'
  import type { KatexOptions } from 'katex'
  const plugin: PluginWithOptions<KatexOptions>
  export default plugin
}

declare module 'markdown-it-github-alerts' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<{
    matchCaseSensitive?: boolean
    markers?: string[] | '*'
    titles?: Record<string, string>
  }>
  export default plugin
}

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it'
  const plugin: PluginWithOptions<{
    enabled?: boolean
    label?: boolean
    labelAfter?: boolean
  }>
  export default plugin
}
