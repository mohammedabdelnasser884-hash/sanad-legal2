// ══════════════════════════════════════════════════════════════════
// LegalDocumentsPage.tsx — القسم 9 (أولوية 3) من
// Sanad_Legal_Documents_Master_Report.md — ملف 6 من 7
//
// آلة حالات (step machine) تغلّف رحلة الويزارد بالتصنيفات الجديدة:
//   CategoryPicker → TemplatePicker → SourceModeSelector →
//   DynamicFieldsForm → DocumentPreviewEditor
// مع مسارين لدخول الرحلة (القسم 9 "منطق الدخول"):
//   1) من CaseDetailView (initialCaseId موجود): يتخطى خطوة "القسم"
//      بالكامل، يدخل على "المستند" مباشرة (كل التصنيفات، من غير
//      lockedCategory). بعد اختيار القالب لسه بيعدّي على
//      SourceModeSelector زي أي مسار تاني — ⚡ [قرار جيمي، 26 أغسطس
//      2026] تخطي هذه الشاشة تلقائيًا (sourceMode=case_bound جاهز)
//      اتلغى بالكامل. المحامي بيشوف الاختيار الكامل (من القضية/إدخال
//      يدوي/نموذج فاضي) حتى لو داخل من قضية مفتوحة، من غير أي افتراضي
//      محدد مسبقًا — القضية معروفة بالفعل فبتتمرر كـ presetCaseId
//      لـSourceModeSelector، فلو اختار "من قضية مفتوحة" بيستخدمها على
//      طول من غير بحث تاني، لكن الاختيار نفسه يفضل واجب في كل مرة.
//   2) من الصفحة نفسها (initialCaseId=null): يبدأ من "القسم" دايمًا.
//      اختيار كارت تصنيف → "المستند" (TemplatePicker بـlockedCategory)
//      → "المصدر" → "البيانات" → "المعاينة". زرار الرجوع في كل خطوة
//      يرجّع للي قبلها من غير فقد الاختيارات السابقة.
//
// ✅ [سجل القرارات بند 2] زرار "+ مستند جديد" القديم اتشال بالكامل —
// شريط البحث الموحّد فوق شبكة التصنيفات في CategoryPicker.tsx (البحث
// بيقفز مباشرة لقالب من أي تصنيف) بيغطي نفس الاحتياج بترتيب متسق،
// من غير مسار بديل بترتيب معكوس.
//
// [أولوية 4] لما جاي من قضية مفتوحة، initialCaseType (لو موصّل من الـparent)
// بيتحوّل لـcategoryPriority ثابت (caseTypeCategoryPriority.ts) وبيتمرر
// لـTemplatePicker — ترتيب اقتراحي بس، مش فلترة (القسم 5.1).
//
// Stepper: currentStepIndex مبني على index ثابت في STEP_ORDER، مش على
// state منفصل لـ"إيه اللي منجز". لما مسار hasCaseContext يتخطى
// 'categories' (وكمان 'sourceMode')، currentStepIndex بيبقى أعلى منهم
// تلقائيًا فيظهروا "منجزين" من غير أي منطق إضافي — نفس القرار الموثّق
// في Stepper.tsx نفسه.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { I } from '../constants';
import { db } from '../supabaseClient';
import { logActivity } from '../shared/lib/dataAccess';
import { escapeTelegramHtml } from '../shared/lib/sanitize';
import Stepper, { type StepperStep } from '../shared/ui/Stepper';
import CategoryPicker from '../features/documentGeneration/components/CategoryPicker';
import TemplatePicker from '../features/documentGeneration/components/TemplatePicker/TemplatePicker';
import SourceModeSelector from '../features/documentGeneration/components/SourceModeSelector';
import DynamicFieldsForm from '../features/documentGeneration/components/DynamicFieldsForm';
import DocumentPreviewEditor from '../features/documentGeneration/components/DocumentPreviewEditor';
import type { DocumentCategoryFilter } from '../features/documentGeneration/hooks/useDocumentTemplates';
import { useGenerateDocument } from '../features/documentGeneration/hooks/useGenerateDocument';
import { getCategoryPriorityForCaseType } from '../features/documentGeneration/lib/caseTypeCategoryPriority';
import type { DocumentTemplate, SourceMode, GeneratedDocument } from '../features/documentGeneration/types';
import type { NavigationState } from '../useNavigation';

type Step = 'categories' | 'templates' | 'sourceMode' | 'fields' | 'preview';
type CategoryValue = Exclude<DocumentCategoryFilter, 'الكل'>;

