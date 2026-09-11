import { test, expect } from '@playwright/test';
import {
  login, loginAs, logout,
  createTestUser, deleteTestUser, createAndOpenCase, expectToast,
  createClient, createReminder, createStandaloneSession,
} from './utils';

// المرحلة 5 (خطة تفعيل الصلاحيات التفصيلية، 16 أغسطس 2026) — بند
// "اختبارات e2e لاختفاء/تعطيل الأزرار". بيغطي جزء من مصفوفة الـ24 حالة
// (قسم 2.1 من الخطة) على مستوى الواجهة فعليًا: بيسجّل دخول بحساب lawyer/
// viewer حقيقي اتعمل runtime، ويتأكد إن الأزرار/التابات المقفولة مختفية
// فعليًا مش بس متعطّلة بصريًا. طبقة RLS/has_permission() نفس المصفوفة
// مغطاة فى database/tests/phase6-permissions-matrix-test.sql — الملف
// ده بيغطي طبقة الواجهة (مرحلة 3) بس.
//
// ⚠️ نفس شرط admin-users.spec.ts: حساب E2E_TEST_EMAIL لازم يكون Admin.
// ⚠️ التستات هنا بتاخد وقت أطول من المعتاد (بتعمل login/logout كذا مرة
// لنفس الـpage) — نفس السبب اللي خلّى admin-users.spec.ts يستخدم
// disposable users بدل حسابات ثابتة.

let cleanupName: string | null = null;

// 🔒 خلاصة تشخيص فشل التستين دول (17-18 أغسطس 2026، عبر 8 تشغيلات CI):
// 1) السبب الجذري الحقيقي: createTestUser بتسيب قسم "المستخدمين" في
//    لوحة الإدارة مفتوح (overlay بملء الشاشة)، وcreateCase (المُستدعاة
//    من createAndOpenCase بعد createTestUser مباشرة في الملف ده بس)
//    كانت بتحاول تدوس desktop-nav-cases والقسم لسه فاتح — الفيكس
//    الحقيقي في utils.ts (closeAdminSectionIfOpen في أول createCase).
// 2) بعد الفيكس، جسم التستين اتأكد إنه سريع وسليم 100% (15-16 ثانية).
//    المشكلة اللي فضلت معزولة في afterEach بس: إعادة تسجيل الدخول
//    كـadmin بعد التست بتعلّق أحيانًا تحت ظروف شبكة حقيقية (بطء/تقطع
//    اتصال Supabase تحت حمل الرن الطويل — نفس النمط الموثّق فوق في
//    playwright.config.ts من 27 يوليو). بما إن التنظيف ده مش أساسي
//    لصحة التست (global-teardown بيمسح أي صف عليه علامة اختبار E2E
//    فضل من غير كده آخر الرن)، try/catch هنا بيمنع فشل/تعليق التنظيف
//    من إسقاط تست الصلاحيات الفعلي اللي أصلاً نجح.
test.beforeEach(async ({ page }, testInfo) => {
  void page;
  testInfo.setTimeout(60_000);
});

