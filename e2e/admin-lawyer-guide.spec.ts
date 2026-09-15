import { test, expect } from '@playwright/test';
import { login } from './utils';

// خطة "الموارد القانونية" — مرحلة 6 (اختبارات): إدارة "دليل المحامي" في
// لوحة الإدارة مقصورة بالكامل على حساب السوبر أدمن الوحيد
// (SUPER_ADMIN_EMAIL في AdminPanel.tsx) — نفس نمط admin-legal-library.spec.ts
// وadmin-encyclopedia.spec.ts بالظبط. حساب E2E_TEST_EMAIL هو owner/admin
// لمكتب تجريبي عادي (مش سوبر أدمن)، فالتست ده بيتأكد إن كرت القسم مش ظاهر
// له خالص في شبكة أقسام لوحة الإدارة.
//
// ⚡ تحديث (فصل إدارة دليل المحامي عن شبكة أقسام لوحة الإدارة — طلب
// Gemy، نفس اللي حصل مع الموسوعة القانونية بالظبط): كرت "دليل المحامي"
// اتشال بالكامل من شبكة أقسام لوحة الإدارة — دلوقتي مش موجود فيها لأي
// حساب خالص (ولا حتى السوبر أدمن)، لأن القسم بقى بيتفتح بس عن طريق زرار
// "إدارة دليل المحامي" (lawyer-guide-manage-button) الظاهر في صفحة دليل
// المحامي العادية لحساب السوبر أدمن بس — مغطى (غيابه لغير السوبر أدمن)
// في lawyer-guide-browse.spec.ts. التست ده بالتالي لسه صحيح زي ما هو
// (admin-section-lawyer_guide مالوش وجود في الشبكة أصلًا لأي حد)، لكن
// بقى بيتأكد من غياب الكرت نفسه مش بس غيابه عن حساب معيّن.
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

test('حساب مكتب عادي (مش سوبر أدمن) → كرت قسم "دليل المحامي" مش ظاهر في شبكة أقسام لوحة الإدارة (اتشال بالكامل)', async ({ page }) => {
  await login(page);
  await page.getByTestId('desktop-nav-admin').click();

  await expect(page.getByTestId('admin-section-lawyer_guide')).toHaveCount(0);
});
