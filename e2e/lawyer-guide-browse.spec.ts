import { test, expect } from '@playwright/test';
import { login, loginAs, logout, createTestUser, deleteTestUser, expectToast } from './utils';

// خطة "الموارد القانونية" — مرحلة 6 (اختبارات): تصفح "دليل المحامي" لكل
// المستخدمين. نفس نمط encyclopedia-browse.spec.ts بالظبط (القسمان شقيقان
// تحت نفس الأب "الموارد القانونية"، ونفس نموذج الصلاحيات: قراءة مفتوحة
// لأي مستخدم مسجّل دخول، الإدارة مقصورة على السوبر أدمن الوحيد).
//
// ⚠️ نطاق التست: القسم عالمي (lawyer_guide_categories/lawyer_guide_links
// بدون tenant_id)، وبيانات المحتوى نفسها بتتضاف بس عن طريق سوبر أدمن من
// لوحة الإدارة (مقفولة تمامًا، مغطاة سلبًا في admin-lawyer-guide.spec.ts).
// يعني وقت تشغيل E2E هنا مش مضمون وجود أي تصنيفات فعلية. التست ده بالتالي
// بيتحقق من إتاحة *الوصول* للتاب نفسه، مش من محتوى بعينه — الحالتين (فاضي
// أو فيه تصنيفات) لازم يعدّوا من غير أي كسر.

async function assertLawyerGuideTabOpensCleanly(page: import('@playwright/test').Page) {
  await page.getByTestId('desktop-nav-lawyerGuide').click();
  // إما فيه تصنيفات (لو فيها محتوى فعلي)، أو رسالة "لا توجد تصنيفات
  // مضافة بعد" — أي حالة تانية (شاشة بيضا/كراش) فشل.
  await expect(
    page.getByTestId('lawyer-guide-category-card').first()
      .or(page.getByTestId('lawyer-guide-empty'))
  ).toBeVisible({ timeout: 15_000 });
  // مربع البحث الخاص بدليل المحامي لازم يكون ظاهر دايمًا (بغض النظر عن
  // وجود محتوى)، بنفس نمط بحث الصيغ والنماذج.
  await expect(page.getByTestId('lawyer-guide-search-input')).toBeVisible();
  // زرارات لوحة الإدارة (تعديل/حذف/ترتيب) ملهمش وجود في نسخة التصفح دي
  await expect(page.getByTestId('admin-lawyer-guide-category-edit')).toHaveCount(0);
  await expect(page.getByTestId('admin-lawyer-guide-category-delete')).toHaveCount(0);
  await expect(page.getByTestId('admin-lawyer-guide-link-move-up')).toHaveCount(0);
  // زرار "إدارة دليل المحامي" بييجي بس لحساب السوبر أدمن الوحيد
  // (onManageLawyerGuide في App.tsx) — أي حساب تاني مش المفروض يشوفه هنا.
  await expect(page.getByTestId('lawyer-guide-manage-button')).toHaveCount(0);
}

test('حساب أدمن عادي (مش سوبر أدمن) → تاب "دليل المحامي" ظاهر ومفتوح', async ({ page }) => {
  await login(page);

  // نفس منطق الموسوعة: ظاهر لأدمن المكتب لأن القراءة مفتوحة للكل، مش
  // لأنه أدمن.
  await expect(page.getByTestId('desktop-nav-lawyerGuide')).toBeVisible();

  await assertLawyerGuideTabOpensCleanly(page);
});

test('lawyer عادي (بدون أي صلاحيات إدارية) → برضو يقدر يشوف ويفتح "دليل المحامي"', async ({ page }) => {
  const fullName = `اختبار E2E دليل محامي - lawyer - ${Date.now()}`;

  await login(page);
  const { email, password } = await createTestUser(page, fullName, { role: 'lawyer' });
  await expectToast(page, '✅ تم إنشاء حساب ' + fullName);

  await logout(page);
  await loginAs(page, email, password);

  // can_view_fees مقفول بلا استثناء لغير admin، فتاب الأتعاب مختفي —
  // بعكس دليل المحامي اللي المفروض يفضل ظاهر لأي role.
  await expect(page.getByTestId('desktop-nav-fees')).toHaveCount(0);
  await expect(page.getByTestId('desktop-nav-lawyerGuide')).toBeVisible();

  await assertLawyerGuideTabOpensCleanly(page);

  // تنظيف: نرجع أدمن ونمسح حساب الـlawyer التجريبي
  await logout(page);
  await login(page);
  await deleteTestUser(page, fullName);
});

test('البحث في "دليل المحامي" بيفضل شغّال من غير كسر حتى لو مفيش نتايج', async ({ page }) => {
  await login(page);
  await page.getByTestId('desktop-nav-lawyerGuide').click();

  const searchInput = page.getByTestId('lawyer-guide-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('نص بحث غير موجود إطلاقًا - ' + Date.now());

  // نفس فكرة اختبار الموسوعة: مش مضمون وجود محتوى، لكن أي بحث بنص عشوائي
  // فريد لازم يرجّع "مفيش نتايج مطابقة" مش كراش أو شاشة بيضا.
  await expect(page.getByTestId('lawyer-guide-search-empty')).toBeVisible({ timeout: 10_000 });

  // زرار مسح البحث بيفضّي المربع ويرجّع العرض الطبيعي (تصنيفات/فاضي)
  await page.getByTestId('lawyer-guide-search-clear').click();
  await expect(searchInput).toHaveValue('');
  await expect(
    page.getByTestId('lawyer-guide-category-card').first()
      .or(page.getByTestId('lawyer-guide-empty'))
  ).toBeVisible({ timeout: 10_000 });
});
