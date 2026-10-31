import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// The hero animation draws on the Slide 01 background. Serve it straight from the templates folder
// rather than keeping a second copy.
const BACKGROUND = resolve(__dirname, '../../Supersources-templates/Slide_01.PNG')

function background(): Plugin {
  return {
    name: 'sds-background',
    configureServer(server) {
      server.middlewares.use('/Slide_01.PNG', (_req, res) => {
        res.setHeader('Content-Type', 'image/png')
        res.end(readFileSync(BACKGROUND))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'Slide_01.PNG', source: readFileSync(BACKGROUND) })
    },
  }
}

export default defineConfig({
  plugins: [background()],
  server: { port: 5198, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
