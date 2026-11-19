import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electron = require('electron')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), '数墨自测-'))
fs.cpSync(path.join(root, 'samples'), dir, { recursive: true })
const file = path.join(dir, 'sample.md')
const shotDir = process.env.SHUMO_SHOT_DIR || path.join(root, 'shots')
fs.mkdirSync(shotDir, { recursive: true })
const child = spawn(electron, ['.', file], {
  cwd: root,
  env: {
    ...process.env,
    SHUMO_SELF_TEST: '1',
    SHUMO_SHOT_DIR: shotDir,
    SHUMO_NO_SANDBOX: process.env.SHUMO_NO_SANDBOX || '1'
  },
  stdio: 'inherit'
})
child.on('exit', (code) => process.exit(code ?? 1))
