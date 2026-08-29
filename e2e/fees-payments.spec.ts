import { test, expect, type Page } from '@playwright/test';
import { login, createCaseWithClient, selectCaseFromSearch, expectToast, todayIso, ADVANCE_PAYMENT_DATE } from './utils';

// المرحلة 4 من خطة تنفيذ اختبارات E2E المقسمة — الأتعاب: تسجيل دفعات
// (جزئية/كاملة/أكبر من المتبقي)، منع التسجيل أوفلاين، معاينة الفاتورة،
// حذف دفعة، وتعديل/حذف سجل الأتعاب نفسه.
//
// كل تست بيعمل قضية جديدة + سجل أتعاب جديد من الصفر (بدل ما يشارك سجل
// واحد بين التستات) — نفس فلسفة fees.spec.ts الأصلي — عشان محدش يعتمد
// على ترتيب تشغيل، ومحصلش تلوث بيانات بين تست وتاني.
//
// 🔄 CHANGED (المرحلة 7 — بعد القرار النهائي بقفل حقل الموكل في الفورمين):
// createCase العادية بترجع قضية من غير موكل حقيقي → save-fee-button
// وconfirm-add-payment يفضلوا disabled من أول خطوة. كل تست هنا بقى بيستخدم
// createCaseWithClient (المرحلة 6) بدل createCase. وfee-case-select بقى
// CaseSearchSelect (بحث حي) — selectCaseFromSearch بدل selectOption القديمة.
//
// 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): زي ما اتوضّح في
// fees.spec.ts، إنشاء أي سجل أتعاب بقى بيتطلب "المستلم"، "المدفوع" (> 0)،
// و"تاريخ الدفعة" كحقول إجبارية — و"المدفوع" ده بالذات بقى دفعة حقيقية
// أولى (advance) بتتسجل كصف في fee_payments عبر create_fee_with_advance،
// مش مجرد رقم. ده أثّر على أرقام كل تست تحت (المتبقي بقى = الإجمالي -
// الدفعة المقدّمة - أي دفعات إضافية، مش = الإجمالي فقط زي قبل)، وعلى عدّ
// صفوف سجل الدفعات (الدفعة المقدّمة بقت تحسب صف زيادة). كل تست اتعدّل
// بأرقام جديدة تحافظ على نفس *نية* التست الأصلية (نفس السيناريو المنطقي)
// مع تعليق بالحساب الجديد جنب كل واحدة.
//
// ⚠️ ملحوظة تاريخ (مُحدَّثة بعد إصلاح CI ثانٍ — راجع الملحوظة الأحدث جنب
// تست 6): الدفعة المقدّمة بتتسجل بتاريخ ثابت في الماضي (ADVANCE_PAYMENT_DATE،
// من utils.ts) بدل تاريخ النهاردة، وأي دفعة إضافية بتتسجل بتاريخ النهاردة
// (fillPaymentForm's default). الفرق ده لسه مفيد لتمييز الصفين بصريًا في
// أي لقطة شاشة/تريس تصحيح، لكنه *مش* الضمان الفعلي لتحديد أي صف هو
// الإضافي في التستات تحت — ده بقى بمطابقة المحتوى (المبلغ) مباشرة، مش
// بترتيب الصفوف. السبب: `setPayments` (تحديث قايمة الدفعات محليًا بعد
// نجاح التسجيل، useFeesActions.ts) عملية async منفصلة بتحصل *بعد* توست
// النجاح، فالاعتماد على ترتيب "أول عنصر" فور ظهور التوست مش موثوق 100%
// تحت حِمل CI حتى لو الترتيب النهائي (بعد اكتمال التحديث) صحيح فعلًا.

function arNum(n: number): string {
  return n.toLocaleString('ar-EG', { maximumFractionDigits: 0 });
}

// 🔄 CHANGED (المرحلة 7 + إصلاح CI): fee-case-select بقى CaseSearchSelect
// (بحث حي في الداتابيز) بدل <select> عادي — selectCaseFromSearch بدل
// selectOption القديمة. وبقى بياخد كائن opts (مش رقم total لوحده) عشان
// يقدر يملى كل الحقول الإجبارية الأربعة الجديدة (راجع الملحوظة فوق).
async function createFee(
  page: Page,
  caseTitle: string,
  opts: { total: string; paid: string; receiver?: string }
): Promise<void> {
  await page.getByTestId('desktop-nav-fees').click();
  await page.getByTestId('add-fee-button').click();
  await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
  await page.getByTestId('fee-receiver').fill(opts.receiver ?? 'محامي الاختبار - دفعة مقدّمة');
  await page.getByTestId('fee-total').fill(opts.total);
  await page.getByTestId('fee-paid').fill(opts.paid);
  await page.getByTestId('fee-payment-date').fill(ADVANCE_PAYMENT_DATE);
  await page.getByTestId('save-fee-button').click();
  await expect(page.getByTestId('fee-total')).not.toBeVisible({ timeout: 15_000 });
}

