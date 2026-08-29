import { test, expect } from '@playwright/test';
import { login } from '../utils';

// ─────────────────────────────────────────────────────────
//  G3 → تحويل لـpixel-diff حقيقي (24 أغسطس 2026 — بند 12 من تقرير
//  الأداء/الأمان).
//
//  ⚠️ تاريخ القرار: النسخة الأصلية من الملف ده (`visual-check.spec.ts`)
//  كانت بتلتقط PNG يدوي فقط (`page.screenshot()`) بدل `toHaveScreenshot()`
//  — قرار نطاق مقصود وقتها، لأن تصميم الديسكتوب/التابلت كان لسه بيتطور
//  (السايدبار/الهيدر القديم والجديد ظاهرين مع بعض مؤقتًا، راجع قرارات
//  B1/B3/D2/D3/G1)، فأي baseline كان هيتحفظ "غلط" رسميًا بمجرد ما
//  العناصر المؤقتة دي تتشال.
//
//  ✅ اتأكد (24 أغسطس 2026) إن المرحلة المؤقتة دي خلصت واستقرت، فبقى
//  آمن نستخدم `toHaveScreenshot()` فعلي مع baseline محفوظة في git —
//  أي كسر شكل حقيقي هيفشّل الـCI تلقائيًا بدل ما يعتمد على مراجعة يدوية
//  بالعين بعد كل تشغيل.
//
//  ⚠️ threshold/maxDiffPixelRatio مضبوطين في playwright.config.ts (مش
//  هنا) عشان يطبّقوا على أي `toHaveScreenshot()` في المشروع كله.
//
//  ⚠️ الـassertion الأول (`app-shell` ظاهر) لسه موجود عمدًا قبل أي
//  screenshot — بيفرّق بين "الصفحة اتكسرت فعليًا" (فشل واضح السبب) و
//  "اختلاف شكل بصري" (فشل pixel-diff عادي).
//
//  ⚠️ الـ3 breakpoints مطابقين لاستراتيجية الخطة الأصلية (قسم 2):
//  Mobile (<768) / Tablet (768–1023) / Desktop (>=1024). القيم المختارة
//  (375/820/1440) أرقام أجهزة حقيقية شائعة (iPhone SE-ish / iPad سطري /
//  شاشة ديسكتوب متوسطة) بدل حدود الـbreakpoint بالظبط، عشان اللقطة تبان
//  زي استخدام حقيقي مش حافة نظرية.
//
//  ⚠️ التشغيل: `npm run test:visual` (أول مرة لازم `-- --update-snapshots`
//  عشان تتولّد الـbaseline، وتتراجع بالعين مرة واحدة قبل ما تتعمل commit
//  — راجع README.md قسم "الأوامر الأساسية"). بعد كده أي رن عادي بيقارن
//  ضد الـbaseline المحفوظة.
//
//  🔒 FIX (تشخيص "محتوى فاضي" في لقطات الديسكتوب — 16 أغسطس 2026): كان
//  فيه دِپّة عابرة (البيانات بتتصفّر لحظيًا وترجع خلال أقل من ثانيتين)
//  في cases/calendar، اتأكدت بأدوات تشخيص مؤقتة (لقطات @0/400/2000ms +
//  قياس طول <main> + فيديو) اتشالت بعد ما وصلنا للمعلومة المطلوبة —
//  الملف رجع لشكله البسيط. المهلة 400ms تحت كافية للحالة العادية (تأكد
//  منها في تشغيلات لاحقة)؛ الدِپّة نفسها race condition حقيقي في تحميل
//  البيانات لسه قائم كبند مؤجل (مش باگ كاسر، جيمي قرر يأجله)، مش زيادة
//  المهلة هنا هتصلحها لو رجعت تظهر تاني.
// ─────────────────────────────────────────────────────────

