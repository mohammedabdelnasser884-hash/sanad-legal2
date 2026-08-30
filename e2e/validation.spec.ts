import { test, expect } from '@playwright/test';
import { login, createCaseWithClient, selectCaseFromSearch, expectToast, uniquePoa } from './utils';

// خطوة 6 من مرحلة 7 (E2E) — فاليديشن الحقول المطلوبة (دفعة الباگات
// الخمسة اللي اتصلحت في 17/7: عنوان قضية فاضي، أتعاب من غير قضية،
// أتعاب من غير مبلغ، أتعاب بمبلغ سالب، موكل بدون اسم).
//
// كل تست بيتأكد من حاجتين: (1) رسالة التوست الصحيحة ظهرت فعليًا في
// المتصفح، و(2) السجل فعليًا ما اتحفظش (الفورم لسه مفتوح / مفيش كارت جديد).

test.describe('فاليديشن الحقول المطلوبة', () => {
  test('قضية بعنوان فاضي → رسالة خطأ، والفورم يفضل مفتوح من غير حفظ', async ({ page }) => {
    await login(page);
    // ⚡ H (16 أغسطس 2026): `nav-cases` (موبايل) بقى `lg:hidden` على
    // الديسكتوب — بديله `desktop-nav-cases`.
    await page.getByTestId('desktop-nav-cases').click();
    await page.getByTestId('new-case-button').click();

    // مفيش أي كتابة في new-case-title — بنحاول نحفظ فورًا
    await page.getByTestId('new-case-save').click();

    await expectToast(page, 'يرجى إدخال موضوع ومسمى الدعوى');
    // الفورم لسه مفتوح (زرار الحفظ لسه ظاهر) — يعني ما اتقفلش زي الحفظ الناجح
    await expect(page.getByTestId('new-case-save')).toBeVisible();
  });

  // 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): قبل قرار قفل حقل
  // الموكل (المرحلة 3)، كان زرار الحفظ فعّال دايمًا وأول فاليديشن تتفحص
  // جوه handleSave هي "القضية مطلوب" (توست بعد الضغط). دلوقتي save-fee-button
  // نفسه بقى disabled من الأساس لغاية ما يبقى فيه موكل محلول (resolvedFormClient)
  // — وده بيتطلب قضية مختارة أصلًا. يعني بدون اختيار قضية، الزرار مستحيل
  // يتدوس عليه خالص (التشغيل الفعلي وقف على "Test timeout... element is not
  // enabled" هنا بالظبط). التست بقى بيتأكد من السلوك الجديد مباشرة: الزرار
  // معطّل والإرشاد ظاهر، بدل محاولة ضغط مستحيلة وانتظار توست مستحيل الظهور.
  test('أتعاب من غير اختيار قضية → زرار الحفظ يفضل معطّل من الأساس (مش قابل للضغط أصلاً)', async ({ page }) => {
    await login(page);
    // ⚡ H (16 أغسطس 2026): `nav-cases` (موبايل) بقى `lg:hidden` على
    // الديسكتوب — بديله `desktop-nav-cases`.
    await page.getByTestId('desktop-nav-fees').click();
    await page.getByTestId('add-fee-button').click();

    // نملى المبلغ بس من غير ما نختار قضية أصلاً
    await page.getByTestId('fee-total').fill('1000');

    await expect(page.getByTestId('fee-client-locked')).toContainText(
      'لا يوجد موكل مرتبط بهذه القضية'
    );
    await expect(page.getByTestId('save-fee-button')).toBeDisabled();
  });

  // 🔴 CHANGED (إصلاح CI): لازم createCaseWithClient (مش createCase) —
  // وإلا الزرار يفضل معطّل من الأساس زي التست فوق، ومحصلش نوصل للتوست
  // المطلوب اختباره هنا أصلًا. وحقل "المستلم من المكتب" بقى إجباري (وبيتفحص
  // قبل "الإجمالي" في ترتيب الفاليديشن — useFeesActions.ts:389) فلازم
  // يتملى، وإلا التست هيوقف على توست "المستلم" مش "الإجمالي".
  test('أتعاب من غير مبلغ → رسالة "الإجمالي مطلوب"، ومفيش حفظ', async ({ page }) => {
    await login(page);
    const caseTitle = `اختبار E2E - فاليديشن أتعاب 2 - ${Date.now()}`;
    await createCaseWithClient(page, caseTitle);

    // ⚡ H (16 أغسطس 2026): `nav-more-toggle`+`nav-more-fees` (موبايل)
    // بقوا `lg:hidden` على الديسكتوب — بديلهم نقرة واحدة `desktop-nav-fees`.
    await page.getByTestId('desktop-nav-fees').click();
    await page.getByTestId('add-fee-button').click();

    await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
    await page.getByTestId('fee-receiver').fill('محامي الاختبار');
    // مفيش كتابة في fee-total خالص
    await page.getByTestId('save-fee-button').click();

    await expectToast(page, '❌ حقل "إجمالي الأتعاب" مطلوب');
    await expect(page.getByTestId('save-fee-button')).toBeVisible();
  });

  // 🔴 CHANGED (إصلاح CI): نفس ملحوظة التست فوق — createCaseWithClient +
  // selectCaseFromSearch + المستلم مطلوب قبل ما نوصل لفحص القيمة السالبة.
  test('أتعاب بمبلغ سالب → رسالة خطأ، ومفيش حفظ', async ({ page }) => {
    await login(page);
    const caseTitle = `اختبار E2E - فاليديشن أتعاب 3 - ${Date.now()}`;
    await createCaseWithClient(page, caseTitle);

    // ⚡ H (16 أغسطس 2026): `nav-more-toggle`+`nav-more-fees` (موبايل)
    // بقوا `lg:hidden` على الديسكتوب — بديلهم نقرة واحدة `desktop-nav-fees`.
    await page.getByTestId('desktop-nav-fees').click();
    await page.getByTestId('add-fee-button').click();

    await selectCaseFromSearch(page, 'fee-case-select', caseTitle);
    await page.getByTestId('fee-receiver').fill('محامي الاختبار');
    await page.getByTestId('fee-total').fill('-500');
    await page.getByTestId('save-fee-button').click();

    await expectToast(page, '❌ خطأ: إجمالي الأتعاب لا يمكن أن يكون سالباً');
    await expect(page.getByTestId('save-fee-button')).toBeVisible();
  });

  test('موكل جديد بدون اسم → رسالة خطأ، والمودال يفضل مفتوح', async ({ page }) => {
    await login(page);
    // ⚡ H (16 أغسطس 2026): `nav-more-toggle`+`nav-more-clients` (موبايل)
    // بقوا `lg:hidden` على الديسكتوب — بديلهم نقرة واحدة `desktop-nav-clients`.
    await page.getByTestId('desktop-nav-clients').click();
    await page.getByTestId('new-client-button').click();

    // مفيش كتابة في new-client-name خالص
    await page.getByTestId('save-client-button').click();

    await expectToast(page, 'يرجى إدخال اسم الموكل');
    await expect(page.getByTestId('save-client-button')).toBeVisible();
  });

  test('تعديل موكل موجود ومسح اسمه بالكامل → رسالة خطأ، ومفيش حفظ للتعديل', async ({ page }) => {
    await login(page);
    // ⚡ H (16 أغسطس 2026): `nav-more-toggle`+`nav-more-clients` (موبايل)
    // بقوا `lg:hidden` على الديسكتوب — بديلهم نقرة واحدة `desktop-nav-clients`.
    await page.getByTestId('desktop-nav-clients').click();

    // بننشئ موكل خاص بالتست ده عشان الاختبار يكون مستقل ومحكوم بالكامل،
    // مش معتمد على وجود موكل جاهز في التينانت التجريبي من تشغيلات سابقة.
    const clientName = `اختبار E2E - موكل فاليديشن - ${Date.now()}`;
    await page.getByTestId('new-client-button').click();
    await page.getByTestId('new-client-name').fill(clientName);
    await page.getByTestId('new-client-phone').fill('01000000000');
    // 🔒 FIX (تحليل لوجز E2E — 30 أغسطس 2026): "العنوان" بقى حقل إجباري في
    // NewClientModal — راجع تعليقها الكامل في createClient() جوه utils.ts.
    await page.getByTestId('new-client-address').fill('عنوان تجريبي E2E');
    // ⚡ FIX: new-client-national-id بقى حقل إجباري (14 رقم بالظبط) في
    // NewClientModal — من غيره زرار الحفظ كان بيرفض يعمل submit خالص
    // (توست "يرجى إدخال الرقم القومي")، فالموكل ما كانش بيتحفظ أبدًا
    // والتست كان بيستنى كارت هيظهر أصلاً مش هيتبعت.
    // ⚠️ FIX: راجع نفس التعليق في dashboard-tab.spec.ts — .slice(0, 14) كانت
    // بتسيب رقم قومي شبه ثابت لمدة ~16-17 دقيقة (تكرار حقيقي بين تشغيلتين
    // قريبتين). آخر 14 خانة بدل الأول.
    await page.getByTestId('new-client-national-id').fill(`2900101${Date.now()}`.slice(-14));
    // ⚡ NEW (طلب مباشر — 12 أغسطس 2026): بيانات التوكيل بقت إجبارية.
    // 🔒 FIX (تحليل لوجز E2E — 12 أغسطس 2026، تشغيلة تانية): uniquePoa()
    // بدل القيمة الثابتة — راجع تعليقها الكامل في utils.ts.
    const poa = uniquePoa();
    await page.getByTestId('new-client-poa-number').fill(poa.number);
    await page.getByTestId('new-client-poa-letters').fill(poa.letters);
    await page.getByTestId('new-client-poa-year').fill(poa.year);
    await page.getByTestId('save-client-button').click();

    // ⚡ H (16 أغسطس 2026): `client-card` بقى `lg:hidden` على الديسكتوب —
    // بديله `clients-table-row` (جدول الديسكتوب D3) + زرار الفتح.
    const newClientRow = page.getByTestId('clients-table-row').filter({ hasText: clientName });
    await expect(newClientRow.first()).toBeVisible({ timeout: 15_000 });

    await newClientRow.first().getByTestId('clients-table-row-open').click();
    await page.getByTestId('client-detail-view').waitFor({ state: 'visible', timeout: 10_000 });

    await page.getByTestId('client-edit-trigger').click();
    await page.getByTestId('edit-client-name').fill('');
    await page.getByTestId('save-client-edit-button').click();

    await expectToast(page, 'يرجى إدخال اسم الموكل');
    // المودال لسه مفتوح
    await expect(page.getByTestId('save-client-edit-button')).toBeVisible();
  });
});