async function openFeeDetail(page: Page, caseTitle: string): Promise<void> {
  const card = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await card.first().click();
  await page.getByTestId('fee-detail-modal').waitFor({ state: 'visible', timeout: 10_000 });
}

// date/receiver حقلين إجباريين فعليًا جوه handleAddPayment (raise قبل حتى
// الوصول لـRPC — useFeesActions.ts) — بيتملوا دايمًا هنا: بقيمة افتراضية
// لو مفيش opts، وبقيمة الـopts نفسها لو اتبعتت (زي تست 5 اللي بيحدد
// receiver مقصودًا للفاتورة). التاريخ الافتراضي هنا (todayIso) عمدًا مختلف
// عن ADVANCE_PAYMENT_DATE بتاعة createFee — راجع ملحوظة الترتيب فوق.
async function fillPaymentForm(
  page: Page,
  amount: string,
  opts?: { date?: string; receiver?: string; note?: string }
): Promise<void> {
  await page.getByTestId('add-payment-trigger').click();
  await page.getByTestId('pay-amount').fill(amount);
  await page.getByTestId('pay-date').fill(opts?.date ?? todayIso());
  await page.getByTestId('pay-receiver').fill(opts?.receiver ?? 'محامي الاختبار - افتراضي');
  if (opts?.note) await page.getByTestId('pay-note').fill(opts.note);
}

// 🔴 CHANGED (إصلاح CI): إجمالي 10000، دفعة مقدّمة إجبارية 1000 وقت
// الإنشاء (بدل 0 قبل كده)، بعدين دفعة إضافية 3000 (بدل 4000) — نفس
// المتبقي النهائي المستهدف أصلًا (6000 = 10000 - 1000 - 3000). عدد صفوف
// سجل الدفعات بقى 2 (الدفعة المقدّمة + الدفعة الإضافية) بدل 1.
test('1) تسجيل دفعة جزئية وتحديث النسبة/المتبقي', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - أتعاب جزئي - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '10000', paid: '1000' });
  await openFeeDetail(page, caseTitle);

  await fillPaymentForm(page, '3000');
  await page.getByTestId('confirm-add-payment').click();
  await expectToast(page, '✅ تم تسجيل الدفعة');

  // المتبقي = 10000 - 1000 (مقدّم) - 3000 (إضافية) = 6000
  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(6000));
  await page.getByTestId('payments-history-toggle').click();
  await expect(page.getByTestId('payment-row')).toHaveCount(2);
});

// 🔴 CHANGED (إصلاح CI): إجمالي 3000، دفعة مقدّمة إجبارية 500، بعدين دفعة
// إضافية 2500 تكمل السداد بالكامل (500 + 2500 = 3000).
test('2) دفعة تكمل السداد بالكامل — البطاقة تتحول لـ "مسدد"', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - أتعاب كامل - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '3000', paid: '500' });
  await openFeeDetail(page, caseTitle);

  await fillPaymentForm(page, '2500');
  await page.getByTestId('confirm-add-payment').click();
  await expectToast(page, '✅ تم تسجيل الدفعة');

  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(0));
  // بعد السداد الكامل زرار "تسجيل دفعة" بيختفي (isFullyPaid) والكارت
  // برة المودال بيوريه "✅ مسدد" بدل النسبة.
  await expect(page.getByTestId('add-payment-trigger')).not.toBeVisible();
  await page.getByTestId('fee-detail-close').click();
  const card = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await expect(card.first()).toContainText('✅ مسدد');
});

