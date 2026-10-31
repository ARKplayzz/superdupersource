import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The renderer on its own, in a browser, running the simulator in the page (see browserApi.ts).
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, '../../Supersources-templates'),
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
})
