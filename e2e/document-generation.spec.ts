import { test, expect } from '@playwright/test';
import { login, createAndOpenCase, expectToast } from './utils';

// المرحلة 4 (خطة توليد المستندات القانونية) — بند 4: e2e كامل للرحلة
// "توليد → معاينة → تصدير PDF → التأكد إنه ظاهر في DocsSection.tsx
// الموجود بالفعل". المسار المستخدم هنا هو زرار "توليد مستند" جوه
// CaseDetailView (تبويب docs) — بيبدأ case_bound، ⚡ [قرار جيمي، 26
// أغسطس 2026] لكن SourceModeSelector بقت واجبة الظهور حتى في المسار
// ده (اتلغى التخطي التلقائي القديم) — راجع الخطوة 3 تحت.
//
// ⚡ NEW (طلب جيمي، 26 أغسطس 2026 — إخفاء قسم المستندات القانونية):
// canGenerateDocuments (App.tsx) بقى مقصور على حساب السوبر أدمن
// الوحيد بس (isAISuperAdmin — m.gemy4231@gmail.com)، مش أي lawyer/admin
// عادي. حساب E2E_TEST_EMAIL المستخدم في login() مش السوبر أدمن (نفس
// ملحوظة admin-legal-library.spec.ts بالظبط) — يعني زرار
// "case-detail-generate-document-btn" ماعادش بيظهر ليه، فالرحلة دي
// (توليد فعلي → PDF → ظهور في المستندات) بقت غير قابلة للتشغيل
// بحساب E2E العادي. اتحولت لـtest.skip بدل ما تتمسح (نفس نمط
// ai-assistant.spec.ts بالظبط) — الكود فاضل كمرجع لو السوبر أدمن
// نفسه احتاج يشغّلها يدويًا بحساب حقيقي يوم ما. التست الجديد تحت
// بيتأكد بدل منها إن القسم مختفي فعليًا لحساب عادي.