test.afterEach(async ({ page }) => {
  if (!cleanupName) return;
  const name = cleanupName;
  cleanupName = null;
  try {
    // 🔒 FIX (19 أغسطس 2026، بعد 8 تشغيلات فاشلة رغم الـtry/catch هنا):
    // السبب الحقيقي إن login()/deleteTestUser() بيستخدموا .fill()/.click()
    // من غير timeout صريح على كل خطوة — الـdefault بتاع Playwright لأي
    // action من غير timeout صريح هو "من غير حد أقصى خالص" (مش 30 ثانية
    // زي ما يبدو بديهي)، فلو العنصر المتوقع (login-email) ما ظهرش لأي
    // سبب (مثلاً الصفحة لسه فيها overlay من التست اللي فشل قبله)، الـ
    // .fill() بتفضل معلّقة *بلا نهاية* — الـtry/catch هنا مبنيّ على إن
    // JS exception تترمي، لكن مفيش استثناء بيتترمي أصلًا، فبيوصل بدل كده
    // لـ"Test timeout of 60000ms exceeded while running afterEach hook"
    // (تايم آوت مفروض من Playwright نفسه على الـhook كله، مش استثناء
    // قابل للمسك). الحل: نحط سقف زمني صريح (20 ثانية) بأنفسنا حوالين
    // كل محاولة التنظيف عبر Promise.race — أي تعليق داخلي (فيل/كليك/
    // انتظار عنصر) هيترفض كـException عادي بعد 20 ثانية بالظبط، فيوصل
    // فعليًا لل catch تحت ويطبع التحذير بدل ما ياكل كل ميزانية الـhook.
    // 🔒 FIX نهائي مبني على دليل فعلي (19 أغسطس 2026، بعد لوج [DEBUG
    // afterEach-hang] الأول): التست بينجح فعليًا (36.5s) — التعليق في
    // الـafterEach بس. اللوج أثبت إن الصفحة وقت التعليق كانت لسه فاتحة
    // على dashboard حساب lawyer/viewer (app-shell موجود=1، login-email
    // موجود=0) وبانر "أنت الآن offline" ظاهر. يعني login() هنا كان بيعمل
    // goto('/') بس، ولأن فيه سيشن lawyer/viewer لسه صالح فى localStorage
    // (من loginAs() جوه جسم التست) والتطبيق PWA أوفلاين-فيرست، بيعرض
    // الـdashboard المخزّن كاش على طول من غير ما يرجع لشاشة الدخول خالص
    // — فـlogin-email ما بيظهرش أبدًا. الحل الحقيقي: لازم نمسح السيشن
    // فعليًا بـlogout() (بتمسح localStorage+cookies) قبل login()، مش
    // نعتمد على goto('/') إنها كافية.
    await Promise.race([
      (async () => {
        // afterEach ممكن يشتغل والصفحة لسه مسجّلة دخول بحساب lawyer/
        // viewer (لو التست فشل قبل ما يرجع admin) — لازم نرجع admin
        // الأول عشان deleteTestUser يقدر يفتح لوحة الإدارة أصلًا.
        await logout(page);
        await login(page);
        await deleteTestUser(page, name);
      })(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('تنظيف المستخدم التجريبي علّق أكتر من 20 ثانية')),
          20_000
        );
      }),
    ]);
  } catch (e) {
    console.warn(`⚠️ تنظيف المستخدم التجريبي "${name}" فشل (هيتنضف عبر global-teardown آخر الرن):`, e);
    // 🆕 ديباج تشخيصي (19 أغسطس 2026): كل الفيكسات اللي فاتت كانت تخمين
    // مبني على قراءة اللوج بعد ما التعليق يحصل، من غير دليل فعلي من جوه
    // الصفحة وقت التعليق نفسه. لو التعليق اتكرر رغم فيكس الـ20 ثانية
    // فوق، الكتلة دي هتلقط "صورة" حقيقية من حالة الصفحة في نفس اللحظة —
    // مش تخمين تاني. ملحوظة: .fill()/.click() المعلّقة جوه Promise.race
    // فوق اتسابت لوحدها معلّقة (مفيش طريقة تلغيها فعليًا في Playwright)،
    // لكن page لسه حي وممكن نستخدمه لقراءات سريعة زي دي من غير ما نستنى
    // أي action تاني عليه.
    try {
      const url = page.url();
      const loginEmailCount = await page.getByTestId('login-email').count();
      const appShellCount = await page.getByTestId('app-shell').count();
      const bodyText = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '(تعذّرت قراءة body)');
      console.warn(
        `[DEBUG afterEach-hang] url=${url} | login-email موجود=${loginEmailCount} | app-shell موجود=${appShellCount} | أول 300 حرف من الصفحة: ${bodyText.slice(0, 300)}`
      );
      await page.screenshot({ path: `test-results/afterEach-hang-${name}.png` }).catch(() => {});
    } catch (debugErr) {
      console.warn('[DEBUG afterEach-hang] فشل حتى جمع الديباج نفسه:', debugErr);
    }
  }
});

test('lawyer: يقدر يضيف قضية لكن مايشوفش زرار حذف القضية ولا تاب الأتعاب', async ({ page }) => {
  const fullName = `اختبار E2E صلاحيات lawyer - ${Date.now()}`;
  // 🔒 FIX (تحليل تسريب بيانات E2E — 19 أغسطس 2026): كان `قضية اختبار
  // صلاحيات - ${Date.now()}` — فيه "اختبار" بس من غير "E2E" جنبها، فمش
  // بيطابق MARKER = '%اختبار E2E%' في global-teardown.ts. القضايا دي
  // كانت بتفضل عالقة للأبد. اتضاف "E2E" جنب "اختبار" فعليًا.
  const caseTitle = `اختبار E2E صلاحيات - قضية - ${Date.now()}`;
  cleanupName = fullName;

  // 1) admin: ينشئ مستخدم lawyer تجريبي + قضية (عشان lawyer يفتحها بعدين)
  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'lawyer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);
  await createAndOpenCase(page, caseTitle);
  await page.getByTestId('case-detail-close').click();

  // 2) يبدّل لحساب lawyer التجريبي
  await logout(page);
  await loginAs(page, email, password);

  // can_view_fees مقفول بلا استثناء (قرار 2.1) → تاب الأتعاب مش
  // موجود خالص فى قائمة التنقل، حتى لو الرابط اتعرف مباشرة
  await expect(page.getByTestId('desktop-nav-fees')).toHaveCount(0);

  // can_add_cases = true افتراضيًا لـlawyer → الزرار موجود
  await expect(page.getByTestId('desktop-nav-cases')).toBeVisible();
  // 🔒 FIX (18 أغسطس 2026، تشغيلة سادسة): الأسطر دي كانت من غير timeout
  // صريح (على عكس كل نظائرها في utils.ts) — أي تعليق غير محدود هنا كان
  // بياخد ميزانية التست كلها (فسّر ليه مدة الفشل كانت بتتمدد بالظبط مع
  // أي رقم نرفع setTimeout له). مهلة صريحة 15 ثانية بتحوّل أي تعليق زي
  // ده لفشل سريع وواضح بدل ما ياكل كل الوقت المتاح.
  await page.getByTestId('desktop-nav-cases').click({ timeout: 15_000 });
  await expect(page.getByTestId('new-case-button')).toBeVisible();

  // can_delete_cases = false افتراضيًا لـlawyer → زرار الحذف مختفي،
  // لكن can_edit_cases = true → زرار التعديل موجود
  const row = page.getByTestId('cases-table-row').filter({ hasText: caseTitle });
  await row.first().getByTestId('cases-table-row-open').click({ timeout: 15_000 });
  await page.getByTestId('case-detail-view').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByTestId('edit-case-trigger')).toBeVisible();
  await expect(page.getByTestId('case-delete-trigger')).toHaveCount(0);
});

