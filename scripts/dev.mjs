import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
const env = { ...process.env }
if (fileArg) env.SHUMO_OPEN = fileArg
const bin = path.join(root, 'node_modules', '.bin', 'electron-vite')
const child = spawn(bin, ['dev'], { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
