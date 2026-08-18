import { defineConfig } from 'vite'

// GitHub Pages serves the project site from https://<user>.github.io/nyc-trip/
export default defineConfig({
  base: '/nyc-trip/',
  build: {
    target: 'es2019',
    assetsInlineLimit: 0
  }
})
