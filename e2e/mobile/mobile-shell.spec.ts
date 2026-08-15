import { test, expect } from '@playwright/test';
import { login } from '../utils';

// ─────────────────────────────────────────────────────────
//  G3 — أول ملف E2E بيشتغل فعليًا على فيوبورت موبايل حقيقي
//  (project 'mobile'، devices['iPhone 13']، راجع playwright.config.ts).
//
//  ⚠️ الهدف هنا محدد وضيق عمدًا (Smoke بس، مش تكرار كامل للـ31 spec
//  الحالية على فيوبورت تاني): إثبات إن كل قرارات التأجيل الموثّقة من
//  B1 لحد G1 ("CommandDock/AppHeader الأصليين هيفضلوا ظاهرين مؤقتًا،
//  وDesktopSidebar/DesktopHeader/TabletDrawer هيتعرضوا *جنب*هم على
//  الديسكتوب/التابلت بس") فعلاً بترجع لشكل الموبايل الأصلي 100% تحت
//  768px — يعني useResponsiveLayout بيرجّع 'mobile'، وبالتالي
//  canShowSidebar/canShowHeader/canShowTabletDrawer الثلاثة في
//  AppShell.tsx كلهم false، فمكونات الديسكتوب/التابلت الثلاثة **مش
//  بتتركب في الـDOM خالص** (مش بس مخفية بـCSS زي `hidden lg:block` —
//  شرط React نفسه بيمنع الـmount من أصله)، وCommandDock/AppHeader
//  الأصليين هما بس اللي شغالين، بالظبط زي قبل ما الخطة دي تبدأ.
//
//  ⚠️ ليه مش بنكرر رحلات إنشاء قضية/موكل كاملة هنا: دي مغطاة بالفعل
//  في الـ31 spec الحالية (على فيوبورت Desktop Chrome) — تكرارها هنا
//  مرة تانية بس بفيوبورت مختلف هيضاعف وقت CI من غير قيمة إضافية حقيقية،
//  لأن منطق الحفظ/الفاليديشن نفسه (useCaseActions/useClientActions...)
//  صفر علاقة له بالفيوبورت أصلًا. اللي محتاج فحص فعلي هنا هو تحديدًا
//  الطبقة اللي الخطة دي أضافتها (AppShell/DesktopSidebar/DesktopHeader/
//  TabletDrawer) — ده نطاق mobile-shell.spec.ts بالكامل.
// ─────────────────────────────────────────────────────────

test('فيوبورت موبايل: مكونات الديسكتوب/التابلت مش بتتركب، والدوك/الهيدر الأصليين شغالين', async ({ page }) => {
  await login(page);

  // 1) الـ3 مكونات الجديدة (B–G) لازم يكونوا غير موجودين في الـDOM
  //    خالص عند isMobile — مش بس toBeHidden (اللي ممكن تنجح غلط لو
  //    العنصر موجود بس بـdisplay:none من كلاس CSS)، لازم toHaveCount(0)
  //    عشان نتأكد إن شرط React نفسه (canShowSidebar/canShowHeader/
  //    canShowTabletDrawer) بيمنع الـmount من أصله.
  await expect(page.getByTestId('desktop-sidebar')).toHaveCount(0);
  await expect(page.getByTestId('desktop-header')).toHaveCount(0);
  await expect(page.getByTestId('tablet-drawer-toggle')).toHaveCount(0);
  await expect(page.getByTestId('tablet-drawer-panel')).toHaveCount(0);

  // 2) الشريط السفلي الأصلي (CommandDock) والهيدر الأصلي (AppHeader)
  //    لازم يكونوا ظاهرين وشغالين زي ما هم من قبل الخطة دي — صفر تغيير
  //    عليهم موثّق في كل مرحلة من B1 لحد G2.
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-cases')).toBeVisible();
  await expect(page.getByTestId('nav-calendar')).toBeVisible();
  await expect(page.getByTestId('nav-reminders')).toBeVisible();
  await expect(page.getByTestId('nav-ai-center')).toBeVisible();
  await expect(page.getByTestId('nav-more-toggle')).toBeVisible();
  await expect(page.getByTestId('header-search-open')).toBeVisible();

  // 3) قائمة "المزيد" (nav-more-toggle) لازم تفضل شغالة بنفس الشكل —
  //    الشبكة الرباعية (موكلين/مستندات/أتعاب/[أدمن]) اللي navConfig.ts
  //    (A2) اتبنى بروحها من غيرها بس بدون أي تعديل على CommandDock نفسه.
  await page.getByTestId('nav-more-toggle').click();
  await expect(page.getByTestId('nav-more-clients')).toBeVisible();
  await expect(page.getByTestId('nav-more-documents')).toBeVisible();
  await expect(page.getByTestId('nav-more-fees')).toBeVisible();
  // إغلاق القائمة تاني (بالضغط على نفس الزرار) قبل أي تنقل تالي.
  await page.getByTestId('nav-more-toggle').click();

  // 4) التنقل بين التابات الأساسية عبر CommandDock لازم يفضل شغال —
  //    فحص سريع إن كل تاب بيفتح من غير أي خطأ في الكونسول (login()
  //    في utils.ts بيسجّل console.error/warning لو حصل).
  await page.getByTestId('nav-cases').click();
  await expect(page.getByTestId('nav-cases')).toBeVisible();
  await page.getByTestId('nav-calendar').click();
  await expect(page.getByTestId('nav-calendar')).toBeVisible();
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
});

test('فيوبورت موبايل: جداول الديسكتوب (D1–D3) مش ظاهرة جنب الكروت', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-cases').click();

  // الجدول (`hidden lg:block`) لسه موجود في الـDOM (قرار D2/D3 الموثّق:
  // تأجيل الإخفاء الفعلي للكروت لحد ما يبقى فيه تغطية موبايل — دلوقتي
  // بقت متوفرة هنا)، بس لازم يكون مش ظاهر بصريًا تحت 768px — الـCSS class
  // نفسه (`hidden`) هو اللي بيتفحص هنا (بعكس السايدبار/الهيدر اللي React
  // نفسه بيمنع تركيبهم، الجدول تركيبه شرطه CSS بس زي ما اتوثق في D1/D3).
  // `toBeHidden()` بينجح في الحالتين: العنصر موجود بـ`display:none`
  // (المتوقع حاليًا)، أو مش موجود في الـDOM خالص (لو حصل تحسين إضافي
  // بعد كتابة التست ده بيشيل العنصر تمامًا على الموبايل).
  await expect(page.getByTestId('cases-desktop-table')).toBeHidden();

  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-clients').click();
  await expect(page.getByTestId('clients-desktop-table')).toBeHidden();
});
