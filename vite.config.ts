import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// شغّل بـ`npm run build:analyze` — بيولّد dist/stats.html بعد الـbuild
// من غير ما يأثر على الـbuild العادي (npm run build) خالص.
const shouldAnalyze = process.env.ANALYZE === 'true'

export default defineConfig({
  plugins: [
    react(),
    shouldAnalyze &&
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