test('lawyer: يقدر يعدّل موكل/تذكير/جلسة مستقلة، ما يقدرش يحذف موكل أو جلسة (يقدر يحذف تذكير)', async ({ page }) => {
  // المرحلة 5 (خطة تفعيل الصلاحيات الناقصة — الموكلين/التذكيرات/الجلسات
  // المستقلة، 11 سبتمبر 2026): بيغطي مصفوفة قسم 3 من الخطة على مستوى
  // الواجهة (نفس فلسفة تست lawyer الأول فوق بتاع القضايا، بس للتلات
  // أقسام الجداد). طبقة RLS نفس المصفوفة مغطاة بالاستعلام اليدوي اللي
  // اتأكد قبل كده على الإنتاج (has_permission + سياسات clients/
  // case_sessions/reminders) — الملف ده بيغطي مرحلة 3 (إخفاء الأزرار) بس.
  const fullName = `اختبار E2E صلاحيات lawyer موكلين - ${Date.now()}`;
  const clientName = `اختبار E2E صلاحيات - موكل - ${Date.now()}`;
  const reminderTitle = `اختبار E2E صلاحيات - تذكير - ${Date.now()}`;
  const sessionTitle = `اختبار E2E صلاحيات - جلسة مستقلة - ${Date.now()}`;
  cleanupName = fullName;

  // 1) admin: ينشئ مستخدم lawyer تجريبي + موكل + تذكير + جلسة مستقلة
  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'lawyer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);
  await createClient(page, clientName);
  await createReminder(page, reminderTitle);
  await createStandaloneSession(page, sessionTitle);

  // 2) يبدّل لحساب lawyer التجريبي
  await logout(page);
  await loginAs(page, email, password);

  // الموكل: can_edit_clients=true (زرار تعديل ظاهر)، can_delete_clients=false
  // افتراضيًا لـlawyer (زرار حذف مختفي كليًا)
  await page.getByTestId('desktop-nav-clients').click({ timeout: 15_000 });
  const clientRow = page.getByTestId('clients-table-row').filter({ hasText: clientName });
  await clientRow.first().getByTestId('clients-table-row-open').click({ timeout: 15_000 });
  await page.getByTestId('client-detail-view').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByTestId('client-edit-trigger')).toBeVisible();
  await expect(page.getByTestId('client-delete-trigger')).toHaveCount(0);
  await page.getByTestId('client-detail-close').click();

  // التذكير: can_edit_reminders/can_delete_reminders = true الاتنين
  // افتراضيًا لـlawyer (منطق مختلف عن الموكلين/الجلسات — راجع قسم 3
  // من الخطة: التذكيرات أداة شخصية للمتابعة، فالحذف حر لـlawyer)
  await page.getByTestId('desktop-nav-reminders').click({ timeout: 15_000 });
  const reminderCard = page.locator('[data-testid^="reminder-card-"]').filter({ hasText: reminderTitle }).first();
  await reminderCard.waitFor({ state: 'visible', timeout: 15_000 });
  const reminderId = (await reminderCard.getAttribute('data-testid'))!.replace('reminder-card-', '');
  await expect(page.getByTestId(`reminder-edit-btn-${reminderId}`)).toBeVisible();
  await expect(page.getByTestId(`reminder-delete-btn-${reminderId}`)).toBeVisible();

  // الجلسة المستقلة: can_edit_sessions=true (زرار تعديل ظاهر)،
  // can_delete_sessions=false افتراضيًا لـlawyer (زرار حذف مختفي كليًا)
  await page.getByTestId('desktop-nav-calendar').click({ timeout: 15_000 });
  const today = new Date().getDate().toString();
  await page.getByTestId('calendar-day').filter({ hasText: new RegExp(`^${today}$`) }).first().click();
  const sessionCard = page.getByTestId('calendar-session-card').filter({ hasText: sessionTitle });
  await sessionCard.first().click({ timeout: 15_000 });
  await page.getByTestId('standalone-session-detail-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByTestId('standalone-session-edit-trigger')).toBeVisible();
  await expect(page.getByTestId('standalone-session-delete-trigger')).toHaveCount(0);
});

