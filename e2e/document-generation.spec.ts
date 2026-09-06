import { test, expect } from '@playwright/test';
import { login, createAndOpenCase, expectToast } from './utils';

// المرحلة 4 (خطة توليد المستندات القانونية) — بند 4: e2e كامل للرحلة
// "تعبئة → تأكيد وتحميل (.docx) → التأكد إن الملف اتحمّل فعليًا".
// ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 4.3] اتحدّث
// السيناريو ده بعد تحويل الخطوة الأخيرة من "معاينة نصية + تصدير PDF"
// (DocumentPreviewEditor/exportApi القديمين) لـ"تأكيد وتحميل" (Document
// FillConfirmScreen، مرحلة 4.2) — بيحمّل ملف .docx معبّى مباشرة (Blob من
// fill-document-template) من غير أي خطوة معاينة/تصدير منفصلة. صفر اعتماد
// على Gotenberg/PDF في المسار ده (القسم 8 بند 1 — Word فقط في هذه المرحلة).
// المسار المستخدم هنا هو زرار "توليد مستند" جوه CaseDetailView (تبويب
// docs) — بيبدأ case_bound، ⚡ [قرار جيمي، 26 أغسطس 2026] لكن
// SourceModeSelector بقت واجبة الظهور حتى في المسار ده (اتلغى التخطي
// التلقائي القديم) — راجع الخطوة 4 تحت.
//
// ⚠️ لسه محتاج قالب حقيقي عليه master_file_path مرفوع فعليًا على باكت
// legal-doc-templates (مرحلة 5 — لسه لم تبدأ وقت كتابة هذا التحديث) —
// السيناريو ده هيفضل test.skip لحد ما القوالب الأربعة الحقيقية تترحّل.
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

test.skip('تعبئة مستند قانوني من قضية مفتوحة، وتحميله كملف Word معبّى', async ({ page }) => {
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

  // 3) شاشة "القالب المفرد" (TemplateActionScreen) — ⚡ [Sanad_Legal_Documents_
  // Library_Transition_Plan.md، مرحلة 3.1] خطوة جديدة بين اختيار القالب
  // وSourceModeSelector. اختيار "تعبئة من بيانات قضية" يكمّل بالظبط نفس
  // المسار القديم (زرار "تحميل كما هو" جنبه بيحمّل الملف الأصلي فورًا، مش
  // جزء من رحلة التعبئة دي).
  await page.getByTestId('doc-gen-choose-fill-btn').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('doc-gen-choose-fill-btn').click();

  // 4) SourceModeSelector — ⚡ [قرار جيمي، 26 أغسطس 2026] الشاشة دي بقت
  // واجبة دايمًا حتى مع case_bound context (اتلغى التخطي التلقائي القديم؛
  // راجع LegalDocumentsPage.tsx). القضية معروفة بالفعل (مررة كـpresetCaseId)
  // فاختيار "من قضية مفتوحة" بيستخدمها على طول من غير بحث تاني.
  await page.getByTestId('doc-gen-source-mode-case').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('doc-gen-source-mode-case').click();

  // 5) DynamicFieldsForm — تعبئة الحقل الوحيد غير المربوط تلقائيًا ببيانات
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

  // 6) DocumentFillConfirmScreen ("تأكيد وتحميل") — [مرحلة 4.2] الخطوة
  // الجديدة اللي حلّت محل DocumentPreviewEditor/تصدير PDF القديمين. زرار
  // "تأكيد وتحميل" هنا هو أول لحظة بتنادي فيها الـEdge Function
  // fill-document-template فعليًا (الخطوات اللي قبل كده صفر نداء شبكة
  // للتعبئة نفسها) — بيرجّع Blob ويشغّل تحميل .docx مباشرة (event
  // 'download' في المتصفح، مش toast "تم التصدير").
  await page.getByTestId('doc-gen-fill-confirm-screen').waitFor({ state: 'visible', timeout: 10_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 25_000 });
  await page.getByTestId('doc-gen-confirm-fill-btn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);

  // 7) رسالة النجاح المحلية في نفس الشاشة (صفر جدول generated_documents،
  // القسم 8 بند 3 — التسجيل عبر logActivity بس، مفيش سجل DB منفصل نتحقق
  // من ظهوره في DocsSection.tsx زي المسار القديم).
  await expect(page.getByTestId('doc-gen-fill-success')).toBeVisible({ timeout: 5_000 });
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
