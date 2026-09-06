import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // ⚠️ الفانكشنز اللي بتستورد supabase-js بصيغة Deno (بعكس باقي
      // الفانكشنز اللي بتستخدم fetch خام) بتكتب المسار بشكلين مختلفين:
      // 'npm:@supabase/supabase-js@2' (embed-batch، process-law-extract)
      // و 'https://esm.sh/@supabase/supabase-js@2' (session-alerts).
      // Vite مش بيعرف يحل الأشكال دي أصلًا (مش node resolution عادي)،
      // فبنوجّههم للباكدج الحقيقية الموجودة في package.json عشان
      // Vitest يقدر يحمّل الملفات دي أصلًا، وبعدين نعمل vi.mock('@supabase/supabase-js', ...)
      // في كل ملف تست يحتاجها.
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
      'https://esm.sh/@supabase/supabase-js@2': '@supabase/supabase-js',
      // ⚠️ 'unpdf' (يُستخدم في process-law-extract) مش dependency حقيقية
      // في package.json أصلًا — مش زي supabase-js اللي ليه باكدج مثبّت
      // نقدر نوجّه الـ alias له. فبدل ما نضيف مكتبة PDF حقيقية بس عشان
      // التستات (تبعية وهمية غير مستخدمة فعليًا)، بنوجّه الـ import مباشرة
      // لملف محلي بديل (supabase/functions/_shared/unpdfMock.ts) بيصدّر
      // نفس الدالتين (`getDocumentProxy`, `extractText`) بسلوك قابل للتحكم
      // من التستات مباشرة (عن طريق استيراد نفس الملف وتعديل `__state`).
      'npm:unpdf': path.resolve(__dirname, 'supabase/functions/_shared/unpdfMock.ts'),
      // ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 2.2]
      // نفس سبب/نمط alias 'npm:unpdf' فوق بالحرف — 'pizzip'/'docxtemplater'
      // مش موجودين في package.json، فبنوجّههم لملفات mock محلية بديلة.
      // ⚠️ المفتاح هنا لازم يطابق حرفيًا الـspecifier المكتوب في
      // fill-document-template/index.ts (بما فيه رقم الإصدار بعد @) —
      // alias الأوبچكت ده matching بالتطابق التام، مش prefix. لو رقم
      // الإصدار في index.ts اتغيّر، لازم يتحدّث هنا بالظبط بنفس القيمة.
      'npm:pizzip@3.1.7': path.resolve(__dirname, 'supabase/functions/_shared/pizzipMock.ts'),
      'npm:docxtemplater@3.62.2': path.resolve(__dirname, 'supabase/functions/_shared/docxtemplaterMock.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    // ⚠️ ملفات e2e/*.spec.ts بتستورد test/expect من '@playwright/test' مش من
    // vitest، ولازم تتشغل حصريًا عن طريق `playwright test` (npm run test:e2e).
    // من غير الاستثناء ده، vitest بيلقطها تلقائيًا (لأنها بتطابق pattern
    // الـ include الافتراضي بتاعه لـ *.spec.ts) ويحاول يفسّرها بنفسه،
    // فبيطلع خطأ "calling test() from an async describe block" لأن
    // Playwright بتوقع تتحمّل من خلال test runner بتاعها هي مش أي loader تاني.
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
})
