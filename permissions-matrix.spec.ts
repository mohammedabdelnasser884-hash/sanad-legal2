import { test, expect } from '@playwright/test';
import {
  login, loginAs, logout,
  createTestUser, deleteTestUser, createAndOpenCase, expectToast,
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
    await Promise.race([
      (async () => {
        // afterEach ممكن يشتغل والصفحة لسه مسجّلة دخول بحساب lawyer/
        // viewer (لو التست فشل قبل ما يرجع admin) — لازم نرجع admin
        // الأول عشان deleteTestUser يقدر يفتح لوحة الإدارة أصلًا.
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
  }
});

test('lawyer: يقدر يضيف قضية لكن مايشوفش زرار حذف القضية ولا تاب الأتعاب', async ({ page }) => {
  const fullName = `اختبار E2E صلاحيات lawyer - ${Date.now()}`;
  const caseTitle = `قضية اختبار صلاحيات - ${Date.now()}`;
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
