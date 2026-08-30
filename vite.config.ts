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
    rollupOptions: {
      output: {
        // ⚡ FIX (تحليل bundle build:analyze — 30 أغسطس 2026): فصل
        // مكتبات الـvendor الأساسية (بتتغيّر نادرًا جدًا) عن كود
        // التطبيق نفسه (بيتغيّر كل نشر) — بيسمح للمتصفح إنه يكاش شنك
        // الـvendor لمدة طويلة عبر النشرات المتتالية، بدل ما يعيد
        // تحميله من الصفر مع كل تحديث بسيط في كود سند. react/react-dom
        // في شنك منفصل عن @supabase/supabase-js لأنهم بيتحدّثوا بمعدل
        // مختلف تمامًا عن بعض. باقي مكتبات node_modules (الأصغر حجمًا)
        // بتتجمّع في شنك vendor عام واحد. لاحظ إن jspdf/html2canvas/docx
        // متعملهاش include هنا عمدًا — هما أصلًا بيتحمّلوا بـdynamic
        // import() جوه exportApi.ts، فـVite بيطلعهم في chunks منفصلة
        // تلقائيًا من غير أي تدخل هنا.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('/docx/')) {
            return undefined; // سيب دول لآلية الـdynamic import تتعامل معاهم
          }
          return 'vendor';
        },
      },
    },
  },
})
