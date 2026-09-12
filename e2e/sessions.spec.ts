import { test, expect } from '@playwright/test';
import { login, createAndOpenCase } from './utils';

// خطوة 3 من مرحلة 7 (E2E) — تسجيل جلسة.
// بتستخدم helper إنشاء/فتح قضية (نفس منطق خطوة 2) عشان توصل لشاشة
// تفاصيل القضية، وبعدين تضيف جلسة من TimelineSection.

// 🔄 REWRITE (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 1، 12 سبتمبر
// 2026): زرار/فورم "إضافة جلسة جديدة" (add-session-button، session-date-*،
// session-time-*، session-description، save-session-button) اتشالوا
// نهائي من TimelineSection.tsx — كانوا بيسمحوا بإنشاء جلسة جديدة من غير
// أي التزام بتسجيل نتيجة الجلسة اللي قبلها. الطريقة الوحيدة دلوقتي هي
// "⚡ تحديث" (SessionUpdateModal)، اللي بتحدّث نتيجة آخر جلسة *وفي نفس
// الوقت* بتنشئ الجلسة القادمة — التست ده بقى بيغطي المسار الكامل ده بدل
// المسار القديم. (ملحوظة: تست مشابه أضيق نطاقًا موجود بالفعل في
// case-parties-and-sessions.spec.ts — بس اتسيب ده هنا كمرجع أساسي لتسجيل
// جلسة، عشان يفضل الملف المخصص لموضوع "تسجيل جلسة" اللي اسمه بيقوله.)
test('تحديث آخر جلسة (⚡) — تسجيل ما تم وإنشاء الجلسة القادمة في التايم لاين', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار E2E - قضية 3 - ${Date.now()}`;
  await createAndOpenCase(page, caseTitle);

  // شاشة تفاصيل القضية بتفتح افتراضيًا على تبويب "الجلسات".
  await expect(page.getByTestId('case-tab-timeline')).toBeVisible();

  // القضية الجديدة بتتعمل بجلسة أولى (بس تاريخ، بلا وصف) — كارت واحد
  // موجود دايمًا، وهو "آخر جلسة" (index 0) فكله قابل للضغط لفتح "⚡ تحديث".
  await page.getByTestId('session-card').first().click();
  await page.getByTestId('session-update-modal').waitFor({ state: 'visible', timeout: 10_000 });

  // 1) "ما تم في هذه الجلسة" — بيتسجل كـresult على الجلسة الحالية.
  const whatHappened = `اختبار E2E - ما تم في الجلسة ${Date.now()}`;
  await page.getByTestId('session-update-what-happened').fill(whatHappened);

  // 2) تاريخ الجلسة القادمة (إجباري — بنختار "النهاردة"، نفس شهر
  // الـDatePicker المعروض افتراضيًا).
  await page.getByTestId('session-update-next-date-trigger').click();
  const today = new Date().getDate().toString();
  await page.getByTestId('session-update-next-date-day').filter({ hasText: new RegExp(`^${today}$`) }).click();

  // 3) "المطلوب في الجلسة القادمة" — النص الوحيد اللي بيظهر فعليًا على
  // كارت الجلسة *الجديدة* (تحت "⚡ الإجراء القادم")، فهو اللي بنميّزها بيه.
  const nextRequired = `اختبار E2E - المطلوب القادم ${Date.now()}`;
  await page.getByTestId('session-update-next-required').fill(nextRequired);

  // 4) الحفظ — SessionUpdateModal.handleSave بيقفل المودال ويعمل
  // refetch لو نجح.
  await page.getByTestId('session-update-save').click();
  await expect(page.getByTestId('session-update-modal')).not.toBeVisible({ timeout: 15_000 });

  // 5) التأكد إن الجلسة القادمة ظهرت في التايم لاين بالمطلوب اللي كتبناه.
  const newSessionCard = page.getByTestId('session-card').filter({ hasText: nextRequired });
  await expect(newSessionCard.first()).toBeVisible({ timeout: 15_000 });

  // 6) والتأكد إن الجلسة القديمة اتسجل عليها "ما تم" (لسه ظاهرة، بس من
  // غير زرار "⚡ تحديث" دلوقتي لأنها بقت غير آخر جلسة).
  const oldSessionCard = page.getByTestId('session-card').filter({ hasText: whatHappened });
  await expect(oldSessionCard.first()).toBeVisible();
});