// ترتيب ثابت لكل خطوات الويزارد — منه بيتحسب currentStepIndex بتاع Stepper.
const STEP_ORDER: Step[] = ['categories', 'templates', 'sourceMode', 'fields', 'preview'];
const STEPPER_STEPS: StepperStep[] = [
  { key: 'categories', label: 'القسم' },
  { key: 'templates', label: 'المستند' },
  { key: 'sourceMode', label: 'المصدر' },
  { key: 'fields', label: 'البيانات' },
  { key: 'preview', label: 'المعاينة' },
];

interface LegalDocumentsPageProps {
  /** لو موجودة (جاي من زرار "توليد مستند" جوه CaseDetailView) — القسم 9.5 */
  initialCaseId?: string | null;
  /** نوع القضية (case_type/MappedCase.type) — أولوية 4 (القسم 5.1)، بيتحسب
   * من الـparent (App.tsx) وقت الدخول من CaseDetailView بس، عشان يرتّب
   * القوالب الأكتر صلة أول القايمة. اختياري تمامًا — من غيره الترتيب
   * الافتراضي زي ما هو. */
  initialCaseType?: string | null;
  /** بينادى مرة واحدة بمجرد استهلاك initialCaseId، عشان زيارة تانية للتاب متبدأش نفس التدفق تلقائيًا */
  onInitialCaseConsumed?: () => void;
  nav: NavigationState;
  /** ⚡ NEW (26 أغسطس 2026 — مراجعة "إيه الناقص في التقرير"): اختياري تمامًا،
   * زي كل مكان تاني في المشروع بيستخدم useTelegramAlerts — لو مش متمرر
   * (مثلاً في تست)، إشعار التيليجرام بيتخطى بصمت من غير أي كسر. */
  sendTelegram?: (text: string) => void;
}

