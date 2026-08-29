import { test, expect } from '@playwright/test';
import { login, createCase, createCaseWithClient, selectCaseFromSearch, ADVANCE_PAYMENT_DATE } from './utils';

// المرحلة 8 (خطة تنفيذ اختبارات E2E المقسمة — قسم الأتعاب) — تستات جديدة
// للقرار النهائي (قفل حقل الموكل في الفورمين، مشتق من resolveCaseFeeClient،
// ومنع الحفظ الكامل لو مفيش موكل مربوط). راجع تقرير المراجعة (29 أغسطس
// 2026) قسم "🧩 ملحوظة منطقية مهمة" لتفصيل ليه المسار الأساسي (فورم
// الإضافة) وحده كافي بتست واحد بسيط، بينما فورمي التعديل/الدفعة محتاجين
// سيناريو أعقد (دفاعي — فك ربط بعد إنشاء السجل).

test('١) قضية بلا موكل مربوط → فورم إضافة الأتعاب مقفول ومعطّل من الأساس', async ({ page }) => {
  await login(page);

  // createCase العادية (بلا opts.linkClientName) — نفس المسار القديم، بتعمل
  // قضية بـis_client:true على المدعي الأول لكن من غير client_id حقيقي مربوط
  // في جدول clients. ده بالظبط سيناريو "القضية بلا موكل" المطلوب هنا.
  const caseTitle = `اختبار E2E - أتعاب بلا موكل - ${Date.now()}`;
  await createCase(page, caseTitle);

  await page.getByTestId('desktop-nav-fees').click();
  await page.getByTestId('add-fee-button').click();
  await selectCaseFromSearch(page, 'fee-case-select', caseTitle);

  // الإرشاد بيظهر بدل الاسم، وزرار الحفظ معطّل من الأساس — مش بس فحص وقت
  // الضغط (resolvedFormClient.displayLabel فاضي → save-fee-button disabled،
  // راجع FeesTab.tsx).
  await expect(page.getByTestId('fee-client-locked')).toContainText(
    'لا يوجد موكل مرتبط بهذه القضية'
  );
  await expect(page.getByTestId('save-fee-button')).toBeDisabled();
});

test('٢) فك ربط الموكل بعد إنشاء سجل أتعاب عليه بالفعل → منع تعديل السجل وتسجيل دفعة جديدة', async ({ page }) => {
  // سيناريو أطول من العادي (إنشاء + فتح تفاصيل قضية + فك ربط + رجوع للأتعاب)
  // — راجع ملحوظة الخطة: ده تست حافة/دفاعي واحد بيغطي الحالتين (تعديل +
  // دفعة) مع بعض، مش تكرار بنفس الوزن زي تست الإضافة.
  test.setTimeout(90_000);
  await login(page);

  const caseTitle = `اختبار E2E - فك ربط بعد أتعاب - ${Date.now()}`;
  await createCaseWithClient(page, caseTitle);

  // 1) إنشاء سجل أتعاب طبيعي — القضية معاها موكل حقيقي مربوط وقتها، فالحفظ
  // المفروض ينجح عادي (نفس مسار fees.spec.ts، بكل الحقول الإجبارية الأربعة
  // — راجع ملحوظة إصلاح CI في fees.spec.ts).
  await page.getByTestId('desktop-nav-fees').click();
  await page.getByTestId('add-fee-button').click();
  await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
  await page.getByTestId('fee-receiver').fill('محامي الاختبار');
  await page.getByTestId('fee-total').fill('2000');
  await page.getByTestId('fee-paid').fill('500');
  await page.getByTestId('fee-payment-date').fill(ADVANCE_PAYMENT_DATE);
  await page.getByTestId('save-fee-button').click();
  await expect(page.getByTestId('fee-total')).not.toBeVisible({ timeout: 15_000 });

  // 2) فتح القضية وفك ربط الموكل عن الطرف المدعي الأساسي من تبويب "البيانات"
  // (info-unlink-party-<partyId> — المسار الموثّق في EditCaseModal.tsx لفك
  // ربط الطرف الأساسي، بما إن فورم التعديل نفسه مايعرضش خيار فك ربط لطرف
  // الـlinkedPartyId). data-testid ديناميكي بـparty.id، فبندوّر بـregex بادئة
  // مع استبعاد صريح لنسخة "-confirm-" (نفس البادئة بالظبط) عشان مانلقطش
  // زرار التأكيد بدل الزرار الأصلي بالغلط.
  await page.getByTestId('desktop-nav-cases').click();
  const caseRow = page.getByTestId('cases-table-row').filter({ hasText: caseTitle });
  await caseRow.first().getByTestId('cases-table-row-open').click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('case-tab-info').click();

  const unlinkTrigger = page.getByTestId(/^info-unlink-party-(?!confirm-)/);
  await unlinkTrigger.first().click();
  await page.getByTestId(/^info-unlink-party-confirm-/).first().click();
  // بعد فك الربط بنجاح، زرار "🔓" بيختفي (الطرف مبقاش عنده client_id).
  await expect(unlinkTrigger).toHaveCount(0);

  // 3) الرجوع لتبويب الأتعاب — محاولة فتح تعديل السجل الموجود بالفعل:
  // الفورم لازم يبقى مقفول ومعطّل بنفس منطق فورم الإضافة تمامًا، رغم إن
  // السجل نفسه كان اتعمل صح وقت ما القضية كانت مربوطة بموكل.
  await page.getByTestId('desktop-nav-fees').click();
  const feeCard = page.getByTestId('fee-card').filter({ hasText: caseTitle });
  await feeCard.first().click();
  await page.getByTestId('fee-detail-modal').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('edit-fee-trigger').click();

  await expect(page.getByTestId('fee-client-locked')).toContainText(
    'لا يوجد موكل مرتبط بهذه القضية'
  );
  await expect(page.getByTestId('save-fee-button')).toBeDisabled();
  await page.getByTestId('close-fee-form').click();

  // 4) نفس الفحص على فورم "تسجيل دفعة" (FeeCard.tsx) — لسه جوه نفس مودال
  // التفاصيل المفتوح.
  await page.getByTestId('add-payment-trigger').click();
  await expect(page.getByTestId('pay-client-locked')).toContainText(
    'لا يوجد موكل مرتبط بهذه القضية'
  );
  await expect(page.getByTestId('confirm-add-payment')).toBeDisabled();
});