test.skip('توليد مستند قانوني من قضية مفتوحة، تصديره PDF، والتأكد من ظهوره في مستندات القضية', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار توليد مستندات E2E - ${Date.now()}`;
  await createAndOpenCase(page, caseTitle);

  // 1) تبويب المستندات، وزرار "توليد مستند" (جنب زرار الرفع العادي)
  await page.getByTestId('case-tab-docs').click();
  await page.getByTestId('case-detail-generate-document-btn').click();

  // 2) TemplatePicker — ⚡ FIX (تشخيص لوجز E2E جديدة — 26 أغسطس 2026):
  // "أول كارت في الشبكة" مش تحديد ثابت — أولوية 4 (getCategoryPriorityForCaseType)
  // بترتّب القوالب حسب نوع القضية (هنا 'مدني' → عرائض أول التصنيفات)، فأول
  // كارت فعليًا بيتغيّر لو نوع القضية أو ترتيب الأولوية اتغيّر مستقبلاً —
  // وده اللي حصل بالظبط (كان بيرجّع "إنذار على يد محضر"، بقى يرجّع "صحيفة
  // دعوى مبسطة" اللي حقولها مختلفة تمامًا ومفيهاش warning_subject أصلاً).
  // الفيكس الصحيح: نستهدف القالب المطلوب فعليًا بالاسم عبر شريط البحث
  // الموحّد (نتيجة وحيدة مضمونة، بغض النظر عن ترتيب الشبكة).
  await page.getByTestId('doc-gen-search-input').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('doc-gen-search-input').fill('إنذار');
  const warningTemplateCard = page.locator('[data-testid^="doc-gen-template-card-"]').first();
  await warningTemplateCard.waitFor({ state: 'visible', timeout: 10_000 });
  await warningTemplateCard.click();

  // 3) SourceModeSelector — ⚡ [قرار جيمي، 26 أغسطس 2026] الشاشة دي بقت
  // واجبة دايمًا حتى مع case_bound context (اتلغى التخطي التلقائي القديم؛
  // راجع LegalDocumentsPage.tsx). القضية معروفة بالفعل (مررة كـpresetCaseId)
  // فاختيار "من قضية مفتوحة" بيستخدمها على طول من غير بحث تاني.
  await page.getByTestId('doc-gen-source-mode-case').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('doc-gen-source-mode-case').click();

  // 4) DynamicFieldsForm — تعبئة الحقل الوحيد غير المربوط تلقائيًا ببيانات
  // القضية في هذا القالب.
  // 🔒 FIX (24 أغسطس 2026 — تشخيص فعلي عبر trace.zip): المنطق القديم هنا
  // كان بيدوّر ديناميكيًا على `input[required], textarea[required]` فاضية
  // ويعبّيها. التريس الفعلي أثبت إن الاستعلام ده كان بيتنفذ في سباق حقيقي
  // مع رندر الفورم — queryCount رجّع صفر عناصر رغم إن `required` موجودة في
  // الكود فعلاً (submit-btn بيبقى visible قبل ما بيانات الحقول تخلص تحميل
  // فعليًا)، فالحلقة القديمة كانت بتتخطى كل الحقول من غير أي fill، والضغط
  // على submit كان بيرتد فورًا (isValid=false) من غير ما ينقل الخطوة أصلاً
  // — الاختبار كان بيقعد يستنى زرار "تصدير PDF" اللي عمره ما هيظهر.
  // الفيكس: تعبئة الحقل المعروف ("موضوع الإنذار"، field_key=warning_subject
  // — الحقل الوحيد غير المربوط تلقائيًا ببيانات القضية في هذا القالب)
  // بالـtestid الصريح بتاعه مباشرة، بدل الاكتشاف الديناميكي الهش. ده بينتظر
  // الحقل نفسه (مش زرار submit بس) قبل أي تفاعل، فبيضمن إن الفورم خلص رندر
  // فعليًا قبل التعبئة.
  await page.getByTestId('doc-gen-field-warning_subject').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('doc-gen-field-warning_subject').fill('بيانات اختبار E2E');
  await page.getByTestId('doc-gen-submit-btn').click();

  // 5) DocumentPreviewEditor — معاينة المستند المولّد
  // ⚡ FIX (24 أغسطس 2026): generate() دلوقتي بسقف داخلي 20 ثانية (بدل
  // 8) — راجع useGenerateDocument.ts. الـ15 ثانية القديمة هنا كانت أقل
  // من السقف الداخلي نفسه، يعني الاختبار كان مضمون يفشل حتى لو العملية
  // نجحت فعليًا في آخر لحظة. رفعتها لـ25 ثانية عشان تدّي هامش حقيقي بعد
  // أطول سيناريو ممكن للسلسلة الداخلية + وقت الرندر.
  await page.getByTestId('doc-gen-export-pdf-btn').waitFor({ state: 'visible', timeout: 25_000 });
  await expect(page.locator('[data-testid^="doc-gen-preview-section-"]').first()).toBeVisible();

  // 6) تصدير PDF
  await page.getByTestId('doc-gen-export-pdf-btn').click();
  await expectToast(page, 'تم التصدير بنجاح', 20_000);

  // 7) الرجوع لتبويب مستندات القضية، والتأكد إن الملف الناتج ظاهر فعليًا
  // — بدون أي تعديل على DocsSection.tsx نفسه (معيار القبول)
  // الرجوع للقضية (زرار "توليد مستند" نقل التاب بالكامل لـ
  // legalDocs، فمفيش مسار داخلي يرجّع لـCaseDetailView مباشرة — نفتح
  // القضية تاني من تبويب القضايا) والتأكد إن الملف الناتج ظاهر فعليًا
  // في مستنداتها — بدون أي تعديل على DocsSection.tsx نفسه (معيار القبول)
  await page.getByTestId('desktop-nav-cases').click();
  const caseRow = page.getByTestId('cases-table-row').filter({ hasText: caseTitle });
  await caseRow.first().getByTestId('cases-table-row-open').click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('case-tab-docs').click();
  await expect(page.getByTestId('doc-card').filter({ hasText: '.pdf' }).first()).toBeVisible({ timeout: 15_000 });
});

// ⚡ NEW (طلب جيمي، 26 أغسطس 2026 — إخفاء قسم المستندات القانونية):
// نفس نمط admin-legal-library.spec.ts بالظبط — بدل ما نتأكد من رفض
// RLS بعد محاولة فتح القسم، بنتأكد إنه أصلاً مش بيتعمله render خالص
// لحساب مش سوبر أدمن، لا في تاب المزيد (موبايل) ولا زرار "توليد
// مستند" جوه تبويب مستندات القضية.
test('حساب مكتب عادي (مش سوبر أدمن) → قسم "المستندات القانونية" مش ظاهر خالص', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار إخفاء المستندات القانونية E2E - ${Date.now()}`;
  await createAndOpenCase(page, caseTitle);

  await page.getByTestId('case-tab-docs').click();
  await expect(page.getByTestId('case-detail-generate-document-btn')).toHaveCount(0);

  // 🔴 CHANGED (إصلاح CI بعد تشغيل فعلي — 29 أغسطس 2026): كان ناقص هنا
  // إغلاق case-detail-view (مودال تفاصيل القضية، fixed inset-0 z-50) قبل
  // محاولة الرجوع لتبويب القضايا مباشرة — التشغيل الفعلي وقف على
  // "desktop-nav-cases ... subtree intercepts pointer events" بالظبط
  // (نفس الباگ اللي اتصلح في fees-linkage.spec.ts: مودال تفاصيل القضية
  // فضل فاتح فوق الشريط الجانبي بالكامل ومنع أي كليك عليه).
  // case-detail-close (CaseDetailView.tsx) هو زرار الإغلاق الصريح.
  await page.getByTestId('case-detail-close').click();
  await page.getByTestId('case-detail-view').waitFor({ state: 'hidden', timeout: 10_000 });

  await page.getByTestId('desktop-nav-cases').click();
  await expect(page.getByTestId('desktop-nav-legalDocs')).toHaveCount(0);
});