// 🔴 CHANGED (إصلاح CI): إجمالي 1500، دفعة مقدّمة إجبارية 500 → المتبقي
// 1000 (بدل ما يبدأ المتبقي = الإجمالي كامل زي قبل). بعدين دفعة 1500
// (أكبر من الـ1000 المتبقي) — لسه بتحقق نفس نية التست الأصلية (دفعة أكبر
// من المتبقي، مش رفض).
test('3) دفعة أكبر من المتبقي — تحذير بس مش رفض (تُسجَّل فعليًا)', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - أتعاب تجاوز - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '1500', paid: '500' });
  await openFeeDetail(page, caseTitle);

  // المتبقي 1000، هنسجل 1500 (أكبر من المتبقي)
  await fillPaymentForm(page, '1500');
  await page.getByTestId('confirm-add-payment').click();

  // useFeesActions.handleAddPayment: توست تحذير أول، ثم توست نجاح —
  // الدفعة بتتسجل فعليًا رغم التحذير (مفيش منع في الكود).
  await expect(page.locator('#toast')).toContainText('يتجاوز المتبقي');
  await expectToast(page, '✅ تم تسجيل الدفعة');
  await page.getByTestId('payments-history-toggle').click();
  // 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): كان `.first()`
  // على `payment-row-amount` — بيفترض إن الدفعة الإضافية (اللي لسه اتسجلت)
  // هي أول عنصر في القائمة. لكن `setPayments` (تحديث state الدفعات بعد
  // نجاح تسجيل دفعة — useFeesActions.ts:handleAddPayment) عملية async
  // منفصلة بتحصل *بعد* toast النجاح، مش قبله — يعني ممكن (خصوصًا تحت حمل
  // CI) نوصل هنا وقايمة الدفعات لسه القديمة (صف واحد بس، المقدّمة). بدل
  // الاعتماد على ترتيب مؤقت هش، بنستنى عدد الصفوف يوصل 2 فعليًا الأول
  // (تأكيد إن التحديث اكتمل)، وبعدين بندوّر على الصف بمحتواه مباشرة (مش
  // بترتيبه) — طريقة مضمونة بصرف النظر عن أي ترتيب.
  await expect(page.getByTestId('payment-row')).toHaveCount(2);
  await expect(
    page.getByTestId('payment-row').filter({ hasText: arNum(1500) })
  ).toHaveCount(1);
});