test('٣) تبديل القضية في فورم إضافة الأتعاب قبل الحفظ → اسم الموكل المعروض بيتحدث تلقائيًا', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);

  const caseATitle = `اختبار E2E - تبديل قضية أ - ${Date.now()}`;
  const clientA = await createCaseWithClient(page, caseATitle);
  const caseBTitle = `اختبار E2E - تبديل قضية ب - ${Date.now()}`;
  const clientB = await createCaseWithClient(page, caseBTitle);

  await page.getByTestId('desktop-nav-fees').click();
  await page.getByTestId('add-fee-button').click();

  // اختيار القضية أ أولًا — الاسم المعروض المفروض يبقى اسم موكلها.
  await selectCaseFromSearch(page, 'fee-case-select', caseATitle);
  await expect(page.getByTestId('fee-client-locked')).toContainText(clientA);

  // تبديل الاختيار لقضية ب من غير حفظ — الاسم لازم يتحدّث تلقائيًا لموكل
  // القضية الجديدة (عبر resolvedFormClient المُعاد حسابه من form.case_id
  // الجديد)، من غير أي تدخل يدوي.
  await selectCaseFromSearch(page, 'fee-case-select', caseBTitle);
  await expect(page.getByTestId('fee-client-locked')).toContainText(clientB);
  await expect(page.getByTestId('fee-client-locked')).not.toContainText(clientA);
});

test('٤) CaseSearchSelect: البحث بيرجّع قضية برة أول 15 قضية محمّلة محليًا (تأكيد حل مشكلة الـpagination)', async ({ page }) => {
  // تست مكلّف عمدًا (16 عملية إنشاء قضية عبر الواجهة فعليًا، مش seeding
  // مباشر في القاعدة) — الطريقة الوحيدة لإثبات إن CaseSearchSelect بيدوّر
  // في db.from('cases') مباشرة، مش في مصفوفة `cases` المحلية (PAGE_SIZE=15،
  // useAppData.ts) الواصلة لـFeesTab كـprop. لازم قضية الهدف تتدفع فعليًا
  // برة أحدث 15 قضية (بترتيب created_at تنازليًا) بإنشاء 15 قضية تانية
  // بعدها، وإلا التست ممكن ينجح غلط حتى لو الكود رجع للفلتر المحلي القديم.
  test.setTimeout(240_000);
  await login(page);

  const targetTitle = `اختبار E2E - قضية عميقة في القايمة - ${Date.now()}`;
  await createCase(page, targetTitle);

  for (let i = 1; i <= 15; i++) {
    await createCase(page, `اختبار E2E - حشو صفحة ${i} - ${Date.now()}`);
  }

  await page.getByTestId('desktop-nav-fees').click();
  await page.getByTestId('add-fee-button').click();

  // لو البحث لسه معتمد (غلط) على المصفوفة المحلية المُصفَّحة، قضية الهدف
  // (اتدفعت برة أحدث 15 دلوقتي) مش هتظهر خالص في النتائج — الخيار مش هيتلاقى
  // وexpect تحت هيفشل بـTimeout.
  await page.getByTestId('fee-case-select').fill(targetTitle);
  const option = page.getByTestId('fee-case-select-option').filter({ hasText: targetTitle });
  await expect(option.first()).toBeVisible({ timeout: 10_000 });
  await option.first().click();

  // بعد الاختيار، الحقل المقفول بيعرض إرشاد "لا يوجد موكل" (القضية دي من
  // غير موكل حقيقي مربوط، createCase العادية) — ده تأكيد إضافي إن الاختيار
  // فعلًا اتنفذ صح (onSelect نادى resolveCaseFeeClient على القضية الصح).
  await expect(page.getByTestId('fee-client-locked')).toContainText(
    'لا يوجد موكل مرتبط بهذه القضية'
  );
});
