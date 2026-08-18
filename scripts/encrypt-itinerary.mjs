// Encrypts src/itinerary.json into public/itinerary.enc.json (AES-256-GCM, PBKDF2-SHA256).
// Usage: npm run encrypt -- <passcode>
// The plaintext itinerary is never copied into dist/ — only the encrypted blob ships.
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ITERATIONS = 250000

const passcode = process.argv[2] || process.env.TRIP_PASSCODE
if (!passcode) {
  console.error('Missing passcode.\n  npm run encrypt -- <passcode>')
  process.exit(1)
}

const plaintext = readFileSync(join(ROOT, 'src', 'itinerary.json'))
const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))

const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey'])
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
)
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

const b64 = buf => Buffer.from(buf).toString('base64')
const out = {
  v: 1,
  kdf: 'PBKDF2-SHA256',
  iterations: ITERATIONS,
  salt: b64(salt),
  iv: b64(iv),
  ct: b64(ct)
}
writeFileSync(join(ROOT, 'public', 'itinerary.enc.json'), JSON.stringify(out))
console.log(`public/itinerary.enc.json written (${(out.ct.length / 1024).toFixed(1)} KB ciphertext)`)