// 🔴 CHANGED (إصلاح CI): إجمالي 2000، دفعة مقدّمة إجبارية 500 → المتبقي
// 1500 قبل المحاولة الأوفلاين (بدل 2000 زي قبل، لأن مفيش طريقة تقنية
// نخلق سجل أتعاب بمتبقي = الإجمالي كامل دلوقتي — الدفعة المقدّمة إجبارية).
test('4) منع تسجيل الدفعة أوفلاين برسالة واضحة', async ({ page, context }) => {
  await login(page);
  const caseTitle = `اختبار E2E - أتعاب أوفلاين - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '2000', paid: '500' });
  await openFeeDetail(page, caseTitle);

  await fillPaymentForm(page, '500');
  await context.setOffline(true);
  try {
    await page.getByTestId('confirm-add-payment').click();
    await expectToast(page, '⚠️ تسجيل الدفعة يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال');
    // الفورم لازم يفضل مفتوح (العملية اتمنعت بالكامل، مفيش تسجيل جزئي)
    await expect(page.getByTestId('pay-amount')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  // نتأكد إن المتبقي فعلاً متغيرش (مفيش دفعة انسجلت فعليًا) — لسه 1500
  // (2000 - 500 الدفعة المقدّمة، رغم محاولة الـ500 الأوفلاين المرفوضة)
  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(1500));
});

// 🔴 CHANGED (إصلاح CI): إجمالي 5000، دفعة مقدّمة إجبارية 1000 — مفيش أثر
// على منطق التست نفسه (الفاتورة بتتفحص للدفعة الإضافية 2000 بالذات، مش
// للدفعة المقدّمة).
test('5) معاينة فاتورة دفعة مسجّلة', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - فاتورة - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '5000', paid: '1000' });
  await openFeeDetail(page, caseTitle);

  await fillPaymentForm(page, '2000', { receiver: 'محامي الاختبار' });
  await page.getByTestId('confirm-add-payment').click();
  await expectToast(page, '✅ تم تسجيل الدفعة');

  await page.getByTestId('payments-history-toggle').click();
  // 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): نفس ملحوظة تست 3
  // — `.first()` مش مضمون هنا لأن `setPayments` (تحديث قايمة الدفعات بعد
  // نجاح التسجيل) عملية async منفصلة بتحصل *بعد* توست النجاح، فممكن نوصل
  // هنا وقايمة الدفعات لسه القديمة (صف واحد بس). بنستنى عدد الصفوف = 2
  // فعليًا الأول، وبعدين بندوّر على الصف الصحيح بمحتواه (مبلغ 2000) مباشرة
  // بدل الاعتماد على ترتيبه في القائمة.
  await expect(page.getByTestId('payment-row')).toHaveCount(2);
  const targetRow = page.getByTestId('payment-row').filter({ hasText: arNum(2000) });
  await targetRow.getByTestId('payment-invoice-trigger').click();
  await page.getByTestId('invoice-modal').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(page.getByTestId('invoice-amount')).toContainText(arNum(2000));
  await page.getByTestId('invoice-modal-close').click();
  await page.getByTestId('invoice-modal').waitFor({ state: 'hidden' });
});

// 🔴 CHANGED (إصلاح CI): إجمالي 4000، دفعة مقدّمة إجبارية 100 (بتاريخ
// ADVANCE_PAYMENT_DATE، في الماضي). دفعة إضافية 1000 بتاريخ النهاردة.
test('6) حذف دفعة وإعادة حساب المتبقي', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - حذف دفعة - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '4000', paid: '100' });
  await openFeeDetail(page, caseTitle);

  await fillPaymentForm(page, '1000');
  await page.getByTestId('confirm-add-payment').click();
  await expectToast(page, '✅ تم تسجيل الدفعة');
  // المتبقي = 4000 - 100 (مقدّم) - 1000 (إضافية) = 2900
  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(2900));

  await page.getByTestId('payments-history-toggle').click();
  // 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): التشغيل الفعلي
  // كشف إن الافتراض الأصلي هنا (`.first()` = الدفعة الأحدث تاريخًا، بما إن
  // سجل الدفعات مرتب `payment_date` تنازليًا) مش موثوق عمليًا رغم إن كود
  // useFeesActions.ts فعلًا بيرتب كده — لأن `setPayments` (تحديث قايمة
  // الدفعات محليًا بعد نجاح التسجيل) عملية async منفصلة بتحصل *بعد* توست
  // "✅ تم تسجيل الدفعة" مباشرة (مش قبله)، فتحت حمل CI ممكن الكليك يوصل
  // والقايمة لسه بالصف القديم بس (المقدّمة فقط) — فـ`.first()` كان بيمسك
  // الصف الغلط (المقدّمة 100 بدل الإضافية 1000)، وده بالظبط اللي ظهر في
  // اللوج الفعلي (المتبقي النهائي طلع 3000 مش 3900 — يعني اللي اتمسح كان
  // الـ100 مش الـ1000). الإصلاح: بنستنى عدد الصفوف = 2 فعليًا الأول (تأكيد
  // اكتمال التحديث)، وبعدين بندوّر على الصف الصح بمحتواه (مبلغ 1000)
  // مباشرة — مش بترتيبه في القائمة، بصرف النظر عن أي تأخير أو ترتيب.
  await expect(page.getByTestId('payment-row')).toHaveCount(2);
  const targetRow = page.getByTestId('payment-row').filter({ hasText: arNum(1000) });
  await targetRow.getByTestId('payment-delete-trigger').click();
  // بيانات نص التأكيد (fmt/fmtDate) بيتقروا من نفس المودال — نص مُنسّق
  // بأرقام عربية شرقية وصعب نعيد بناءه يدويًا، فبنقرأه من الشاشة نفسها.
  const exactText = await page.getByTestId('delete-confirm-item-name').innerText();
  await page.getByTestId('confirm-delete-payment-input').fill(exactText);
  await page.getByTestId('confirm-delete-payment-yes').click();

  // بعد حذف الدفعة الإضافية، صف واحد بس فاضل (الدفعة المقدّمة)، والمتبقي
  // بيرجع لـ3900 (4000 - 100)
  await expect(page.getByTestId('payment-row')).toHaveCount(1);
  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(3900));
});

test('7) تعديل سجل أتعاب موجود (تغيير الإجمالي)', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - تعديل أتعاب - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '1000', paid: '200' });

  const card = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await card.first().click();
  await page.getByTestId('fee-detail-modal').waitFor({ state: 'visible' });
  await page.getByTestId('edit-fee-trigger').click();
  await page.getByTestId('fee-total').fill('7000');
  await page.getByTestId('save-fee-button').click();
  await expect(page.getByTestId('fee-total')).not.toBeVisible({ timeout: 15_000 });

  // ⚠️ handleSave بيقفل فورم التعديل بس (setShowForm(false)) — مودال
  // التفاصيل (detailsFor) فاضل مفتوح تحته زي ما هو، وبيتحدّث بالبيانات
  // الجديدة بعد fetchFees. مفيش داعي (ولا لازم) نفتحه تاني.
  // 🔴 CHANGED (إصلاح CI): المدفوع لسه 200 (فورم التعديل بيعطّل حقل
  // "المبلغ المدفوع" ومايأثرش — راجع تعليق fee-paid في FeesTab.tsx) —
  // فالمتبقي الجديد = 7000 - 200 = 6800، مش 7000 كامل زي قبل.
  await expect(page.getByTestId('fee-remaining-value')).toContainText(arNum(6800));
});

test('8) حذف سجل أتعاب (أرشفة) واختفاؤه من القائمة', async ({ page }) => {
  await login(page);
  const caseTitle = `اختبار E2E - حذف أتعاب - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);
  await createFee(page, caseTitle, { total: '1500', paid: '300' });

  const card = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await card.first().click();
  await page.getByTestId('fee-detail-modal').waitFor({ state: 'visible' });
  await page.getByTestId('delete-fee-trigger').click();
  await page.getByTestId('archive-confirm-choice-archive').click();
  const exactText = await page.getByTestId('delete-confirm-item-name').innerText();
  await page.getByTestId('fee-delete-confirm-input').fill(exactText);
  await page.getByTestId('fee-delete-confirm-button').click();

  await expect(page.getByTestId('fee-card').filter({ hasText: caseTitle })).toHaveCount(0);
});
