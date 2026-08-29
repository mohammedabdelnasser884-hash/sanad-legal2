import { test, expect } from '@playwright/test';
import { login, createCaseWithClient, selectCaseFromSearch, ADVANCE_PAYMENT_DATE } from './utils';

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
//
// 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): التشغيل الفعلي
// كشف إن الفورم فيه 3 حقول إجبارية تانية غير fee-total كان التست ده (وكل
// تستات الأتعاب التانية) بيتجاهلها خالص:
//   1. "المستلم من المكتب" (fee-receiver) — إجباري دايمًا (useFeesActions.ts:389).
//   2. "المبلغ المدفوع" (fee-paid) — إجباري في مسار الإنشاء الجديد (!editId)
//      بس، لازم > 0 (دفعة مقدّمة إجبارية — create_fee_with_advance RPC).
//   3. "تاريخ الدفعة" (fee-payment-date) — إجباري في نفس المسار.
// من غيرهم save-fee-button كان بيرمي فورًا لتوست فاليديشن ("حقل ... مطلوب")
// بدل ما يقفل الفورم فعليًا، وده اللي ظهر في اللوج (fee-total فضل visible
// بعد الضغط — يعني الحفظ اتمنع بصمت). كمان بما إن الدفعة المقدّمة دي
// بتتسجل كصف حقيقي في fee_payments (مش مجرد رقم على السجل)، حالة السجل
// (computeFeeStatus) بقت 'deferred' لو المدفوع < الإجمالي — فاخترنا مدفوع
// أول أقل من الإجمالي (1000 من 5000) عشان يفضل يظهر في التاب الافتراضي
// "مؤجلة" بالظبط زي النية الأصلية للتست.
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
  // كل الحقول الإجبارية الأربعة (القضية فوق + المستلم + الإجمالي +
  // المدفوع + تاريخ الدفعة — راجع الملحوظة فوق التست).
  await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
  await page.getByTestId('fee-receiver').fill('محامي الاختبار');
  await page.getByTestId('fee-total').fill('5000');
  await page.getByTestId('fee-paid').fill('1000');
  await page.getByTestId('fee-payment-date').fill(ADVANCE_PAYMENT_DATE);

  // 4) الحفظ — handleSave بيعمل setShowForm(false) و fetchFees() بعد النجاح
  await page.getByTestId('save-fee-button').click();
  await expect(page.getByTestId('fee-total')).not.toBeVisible({ timeout: 15_000 });

  // 5) التأكد إن سجل الأتعاب ظهر في القايمة (التبويب الافتراضي "مؤجلة"
  // بيطابق حالة سجل بإجمالي > مدفوع — computeFeeStatus في feeStatus.ts —
  // هنا 5000 إجمالي مقابل 1000 مدفوع، فلسه "مؤجلة" بالظبط)
  const newFeeCard = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await expect(newFeeCard.first()).toBeVisible({ timeout: 15_000 });
});
