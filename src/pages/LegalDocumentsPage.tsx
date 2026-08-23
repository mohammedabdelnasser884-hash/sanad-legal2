// ══════════════════════════════════════════════════════════════════
// LegalDocumentsPage.tsx — القسم 9.1 + القسم 8 (المسارات)
//
// آلة حالات بسيطة (step machine) تغلّف رحلة:
//   TemplatePicker → SourceModeSelector → DynamicFieldsForm → DocumentPreviewEditor
// مع مسارين لدخول الرحلة:
//   1) من CaseDetailView (initialCaseId موجود): TemplatePicker مباشرة، وبعد
//      اختيار القالب بتتخطى SourceModeSelector بالكامل (sourceMode=case_bound
//      تلقائيًا) — القسم 9.5.
//   2) من الصفحة نفسها (initialCaseId=null): TemplatePicker هي جسم الصفحة
//      الافتراضي (القسم 9.1)؛ اختيار كارت قالب → SourceModeSelector، بالترتيب
//      المذكور في القسم 6/بند 3.
//
// ⚠️ [قرار أثناء المرحلة 3] زرار "+ مستند جديد" (القسم 9.1 بند 1) نصّه
// بيقول بيفتح SourceModeSelector "مباشرة (مش TemplatePicker)"، وده ظاهريًا
// بيعارض ترتيب "TemplatePicker → SourceModeSelector" المقفول في القسم
// 6/بند 3. الحل المتبع هنا: اعتبرت زرار "+" مسار بديل منفصل عن مسار
// اختيار القالب من الشبكة — بيفتح SourceModeSelector *بدون* قالب محدد
// بعد، وبعد اختيار المصدر بيرجع لنفس شبكة TemplatePicker لاختيار القالب
// (خطوة 'templates' تاني، بس بعلامة "قالب مطلوب دلوقتي" بدل عرض حر).
// الترتيب الافتراضي (كارت من الشبكة) فضل زي ما هو مقفول بالظبط. يحتاج
// تأكيدك — لو قصدك حاجة تانية وضّحها وهعدّل فورًا.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { I } from '../constants';
import TemplatePicker from '../features/documentGeneration/components/TemplatePicker/TemplatePicker';
import SourceModeSelector from '../features/documentGeneration/components/SourceModeSelector';
import DynamicFieldsForm from '../features/documentGeneration/components/DynamicFieldsForm';
import DocumentPreviewEditor from '../features/documentGeneration/components/DocumentPreviewEditor';
import { useGenerateDocument } from '../features/documentGeneration/hooks/useGenerateDocument';
import type { DocumentTemplate, SourceMode, GeneratedDocument } from '../features/documentGeneration/types';
import type { NavigationState } from '../useNavigation';

type Step = 'templates' | 'sourceMode' | 'fields' | 'preview';

interface LegalDocumentsPageProps {
  /** لو موجودة (جاي من زرار "توليد مستند" جوه CaseDetailView) — القسم 9.5 */
  initialCaseId?: string | null;
  /** بينادى مرة واحدة بمجرد استهلاك initialCaseId، عشان زيارة تانية للتاب متبدأش نفس التدفق تلقائيًا */
  onInitialCaseConsumed?: () => void;
  nav: NavigationState;
}

export default function LegalDocumentsPage({ initialCaseId, onInitialCaseConsumed, nav }: LegalDocumentsPageProps) {
  // مجمّد زي caseId بالظبط — لازم يتحسب مرة واحدة في mount الأول، مش من الـprop
  // الحي، لأن initialCaseId بيترجع null في الـparent بعد onInitialCaseConsumed
  // (useEffect تحت) فورًا بعد أول render.
  const [hasCaseContext] = useState<boolean>(!!initialCaseId);

  const [step, setStep] = useState<Step>('templates');
  const [pendingSourceModeOnly, setPendingSourceModeOnly] = useState(false); // مسار زرار "+" — بعد اختيار المصدر لازم نرجع نختار قالب
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(hasCaseContext ? 'case_bound' : null);
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

  const resetToTemplates = () => {
    setStep('templates');
    setSelectedTemplate(null);
    setPendingSourceModeOnly(false);
    if (!hasCaseContext) { setSourceMode(null); setCaseId(null); }
  };

  const handleNewDocumentClick = () => {
    setPendingSourceModeOnly(true);
    setStep('sourceMode');
  };

  const handleSelectTemplate = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    if (hasCaseContext) {
      // القسم 9.5: من CaseDetailView — تخطي SourceModeSelector بالكامل
      setStep('fields');
      return;
    }
    setStep('sourceMode');
  };

  const handleSelectSourceMode = (mode: SourceMode, pickedCaseId: string | null) => {
    setSourceMode(mode);
    setCaseId(pickedCaseId);
    if (pendingSourceModeOnly && !selectedTemplate) {
      // مسار زرار "+": المصدر اتحدد، دلوقتي نرجع نختار القالب
      setPendingSourceModeOnly(false);
      setStep('templates');
      return;
    }
    setStep('fields');
  };

  const handleGenerate = async () => {
    const doc = await genState.generate();
    if (doc) {
      setGeneratedDocument(doc);
      setStep('preview');
    }
  };

  const headerTitle = 'المستندات القانونية';

  return (
    <div className="space-y-4 fade-in">
      {step === 'templates' && !pendingSourceModeOnly && (
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-white">{headerTitle}</h3>
          {!hasCaseContext && (
            <button
              data-testid="doc-gen-new-document-btn"
              onClick={handleNewDocumentClick}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black text-premium-bg transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg,#d4af37,#f0c040)' }}
            >
              <I.Plus /> مستند جديد
            </button>
          )}
        </div>
      )}

      {step === 'templates' && pendingSourceModeOnly && (
        <div className="flex items-center gap-2">
          <button onClick={resetToTemplates} data-testid="doc-gen-back-btn" className="flex items-center gap-1 text-slate-400 text-xs font-bold">
            <I.ChevronRight className="w-4 h-4" /> رجوع
          </button>
          <span className="text-xs font-bold text-slate-400">اختر القالب</span>
        </div>
      )}

      {step === 'templates' && (
        <TemplatePicker onSelectTemplate={handleSelectTemplate} />
      )}

      {step === 'sourceMode' && (
        <SourceModeSelector
          onSelectMode={handleSelectSourceMode}
          onBack={() => { setPendingSourceModeOnly(false); setStep('templates'); }}
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
          sourceMode={sourceMode}
          caseId={caseId}
          onSubmit={handleGenerate}
          onBack={() => {
            if (hasCaseContext) { setStep('templates'); setSelectedTemplate(null); return; }
            setStep('sourceMode');
          }}
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
