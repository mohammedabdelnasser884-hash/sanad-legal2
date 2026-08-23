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
  // من سياق القضية). لو فيه حقول مطلوبة لسه فاضية (مش متعبّية تلقائيًا
  // من بيانات القضية)، نعبّيها بقيمة اختبار عامة قبل التوليد.
  await page.getByTestId('doc-gen-submit-btn').waitFor({ state: 'visible', timeout: 10_000 });
  const emptyRequiredInputs = page.locator('input[required], textarea[required]').filter({ hasNot: page.locator('[value]:not([value=""])') });
  const emptyCount = await emptyRequiredInputs.count();
  for (let i = 0; i < emptyCount; i++) {
    const el = emptyRequiredInputs.nth(i);
    if ((await el.inputValue()) === '') await el.fill('بيانات اختبار E2E');
  }
  await page.getByTestId('doc-gen-submit-btn').click();

  // 4) DocumentPreviewEditor — معاينة المستند المولّد
  await page.getByTestId('doc-gen-export-pdf-btn').waitFor({ state: 'visible', timeout: 15_000 });
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