export default function LegalDocumentsPage({ initialCaseId, initialCaseType, onInitialCaseConsumed, nav, sendTelegram }: LegalDocumentsPageProps) {
  // مجمّد زي caseId بالظبط — لازم يتحسب مرة واحدة في mount الأول، مش من الـprop
  // الحي، لأن initialCaseId بيترجع null في الـparent بعد onInitialCaseConsumed
  // (useEffect تحت) فورًا بعد أول render.
  const [hasCaseContext] = useState<boolean>(!!initialCaseId);
  // نفس التجميد بالظبط — أولوية 4، مش لازم يتغيّر بعد أول render.
  const [categoryPriority] = useState(() => getCategoryPriorityForCaseType(initialCaseType));

  const [step, setStep] = useState<Step>(hasCaseContext ? 'templates' : 'categories');
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  // ⚡ [قرار جيمي، 26 أغسطس 2026] كان بيتحسب hasCaseContext ? 'case_bound' : null
  // (تخطي تلقائي). دلوقتي دايمًا null — SourceModeSelector واجبة الظهور في كل
  // المسارين، مفيش افتراضي محدد مسبقًا حتى لو القضية معروفة.
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  const [caseId, setCaseId] = useState<string | null>(initialCaseId ?? null);
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedDocument | null>(null);

  useEffect(() => {
    if (initialCaseId) onInitialCaseConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const genState = useGenerateDocument({
    templateId: selectedTemplate?.id ?? null,
    caseId,
    sourceMode,
  });

  const handleSelectCategory = (category: CategoryValue) => {
    setSelectedCategory(category);
    setStep('templates');
  };

  const handleBackToCategories = () => {
    setStep('categories');
    setSelectedCategory(null);
    setSelectedTemplate(null);
  };

  const handleOpenArchive = () => {
    // القسم 8.2: مش توليد مستند — تنقّل مباشر لتاب "المستندات" (ArchiveTab)
    // الموجود فعليًا، بره الويزارد بالكامل.
    nav.navigateTo('documents');
  };

  const handleSelectTemplate = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    // ⚡ [قرار جيمي، 26 أغسطس 2026] كان بيتخطى SourceModeSelector تلقائيًا
    // لما hasCaseContext=true (القسم 9.5 الأصلي). اتلغى — الاختيار (من
    // القضية/يدوي/فاضي) واجب الظهور دايمًا، حتى لو القضية معروفة بالفعل
    // (بتتمرر كـpresetCaseId فقط عشان تسهّل اختيار "من قضية مفتوحة" لو
    // اختارها، مش عشان تتخطى الاختيار نفسه).
    setStep('sourceMode');
  };

  const handleSelectSourceMode = (mode: SourceMode, pickedCaseId: string | null) => {
    setSourceMode(mode);
    setCaseId(pickedCaseId);
    setStep('fields');
  };

  const handleGenerate = async () => {
    const doc = await genState.generate();
    if (doc) {
      setGeneratedDocument(doc);
      setStep('preview');
      // ⚡ NEW (26 أغسطس 2026 — مراجعة "إيه الناقص في التقرير"): توليد
      // مستند فعل رئيسي زي إضافة قضية/جلسة/رفع مستند أرشيف — كلهم بيتسجلوا
      // في سجل النشاط (logActivity) بنفس entity_type: 'document' المستخدم
      // فعليًا في ArchiveTab.tsx/useCaseDocuments.ts للمستندات المرفوعة.
      // توليد المستند كان الاستثناء الوحيد الغير مسجّل — مفيش أي تعديل على
      // منطق التوليد نفسه، استدعاء واحد بس بعد نجاحه، بنفس نمط باقي
      // المشروع (بدون await — logActivity بتتعامل مع أخطاءها داخليًا).
      const sourceLabel = sourceMode === 'case_bound' ? ' — من قضية مفتوحة' : sourceMode === 'manual' ? ' — إدخال يدوي' : ' — نموذج فاضي';
      logActivity(db, 'توليد مستند قانوني', {
        entity_type: 'document',
        entity_id: doc.id,
        details: `${selectedTemplate?.name_ar || ''}${sourceLabel}`.trim(),
      });
      // نفس نمط باقي أفعال المشروع الرئيسية (قضية جديدة/جلسة جديدة) —
      // إشعار تيليجرام اختياري، صفر تأثير لو sendTelegram مش متمرر.
      if (sendTelegram && selectedTemplate) {
        let msg = `📄 <b>تم توليد مستند</b>\n\n`;
        msg += `⚖️ ${escapeTelegramHtml(selectedTemplate.name_ar)}\n`;
        msg += `📂 ${escapeTelegramHtml(selectedTemplate.category)}\n`;
        msg += `🔗 المصدر:${sourceLabel}\n`;
        sendTelegram(msg);
      }
    }
  };

  const currentStepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="space-y-4 fade-in">
      <Stepper steps={STEPPER_STEPS} currentStepIndex={currentStepIndex} testId="doc-gen-stepper" />

      {step === 'categories' && (
        <CategoryPicker
          onSelectCategory={handleSelectCategory}
          onSelectTemplate={handleSelectTemplate}
          onOpenArchive={handleOpenArchive}
        />
      )}

      {step === 'templates' && !hasCaseContext && (
        <div className="flex items-center gap-2">
          <button onClick={handleBackToCategories} data-testid="doc-gen-back-to-categories-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
            <I.ChevronRight className="w-4 h-4" /> رجوع
          </button>
          <span className="text-xs font-bold text-slate-400">{selectedCategory}</span>
        </div>
      )}

      {step === 'templates' && (
        <TemplatePicker
          onSelectTemplate={handleSelectTemplate}
          lockedCategory={hasCaseContext ? undefined : selectedCategory ?? undefined}
          categoryPriority={hasCaseContext ? categoryPriority : undefined}
        />
      )}

      {step === 'sourceMode' && (
        <SourceModeSelector
          onSelectMode={handleSelectSourceMode}
          onBack={() => setStep('templates')}
          presetCaseId={hasCaseContext ? caseId : null}
        />
      )}

      {step === 'fields' && selectedTemplate && sourceMode && (
        <DynamicFieldsForm
          templateName={selectedTemplate.name_ar}
          fields={genState.fields}
          values={genState.values}
          setValue={genState.setValue}
          loadingFields={genState.loadingFields}
          loadError={genState.loadError}
          missingRequiredFieldLabels={genState.missingRequiredFieldLabels}
          isValid={genState.isValid}
          generating={genState.generating}
          generateError={genState.generateError}
          usingOfflineCache={genState.usingOfflineCache}
          sourceMode={sourceMode}
          caseId={caseId}
          onSubmit={handleGenerate}
          onBack={() => setStep('sourceMode')}
        />
      )}

      {step === 'preview' && generatedDocument && selectedTemplate && (
        <DocumentPreviewEditor
          document={generatedDocument}
          templateName={selectedTemplate.name_ar}
          onBack={() => setStep('fields')}
          onOpenSettings={() => nav.openModal('settings')}
        />
      )}
    </div>
  );
}
