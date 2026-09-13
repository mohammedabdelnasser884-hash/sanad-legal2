import { test, expect } from '@playwright/test';
import { login, loginAs, logout, createTestUser, deleteTestUser, expectToast } from './utils';

// مرحلة 4 (تصفح/تحميل "الموسوعة القانونية" لكل المستخدمين) — Smoke.
//
// ⚠️ نطاق التست: القسم عالمي (مفيش tenant_id على encyclopedia_categories/
// encyclopedia_forms — راجع migration مرحلة 1)، وبيانات المحتوى نفسها
// (مجلدات/نماذج) بتتضاف بس عن طريق سوبر أدمن من admin-encyclopedia
// (مقفول تمامًا، مغطى في admin-encyclopedia.spec.ts). يعني وقت تشغيل E2E
// هنا مش مضمون وجود أي محتوى فعلي (ولا حتى إن الـmigration اتشغّلت
// أصلاً على بيئة الاختبار). التست ده بالتالي بيتحقق من إتاحة *الوصول*
// للتاب نفسه (الفرق الجوهري عن 'fees'/'admin' اللي adminOnly)، مش من
// محتوى بعينه — الحالتين (فاضي أو فيه مجلدات) لازم يعدّوا من غير أي كسر.

async function assertEncyclopediaTabOpensCleanly(page: import('@playwright/test').Page) {
  await page.getByTestId('desktop-nav-encyclopedia').click();
  // إما فيه مجلدات (لو الـmigration اتشغّلت وفيها محتوى)، أو رسالة
  // "لا توجد مجلدات مضافة بعد" — أي حالة تانية (شاشة بيضا/كراش) فشل.
  await expect(
    page.getByTestId('encyclopedia-folder-card').first()
      .or(page.getByTestId('encyclopedia-empty'))
  ).toBeVisible({ timeout: 15_000 });
  // زرارا التعديل/الحذف بتوع لوحة الإدارة ملهمش وجود في نسخة التصفح دي
  await expect(page.getByTestId('admin-encyclopedia-folder-edit')).toHaveCount(0);
  await expect(page.getByTestId('admin-encyclopedia-folder-delete')).toHaveCount(0);
  // ⚡ NEW (فصل إدارة الموسوعة عن شبكة أقسام لوحة الإدارة): زرار "إدارة
  // الموسوعة" بييجي بس لحساب السوبر أدمن الوحيد (onManageEncyclopedia في
  // App.tsx) — أي حساب تاني (أدمن مكتب عادي أو lawyer) مش المفروض يشوفه
  // خالص هنا.
  await expect(page.getByTestId('encyclopedia-manage-button')).toHaveCount(0);
}

test('حساب أدمن عادي (مش سوبر أدمن) → تاب "الموسوعة القانونية" ظاهر ومفتوح، بخلاف تاب الأتعاب/لوحة الإدارة', async ({ page }) => {
  await login(page);

  // الفرق الجوهري عن 'fees'/'admin': ظاهرين لأدمن المكتب لأنه أدمن،
  // مش لأنهم متاحين للكل — بينما 'encyclopedia' هنا متاح بغض النظر.
  await expect(page.getByTestId('desktop-nav-encyclopedia')).toBeVisible();

  await assertEncyclopediaTabOpensCleanly(page);
});

test('lawyer عادي (بدون أي صلاحيات إدارية) → برضو يقدر يشوف ويفتح "الموسوعة القانونية"', async ({ page }) => {
  const fullName = `اختبار E2E موسوعة - lawyer - ${Date.now()}`;

  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'lawyer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);

  await logout(page);
  await loginAs(page, email, password);

  // can_view_fees مقفول بلا استثناء لغير admin، فتاب الأتعاب مختفي —
  // بعكس الموسوعة اللي المفروض تفضل ظاهرة لأي role.
  await expect(page.getByTestId('desktop-nav-fees')).toHaveCount(0);
  await expect(page.getByTestId('desktop-nav-encyclopedia')).toBeVisible();

  await assertEncyclopediaTabOpensCleanly(page);

  // تنظيف: نرجع أدمن ونمسح حساب الـlawyer التجريبي
  await logout(page);
  await login(page);
  await deleteTestUser(page, fullName);
});
