// ══════════════════════════════════════════════════════════════════
// LegalDocumentsPage.test.tsx — اختبار ريجريشن للباج:
//   hasCaseContext كان بيتحسب من initialCaseId (الـprop الحي) بدل ما
//   يتجمّد زي caseId، فبمجرد ما onInitialCaseConsumed بيرجّع initialCaseId
//   لـ null في الـparent (بيحصل فورًا بعد أول render)، hasCaseContext كان
//   بيرجع false ويخلي اختيار قالب يعدّي على SourceModeSelector بدل ما
//   يقفز مباشرة لـ DynamicFieldsForm (القسم 9.5).
//
// الاختبار ده بيحاكي بالظبط سلوك الـparent الحقيقي: initialCaseId بيترجع
// null بعد أول render (زي ما App.tsx/onInitialCaseConsumed بيعملوا)،
// وبعدين بيتحقق إن اختيار قالب لسه بيقفز لـ 'fields' مباشرة، مش
// 'sourceMode'.
// ══════════════════════════════════════════════════════════════════

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LegalDocumentsPage from './LegalDocumentsPage';
import type { DocumentTemplate } from '../features/documentGeneration/types';

// ⚠️ vitest.config.ts فيه globals: false، يعني @testing-library/react مش
// بيلاقي `afterEach` كـ global عشان يسجّل الـauto-cleanup بتاعه (زي ما
// LoginScreen.test.tsx موثّق). من غير ده، كل تست بيرندر فوق DOM التست
// اللي قبله في document.body بدل ما يتنضف، فالـqueries بتلاقي عناصر
// باقية من تستات سابقة. لازم cleanup() يدوي بعد كل تست.
afterEach(() => { cleanup(); });

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
} as DocumentTemplate;

// نموك للأطفال عشان نختبر آلة الحالات في LegalDocumentsPage بمعزل عن
// تفاصيلهم الداخلية (فلترة، شبكة قوالب، إلخ).
vi.mock('../features/documentGeneration/components/TemplatePicker/TemplatePicker', () => ({
  default: ({ onSelectTemplate }: { onSelectTemplate: (t: DocumentTemplate) => void }) => (
    <button data-testid="mock-select-template" onClick={() => onSelectTemplate(fakeTemplate)}>
      اختر القالب
    </button>
  ),
}));

vi.mock('../features/documentGeneration/components/SourceModeSelector', () => ({
  default: () => <div data-testid="mock-source-mode-selector">SourceModeSelector</div>,
}));

vi.mock('../features/documentGeneration/components/DynamicFieldsForm', () => ({
  default: () => <div data-testid="mock-dynamic-fields-form">DynamicFieldsForm</div>,
}));

vi.mock('../features/documentGeneration/components/DocumentPreviewEditor', () => ({
  default: () => <div data-testid="mock-document-preview-editor">DocumentPreviewEditor</div>,
}));

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
    generate: vi.fn(),
  }),
}));

const navStub = { openModal: vi.fn() } as any;

describe('LegalDocumentsPage — القسم 9.5: تخطي SourceModeSelector لما يكون جاي من قضية', () => {
  it('لازم يقفز لـ DynamicFieldsForm مباشرة بعد اختيار القالب، حتى بعد ما initialCaseId يترجع null من الـparent (زي onInitialCaseConsumed الحقيقي)', () => {
    // بنحاكي الـparent الحقيقي (App.tsx/LegalDocumentsPage wrapper):
    // initialCaseId بيترجع null فورًا بعد أول render لما onInitialCaseConsumed
    // ينادى — ده لازم ميأثرش على تصرف الصفحة بعد كده.
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

    // اختيار قالب من الشبكة
    fireEvent.click(screen.getByTestId('mock-select-template'));

    // المفروض يقفز مباشرة للفورم، وميظهرش SourceModeSelector أبدًا
    expect(screen.getByTestId('mock-dynamic-fields-form')).toBeTruthy();
    expect(screen.queryByTestId('mock-source-mode-selector')).toBeNull();
  });

  it('لما مفيش initialCaseId من الأساس، اختيار قالب لازم يعدّي على SourceModeSelector عادي', () => {
    render(<LegalDocumentsPage initialCaseId={null} nav={navStub} />);

    fireEvent.click(screen.getByTestId('mock-select-template'));

    expect(screen.getByTestId('mock-source-mode-selector')).toBeTruthy();
    expect(screen.queryByTestId('mock-dynamic-fields-form')).toBeNull();
  });

  it('زرار "+ مستند جديد" لازم يفضل مختفي لما الصفحة جاية من قضية (hasCaseContext=true) حتى بعد استهلاك initialCaseId', () => {
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