test('viewer: مايشوفش زرار تعديل ولا حذف فى الموكلين ولا التذكيرات ولا الجلسات المستقلة', async ({ page }) => {
  const fullName = `اختبار E2E صلاحيات viewer موكلين - ${Date.now()}`;
  const clientName = `اختبار E2E صلاحيات - موكل viewer - ${Date.now()}`;
  const reminderTitle = `اختبار E2E صلاحيات - تذكير viewer - ${Date.now()}`;
  const sessionTitle = `اختبار E2E صلاحيات - جلسة مستقلة viewer - ${Date.now()}`;
  cleanupName = fullName;

  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'viewer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);
  await createClient(page, clientName);
  await createReminder(page, reminderTitle);
  await createStandaloneSession(page, sessionTitle);

  await logout(page);
  await loginAs(page, email, password);

  // الموكل: مفيش تعديل ولا حذف خالص لـviewer
  await page.getByTestId('desktop-nav-clients').click({ timeout: 15_000 });
  const clientRow = page.getByTestId('clients-table-row').filter({ hasText: clientName });
  await clientRow.first().getByTestId('clients-table-row-open').click({ timeout: 15_000 });
  await page.getByTestId('client-detail-view').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByTestId('client-edit-trigger')).toHaveCount(0);
  await expect(page.getByTestId('client-delete-trigger')).toHaveCount(0);
  await page.getByTestId('client-detail-close').click();

  // التذكير: مفيش تعديل ولا حذف خالص لـviewer
  await page.getByTestId('desktop-nav-reminders').click({ timeout: 15_000 });
  const reminderCard = page.locator('[data-testid^="reminder-card-"]').filter({ hasText: reminderTitle }).first();
  await reminderCard.waitFor({ state: 'visible', timeout: 15_000 });
  const reminderId = (await reminderCard.getAttribute('data-testid'))!.replace('reminder-card-', '');
  await expect(page.getByTestId(`reminder-edit-btn-${reminderId}`)).toHaveCount(0);
  await expect(page.getByTestId(`reminder-delete-btn-${reminderId}`)).toHaveCount(0);

  // الجلسة المستقلة: مفيش تعديل ولا حذف خالص لـviewer
  await page.getByTestId('desktop-nav-calendar').click({ timeout: 15_000 });
  const today = new Date().getDate().toString();
  await page.getByTestId('calendar-day').filter({ hasText: new RegExp(`^${today}$`) }).first().click();
  const sessionCard = page.getByTestId('calendar-session-card').filter({ hasText: sessionTitle });
  await sessionCard.first().click({ timeout: 15_000 });
  await page.getByTestId('standalone-session-detail-modal').waitFor({ state: 'visible', timeout: 15_000 });
  await expect(page.getByTestId('standalone-session-edit-trigger')).toHaveCount(0);
  await expect(page.getByTestId('standalone-session-delete-trigger')).toHaveCount(0);
});

test('viewer: مايشوفش زرار إضافة قضية ولا إضافة موكل ولا تاب الأتعاب', async ({ page }) => {
  const fullName = `اختبار E2E صلاحيات viewer - ${Date.now()}`;
  cleanupName = fullName;

  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'viewer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);

  await logout(page);
  await loginAs(page, email, password);

  // can_view_fees/can_add_cases/can_add_clients كلهم false لـviewer
  await expect(page.getByTestId('desktop-nav-fees')).toHaveCount(0);

  // 🔒 FIX (18 أغسطس 2026، تشغيلة سادسة) — نفس ملحوظة تست lawyer فوق.
  await page.getByTestId('desktop-nav-cases').click({ timeout: 15_000 });
  await expect(page.getByTestId('new-case-button')).toHaveCount(0);

  await page.getByTestId('desktop-nav-clients').click({ timeout: 15_000 });
  await expect(page.getByTestId('new-client-button')).toHaveCount(0);

  // لوحة الإدارة مقفولة أصلًا لغير admin (قرار 2.4، سابق على الخطة دي)
  await expect(page.getByTestId('desktop-nav-admin')).toHaveCount(0);
});
