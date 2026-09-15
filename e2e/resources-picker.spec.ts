import { test, expect } from '@playwright/test';
import { login } from './utils';

// خطة "الموارد القانونية" — مرحلة 6 (اختبارات): بوكس "الموارد القانونية"
// الفرعي في CommandDock.tsx (الشريط السفلي، موبايل) — أهم ملف اتلمس في
// مرحلة 4 من الخطة. البوكس بيفتح من زرار "الموارد القانونية" جوه بوكس
// "المزيد"، وفيه اختيارين: "الصيغ والنماذج" (تاب encyclopedia) و"دليل
// المحامي" (تاب lawyerGuide).
//
// ⚠️ ليه التست ده ممكن يشتغل على Desktop Chrome (playwright.config.ts):
// CommandDock.tsx لسه بيتعرض على الديسكتوب كمان (مفيش `!isDesktop` بعد —
// راجع تعليق "Mobile Safety" في DesktopSidebar.tsx)، فالعناصر دي موجودة
// وقابلة للنقر فعليًا حتى في فيوبورت الديسكتوب المستخدم في CI حاليًا.
// DesktopSidebar نفسه (desktop-nav-encyclopedia/desktop-nav-lawyerGuide)
// بيوفر مسار مباشر موازي — مغطى في encyclopedia-browse.spec.ts و
// lawyer-guide-browse.spec.ts، ومش بديل عن اختبار البوكس الفرعي نفسه هنا.

test('بوكس "الموارد القانونية": فتحه من "المزيد"، زرار الرجوع يرجّع لبوكس "المزيد"', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-resources').click();

  // البوكس الفرعي فيه بالظبط الاختيارين ("الصيغ والنماذج" و"دليل المحامي")
  await expect(page.getByTestId('nav-more-encyclopedia')).toBeVisible();
  await expect(page.getByTestId('nav-more-lawyerGuide')).toBeVisible();
  // زرار "الرجوع" الخاص بالبوكس الفرعي ظاهر
  await expect(page.getByTestId('nav-resources-back')).toBeVisible();

  await page.getByTestId('nav-resources-back').click();

  // بعد الرجوع: البوكس الفرعي اختفى، وبوكس "المزيد" الأصلي ظهر تاني
  await expect(page.getByTestId('nav-more-encyclopedia')).toHaveCount(0);
  await expect(page.getByTestId('nav-more-resources')).toBeVisible();
});

test('بوكس "الموارد القانونية": اختيار "الصيغ والنماذج" بينقّل للتاب ويقفل البوكس', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-resources').click();
  await page.getByTestId('nav-more-encyclopedia').click();

  // البوكس الفرعي وبوكس "المزيد" الاتنين اتقفلوا، والتاب فتح فعليًا
  await expect(page.getByTestId('nav-more-encyclopedia')).toHaveCount(0);
  await expect(page.getByTestId('nav-resources-back')).toHaveCount(0);
  await expect(
    page.getByTestId('encyclopedia-folder-card').first()
      .or(page.getByTestId('encyclopedia-empty'))
  ).toBeVisible({ timeout: 15_000 });
});

test('بوكس "الموارد القانونية": اختيار "دليل المحامي" بينقّل للتاب ويقفل البوكس', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-resources').click();
  await page.getByTestId('nav-more-lawyerGuide').click();

  await expect(page.getByTestId('nav-more-lawyerGuide')).toHaveCount(0);
  await expect(page.getByTestId('nav-resources-back')).toHaveCount(0);
  await expect(
    page.getByTestId('lawyer-guide-category-card').first()
      .or(page.getByTestId('lawyer-guide-empty'))
  ).toBeVisible({ timeout: 15_000 });
});

test('زرار "المزيد" بيقفل بوكس "الموارد القانونية" المفتوح ويرجّع بوكس "المزيد"', async ({ page }) => {
  await login(page);

  await page.getByTestId('nav-more-toggle').click();
  await page.getByTestId('nav-more-resources').click();
  await expect(page.getByTestId('nav-more-encyclopedia')).toBeVisible();

  // الضغط على "المزيد" تاني (مش زرار الرجوع) لازم يقفل بوكس الموارد
  // ويفتح بوكس "المزيد" العادي تاني (نفس سلوك setShowResourcesPicker(false)
  // جوه onClick بتاعه في CommandDock.tsx)
  await page.getByTestId('nav-more-toggle').click();

  await expect(page.getByTestId('nav-more-encyclopedia')).toHaveCount(0);
  await expect(page.getByTestId('nav-more-resources')).toBeVisible();
});
