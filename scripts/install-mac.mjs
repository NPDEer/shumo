// Replace the installed 数墨 with the bundle `npm run dist:mac` just built.
// The old copy goes to the Trash (recoverable with “Put Back”), so only one
// 数墨 is ever installed. Run through `npm run install:mac`.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const built = path.join(root, 'release', 'mac-universal', '数墨.app')
const installed = '/Applications/数墨.app'
const binary = `${installed}/Contents/MacOS/数墨`

function fail(message) {
  console.error(`install:mac ${message}`)
  process.exit(1)
}

function osascript(script) {
  execFileSync('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] })
}

function isRunning() {
  try {
    execFileSync('pgrep', ['-f', `^${binary}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

if (process.platform !== 'darwin') fail('只能在 macOS 上运行')
if (!fs.existsSync(built)) fail(`找不到打包产物 ${built}，先运行 npm run dist:mac`)

const wasRunning = isRunning()
if (wasRunning) {
  // A normal quit, as with ⌘Q. 数墨 is read-only, so nothing can be lost.
  osascript(`tell application "${installed}" to quit`)
  for (let i = 0; i < 20 && isRunning(); i += 1) sleep(250)
  if (isRunning()) fail('数墨没有退出，请手动退出后重试')
}

if (fs.existsSync(installed)) {
  osascript(`tell application "Finder" to delete (POSIX file "${installed}")`)
  if (fs.existsSync(installed)) fail('旧版没有移到废纸篓')
  console.log('install:mac 旧版已移到废纸篓')
}

execFileSync('ditto', [built, installed])
console.log(`install:mac 已安装 ${installed}`)

if (wasRunning) {
  execFileSync('open', ['-a', installed])
  console.log('install:mac 已重新打开数墨')
}
