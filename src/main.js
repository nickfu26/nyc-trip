import 'leaflet/dist/leaflet.css'
import './style.css'
import L from 'leaflet'

const STORE_KEY = 'nyc-trip:v1'
const PASS_KEY = 'nyc-trip:pc'
let days = []

/* ---------- persisted state ---------- */
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {} } catch { return {} }
}
const state = Object.assign({ checked: {}, day: 0, map: false, iosTipDismissed: false }, load())
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch {} }

const stopKey = (dayIdx, i) => `${dayIdx}:${i}`
const isChecked = (d, i) => !!state.checked[stopKey(d, i)]

/* ---------- time helpers ---------- */
// "1:30 PM" + "2026-08-18" -> Date in the device's local timezone
function stopDate (day, stop) {
  const [, h, m, ap] = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(stop.time.trim())
  let hour = Number(h) % 12
  if (/pm/i.test(ap)) hour += 12
  const [y, mo, d] = day.date.split('-').map(Number)
  return new Date(y, mo - 1, d, hour, Number(m), 0, 0)
}
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function isTripDay (dayIdx, now = new Date()) {
  return sameDay(now, stopDate(days[dayIdx], days[dayIdx].stops[0]))
}

// Index of the stop to highlight. On the actual trip day this is time-driven;
// otherwise it is the first unchecked stop.
function currentIndex (dayIdx, now = new Date()) {
  const day = days[dayIdx]
  if (isTripDay(dayIdx, now)) {
    let idx = -1
    day.stops.forEach((s, i) => { if (stopDate(day, s) <= now) idx = i })
    if (idx === -1) idx = 0                       // before the day starts
    return idx
  }
  const firstOpen = day.stops.findIndex((_, i) => !isChecked(dayIdx, i))
  return firstOpen === -1 ? day.stops.length - 1 : firstOpen
}

function countdown (target, now = new Date()) {
  const ms = target - now
  if (ms <= 0) return null
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  return `in ${h}h ${String(mins % 60).padStart(2, '0')}m`
}

/* ---------- maps deep link ---------- */
function openMaps (stop) {
  const q = encodeURIComponent(stop.name)
  const web = `https://maps.google.com/?q=${stop.lat},${stop.lng}`
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)
  if (!isApple) { window.open(web, '_blank', 'noopener'); return }

  // Try Apple Maps; if the app never takes over, fall back to the web map.
  let handled = false
  const onHide = () => { handled = true }
  document.addEventListener('visibilitychange', onHide, { once: true })
  window.location.href = `maps://?q=${q}&ll=${stop.lat},${stop.lng}`
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!handled && !document.hidden) window.location.href = web
  }, 900)
}

/* ---------- DOM ---------- */
const el = {
  tabs: document.getElementById('tabs'),
  stops: document.getElementById('stops'),
  banners: document.getElementById('banners'),
  clock: document.getElementById('clock'),
  progress: document.getElementById('progress'),
  mapWrap: document.getElementById('map-wrap'),
  toggleMap: document.getElementById('toggle-map')
}

function renderTabs () {
  el.tabs.innerHTML = ''
  days.forEach((day, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'tab')
    b.className = 'tab' + (i === state.day ? ' is-active' : '')
    b.setAttribute('aria-selected', String(i === state.day))
    const parts = day.label.split('— ')
    b.innerHTML = `<span class="tab-n">Day ${i + 1}</span><span class="tab-d">${parts[1] || ''}</span>`
    b.addEventListener('click', () => {
      if (state.day === i) return
      state.day = i
      save()
      render()
      if (state.map) drawMap()
    })
    el.tabs.appendChild(b)
  })
}

