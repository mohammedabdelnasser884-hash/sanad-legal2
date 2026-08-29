import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ClientRow, CaseFeeRow, PaymentsByFeeId } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';
import { formatPartySideLine } from '../../shared/parties/partyDisplay';

// ⚠️ نفس فيكس EditUserModal.test.tsx: constants.ts (بتستورده FeeCard.tsx
// لأيقونة I) بيستورد db من supabaseClient.ts على مستوى الموديول، وده
// بيكراش في CI من غير VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY. FeeCard.tsx
// نفسها مبتنادي أي method على db مباشرة، فـstub فاضي كافي.
vi.mock('../../supabaseClient', () => ({
  db: {
    from: () => ({
      select: () => ({ data: null, error: null }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
      insert: () => ({ data: null, error: null }),
    }),
  },
}));

import FeeCard from './FeeCard';

// ⚠️ نفس ملاحظة EditUserModal.test.tsx: useModalPresentation → useResponsiveLayout
// بيعتمد على window.matchMedia (مش متاحة في jsdom افتراضيًا)، بترجع 'mobile'
// (fallback طبيعي) من غير أي mock مطلوب.

afterEach(() => { cleanup(); });

const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد' } as ClientRow];

function baseCase(overrides: Partial<MappedCase> = {}): MappedCase {
  return {
    id: 'case-1', number: '1', title: 'قضية عمالية', court: '', type: 'عمالي',
    court_level: null, circuit_number: null, status: 'مفتوحة', date: '', client_id: 'client-1',
    plaintiff: null, plaintiff_role: null, defendant: null, defendant_role: null, year: 2026, updated_at: null, court_floor: null,
    court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null, secretary_mobile: null,
    plaintiff_national_id: null, plaintiff_power_of_attorney: null, defendant_national_id: null, plaintiff_address: null,
    plaintiff_legal_title: null, defendant_legal_title: null,
    parties: [{ side: 'plaintiff', name: 'أحمد محمد', capacity: 'مدعي', client_id: 'client-1' }],
    ...overrides,
  } as MappedCase;
}

function makeFee(overrides: Partial<CaseFeeRow> = {}): CaseFeeRow {
  return {
    id: 'fee-1', case_id: 'case-1', client_id: 'client-1', client_name: null,
    total_fees: 1000, paid_fees: 500, status: 'deferred', notes: null,
    receiver: null, last_payment_date: null, created_at: null, updated_at: null,
    deleted_at: null, tenant_id: 'tenant-1', case_title: null, payment_note: null,
    ...overrides,
  } as CaseFeeRow;
}

// هارنس صغير بيمسك state حقيقي لـ payClientName/payClientNameText — عشان
// نراقب فعليًا هل الـeffect جوه FeeCard.tsx بيحدّثهم زي ما هو متوقع، مش
// مجرد بنتأكد إن setter اتنادى (زي ما كان ممكن يحصل لو استخدمنا vi.fn هنا).
function Harness({ cases, fee = makeFee(), autoOpenPayment = true }: { cases: MappedCase[]; fee?: CaseFeeRow; autoOpenPayment?: boolean }) {
  const [payClientName, setPayClientName] = useState('');
  const [payClientNameText, setPayClientNameText] = useState('');
  return React.createElement(FeeCard, {
    fee, cases, clients, currency: 'ج.م',
    fmt: (n: number | string | null | undefined) => String(n ?? ''),
    fmtDate: (d: string | null | undefined) => d || '',
    detailsFor: null, setDetailsFor: vi.fn(),
    expandedPayments: {}, setExpandedPayments: vi.fn(),
    invoiceLoadingFor: null, setInvoiceLoadingFor: vi.fn(),
    getOrCreateInvoice: vi.fn(),
    setInvoiceModal: vi.fn(),
    toast: vi.fn(),
    printAllPayments: vi.fn(),
    setConfirmDeletePay: vi.fn(),
    addPaymentFor: autoOpenPayment ? fee.id : null,
    setAddPaymentFor: vi.fn(),
    payingFeeId: null,
    payClientName, setPayClientName,
    payClientNameText, setPayClientNameText,
    payAmount: '', setPayAmount: vi.fn(),
    payDate: '', setPayDate: vi.fn(),
    payReceiver: '', setPayReceiver: vi.fn(),
    payNote: '', setPayNote: vi.fn(),
    handleAddPayment: vi.fn(),
    setEditId: vi.fn(),
    setForm: vi.fn(),
    setShowForm: vi.fn(),
    setConfirmDeleteFee: vi.fn(),
    payments: {} as PaymentsByFeeId,
  });
}

describe('FeeCard — قفل حقل الموكل في فورم تسجيل دفعة (المرحلة 5، تست مكوّن جديد)', () => {
  it('قضية بموكل حقيقي واحد → الحقل المقفول بيتملى تلقائيًا باسمه، وزرار "✅ تسجيل" مش معطّل', () => {
    render(React.createElement(Harness, { cases: [baseCase()] }));

    const locked = screen.getByTestId('pay-client-locked');
    expect(locked.textContent).toBe('أحمد محمد');
    const confirmBtn = screen.getByTestId('confirm-add-payment') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it('قضية من غير موكل مرتبط → الحقل بيعرض جملة إرشادية بدل الاسم، وزرار "✅ تسجيل" معطّل من الأساس', () => {
    const noClientCase = baseCase({
      id: 'case-no-client', client_id: null,
      parties: [{ side: 'plaintiff', name: 'موكل بدون ربط', capacity: 'مدعي', client_id: null }],
    });
    render(React.createElement(Harness, {
      cases: [noClientCase],
      fee: makeFee({ case_id: 'case-no-client' }),
    }));

    const locked = screen.getByTestId('pay-client-locked');
    expect(locked.textContent).toContain('⚠️ لا يوجد موكل مرتبط بهذه القضية');
    const confirmBtn = screen.getByTestId('confirm-add-payment') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it('قضية بأكتر من شخص على نفس جهة الموكل → الحقل بيعرض المسمى القانوني الجامع (مش اسم فردي)، وزرار "✅ تسجيل" شغال', () => {
    const multiCase = baseCase({
      id: 'case-multi', client_id: 'client-2',
      plaintiff_legal_title: 'الورثة الشرعيون',
      parties: [
        { side: 'plaintiff', name: 'وريث أول', capacity: 'مدعي', client_id: 'client-2' },
        { side: 'plaintiff', name: 'وريث تاني', capacity: 'مدعي', client_id: null },
      ],
    });
    const expectedJoint = formatPartySideLine(
      [{ name: 'وريث أول', capacity: 'مدعي' }, { name: 'وريث تاني', capacity: 'مدعي' }],
      'الورثة الشرعيون',
    );
    render(React.createElement(Harness, {
      cases: [multiCase],
      fee: makeFee({ case_id: 'case-multi' }),
    }));

    const locked = screen.getByTestId('pay-client-locked');
    expect(locked.textContent).toBe(expectedJoint);
    const confirmBtn = screen.getByTestId('confirm-add-payment') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
  });

  it('مفيش أي عنصر إدخال/اختيار تاني لاسم الموكل في فورم الدفعة — الحقل عرض مقفول بس، مش دروب-داون قابل للتعديل', () => {
    render(React.createElement(Harness, { cases: [baseCase()] }));

    // الحقل المقفول موجود، لكن مفيش أي select/input/combobox بديل يقدر
    // المستخدم يكتب أو يختار منه اسم موكل مختلف عن المُشتق من القضية.
    expect(screen.getByTestId('pay-client-locked')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    // فيه inputs تانية في الفورم (مبلغ/تاريخ/مستلم/ملاحظات) — بس مفيش
    // أي واحد منهم بيمثل اسم الموكل (بيتفحص عن طريق عدم وجود placeholder
    // خاص باسم موكل، والقيمة النهائية بتيجي من الحقل المقفول بس).
    expect(screen.queryByPlaceholderText(/اسم الموكل/)).toBeNull();
  });

  it('تبديل القضية المربوطة (نفس addPaymentFor) → الاسم المعروض في الحقل المقفول بيتحدث تلقائيًا للقضية الجديدة', () => {
    const caseA = baseCase({ id: 'case-a', client_id: 'client-1' });
    const caseB = baseCase({
      id: 'case-b', client_id: null,
      parties: [{ side: 'plaintiff', name: 'موكل بدون ربط', capacity: 'مدعي', client_id: null }],
    });
    const fee = makeFee({ id: 'fee-switch', case_id: 'case-a' });

    const { rerender } = render(React.createElement(Harness, { cases: [caseA], fee }));
    expect(screen.getByTestId('pay-client-locked').textContent).toBe('أحمد محمد');

    // إعادة رندر بنفس الهارنس لكن بقضية تانية مربوطة بنفس سجل الأتعاب —
    // بما إن fee.case_id ما اتغيرش هنا احنا بنحاكي حالة linkedCase نفسها
    // اتغيرت بيانات (مثلاً فك ربط الموكل)، فبنبني fee جديد بـcase_id=case-b.
    rerender(React.createElement(Harness, { cases: [caseB], fee: makeFee({ id: 'fee-switch', case_id: 'case-b' }) }));
    expect(screen.getByTestId('pay-client-locked').textContent).toContain('⚠️ لا يوجد موكل مرتبط بهذه القضية');
  });
});
