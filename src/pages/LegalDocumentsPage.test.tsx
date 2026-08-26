// ══════════════════════════════════════════════════════════════════
// LegalDocumentsPage.test.tsx
//
// ⚡ [قرار جيمي، 26 أغسطس 2026] القسم 9.5 الأصلي (تخطي SourceModeSelector
// تلقائيًا لما hasCaseContext=true) اتلغى بالكامل — المحامي لازم يشوف
// اختيار المصدر (من قضية مفتوحة/إدخال يدوي/نموذج فاضي) في كل مرة، حتى
// لو داخل من قضية مفتوحة بالفعل. القضية المعروفة بتتمرر كـpresetCaseId
// لـSourceModeSelector بس (تسهيل اختيار "من قضية مفتوحة" لو اختارها من
// غير بحث تاني) — مش تخطي الشاشة نفسها. التستات القديمة اللي كانت بتتأكد
// من التخطي التلقائي اتحدّثت/اتشالت هنا لتعكس السلوك الجديد.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LegalDocumentsPage from './LegalDocumentsPage';
import type { DocumentTemplate } from '../features/documentGeneration/types';
import type { NavigationState } from '../useNavigation';

// ⚠️ vitest.config.ts فيه globals: false، يعني @testing-library/react مش
// بيلاقي `afterEach` كـ global عشان يسجّل الـauto-cleanup بتاعه (زي ما
// LoginScreen.test.tsx موثّق). من غير ده، كل تست بيرندر فوق DOM التست
// اللي قبله في document.body بدل ما يتنضف، فالـqueries بتلاقي عناصر
// باقية من تستات سابقة. لازم cleanup() يدوي بعد كل تست.
afterEach(() => { cleanup(); mockGenerate.mockReset(); mockLogActivity.mockReset(); });

// LegalDocumentsPage.tsx بيستورد { I } من ../constants، واللي بدوره بيستورد
// db من ./supabaseClient — وده بينادي createClient() فعليًا وقت الـimport
// (top-level)، فبيرمي "supabaseUrl is required." في بيئة الاختبار (مفيش
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY). نفس النمط المستخدم في
// LoginScreen.test.tsx — نموك supabaseClient قبل ما أي حاجة تستورده.
vi.mock('../supabaseClient', () => ({
  db: {
    from: vi.fn(),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) },
    functions: { invoke: vi.fn() },
  },
}));

const fakeTemplate: DocumentTemplate = {
  id: 'tmpl-1',
  name_ar: 'قالب تجريبي',
  category: 'عرائض',
} as DocumentTemplate;

// نموك للأطفال عشان نختبر آلة الحالات في LegalDocumentsPage بمعزل عن
// تفاصيلهم الداخلية (فلترة، شبكة قوالب، إلخ). بيعرض كمان categoryPriority
// اللي استلمها (أولوية 4) كـdata attribute عشان نتحقق منه من غير ما نكسر
// عزل التست عن التفاصيل الداخلية لـuseDocumentTemplates.
vi.mock('../features/documentGeneration/components/TemplatePicker/TemplatePicker', () => ({
  default: ({
    onSelectTemplate,
    categoryPriority,
  }: {
    onSelectTemplate: (t: DocumentTemplate) => void;
    categoryPriority?: string[];
  }) => (
    <button
      data-testid="mock-select-template"
      data-category-priority={categoryPriority ? categoryPriority.join(',') : ''}
      onClick={() => onSelectTemplate(fakeTemplate)}
    >
      اختر القالب
    </button>
  ),
}));

// [أولوية 3] خطوة "① القسم" الجديدة — بنموكها عشان نختبر آلة الحالات
// بمعزل عن تفاصيل CategoryPicker الداخلية (البحث، شبكة الكاردز، إلخ).
// الأزرار التلاتة هنا بتحاكي التلات مسارات اللي CategoryPicker بيقدر
// يودّي لها: اختيار تصنيف (→ templates)، اختيار قالب من نتايج البحث
// الموحّد مباشرة (→ sourceMode/fields زي أي اختيار قالب تاني)، وفتح
// حافظة المستندات (→ تاب "المستندات"، القسم 8.2).
vi.mock('../features/documentGeneration/components/CategoryPicker', () => ({
  default: ({
    onSelectCategory,
    onSelectTemplate,
    onOpenArchive,
  }: {
    onSelectCategory: (category: 'إنذارات') => void;
    onSelectTemplate: (t: DocumentTemplate) => void;
    onOpenArchive: () => void;
  }) => (
    <div data-testid="mock-category-picker">
      <button data-testid="mock-select-category" onClick={() => onSelectCategory('إنذارات')}>
        اختر تصنيف
      </button>
      <button data-testid="mock-select-template-from-search" onClick={() => onSelectTemplate(fakeTemplate)}>
        نتيجة بحث
      </button>
      <button data-testid="mock-open-archive" onClick={onOpenArchive}>
        حافظة مستندات
      </button>
    </div>
  ),
}));

