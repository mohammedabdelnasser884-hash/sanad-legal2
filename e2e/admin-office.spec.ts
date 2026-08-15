import { test, expect } from '@playwright/test';
import { login, openAdminSection, expectToast } from './utils';

// المرحلة 6 (الأدمن) — دفعة 1 (أقل خطورة): إعدادات المكتب (تاب "بيانات المكتب" بس).
// تابات "الدولة"/"المرجع القانوني"/"الإشعارات" (تليجرام) أعقد وأخطر (بتلمس
// تكامل خارجي وقيم بتأثر على باقي التطبيق)، فمؤجّلة لدفعة لاحقة بقرار واعي.
//
// ⚠️ شرط أساسي: حساب E2E_TEST_EMAIL لازم يكون Admin/Owner.
// ⚠️ التست بيعدّل بيانات المكتب الحقيقية (اسم/سلوجن) ويرجّعها زي ما كانت
//    في نهايته، عشان ميسيبش أثر دائم على بيئة التست.

test('حفظ إعدادات المكتب: تعديل الاسم والسلوجن ينحفظ ويفضل بعد إعادة تحميل القسم', async ({ page }) => {
  const uniqueSuffix = Date.now();
  const newName = `مكتب اختبار E2E ${uniqueSuffix}`;
  const newSlogan = `سلوجن اختبار E2E ${uniqueSuffix}`;

  await login(page);
  await openAdminSection(page, 'office');
  await page.getByTestId('admin-office-subtab-office').click();

  // نحتفظ بالقيم الأصلية عشان نرجّعها في نهاية التست
  const nameInput = page.getByTestId('admin-office-field-name');
  const sloganInput = page.getByTestId('admin-office-field-slogan');
  await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
  const originalNameRaw = await nameInput.inputValue();
  const originalSlogan = await sloganInput.inputValue();

  // ⚠️ زرار الحفظ متعطّل لو حقل الاسم فاضي (disabled: !officeSettings.name?.trim()
  // في OfficeSection.tsx) — ده شرط عمل صحيح في التطبيق (مش لازم نغيّره)، لكنه
  // معناه إننا منقدرش "نرجّع" الاسم لحالة فاضية في التنظيف لو كان فاضي من
  // الأساس (زي أول مرة office_settings بتتعمل تلقائيًا لمكتب التست عن طريق
  // generate_invoice_number). في الحالة دي بنسيب اسم افتراضي واضح بدل الفاضي.
  const originalName = originalNameRaw.trim() || 'مكتب اختبار E2E (افتراضي)';

  await nameInput.fill(newName);
  await sloganInput.fill(newSlogan);
  await page.getByTestId('admin-office-save').click();
  await expectToast(page, '✅ تم حفظ إعدادات المكتب');

  // نرجع للداشبورد ونفتح القسم تاني للتأكد إن القيم اتحفظت فعليًا (مش state محلي بس)
  await page.getByTestId('admin-section-back').click();
  await page.getByTestId('admin-section-back').waitFor({ state: 'detached', timeout: 10_000 });
  await page.getByTestId('admin-section-office').click();
  await page.getByTestId('admin-office-subtab-office').click();

  await expect(page.getByTestId('admin-office-field-name')).toHaveValue(newName, { timeout: 10_000 });
  await expect(page.getByTestId('admin-office-field-slogan')).toHaveValue(newSlogan);

  // ── تنظيف: نرجّع القيم الأصلية عشان ميفضلش أثر دائم على بيئة التست ──
  await page.getByTestId('admin-office-field-name').fill(originalName);
  await page.getByTestId('admin-office-field-slogan').fill(originalSlogan);
  await page.getByTestId('admin-office-save').click();
  await expectToast(page, '✅ تم حفظ إعدادات المكتب');
});

// ⚠️ تحديث (12 أغسطس 2026): بعد إخفاء زرار "المكتبة القانونية" نفسه في
// AdminPanel.tsx (isSuperAdminUser && React.createElement('button', {...
// 'data-testid':'admin-section-legal_library' ...})) لغير سوبر أدمن
// المنصة، الزرار بقى مش موجود في الـ DOM خالص لحساب مكتب عادي — مش مجرد
// مخفي بـ CSS. التصميم القديم (قبل كده) كان يعتمد إن الزرار ظاهر لأي
// أدمن، والـ RLS في الداتابيز هي اللي بترفض الإضافة/التعديل فعليًا، فكان
// فيه تستين بيحاولوا يفتحوا القسم ويجربوا إضافة/تعديل/حذف قانون ويتأكدوا
// من رفض RLS. دلوقتي أي محاولة فتح للقسم أصلًا مستحيلة (مفيش زرار نضغط
// عليه)، فالتستين اتدمجوا في تست واحد بيتأكد من نقطة المنع الحقيقية
// الوحيدة اللي حساب عادي ممكن يوصلها: غياب الزرار نفسه.
//
// ⚠️ شرط أساسي: حساب E2E_TEST_EMAIL لازم يكون Admin/Owner (وإلا
// nav-more-admin مش هيظهر أصلًا)، لكن مش سوبر أدمن على مستوى المنصة —
// نفس ملحوظة admin-archive-lifecycle.spec.ts.
test('زرار المكتبة القانونية مش ظاهر لحساب مكتب عادي (مش سوبر أدمن)', async ({ page }) => {
  await login(page);
  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-admin').click();

  // الزرار مش بيتعمله render أصلًا لغير سوبر أدمن (مش مجرد إخفاء بصري) —
  // toHaveCount(0) بتعبّر عن ده بالظبط، بدل toBeVisible() الشرطية.
  await expect(page.getByTestId('admin-section-legal_library')).toHaveCount(0);
});