const BREAKPOINTS = [
  { name: 'mobile', viewport: { width: 375, height: 812 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
] as const;

for (const bp of BREAKPOINTS) {
  test.describe(`تحقق بصري — ${bp.name} (${bp.viewport.width}×${bp.viewport.height})`, () => {
    test.use({ viewport: bp.viewport });

    test(`لقطات الشاشات الأساسية — ${bp.name}`, async ({ page }) => {
      // 🔒 FIX (فحص لوجز E2E — 15 أغسطس 2026): على breakpoint الديسكتوب
      // (1440×900، ≥1024px)، AppHeader/CommandDock الموبايل بقوا `lg:hidden`
      // فعليًا (H2)، فـ`nav-cases`/`nav-more-toggle`/... بقوا غير مرئيين
      // ومش قابلين للنقر عند 1440×900 — ده كان بيسبب timeout هنا (السكريبت
      // ده بيغطي الـ3 breakpoints بنفس السيليكتورز الموبايل بالظبط، من
      // غير تفريق). الحل: نستخدم `desktop-nav-*` (DesktopSidebar، مسطّحة
      // بدون قائمة "المزيد" — راجع navConfig.ts) لما `bp.name === 'desktop'`،
      // ونسيب سيليكتورز الموبايل زي ما هي لـmobile/tablet (لسه بتشتغل صح
      // تحت 1024px). صفر تغيير على منطق الموبايل/التابلت.
      const isDesktopBp = bp.name === 'desktop';
      const navCases = isDesktopBp ? 'desktop-nav-cases' : 'nav-cases';
      const navCalendar = isDesktopBp ? 'desktop-nav-calendar' : 'nav-calendar';
      const navReminders = isDesktopBp ? 'desktop-nav-reminders' : 'nav-reminders';
      const navClients = isDesktopBp ? 'desktop-nav-clients' : 'nav-more-clients';
      const navDashboard = isDesktopBp ? 'desktop-nav-dashboard' : 'nav-dashboard';

      await login(page);
      await expect(page.getByTestId('app-shell')).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${bp.name}-01-dashboard.png`, { fullPage: true });

      await page.getByTestId(navCases).click();
      await expect(page.getByTestId(navCases)).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${bp.name}-02-cases.png`, { fullPage: true });

      await page.getByTestId(navCalendar).click();
      await expect(page.getByTestId(navCalendar)).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${bp.name}-03-calendar.png`, { fullPage: true });

      await page.getByTestId(navReminders).click();
      await expect(page.getByTestId(navReminders)).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page).toHaveScreenshot(`${bp.name}-04-reminders.png`, { fullPage: true });

      // الموكلين (شاشة D3: كروت + جدول hidden lg:block). على الموبايل/
      // التابلت لازم نفتح قائمة "المزيد" الأول — على الديسكتوب
      // desktop-nav-clients ظاهر مباشرة جوه السايدبار (مفيش "مزيد" أصلًا).
      if (!isDesktopBp) {
        await page.getByTestId('nav-more-toggle').click();
      }
      await page.getByTestId(navClients).click();
      // زرار "إضافة موكل" ثابت الظهور في الشاشة دي بمجرد ما التاب
      // يتفتح (بعكس nav-more-clients اللي بيختفي مع إغلاق قائمة
      // "المزيد" وقت التنقل) — أفضل مؤشر إن الشاشة فعلاً حمّلت.
      await expect(page.getByTestId('new-client-button')).toBeVisible();
      // 🔒 FIX (تشخيص لوجز CI — 29 أغسطس 2026): لقطة الموكلين كانت بتقارن
      // محتوى القايمة نفسه (أسماء/أرقام حقيقية)، مش بس التخطيط. القايمة
      // مرتبة created_at desc وبتجيب أول PAGE_SIZE بس — وده تست رقم 113
      // من 116 (workers:1، تسلسلي)، يعني وقت ما بياخد اللقطة، عشرات
      // موكلين "اختبار E2E" من تستات قبله (clients/validation/fees-linkage/
      // case-parties...) لسه موجودين فعليًا (التنظيف بيحصل في globalTeardown
      // بعد كل التستات، مش بعد كل تست لوحده) — فبيملّوا صفحة 1 كاملة
      // ويستبدلوا الموكلين اللي الـbaseline اتلقطلهم أصلاً. نفس فئة
      // المشكلة اللي حلها mobile-01-dashboard قبل كده (راجع تعليق
      // playwright.config.ts، 25 أغسطس) بترفيع maxDiffPixelRatio — هنا
      // بنطبّق الحل الجذري المؤجل ساعتها فعليًا (mask) بدل ما نمتص الفرق:
      // بنغطي صفوف/كروت الموكلين الديناميكية (client-card على موبايل/
      // تابلت، clients-table-row على الديسكتوب) عشان المقارنة تفضل بتتأكد
      // من التخطيط والهيدر والتابين وزرار الإضافة (اللي كلها ثابتة وبتكشف
      // كسر شكل حقيقي)، من غير ما تعتمد على محتوى نصي متغير حسب ترتيب
      // التستات قبلها.
      const dynamicClientRows = isDesktopBp
        ? page.getByTestId('clients-table-row')
        : page.getByTestId('client-card');
      await expect(page).toHaveScreenshot(`${bp.name}-05-clients.png`, {
        fullPage: true,
        mask: [dynamicClientRows],
      });

      await page.getByTestId(navDashboard).click();
    });
  });
}