vi.mock('../features/documentGeneration/components/SourceModeSelector', () => ({
  default: ({
    onSelectMode,
    presetCaseId,
  }: {
    onSelectMode: (mode: 'case_bound' | 'manual' | 'blank', caseId: string | null) => void;
    presetCaseId?: string | null;
  }) => (
    <div data-testid="mock-source-mode-selector" data-preset-case-id={presetCaseId ?? ''}>
      SourceModeSelector
      <button data-testid="mock-select-source-case" onClick={() => onSelectMode('case_bound', presetCaseId ?? 'case-search-result')}>
        من قضية مفتوحة
      </button>
      <button data-testid="mock-select-source-manual" onClick={() => onSelectMode('manual', null)}>
        إدخال يدوي
      </button>
    </div>
  ),
}));

vi.mock('../features/documentGeneration/components/DynamicFieldsForm', () => ({
  default: ({ onSubmit }: { onSubmit: () => void }) => (
    <div data-testid="mock-dynamic-fields-form">
      DynamicFieldsForm
      <button data-testid="mock-submit-generate" onClick={onSubmit}>توليد</button>
    </div>
  ),
}));

vi.mock('../features/documentGeneration/components/DocumentPreviewEditor', () => ({
  default: () => <div data-testid="mock-document-preview-editor">DocumentPreviewEditor</div>,
}));

// mockGenerate قابلة لإعادة التوجيه لكل تست على حدة (mockResolvedValueOnce)
// عشان نختبر مسار النجاح (توليد مستند بنجاح → logActivity/sendTelegram).
// بادئة "mock" مطلوبة عشان vitest يسمح باستخدامها جوه factory معلّق (hoisted).
const mockGenerate = vi.fn();

vi.mock('../features/documentGeneration/hooks/useGenerateDocument', () => ({
  useGenerateDocument: () => ({
    fields: [],
    loadingFields: false,
    loadError: null,
    values: {},
    setValue: vi.fn(),
    missingRequiredFieldLabels: [],
    isValid: true,
    generating: false,
    generateError: null,
    generate: mockGenerate,
  }),
}));

