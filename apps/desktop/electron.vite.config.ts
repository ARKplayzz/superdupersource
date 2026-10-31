import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// @sds/core is TypeScript source in the workspace, so bundle it rather than externalize it.
const bundleCore = { externalizeDeps: { exclude: ['@sds/core'] } }

export default defineConfig({
  main: { build: bundleCore },
  preload: { build: bundleCore },
  renderer: {
    plugins: [react()],
    // The template PNGs are served as-is: /Slide_01.PNG etc.
    publicDir: resolve(__dirname, '../../Supersources-templates'),
  },
})
