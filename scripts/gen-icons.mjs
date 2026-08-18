// Generates the PWA icons (no image deps — raw PNG encoder on top of zlib).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const BG = [13, 17, 23]
const FG = [240, 162, 2]

/* ---------- minimal PNG encoder ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = buf => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng (size, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // color type: truecolor
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      raw[p++] = rgb[i]
      raw[p++] = rgb[i + 1]
      raw[p++] = rgb[i + 2]
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- artwork: amber map pin on the app's dark ground ---------- */
// Coverage of the pin at a point, sampled 3x3 for smooth edges.
function pinCoverage (px, py, size, scale) {
  const S = size
  const cx = S / 2
  const cy = S * (0.5 - 0.08 * scale)
  const r = S * 0.19 * scale
  const tipY = cy + S * 0.34 * scale
  const holeR = r * 0.38
  let hits = 0
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = px + (sx + 0.5) / 3
      const y = py + (sy + 0.5) / 3
      const inHead = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      // Tapered body from the head down to the tip.
      const t = (y - cy) / (tipY - cy)
      const inBody = y >= cy && t <= 1 && Math.abs(x - cx) <= r * 0.95 * (1 - t)
      const inHole = (x - cx) ** 2 + (y - cy) ** 2 <= holeR * holeR
      if ((inHead || inBody) && !inHole) hits++
    }
  }
  return hits / 9
}

function render (size, { scale = 1, rounded = false } = {}) {
  const rgb = Buffer.alloc(size * size * 3)
  const radius = rounded ? size * 0.22 : 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-square mask (transparent-free: corners fall back to black).
      let bg = BG
      if (rounded) {
        const dx = Math.max(radius - x, x - (size - radius), 0)
        const dy = Math.max(radius - y, y - (size - radius), 0)
        if (Math.hypot(dx, dy) > radius) bg = [0, 0, 0]
      }
      const a = pinCoverage(x, y, size, scale)
      const i = (y * size + x) * 3
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(bg[c] * (1 - a) + FG[c] * a)
    }
  }
  return encodePng(size, rgb)
}

mkdirSync(OUT, { recursive: true })
const files = [
  ['icon-192.png', render(192)],
  ['icon-512.png', render(512)],
  ['maskable-512.png', render(512, { scale: 0.66, rounded: false })],
  ['apple-touch-icon.png', render(180, { rounded: false })]
]
for (const [name, buf] of files) {
  writeFileSync(join(OUT, name), buf)
  console.log(`icons/${name}  ${(buf.length / 1024).toFixed(1)} KB`)
}
