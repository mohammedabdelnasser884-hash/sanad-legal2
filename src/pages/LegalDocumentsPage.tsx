// ══════════════════════════════════════════════════════════════════
// LegalDocumentsPage.tsx — القسم 9 (أولوية 3) من
// Sanad_Legal_Documents_Master_Report.md — ملف 6 من 7
//
// آلة حالات (step machine) تغلّف رحلة الويزارد بالتصنيفات الجديدة:
//   CategoryPicker → TemplatePicker → TemplateActionScreen → (إما تحميل
//   فوري، أو) SourceModeSelector → DynamicFieldsForm →
//   DocumentFillConfirmScreen
// ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 3.1] خطوة
// TemplateActionScreen ("القالب المفرد") جديدة بين TemplatePicker
// وSourceModeSelector — بزرارين "تحميل كما هو" (فوري، صفر انتقال خطوة)
// و"تعبئة من بيانات قضية" (يكمّل للمسار القديم زي ما هو). DynamicFieldsForm
// لسه زي ما هو بالظبط (صفر تعديل داخلي، القسم 7 مرحلة 4.1) — الفرق
// بقى في مصدر بياناته (useFillDocument بدل useGenerateDocument) وفي
// خطوة "المعاينة" اللي بقت DocumentFillConfirmScreen (مرحلة 4.2) بدل
// DocumentPreviewEditor القديمة (المعاينة/التعديل النصي اتشالت بالكامل
// — القسم 3.5: مفيش نص بيتبني نعرضه في المتصفح بعد دلوقتي).
// مع مسارين لدخول الرحلة (القسم 9 "منطق الدخول"):
//   1) من CaseDetailView (initialCaseId موجود): يتخطى خطوة "القسم"
//      بالكامل، يدخل على "المستند" مباشرة (كل التصنيفات، من غير
//      lockedCategory). بعد اختيار القالب بيعدّي على TemplateActionScreen
//      زي أي مسار تاني، ولو اختار "تعبئة من بيانات قضية" يوصل
//      لـSourceModeSelector — ⚡ [قرار جيمي، 26 أغسطس 2026] تخطي هذه
//      الشاشة تلقائيًا (sourceMode=case_bound جاهز) اتلغى بالكامل. المحامي
//      بيشوف الاختيار الكامل (من القضية/إدخال يدوي/نموذج فاضي) حتى لو
//      داخل من قضية مفتوحة، من غير أي افتراضي محدد مسبقًا — القضية معروفة
//      بالفعل فبتتمرر كـ presetCaseId لـSourceModeSelector، فلو اختار "من
//      قضية مفتوحة" بيستخدمها على طول من غير بحث تاني، لكن الاختيار نفسه
//      يفضل واجب في كل مرة.
//   2) من الصفحة نفسها (initialCaseId=null): يبدأ من "القسم" دايمًا.
//      اختيار كارت تصنيف → "المستند" (TemplatePicker بـlockedCategory)
//      → "الإجراء" (TemplateActionScreen) → "المصدر" → "البيانات" →
//      "المعاينة". زرار الرجوع في كل خطوة يرجّع للي قبلها من غير فقد
//      الاختيارات السابقة.
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
import { escapeTelegramHtml } from '../shared/lib/sanitize';
import Stepper, { type StepperStep } from '../shared/ui/Stepper';
import CategoryPicker from '../features/documentGeneration/components/CategoryPicker';
import TemplatePicker from '../features/documentGeneration/components/TemplatePicker/TemplatePicker';
import TemplateActionScreen from '../features/documentGeneration/components/TemplateActionScreen';
import SourceModeSelector from '../features/documentGeneration/components/SourceModeSelector';
import DynamicFieldsForm from '../features/documentGeneration/components/DynamicFieldsForm';
import DocumentFillConfirmScreen from '../features/documentGeneration/components/DocumentFillConfirmScreen';
import type { DocumentCategoryFilter } from '../features/documentGeneration/hooks/useDocumentTemplates';
import { useFillDocument } from '../features/documentGeneration/hooks/useFillDocument';
import { getCategoryPriorityForCaseType } from '../features/documentGeneration/lib/caseTypeCategoryPriority';
import type { DocumentTemplate, SourceMode } from '../features/documentGeneration/types';
import type { NavigationState } from '../useNavigation';

// ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — القسم 3.5، مرحلة 3.1]
// خطوة 'action' جديدة اتضافت بين 'templates' و'sourceMode' — شاشة
// "القالب المفرد" (TemplateActionScreen) اللي بتحل محل الانتقال المباشر
// القديم من اختيار القالب لـSourceModeSelector. زرار "تحميل كما هو"
// فيها بيتفعّل من غير ما يغيّر الخطوة أصلاً (فوري)؛ زرار "تعبئة من
// بيانات قضية" هو اللي بيكمّل لـ'sourceMode' زي المسار القديم بالظبط.
type Step = 'categories' | 'templates' | 'action' | 'sourceMode' | 'fields' | 'preview';
type CategoryValue = Exclude<DocumentCategoryFilter, 'الكل'>;