function renderBanners (now) {
  const day = days[state.day]
  el.banners.innerHTML = ''
  day.stops.forEach((s, i) => {
    if (!s.deadline) return
    const when = stopDate(day, s)
    const live = isTripDay(state.day, now)
    const cd = live ? countdown(when, now) : null
    const done = isChecked(state.day, i)
    const div = document.createElement('div')
    div.className = 'banner' +
      (done ? ' is-done' : '') +
      (cd && when - now < 45 * 60000 ? ' is-soon' : '')
    const status = done ? 'done' : (cd || (live ? 'now / passed' : 'hard deadline'))
    div.innerHTML =
      `<span class="banner-time">${s.time}</span>` +
      `<span class="banner-name">${s.name}</span>` +
      `<span class="banner-cd">${status}</span>`
    div.addEventListener('click', () => {
      const target = document.getElementById(`stop-${i}`)
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    el.banners.appendChild(div)
  })
}

function renderStops (now) {
  const day = days[state.day]
  const cur = currentIndex(state.day, now)
  el.stops.innerHTML = ''

  day.stops.forEach((s, i) => {
    const li = document.createElement('li')
    li.id = `stop-${i}`
    li.className = 'stop'
    if (isChecked(state.day, i)) li.classList.add('is-done')
    if (i === cur) li.classList.add('is-current')
    if (s.deadline) li.classList.add('is-deadline')

    const box = document.createElement('button')
    box.type = 'button'
    box.className = 'check'
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(isChecked(state.day, i)))
    box.setAttribute('aria-label', `Mark ${s.name} done`)
    box.textContent = isChecked(state.day, i) ? '✓' : ''
    box.addEventListener('click', () => {
      const k = stopKey(state.day, i)
      if (state.checked[k]) delete state.checked[k]
      else state.checked[k] = true
      save()
      render()
      if (state.map) drawMap()
    })

    const idx = document.createElement('span')
    idx.className = 'stop-idx'
    idx.textContent = String(i + 1)

    const body = document.createElement('div')
    body.className = 'stop-body'
    body.innerHTML =
      `<div class="stop-time">${s.time}${s.deadline ? '<span class="hard">hard</span>' : ''}</div>`

    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'stop-name'
    name.innerHTML = `${s.name} <span class="pin" aria-hidden="true">&#10148;</span>`
    name.addEventListener('click', () => openMaps(s))
    body.appendChild(name)

    const note = document.createElement('p')
    note.className = 'stop-note'
    note.textContent = s.note
    body.appendChild(note)

    li.append(box, idx, body)
    el.stops.appendChild(li)
  })

  const done = day.stops.filter((_, i) => isChecked(state.day, i)).length
  el.progress.textContent = `${done} of ${day.stops.length} stops done`
}

function renderClock (now) {
  el.clock.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function render () {
  const now = new Date()
  el.mapWrap.hidden = !state.map
  renderTabs()
  renderBanners(now)
  renderStops(now)
  renderClock(now)
}

/* ---------- map ---------- */
let map = null
let layer = null
const numberIcon = (n, cls) => L.divIcon({
  className: '',
  html: `<div class="mk ${cls}">${n}</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14]
})

function drawMap () {
  const day = days[state.day]
  const pts = day.stops.map(s => [s.lat, s.lng])

  if (!map) {
    map = L.map('map', { zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
  }
  if (layer) layer.remove()
  layer = L.layerGroup().addTo(map)

  L.polyline(pts, { color: '#f0a202', weight: 3, opacity: 0.85, dashArray: '6 6' }).addTo(layer)

  const cur = currentIndex(state.day)
  day.stops.forEach((s, i) => {
    const cls = isChecked(state.day, i) ? 'mk-done' : (i === cur ? 'mk-current' : '')
    L.marker([s.lat, s.lng], { icon: numberIcon(i + 1, cls) })
      .addTo(layer)
      .bindPopup(`<strong>${s.time}</strong><br>${s.name}`)
  })

  map.invalidateSize()
  map.fitBounds(L.latLngBounds(pts).pad(0.15))
}

el.toggleMap.addEventListener('click', () => {
  state.map = !state.map
  save()
  el.mapWrap.hidden = !state.map
  el.toggleMap.setAttribute('aria-pressed', String(state.map))
  if (state.map) drawMap()
})
if (state.map) el.toggleMap.setAttribute('aria-pressed', 'true')

/* ---------- install prompt ---------- */
const installBtn = document.getElementById('install')
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  installBtn.hidden = false
})
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  installBtn.hidden = true
})

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
if (isIOS && !standalone && !state.iosTipDismissed) {
  const tip = document.getElementById('ios-tip')
  tip.hidden = false
  document.getElementById('ios-tip-close').addEventListener('click', () => {
    tip.hidden = true
    state.iosTipDismissed = true
    save()
  })
}

/* ---------- passcode gate ---------- */
// The itinerary ships as an AES-256-GCM blob; the key is derived from the
// passcode with PBKDF2 so the data is unreadable without it.
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0))

let blobPromise = null
const loadBlob = () => {
  if (!blobPromise) {
    blobPromise = fetch(`${import.meta.env.BASE_URL}itinerary.enc.json`).then(r => {
      if (!r.ok) throw new Error(`itinerary blob ${r.status}`)
      return r.json()
    })
  }
  return blobPromise
}

async function decrypt (passcode) {
  const blob = await loadBlob()
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(blob.salt), iterations: blob.iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.ct))
  return JSON.parse(new TextDecoder().decode(plain))
}

const gate = document.getElementById('gate')
const gateForm = document.getElementById('gate-form')
const gateInput = document.getElementById('gate-input')
const gateError = document.getElementById('gate-error')

function start (itinerary) {
  days = itinerary.days
  gate.hidden = true
  document.getElementById('app').hidden = false
  render()
  if (state.map) drawMap()
  setInterval(render, 30000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render() })
}

async function tryPasscode (passcode, { remember }) {
  const itinerary = await decrypt(passcode)   // throws on a wrong code
  if (remember) { try { localStorage.setItem(PASS_KEY, passcode) } catch {} }
  start(itinerary)
}

gateForm.addEventListener('submit', async e => {
  e.preventDefault()
  const code = gateInput.value.trim()
  if (!code) return
  gateError.textContent = ''
  gateForm.classList.add('is-busy')
  try {
    await tryPasscode(code, { remember: true })
  } catch (err) {
    gateError.textContent = navigator.onLine === false && !blobPromise
      ? 'Offline and not yet unlocked on this device.'
      : 'Wrong passcode.'
    gateInput.select()
  } finally {
    gateForm.classList.remove('is-busy')
  }
})

/* ---------- boot ---------- */
const saved = (() => { try { return localStorage.getItem(PASS_KEY) } catch { return null } })()
if (saved) {
  tryPasscode(saved, { remember: false }).catch(() => {
    try { localStorage.removeItem(PASS_KEY) } catch {}
    gate.hidden = false
    gateInput.focus()
  })
} else {
  gate.hidden = false
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(err => console.warn('SW registration failed', err))
  })
}
