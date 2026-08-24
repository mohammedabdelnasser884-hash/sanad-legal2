import { test, expect } from '@playwright/test';
import { login, createAndOpenCase, expectToast } from './utils';

// المرحلة 4 (خطة توليد المستندات القانونية) — بند 4: e2e كامل للرحلة
// "توليد → معاينة → تصدير PDF → التأكد إنه ظاهر في DocsSection.tsx
// الموجود بالفعل". المسار المستخدم هنا هو زرار "توليد مستند" جوه
// CaseDetailView (تبويب docs) — بيبدأ case_bound تلقائيًا، فبيتخطى
// SourceModeSelector بالكامل (القسم 9.5)، وده أقصر مسار حقيقي للرحلة
// الكاملة يعدّي على كل الخطوات المطلوب اختبارها.

test('توليد مستند قانوني من قضية مفتوحة، تصديره PDF، والتأكد من ظهوره في مستندات القضية', async ({ page }) => {
  await login(page);

  const caseTitle = `اختبار توليد مستندات E2E - ${Date.now()}`;
  await createAndOpenCase(page, caseTitle);

  // 1) تبويب المستندات، وزرار "توليد مستند" (جنب زرار الرفع العادي)
  await page.getByTestId('case-tab-docs').click();
  await page.getByTestId('case-detail-generate-document-btn').click();

  // 2) TemplatePicker — case_bound بالفعل، فأول قالب من الشبكة كافي
  await page.getByTestId('doc-gen-search-input').waitFor({ state: 'visible', timeout: 10_000 });
  const firstTemplateCard = page.locator('[data-testid^="doc-gen-template-card-"]').first();
  await firstTemplateCard.waitFor({ state: 'visible', timeout: 10_000 });
  await firstTemplateCard.click();

  // 3) DynamicFieldsForm — تخطي SourceModeSelector تلقائيًا (case_bound
  // من سياق القضية).
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

  // 4) DocumentPreviewEditor — معاينة المستند المولّد
  // ⚡ FIX (24 أغسطس 2026): generate() دلوقتي بسقف داخلي 20 ثانية (بدل
  // 8) — راجع useGenerateDocument.ts. الـ15 ثانية القديمة هنا كانت أقل
  // من السقف الداخلي نفسه، يعني الاختبار كان مضمون يفشل حتى لو العملية
  // نجحت فعليًا في آخر لحظة. رفعتها لـ25 ثانية عشان تدّي هامش حقيقي بعد
  // أطول سيناريو ممكن للسلسلة الداخلية + وقت الرندر.
  await page.getByTestId('doc-gen-export-pdf-btn').waitFor({ state: 'visible', timeout: 25_000 });
  await expect(page.locator('[data-testid^="doc-gen-preview-section-"]').first()).toBeVisible();

  // 5) تصدير PDF
  await page.getByTestId('doc-gen-export-pdf-btn').click();
  await expectToast(page, 'تم التصدير بنجاح', 20_000);

  // 6) الرجوع لتبويب مستندات القضية، والتأكد إن الملف الناتج ظاهر فعليًا
  // — بدون أي تعديل على DocsSection.tsx نفسه (معيار القبول)
  // 6) الرجوع للقضية (زرار "توليد مستند" نقل التاب بالكامل لـ
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
