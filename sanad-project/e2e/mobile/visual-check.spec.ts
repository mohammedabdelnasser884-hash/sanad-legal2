import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { login } from '../utils';

// ─────────────────────────────────────────────────────────
//  G3 — سكريبت التحقق البصري (Visual Verification Script).
//
//  ⚠️ ده **مش** فحص pixel-diff آلي (`toHaveScreenshot()` مع baseline
//  محفوظة) — قرار نطاق مقصود: كل الخطة دي (A–G) بتضيف تصميم ديسكتوب/
//  تابلت *جديد كليًا* لسه بيتطوّر (السايدبار/الهيدر لسه ظاهرين جنب
//  CommandDock/AppHeader الأصليين مؤقتًا، راجع قرارات B1/B3/D2/D3/G1
//  الموثّقة)، فأي baseline نحفظه دلوقتي هيبقى "غلط" رسميًا بمجرد ما
//  إخفاء العناصر المؤقتة ده يتنفذ لاحقًا — يعني pixel-diff هيفشل CI
//  باستمرار لأسباب متوقعة ومقصودة، مش باجات حقيقية. البديل الأنسب في
//  المرحلة دي: التقاط لقطات فعلية (PNG) لكل breakpoint في مجلد ثابت
//  (`e2e/visual-snapshots/<breakpoint>/`) عشان Gemy يراجعها بعينه يدويًا
//  بعد كل تشغيل — بالظبط المعنى الحرفي لـ"سكريبت تحقق بصري" في نص
//  الخطة (تحقق بصري = عين إنسان، مش اختبار آلي pixel-perfect).
//
//  ⚠️ الـassertion الوحيد هنا (`app-shell` ظاهر) هدفه التأكد إن الصفحة
//  فعلاً حمّلت صح قبل التقاط اللقطة — مش مقارنة شكل. لو الصفحة اتكسرت
//  فعليًا (مش مجرد اختلاف تصميم)، التست ده هيفشل ويوضح السبب، بعكس
//  pixel-diff اللي كان هيفشل برضه لكن من غير ما يميّز "كسر حقيقي" عن
//  "تغيير تصميم متوقع".
//
//  ⚠️ الـ3 breakpoints مطابقين لاستراتيجية الخطة نفسها (قسم 2):
//  Mobile (<768) / Tablet (768–1023) / Desktop (>=1024). القيم المختارة
//  (375/820/1440) أرقام أجهزة حقيقية شائعة (iPhone SE-ish / iPad سطري /
//  شاشة ديسكتوب متوسطة) بدل حدود الـbreakpoint بالظبط، عشان اللقطة تبان
//  زي استخدام حقيقي مش حافة نظرية.
//
//  ⚠️ التشغيل: `npx playwright test e2e/mobile/visual-check.spec.ts
//  --project=mobile` (نفس أي spec تاني — بيستخدم نفس webServer/globalSetup
//  الموجودين، مفيش أداة أو dependency جديدة اتضافت). مجلد الإخراج
//  (`e2e/visual-snapshots/`) مش مقصود يتزوّد في git — نفس معاملة
//  `playwright-report/`/`test-results/` (مخرجات تشغيل محلية).
// ─────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_ROOT = path.join(__dirname, '..', '..', 'e2e-visual-snapshots');

const BREAKPOINTS = [
  { name: 'mobile', viewport: { width: 375, height: 812 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
] as const;

for (const bp of BREAKPOINTS) {
  test.describe(`تحقق بصري — ${bp.name} (${bp.viewport.width}×${bp.viewport.height})`, () => {
    test.use({ viewport: bp.viewport });

    test(`لقطات الشاشات الأساسية — ${bp.name}`, async ({ page }) => {
      const outDir = path.join(SNAPSHOT_ROOT, bp.name);

      await login(page);
      await expect(page.getByTestId('app-shell')).toBeVisible();
      await page.screenshot({ path: path.join(outDir, '01-dashboard.png'), fullPage: true });

      await page.getByTestId('nav-cases').click();
      await expect(page.getByTestId('nav-cases')).toBeVisible();
      await page.screenshot({ path: path.join(outDir, '02-cases.png'), fullPage: true });

      await page.getByTestId('nav-calendar').click();
      await expect(page.getByTestId('nav-calendar')).toBeVisible();
      await page.screenshot({ path: path.join(outDir, '03-calendar.png'), fullPage: true });

      await page.getByTestId('nav-reminders').click();
      await expect(page.getByTestId('nav-reminders')).toBeVisible();
      await page.screenshot({ path: path.join(outDir, '04-reminders.png'), fullPage: true });

      // "المزيد" — الموكلين (شاشة D3: كروت + جدول hidden lg:block).
      await page.getByTestId('nav-more-toggle').click();
      await page.getByTestId('nav-more-clients').click();
      // زرار "إضافة موكل" ثابت الظهور في الشاشة دي بمجرد ما التاب
      // يتفتح (بعكس nav-more-clients اللي بيختفي مع إغلاق قائمة
      // "المزيد" وقت التنقل) — أفضل مؤشر إن الشاشة فعلاً حمّلت.
      await expect(page.getByTestId('new-client-button')).toBeVisible();
      await page.screenshot({ path: path.join(outDir, '05-clients.png'), fullPage: true });

      await page.getByTestId('nav-dashboard').click();
    });
  });
}
