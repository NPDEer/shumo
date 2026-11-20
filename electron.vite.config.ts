import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { declareUndeclared } from './scripts/pseudocode-strict.mjs'
import { fileURLToPath } from 'node:url'

const katexEsm = fileURLToPath(new URL('./node_modules/katex/dist/katex.mjs', import.meta.url))
// pseudocode.js tries require('mathjax') as a fallback math backend; 数墨 gives it
// KaTeX, so the 23 MB MathJax package is left out of the bundle.
const noMathjax = fileURLToPath(new URL('./src/renderer/no-mathjax.cjs', import.meta.url))

const pseudocodeStrictFix: Plugin = {
  name: 'shumo-pseudocode-strict-fix',
  transform(code, id) {
    if (!/[\\/]pseudocode[\\/]src[\\/]Renderer\.js$/.test(id)) return null
    return declareUndeclared(code)
  }
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rolldownOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    plugins: [pseudocodeStrictFix],
    resolve: {
      alias: [
        { find: /^katex$/, replacement: katexEsm },
        { find: /^mathjax$/, replacement: noMathjax }
      ]
    },
    server: {
      port: 52741,
      strictPort: true
    }
  }
})
