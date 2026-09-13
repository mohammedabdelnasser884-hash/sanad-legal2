import { test, expect } from '@playwright/test';
import { login } from './utils';

// مرحلة 4 (تصفح/تحميل لكل المستخدمين) — نفس نمط admin-legal-library.spec.ts
// بالظبط: قسم إدارة "الموسوعة القانونية" في لوحة الإدارة مقصور بالكامل
// على حساب السوبر أدمن الوحيد (SUPER_ADMIN_EMAIL في AdminPanel.tsx) —
// الزرار مش بيتعمله render خالص لأي حساب تاني، مش مجرد معطّل. حساب
// E2E_TEST_EMAIL هو owner/admin لمكتب تجريبي عادي (مش سوبر أدمن)، فالتست
// ده بيتأكد إن القسم مش ظاهر له خالص في لوحة الإدارة.
//
// ⚠️ شرط أساسي: حساب E2E_TEST_EMAIL لازم يكون Admin/Owner، وإلا
// desktop-nav-admin مش هيظهر أصلًا (نفس ملحوظة admin-archive-lifecycle.spec.ts).
//
// ⚠️ ملحوظة مهمة (تختلف عن legal_library): قسم *إدارة* الموسوعة (ده
// التست) مقصور على سوبر أدمن، لكن تاب *تصفح/تحميل* الموسوعة الجديد
// (نفس التسمية في القائمة الجانبية، لكن خارج لوحة الإدارة) متاح لكل
// المستخدمين بلا استثناء — مغطى في encyclopedia-browse.spec.ts المنفصل.

test('حساب مكتب عادي (مش سوبر أدمن) → قسم إدارة "الموسوعة القانونية" مش ظاهر في لوحة الإدارة', async ({ page }) => {
  await login(page);
  await page.getByTestId('desktop-nav-admin').click();

  await expect(page.getByTestId('admin-section-encyclopedia')).toHaveCount(0);
});
