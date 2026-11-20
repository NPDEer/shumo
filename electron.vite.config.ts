import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

const katexEsm = fileURLToPath(new URL('./node_modules/katex/dist/katex.mjs', import.meta.url))
// pseudocode.js tries require('mathjax') as a fallback math backend; 数墨 gives it
// KaTeX, so the 23 MB MathJax package is left out of the bundle.
const noMathjax = fileURLToPath(new URL('./src/renderer/no-mathjax.cjs', import.meta.url))

/**
 * pseudocode.js 2.4.1 assigns the undeclared `attrVal` in
 * src/Renderer.js. That works in Node's sloppy-mode CommonJS, but the
 * renderer bundle is a strict ES module, where it throws on every styled
 * line. Declare the variable where it is assigned.
 */
const PSEUDOCODE_FIX = { from: '                attrVal = style[attrName];', to: '                var attrVal = style[attrName];' }
const pseudocodeStrictFix: Plugin = {
  name: 'shumo-pseudocode-strict-fix',
  transform(code, id) {
    if (!/[\\/]pseudocode[\\/]src[\\/]Renderer\.js$/.test(id)) return null
    if (!code.includes(PSEUDOCODE_FIX.from)) {
      throw new Error('pseudocode.js changed: review the attrVal strict-mode fix in electron.vite.config.ts')
    }
    return code.replace(PSEUDOCODE_FIX.from, PSEUDOCODE_FIX.to)
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
