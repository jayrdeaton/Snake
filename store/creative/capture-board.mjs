// Captures the live game board for the App Store header (see store/README.md). Drives headless Chrome over the DevTools
// protocol against a local serve of the screenshot-only web export, in a small window at a high pixel ratio (762 x 327 at
// 5.04 is 3840 x 1648), and saves a frame at each listed time so one can be picked. The board is the real
// SnakeBoardCanvas, drawn by Skia at 4K, so nothing is upscaled.
//
//   node store/creative/capture-board.mjs <url> <cssW> <cssH> <dpr> <out prefix> <seconds...>
//
// Uses Node's built-in WebSocket and Google Chrome; no npm packages.
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const [url, width, height, dpr, prefix, ...times] = process.argv.slice(2)
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    '--remote-debugging-port=9333',
    '--hide-scrollbars',
    '--no-first-run',
    '--mute-audio',
    // Without these, headless Chrome throttles requestAnimationFrame and the game ticks a few times a second.
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-gpu-vsync',
    `--user-data-dir=${prefix}-profile`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(300)
  try {
    target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page')
  } catch {
    // Chrome is still starting.
  }
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve) => (ws.onopen = resolve))
let nextId = 0
const pending = new Map()
ws.onmessage = (message) => {
  const data = JSON.parse(message.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data.result)
    pending.delete(data.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: Number(dpr), mobile: false })
await send('Page.enable')
await send('Page.navigate', { url })
const start = Date.now()
for (const t of times) {
  await sleep(Math.max(0, Number(t) * 1000 - (Date.now() - start)))
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${prefix}-${t}.png`, Buffer.from(data, 'base64'))
  console.log('captured', t)
}
chrome.kill()
process.exit(0)
