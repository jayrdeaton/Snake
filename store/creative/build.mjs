// The App Store's product page header and search results art (iOS 27's creative assets, see store/README.md), made from
// the app's own screens:
//   header  the live game board at 4K (store/screenshots/raw/header-board.png, from capture-board.mjs), full bleed. No
//           words: the app's name sits right under it.
//   search  "Classic Snake" and the modes beside the Solo screenshot capture (store/screenshots/raw/iphone/01-solo.png)
//           in a phone, on the screenshots' dark green, in the app's display font.
//
//   node store/creative/build.mjs
//
// Writes store/screenshots/header.png (3840 x 1646) and store/screenshots/search.png (3840 x 2560), each with -safe and
// -384 previews, through the app-store-prep skill's creative.mjs (exact size, no alpha channel).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORE = path.join(HERE, '..')
const ROOT = path.join(STORE, '..')
const OUT_DIR = path.join(STORE, 'screenshots')
const CREATIVE = path.join(os.homedir(), '.claude/skills/app-store-prep/scripts/creative.mjs')
const BOARD = path.join(OUT_DIR, 'raw/header-board.png')
const CAPTURE = path.join(OUT_DIR, 'raw/iphone/01-solo.png')
const FONT = pathToFileURL(path.join(ROOT, 'node_modules/@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf')).href
// The screenshots' background (store/screenshots.json): middle, corners.
const [MIDDLE, CORNERS] = ['#12351a', '#040a05']

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'snake-creative-'))

function page(name, width, height, body) {
  const file = path.join(WORK, `${name}.html`)
  fs.writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fredoka'; src: url('${FONT}'); }
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
.text { position: absolute; font-family: 'Fredoka', sans-serif; color: #fff; }
</style></head><body>${body}</body></html>`
  )
  return file
}

try {
  // Header, 3840 x 1646: the board capture is 3840 x 1648, so trim the extra row from the top.
  const headerFile = page('header', 3840, 1646, `<img src="${pathToFileURL(BOARD).href}" style="position:absolute;left:0;top:-2px;width:3840px;height:1648px">`)

  // Search results, 3840 x 2560: state the obvious. The headline on the left and the Solo screen on the right, both
  // inside the safe area (x 836-3004, y 765-1795); the phone runs off the bottom edge.
  const scale = 0.72
  const phoneW = 1320 * scale
  const phoneH = 2868 * scale
  const bezel = 22
  const phoneLeft = 2040
  const phoneTop = 640
  const radius = 165 * scale
  const searchFile = page(
    'search',
    3840,
    2560,
    `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%, ${MIDDLE}, ${CORNERS})"></div>
<div class="text" style="left:876px;top:765px;width:1100px;height:1030px;display:flex;flex-direction:column;justify-content:center;gap:60px">
  <div style="font-size:190px;line-height:1.05;text-shadow:0 8px 30px rgba(0,0,0,0.4)">Classic<br>Snake</div>
  <div style="font-size:84px;line-height:1.25;opacity:0.85">Solo, Vs CPU,<br>or 2 Player.<br>No ads.</div>
</div>
<div style="position:absolute;left:${phoneLeft - bezel}px;top:${phoneTop - bezel}px;padding:${bezel}px;background:#0a0a0a;border-radius:${radius + bezel}px;box-shadow:0 50px 140px rgba(0,0,0,0.6),0 0 0 4px rgba(255,255,255,0.10)">
  <div style="position:relative;width:${phoneW}px;height:${phoneH}px;border-radius:${radius}px;overflow:hidden">
    <img src="${pathToFileURL(CAPTURE).href}" style="display:block;width:${phoneW}px;height:${phoneH}px">
    <div style="position:absolute;left:${(phoneW - 378 * scale) / 2}px;top:${41 * scale}px;width:${378 * scale}px;height:${111 * scale}px;border-radius:${(111 * scale) / 2}px;background:#000"></div>
  </div>
</div>`
  )

  for (const [file, placement] of [
    [headerFile, 'header'],
    [searchFile, 'search']
  ]) {
    execFileSync('node', [CREATIVE, file, placement, path.join(OUT_DIR, `${placement}.png`)], { stdio: 'inherit' })
  }
} finally {
  fs.rmSync(WORK, { recursive: true, force: true })
}
