import { test } from '@playwright/test';
import {
  login,
  createCase,
  createStandaloneSession,
  createReminder,
  openAdminSection,
} from './utils';

// ─────────────────────────────────────────────────────────
//  🎥 desktop-walkthrough — سكريبت تسجيل فيديو بس (16 أغسطس 2026).
//
//  ⚠️ ده مش تست حقيقي — صفر assertions (مفيش ولا `expect` واحدة في
//  الملف كله). الغرض الوحيد: فيديو ديسكتوب متواصل واحد لجيمي يراجعه
//  من الموبايل (شهر كامل بلا لاب توب)، بيغطي أهم رحلات النظام —
//  إضافة قضية، إضافة جلسة مستقلة، تصفح تذكير، وتصفح لوحة الإدارة.
//
//  اتبنى فوق نفس الـhelpers الجاهزة من utils.ts (createCase،
//  createStandaloneSession، createReminder، openAdminSection) —
//  صفر selectors جديدة، صفر منطق تحقق جديد، فقط تسلسل أفعال + مهلات
//  انتظار قصيرة بين كل خطوة عشان الفيديو يبقى مفهوم لعين إنسان بدل ما
//  يعدي بسرعة الاختبار الآلي العادية.
//
//  بيشتغل على مشروع 'chromium' الافتراضي (Desktop Chrome، نفس الـ31
//  spec القديمة) — الملف ده مش جوه e2e/mobile/ فمش هيتفلتر برّه.
//  البيانات اللي بيعملها (قضية/جلسة/تذكير) بتتنضف تلقائيًا بنفس آلية
//  global-teardown.ts القديمة زي أي تست تاني (نفس pattern الأسماء
//  "اختبار E2E").
//
//  الفيديو هيتحفظ في test-results/ (موجودة أصلًا في مسارات رفع
//  ci.yml) — دور على مجلد اسمه فيه "desktop-walkthrough".
// ─────────────────────────────────────────────────────────

test.use({ video: 'on' });

test('جولة فيديو كاملة على الديسكتوب', async ({ page }) => {
  const pause = (ms: number) => page.waitForTimeout(ms);

  // 1) تسجيل الدخول + الرئيسية
  await login(page);
  await pause(1500);

  // 2) إضافة قضية جديدة (بيانات كاملة: قيد رسمي + طرفين)
  const caseTitle = `جولة فيديو — قضية ${Date.now()}`;
  await createCase(page, caseTitle);
  await pause(1500);

  // فتح القضية اللي اتعملت لتصفح شاشة التفاصيل بتاعتها شوية
  const row = page.getByTestId('cases-table-row').filter({ hasText: caseTitle });
  await row.first().getByTestId('cases-table-row-open').click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'visible', timeout: 10_000 });
  await pause(2000);
  await page.getByTestId('case-detail-close').click().catch(() => {});
  await pause(800);

  // 3) إضافة جلسة مستقلة (تقويم/جلسات)
  const sessionTitle = `جولة فيديو — جلسة ${Date.now()}`;
  await createStandaloneSession(page, sessionTitle);
  await pause(2000);

  // 4) تذكير جديد
  const reminderTitle = `جولة فيديو — تذكير ${Date.now()}`;
  await createReminder(page, reminderTitle);
  await pause(1800);

  // 5) الموكلين (تصفح بس)
  await page.getByTestId('desktop-nav-clients').click();
  await pause(1800);

  // 6) الأتعاب (تصفح بس)
  await page.getByTestId('desktop-nav-fees').click().catch(() => {});
  await pause(1500);

  // 7) لوحة الإدارة — جولة سريعة على أهم الأقسام
  await openAdminSection(page, 'office');
  await pause(1800);
  await openAdminSection(page, 'users');
  await pause(1800);
  await openAdminSection(page, 'security');
  await pause(1800);
  await openAdminSection(page, 'backup');
  await pause(1800);

  // رجوع للرئيسية في الآخر
  await page.getByTestId('desktop-nav-dashboard').click();
  await pause(1500);
});