// logActivity بتتنادى بعد نجاح التوليد (مراجعة "إيه الناقص في التقرير"،
// 26 أغسطس 2026) — بنموكها عشان نتحقق من الاستدعاء نفسه (entity_type/
// entity_id/details)، مش من تأثيرها الحقيقي على قاعدة البيانات.
const mockLogActivity = vi.fn();
vi.mock('../shared/lib/dataAccess', () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

// LegalDocumentsPage محتاجة nav: NavigationState كامل، لكن بتستخدم بس
// openModal فعليًا (في مسار 'preview' مش مغطى هنا). باقي الدوال stubs
// فاضية عشان الـtype يتحقق بدون any (المشروع بيشغّل eslint بـ
// --max-warnings=0 فـ@typescript-eslint/no-explicit-any بيوقّف الـbuild).
const navStub: NavigationState = {
  tab: 'dashboard',
  activeModal: null,
  showExitConfirm: false,
  confirmExit: vi.fn(),
  cancelExit: vi.fn(),
  navigateTo: vi.fn(),
  openModal: vi.fn(),
  closeModal: vi.fn(),
  closeAllModals: vi.fn(),
  isOpen: vi.fn(() => false),
};

describe('LegalDocumentsPage — [قرار جيمي 26 أغسطس 2026] SourceModeSelector واجبة الظهور دايمًا', () => {
  it('حتى لو جاي من قضية مفتوحة (hasCaseContext=true)، اختيار قالب لازم يعدّي على SourceModeSelector أول، مش يقفز للفورم مباشرة', () => {
    function Wrapper() {
      const [initialCaseId, setInitialCaseId] = React.useState<string | null>('case-123');
      return (
        <LegalDocumentsPage
          initialCaseId={initialCaseId}
          onInitialCaseConsumed={() => setInitialCaseId(null)}
          nav={navStub}
        />
      );
    }

    render(<Wrapper />);

    fireEvent.click(screen.getByTestId('mock-select-template'));

    // لازم يظهر اختيار المصدر، ومفيش فورم لسه
    expect(screen.getByTestId('mock-source-mode-selector')).toBeTruthy();
    expect(screen.queryByTestId('mock-dynamic-fields-form')).toBeNull();
  });

  it('لما hasCaseContext=true، القضية المعروفة لازم تتمرر لـSourceModeSelector كـpresetCaseId', () => {
    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-template'));

    expect(screen.getByTestId('mock-source-mode-selector').getAttribute('data-preset-case-id')).toBe('case-123');
  });

  it('لما hasCaseContext=false، مفيش presetCaseId يتمرر لـSourceModeSelector', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-category'));
    fireEvent.click(screen.getByTestId('mock-select-template'));

    expect(screen.getByTestId('mock-source-mode-selector').getAttribute('data-preset-case-id')).toBe('');
  });

  it('اختيار أي مصدر (من القضية أو يدوي) لازم يودّي لخطوة "البيانات" (فورم)', () => {
    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-template'));
    fireEvent.click(screen.getByTestId('mock-select-source-manual'));

    expect(screen.getByTestId('mock-dynamic-fields-form')).toBeTruthy();
    expect(screen.queryByTestId('mock-source-mode-selector')).toBeNull();
  });

  it('زرار "+ مستند جديد" القديم اتشال بالكامل — مايظهرش في أي مسار (سجل القرارات بند 2)', () => {
    function Wrapper() {
      const [initialCaseId, setInitialCaseId] = React.useState<string | null>('case-123');
      return (
        <LegalDocumentsPage
          initialCaseId={initialCaseId}
          onInitialCaseConsumed={() => setInitialCaseId(null)}
          nav={navStub}
        />
      );
    }

    render(<Wrapper />);

    expect(screen.queryByTestId('doc-gen-new-document-btn')).toBeNull();
  });
});

describe('LegalDocumentsPage — [أولوية 3] خطوة "القسم" الجديدة (CategoryPicker)', () => {
  it('لما مفيش initialCaseId، الصفحة لازم تبدأ من CategoryPicker مش TemplatePicker مباشرة', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    expect(screen.getByTestId('mock-category-picker')).toBeTruthy();
    expect(screen.queryByTestId('mock-select-template')).toBeNull();
  });

  it('لما فيه initialCaseId (hasCaseContext=true)، لازم يتخطى خطوة "القسم" بالكامل ويدخل على TemplatePicker مباشرة', () => {
    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);

    expect(screen.queryByTestId('mock-category-picker')).toBeNull();
    expect(screen.getByTestId('mock-select-template')).toBeTruthy();
  });

  it('نتيجة بحث موحّد من CategoryPicker لازم تقفز لـSourceModeSelector مباشرة (زي أي اختيار قالب تاني)، من غير المرور بخطوة "المستند"', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-template-from-search'));

    expect(screen.getByTestId('mock-source-mode-selector')).toBeTruthy();
    expect(screen.queryByTestId('mock-select-template')).toBeNull();
  });

  it('كارت "حافظة مستندات" لازم ينقّل لتاب "المستندات" (nav.navigateTo) — مش توليد مستند (القسم 8.2)', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-open-archive'));

    expect(navStub.navigateTo).toHaveBeenCalledWith('documents');
  });

  it('زرار "رجوع" من خطوة "المستند" لازم يرجّع لـCategoryPicker', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-category'));
    expect(screen.getByTestId('mock-select-template')).toBeTruthy();

    fireEvent.click(screen.getByTestId('doc-gen-back-to-categories-btn'));

    expect(screen.getByTestId('mock-category-picker')).toBeTruthy();
    expect(screen.queryByTestId('mock-select-template')).toBeNull();
  });
});

