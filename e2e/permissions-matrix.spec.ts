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

// 🔧 FIX (17 أغسطس 2026، بعد فيكس الـrace condition بتاع expect.poll):
// login()/loginAs() بقى ممكن ياخدوا لحد 40 ثانية (30 app-shell + 10
// تأكيد الجلسة)، والملف ده بيعمل 2-3 تسجيل دخول لكل تست (أدمن + lawyer/
// viewer + afterEach) — فالمهلة الافتراضية (60 ثانية للتست كله، من
// playwright.config.ts) بقت مش كافية وبتفشل بـ"Test timeout" بسيط من
// غير أي assertion غلط. testInfo.setTimeout هنا بيرفعها لـ120 ثانية
// لكل تست في الملف ده بس (بما فيها afterEach)، بدل ما نلمس المهلة
// العامة لكل التستات التانية.
// 🔧 FIX (18 أغسطس 2026، تشغيلة خامسة — بعد فيكس closeAdminSectionIfOpen
// الحقيقي): الفيكس اتأكد إنه نجح — جسم التست بقى بيعدي من غير أي خطأ
// assertion خالص. المشكلة اللي فضلت: التست بقى ياخد وقت قريب جدًا من
// الـ120 ثانية عشان يخلّص، فمابقاش فاضل وقت كافي لـafterEach. رفعناها
// لـ180 ثانية (3 دقايق).
// 🔒 FIX (18 أغسطس 2026، تشغيلة سادسة): رفع المهلة لـ180 ثانية ماكانش
// كافي — التست فضل بياخد وقت قريب جدًا من أي حد نرفعه له بالظبط (120s→
// ~118s مستهلكة، 180s→~178s مستهلكة)، وده نمط "تعليق غير محدود بياكل
// كل الميزانية المتاحة" مش "بطء حقيقي ثابت". السبب: كذا `.click()`/
// `.waitFor()` في جسم التستين هنا من غير timeout صريح (على عكس كل
// نظائرها في utils.ts)، فأي واحد فيهم لو اتعلّق بياخد الميزانية كلها لحد
// ما التايم آوت العام يضرب. الحل: مهلة صريحة 15 ثانية على كل واحدة منهم
// (تحت) — بتحول أي تعليق حقيقي لفشل سريع وواضح بيوضح بالظبط السطر
// المسبب، بدل تخمين رقم مهلة تالت.
test.beforeEach(async ({ page }, testInfo) => {
  void page;
  testInfo.setTimeout(180_000);
});

test.afterEach(async ({ page }) => {
  if (cleanupName) {
    // afterEach ممكن يشتغل والصفحة لسه مسجّلة دخول بحساب lawyer/viewer
    // (لو التست فشل قبل ما يرجع admin) — لازم نرجع admin الأول عشان
    // deleteTestUser يقدر يفتح لوحة الإدارة أصلًا.
    await login(page);
    await deleteTestUser(page, cleanupName);
    cleanupName = null;
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
