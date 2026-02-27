import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { buildCatalog, MODELS_DIR, GPUS_DIR } from './scripts/build-catalog'

const rootPkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8'),
)

const CATALOG_OUTPUT = resolve(import.meta.dirname, 'public', 'v1')

/**
 * Vite plugin: watches registry/models/ and registry/gpus/ for changes,
 * then rebuilds public/v1/catalog.json so the dev server picks it up.
 */
function catalogWatch(): import('vite').Plugin {
  return {
    name: 'catalog-watch',
    configureServer(server) {
      const dirs = [MODELS_DIR, GPUS_DIR]
      server.watcher.add(dirs)

      let debounce: ReturnType<typeof setTimeout> | null = null
      const rebuild = (path: string) => {
        if (!path.endsWith('.json')) return
        // Only react to changes inside registry dirs, not the output
        const isRegistry = path.startsWith(MODELS_DIR) || path.startsWith(GPUS_DIR)
        if (!isRegistry) return
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          buildCatalog(CATALOG_OUTPUT)
        }, 200)
      }

      server.watcher.on('change', rebuild)
      server.watcher.on('add', rebuild)
      server.watcher.on('unlink', rebuild)
    },
    // Build the catalog once at dev server start
    buildStart() {
      buildCatalog(CATALOG_OUTPUT)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), catalogWatch()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: false,
  },
})
