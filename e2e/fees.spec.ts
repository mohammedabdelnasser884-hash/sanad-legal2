import { test, expect } from '@playwright/test';
import { login, createCaseWithClient, selectCaseFromSearch } from './utils';

// خطوة 4 من مرحلة 7 (E2E) — إضافة أتعاب.
// اتأكد من الكود الفعلي (FeesTab.tsx/useFeesActions.ts) إن الأتعاب سجل
// مستقل مربوط بقضية عن طريق case_id — مش جزء من شاشة تفاصيل القضية
// نفسها. فالرحلة هنا: إنشاء قضية (من غير داعي نفتحها)، بعدين الدخول
// لتبويب "الأتعاب" (تحت زرار "المزيد" في الشريط السفلي) وإضافة سجل
// أتعاب مربوط بيها.
//
// 🔄 CHANGED (المرحلة 7 — بعد القرار النهائي بقفل حقل الموكل في الفورمين):
// createCase العادية بترجع قضية من غير client_id حقيقي، وresolveCaseFeeClient
// بترجع EMPTY_RESOLVED_CLIENT ليها → save-fee-button يفضل disabled. لازم
// createCaseWithClient (المرحلة 6 + 7) اللي بتعمل موكل حقيقي وتربطه وقت
// الإنشاء. وحقل القضية بقى CaseSearchSelect (بحث حي)، مش <select> عادي —
// selectOption() القديمة مبقتش تشتغل خالص، بدالها selectCaseFromSearch.

test('إضافة أتعاب لقضية وظهورها في تبويب الأتعاب', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار E2E - قضية 4 - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);

  // 1) الدخول لتبويب "الأتعاب" (جوه قايمة "المزيد")
  await page.getByTestId('desktop-nav-fees').click();

  // 2) فتح فورم "إضافة أتعاب قضية"
  await page.getByTestId('add-fee-button').click();

  // 3) اختيار القضية اللي اتعملت (بحث + اختيار من النتائج، نمط
  // CaseSearchSelect الجديد) — اسم الموكل بيتملى تلقائيًا (fee-client-locked)
  // من resolveCaseFeeClient بمجرد الاختيار، مفيش داعي نلمسه هنا. وكتابة
  // إجمالي الأتعاب (باقي الحقول اختيارية حسب useFeesActions.handleSave).
  await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
  await page.getByTestId('fee-total').fill('5000');

  // 4) الحفظ — handleSave بيعمل setShowForm(false) و fetchFees() بعد النجاح
  await page.getByTestId('save-fee-button').click();
  await expect(page.getByTestId('fee-total')).not.toBeVisible({ timeout: 15_000 });

  // 5) التأكد إن سجل الأتعاب ظهر في القايمة (التبويب الافتراضي "مؤجلة"
  // بيطابق حالة سجل بإجمالي > 0 ومدفوع = 0 — computeFeeStatus في feeStatus.ts)
  const newFeeCard = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await expect(newFeeCard.first()).toBeVisible({ timeout: 15_000 });
});
