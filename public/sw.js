/* NYC trip PWA service worker — app shell + OSM tile caching. */
const VERSION = 'v1'
const SHELL = `nyc-trip-shell-${VERSION}`
const TILES = `nyc-trip-tiles-${VERSION}`
const TILE_LIMIT = 400

const scope = self.registration.scope // e.g. https://user.github.io/nyc-trip/
const SHELL_URLS = [
  scope,
  `${scope}index.html`,
  `${scope}manifest.webmanifest`,
  `${scope}itinerary.enc.json`,
  `${scope}icons/icon-192.png`,
  `${scope}icons/icon-512.png`,
  `${scope}icons/apple-touch-icon.png`
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.allSettled(SHELL_URLS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('nyc-trip-') && k !== SHELL && k !== TILES)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

async function trimCache (name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)))
}

async function tileFirst (request) {
  const cache = await caches.open(TILES)
  const hit = await cache.match(request)
  if (hit) return hit
  try {
    const res = await fetch(request)
    if (res && (res.ok || res.type === 'opaque')) {
      cache.put(request, res.clone())
      trimCache(TILES, TILE_LIMIT)
    }
    return res
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline tile' })
  }
}

async function staleWhileRevalidate (request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  const network = fetch(request)
    .then(res => {
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })
    .catch(() => null)
  return hit || (await network) || new Response('', { status: 504 })
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Map tiles: cache-first, capped.
  if (/tile\.openstreetmap\.org$/.test(url.hostname)) {
    event.respondWith(tileFirst(request))
    return
  }

  // Navigations: network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          caches.open(SHELL).then(c => c.put(scope, res.clone())).catch(() => {})
          return res
        })
        .catch(async () => (await caches.match(scope)) || (await caches.match(`${scope}index.html`)) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
    )
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