describe('LegalDocumentsPage — سجل النشاط + تيليجرام عند توليد مستند (مراجعة "إيه الناقص في التقرير"، 26 أغسطس 2026)', () => {
  it('نجاح التوليد لازم يستدعي logActivity بـentity_type: document وentity_id/details صح', async () => {
    mockGenerate.mockResolvedValueOnce({ id: 'doc-1', case_id: null });

    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);
    fireEvent.click(screen.getByTestId('mock-select-template'));
    fireEvent.click(screen.getByTestId('mock-select-source-case')); // ⚡ SourceModeSelector واجبة دلوقتي حتى مع hasCaseContext=true
    fireEvent.click(screen.getByTestId('mock-submit-generate'));

    await screen.findByTestId('mock-document-preview-editor');

    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const [, action, opts] = mockLogActivity.mock.calls[0];
    expect(action).toBe('توليد مستند قانوني');
    expect(opts).toMatchObject({ entity_type: 'document', entity_id: 'doc-1' });
    expect(opts.details).toContain('قالب تجريبي');
  });

  it('فشل التوليد (generate بيرجّع null) — مفيش logActivity ولا انتقال لخطوة المعاينة', async () => {
    mockGenerate.mockResolvedValueOnce(null);

    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);
    fireEvent.click(screen.getByTestId('mock-select-template'));
    fireEvent.click(screen.getByTestId('mock-select-source-case'));
    fireEvent.click(screen.getByTestId('mock-submit-generate'));

    await Promise.resolve();
    expect(mockLogActivity).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mock-document-preview-editor')).toBeNull();
  });

  it('sendTelegram اختياري — نجاح التوليد من غيره مايكسرش الصفحة أبدًا', async () => {
    mockGenerate.mockResolvedValueOnce({ id: 'doc-2', case_id: 'case-123' });

    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} />);
    fireEvent.click(screen.getByTestId('mock-select-template'));
    fireEvent.click(screen.getByTestId('mock-select-source-case'));
    fireEvent.click(screen.getByTestId('mock-submit-generate'));

    expect(await screen.findByTestId('mock-document-preview-editor')).toBeTruthy();
  });

  it('لما sendTelegram متمرر، نجاح التوليد لازم يستدعيه برسالة فيها اسم القالب والتصنيف', async () => {
    mockGenerate.mockResolvedValueOnce({ id: 'doc-3', case_id: 'case-123' });
    const sendTelegram = vi.fn();

    render(<LegalDocumentsPage initialCaseId="case-123" nav={navStub} sendTelegram={sendTelegram} />);
    fireEvent.click(screen.getByTestId('mock-select-template'));
    fireEvent.click(screen.getByTestId('mock-select-source-case'));
    fireEvent.click(screen.getByTestId('mock-submit-generate'));

    await screen.findByTestId('mock-document-preview-editor');

    expect(sendTelegram).toHaveBeenCalledTimes(1);
    const msg = sendTelegram.mock.calls[0][0] as string;
    expect(msg).toContain('قالب تجريبي');
    expect(msg).toContain('عرائض');
  });
});

describe('LegalDocumentsPage — [أولوية 4] الترتيب حسب نوع القضية', () => {
  it('hasCaseContext=true مع initialCaseType متطابق مع قاعدة معروفة → categoryPriority بيتوصّل لـTemplatePicker', () => {
    render(<LegalDocumentsPage initialCaseId="case-123" initialCaseType="نفقة زوجية" nav={navStub} />);

    const el = screen.getByTestId('mock-select-template');
    expect(el.getAttribute('data-category-priority')).not.toBe('');
  });

  it('hasCaseContext=true من غير initialCaseType (null) → categoryPriority فاضية، الترتيب الافتراضي زي ما هو', () => {
    render(<LegalDocumentsPage initialCaseId="case-123" initialCaseType={null} nav={navStub} />);

    const el = screen.getByTestId('mock-select-template');
    expect(el.getAttribute('data-category-priority')).toBe('');
  });

  it('hasCaseContext=false (من الصفحة نفسها) → categoryPriority مايتمررش أبدًا حتى لو initialCaseType موجودة بالغلط', () => {
    render(<LegalDocumentsPage initialCaseId={null} initialCaseType="نفقة زوجية" nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-category'));
    const el = screen.getByTestId('mock-select-template');
    expect(el.getAttribute('data-category-priority')).toBe('');
  });
});
