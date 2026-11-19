import { defineConfig } from 'electron-vite'
import { fileURLToPath } from 'node:url'

const katexEsm = fileURLToPath(new URL('./node_modules/katex/dist/katex.mjs', import.meta.url))

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
    resolve: {
      alias: [{ find: /^katex$/, replacement: katexEsm }]
    },
    server: {
      port: 52741,
      strictPort: true
    }
  }
})
