# NYC Trip — Aug 18–19

Mobile-first, offline-capable PWA for a two-day NYC itinerary. Vanilla JS + Vite + Leaflet, no framework, no API keys.

## Features

- **Day 1 / Day 2 tabs** — each stop shows time, name, note and a tap-to-check circle.
- **Persistent checkboxes** — stored in `localStorage` under `nyc-trip:v1` (also remembers active day and map toggle).
- **Tap a stop name → maps** — tries `maps://` (Apple Maps) on iOS/macOS and falls back to `https://maps.google.com/?q=lat,lng` if nothing handles it; everywhere else it opens Google Maps directly.
- **Map view** — Leaflet + OpenStreetMap tiles, numbered pins for the active day joined by a dashed route line. Current stop is amber, done stops green.
- **Current-stop highlight** — on the actual trip days (2026-08-18 / 2026-08-19, device local time) the highlight follows the clock; on any other day it falls back to the first unchecked stop. Re-renders every 30s and on tab focus.
- **Deadline banners** — pinned at the top for every stop flagged `"deadline": true` (1:30 PM Statue check-in, 8:30 PM SUMMIT, plus Giulietta 4:00 and the 6:00 PM train on Day 2). On a trip day they show a live countdown and turn red inside 45 minutes.
- **Offline** — service worker caches the app shell (stale-while-revalidate) and OSM tiles (cache-first, capped at 400). Pan the map once on wifi and those tiles stay available.
- **Installable** — `manifest.webmanifest`, generated PNG icons + `apple-touch-icon`, Android install button via `beforeinstallprompt`, and an iOS "Share → Add to Home Screen" hint.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/nyc-trip/
npm run build      # regenerates icons, then builds to dist/
npm run preview
```

Note: the service worker only registers over HTTPS or on `localhost`.

## Passcode

The repo is public (GitHub Free only serves Pages from public repos), so the itinerary is protected by encryption rather than by repo visibility. **`src/itinerary.json` is gitignored and never committed** — it lives only on the machine that edits it.

`src/itinerary.json` is encrypted into `public/itinerary.enc.json` with AES-256-GCM, key derived from the passcode via PBKDF2-SHA256 at 250k iterations. Only the ciphertext is deployed; the plaintext never reaches `dist/`. The app fetches the blob, asks for the passcode, decrypts in the browser with WebCrypto, and remembers the code in `localStorage` so it unlocks offline afterwards.

To change the passcode (or after editing the itinerary):

```bash
npm run encrypt -- <passcode>
git commit -am "update itinerary" && git push
```

A `noindex` meta tag and `robots.txt` keep the URL out of search results.

## Data

All stops live in `src/itinerary.json` (local, gitignored — keep a backup). Each day has a `label`, an ISO `date` (used for the time-based highlight) and `stops` with `time`, `name`, `lat`, `lng`, `note` and optional `deadline: true`.

## Icons

`scripts/gen-icons.mjs` writes `public/icons/*.png` from scratch (raw PNG encoder over `zlib`, no image dependencies). It runs automatically as part of `npm run build`.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages. The Vite `base` is `/nyc-trip/` — if the repo is named anything else, change `base` in `vite.config.js` to match.
