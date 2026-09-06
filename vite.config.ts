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
      // ⚡ TEMP (المرحلة 0 — خطة تحسين الأداء، 7 سبتمبر 2026): من غير alias
      // ده، React.Profiler's onRender بيتشال تمامًا من build الـproduction
      // العادي (React بيشيله عمدًا توفيرًا للأداء) — ده اللي كان بيخلي
      // overlay القياس يرجع فاضي دايمًا رغم إن التطبيق شغال صح. النسخة دي
      // ("profiling") بتحافظ على قياسات onRender بس بأوفرهيد بسيط إضافي.
      // ⚠️ لازم تتشال بعد إغلاق المرحلة 0 (هي وباقي أدوات src/dev/).
      'react-dom/client': 'react-dom/profiling',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // ⚡ FIX (تحليل bundle، مرحلة 4 — 30 أغسطس 2026): مكتبة `docx`
        // كانت فعلًا بتتحمّل كسول صح (dynamic import جوه exportApi.ts،
        // زي jspdf/html2canvas بالظبط)، لكن Vite كان بيسمّي الشنك بتاعها
        // تلقائيًا "index-B3-*.js" — لأن الملف الرئيسي لمكتبة docx نفسه
        // اسمه "index.mjs"، فـVite بياخد نفس اسم شنك التطبيق الرئيسي
        // ("index-*.js") ويضيف لاحقة تمييز بس. ده كان بيوهم إن فيه
        // ~347kB زيادة في التحميل الأساسي رغم إنها مش بتتحمّل غير عند
        // تصدير مستند Word فعليًا. بنسمّيها هنا صراحة "docx-export"
        // عشان أي تحليل bundle مستقبلي يبقى واضح من أول نظرة.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('jspdf') || id.includes('html2canvas')) {
            return undefined; // سيب دول لآلية الـdynamic import تتعامل معاهم
          }
          if (id.includes('/docx/')) return 'docx-export';
          return 'vendor';
        },
      },
    },
  },
})
