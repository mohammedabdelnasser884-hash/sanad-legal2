import { test, expect } from '@playwright/test';
import { login } from './utils';

// خطة "الموارد القانونية" — مرحلة 6 (اختبارات): إدارة "دليل المحامي" في
// لوحة الإدارة مقصورة بالكامل على حساب السوبر أدمن الوحيد
// (SUPER_ADMIN_EMAIL في AdminPanel.tsx) — نفس نمط admin-legal-library.spec.ts
// وadmin-encyclopedia.spec.ts بالظبط. حساب E2E_TEST_EMAIL هو owner/admin
// لمكتب تجريبي عادي (مش سوبر أدمن)، فالتست ده بيتأكد إن كرت القسم مش ظاهر
// له خالص في شبكة أقسام لوحة الإدارة.
//
// ⚠️ بخلاف "الموسوعة القانونية" (اللي كرتها اتشال بالكامل من الشبكة)،
// "دليل المحامي" لسه ليه كرت مباشر في الشبكة (admin-section-lawyer_guide)
// بجانب زرار "إدارة دليل المحامي" في شاشة التصفح العادية — الاتنين
// مقصورين على isSuperAdminUser (راجع AdminPanel.tsx). التست ده بيغطي
// غياب الكرت؛ غياب زرار "إدارة دليل المحامي" نفسه مغطى في
// lawyer-guide-browse.spec.ts.
//
// ⚠️ تغطية CRUD حقيقية (إضافة/تعديل/حذف/ترتيب تصنيف أو رابط) محتاجة حساب
// سوبر أدمن مخصص للاختبار مش متاح في بيئة E2E الحالية — نفس القرار
// المحسوم بخصوص إدارة الموسوعة القانونية (مؤجّل نهائيًا). التغطية البديلة
// لمنطق الكتابة نفسه (createLinkCategory/updateLinkCategory/deleteLinkCategory/
// createLink/updateLink/deleteLink) في اختبارات الـEdge Function
// (supabase/functions/encyclopedia-admin/index.test.ts).
//
// ⚠️ شرط أساسي: حساب E2E_TEST_EMAIL لازم يكون Admin/Owner، وإلا
// desktop-nav-admin مش هيظهر أصلًا (نفس ملحوظة admin-archive-lifecycle.spec.ts).

test('حساب مكتب عادي (مش سوبر أدمن) → كرت قسم "دليل المحامي" مش ظاهر في شبكة أقسام لوحة الإدارة', async ({ page }) => {
  await login(page);
  await page.getByTestId('desktop-nav-admin').click();

  await expect(page.getByTestId('admin-section-lawyer_guide')).toHaveCount(0);
});