// ترتيب ثابت لكل خطوات الويزارد — منه بيتحسب currentStepIndex بتاع Stepper.
const STEP_ORDER: Step[] = ['categories', 'templates', 'action', 'sourceMode', 'fields', 'preview'];
const STEPPER_STEPS: StepperStep[] = [
  { key: 'categories', label: 'القسم' },
  { key: 'templates', label: 'المستند' },
  { key: 'action', label: 'الإجراء' },
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

  useEffect(() => {
    if (initialCaseId) onInitialCaseConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 4.1]
  // useGenerateDocument (body_template/generateDocument القديمة) اتستبدلت
  // بـuseFillDocument (master_file_path/fillDocumentTemplate الجديدة) —
  // نفس آلية تحميل الحقول/حل القيم التلقائية بالظبط، لكن التعبئة نفسها
  // بترجع Blob (ملف .docx معبّى) مش GeneratedDocument (JSON مُركّب).
  const fillState = useFillDocument({
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
    // ⚡ [Sanad_Legal_Documents_Library_Transition_Plan.md — مرحلة 3.1]
    // بعد اختيار القالب، الوجهة بقت شاشة "القالب المفرد" الجديدة
    // (TemplateActionScreen) مش SourceModeSelector مباشرة — هي اللي
    // بتقرّر بعد كده لو المستخدم هيكمّل لـ'sourceMode' (زرار "تعبئة من
    // بيانات قضية"، القسم 8: الاختيار [قرار جيمي، 26 أغسطس 2026] لسه
    // واجب الظهور دايمًا) أو يحمّل الملف زي ما هو فورًا من غير أي خطوة
    // تانية.
    setStep('action');
  };

  // زرار "تعبئة من بيانات قضية" جوه TemplateActionScreen — يكمّل بالظبط
  // نفس المسار القديم (SourceModeSelector → DynamicFieldsForm → المعاينة).
  const handleChooseFill = () => setStep('sourceMode');

  const handleSelectSourceMode = (mode: SourceMode, pickedCaseId: string | null) => {
    setSourceMode(mode);
    setCaseId(pickedCaseId);
    setStep('fields');
  };

  // زرار "توليد المستند" جوه DynamicFieldsForm (onSubmit) — بيتنادى بس لو
  // isValid (منطق DynamicFieldsForm الداخلي نفسه، صفر تعديل، القسم 7
  // مرحلة 4.1). التعبئة الفعلية (نداء fillDocumentTemplate) بقت مؤجَّلة
  // لخطوة "تأكيد وتحميل" الجديدة (DocumentFillConfirmScreen، مرحلة 4.2)
  // — هنا بس بننتقل لها، صفر نداء شبكة في الخطوة دي.
  const handleProceedToConfirm = () => setStep('preview');

  // بينادى من جوه DocumentFillConfirmScreen بعد نجاح التحميل فعليًا —
  // إشعار تيليجرام الاختياري (logActivity نفسها بقت مسؤولية الشاشة
  // الجديدة، نفس نمط "تحميل مستند قانوني" في TemplateActionScreen.tsx).
  const handleFillSuccess = () => {
    if (sendTelegram && selectedTemplate) {
      const sourceLabel = sourceMode === 'case_bound' ? ' — من قضية مفتوحة' : sourceMode === 'manual' ? ' — إدخال يدوي' : ' — نموذج فاضي';
      let msg = `📄 <b>تم تعبئة مستند</b>\n\n`;
      msg += `⚖️ ${escapeTelegramHtml(selectedTemplate.name_ar)}\n`;
      msg += `📂 ${escapeTelegramHtml(selectedTemplate.category)}\n`;
      msg += `🔗 المصدر:${sourceLabel}\n`;
      sendTelegram(msg);
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

      {step === 'action' && selectedTemplate && (
        <TemplateActionScreen
          template={selectedTemplate}
          onBack={() => setStep('templates')}
          onChooseFill={handleChooseFill}
        />
      )}

      {step === 'sourceMode' && (
        <SourceModeSelector
          onSelectMode={handleSelectSourceMode}
          onBack={() => setStep('action')}
          presetCaseId={hasCaseContext ? caseId : null}
        />
      )}

      {step === 'fields' && selectedTemplate && sourceMode && (
        <DynamicFieldsForm
          templateName={selectedTemplate.name_ar}
          fields={fillState.fields}
          values={fillState.values}
          setValue={fillState.setValue}
          loadingFields={fillState.loadingFields}
          loadError={fillState.loadError}
          missingRequiredFieldLabels={fillState.missingRequiredFieldLabels}
          isValid={fillState.isValid}
          generating={false}
          generateError={null}
          sourceMode={sourceMode}
          caseId={caseId}
          onSubmit={handleProceedToConfirm}
          onBack={() => setStep('sourceMode')}
        />
      )}

      {step === 'preview' && selectedTemplate && sourceMode && (
        <DocumentFillConfirmScreen
          templateName={selectedTemplate.name_ar}
          masterFileName={fillState.masterFileName}
          sourceMode={sourceMode}
          filling={fillState.filling}
          fillError={fillState.fillError}
          onFill={fillState.fill}
          onFillSuccess={handleFillSuccess}
          onBack={() => setStep('fields')}
          onOpenSettings={() => nav.openModal('settings')}
        />
      )}
    </div>
  );
}
