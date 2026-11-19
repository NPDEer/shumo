import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electron = require('electron')
const child = spawn(electron, ['.'], {
  cwd: root,
  env: {
    ...process.env,
    SHUMO_LIFECYCLE_TEST: '1',
    SHUMO_NO_SANDBOX: process.env.SHUMO_NO_SANDBOX || '1'
  },
  stdio: 'inherit'
})
child.on('exit', (code) => process.exit(code ?? 1))
