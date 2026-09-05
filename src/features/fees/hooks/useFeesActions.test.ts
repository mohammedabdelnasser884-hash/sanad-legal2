import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ClientRow, ProfileRow, CaseFeeRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بالظبط سلاسل الاستدعاءات الموجودة
// فعليًا في useFeesActions.ts (اتأكدت منها بقراءة الكود، مفيش تخمين):
//   - db.from('case_fees').select('id',{count,head}).eq('status',x).is('deleted_at',null)   [fetchStatusCounts]
//   - db.from('case_fees').select('total_fees,paid_fees').is('deleted_at',null)              [fetchGrandSummary]
//   - db.from('case_fees').select('*',{count}).eq('status',s).is(...).order(...).range(...)  [fetchFees]
//   - db.from('fee_payments').select('*').in('fee_id',ids).order('payment_date',...)         [fetchFees payments]
//   - db.from('fee_payments').select('amount').eq('fee_id', id)                                [realPaid recompute — handleDeletePayment]
//   - db.from('case_fees').update({...}).eq('id', id)                                          [handleSave — فرع التعديل (editId) عن طريق safeUpdate]
//   - db.rpc('record_fee_payment', {...})                                                       [handleAddPayment — نداء ذرّي واحد]
//   - db.rpc('create_fee_with_advance', {...})                                                  [handleSave — فرع الإنشاء، نداء ذرّي واحد (المرحلة 5)]
// 🆕 (21 يوليو — المرحلة 6): حذف/تحديث حذف الدفعة (fee_payments)، والأرشفة/الاسترجاع/الحذف
// النهائي لسجل الأتعاب (case_fees) بقوا بينادوا window.__dbWrite بدل db.from
// مباشرة — نفس نمط useCaseDetailActions.test.ts (dbWriteMock() تحت):
//   - window.__dbWrite({type:'DELETE', table:'fee_payments', id})                                [handleDeletePayment]
//   - window.__dbWrite({type:'UPDATE', table:'case_fees', data:{paid_fees,status}, id})           [handleDeletePayment]
//   - window.__dbWrite({type:'DELETE', table:'case_fees', id})                                    [handlePermanentDeleteFee]
//   - window.__dbWrite({type:'UPDATE', table:'case_fees', data:{deleted_at}, id})                 [handleDelete/handleRestoreFee]
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown; count?: number | null };
const DEFAULT_RESULT: Result = { data: [], error: null, count: 0 };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const deleteSpy = vi.fn();
  const rpcSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string) => configured[key] ?? DEFAULT_RESULT;

  interface SelectChain {
    eq: (col: string) => SelectChain;
    is: () => SelectChain;
    order: () => SelectChain;
    range: () => SelectChain;
    or: () => SelectChain;
    in: () => SelectChain;
    then: (resolve: (r: Result) => void) => void;
  }

  function buildSelectChain(table: string): SelectChain {
    let key = `${table}:default`;
    const c: SelectChain = {
      eq: vi.fn((col: string) => {
        if (table === 'fee_payments' && col === 'fee_id') key = `${table}:eqFeeId`;
        return c;
      }),
      is: vi.fn(() => c),
      order: vi.fn(() => c),
      range: vi.fn(() => c),
      or: vi.fn(() => c),
      in: vi.fn(() => { key = `${table}:in`; return c; }),
      then: (resolve: (r: Result) => void) => resolve(get(key)),
    };
    return c;
  }

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => buildSelectChain(table)),
    insert: vi.fn((payload: unknown) => {
      insertSpy(table, payload);
      const c = {
        select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(get(`${table}:insert`))) })),
        then: (resolve: (r: Result) => void) => resolve(get(`${table}:insert`)),
      };
      return c;
    }),
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn(() => ({ then: (resolve: (r: Result) => void) => resolve(get(`${table}:update`)) })) };
    }),
    delete: vi.fn(() => {
      deleteSpy(table);
      return { eq: vi.fn(() => ({ then: (resolve: (r: Result) => void) => resolve(get(`${table}:delete`)) })) };
    }),
  }));

  // ⚡ FIX: تسجيل دفعة (handleAddPayment) بيعدي دلوقتي عن طريق db.rpc('record_fee_payment', …)
  // — نداء ذرّي واحد بدل insert/select/update منفصلين (راجع migration الدفعات). الموك
  // القديم مكانش فيه rpc() خالص فكانت بترمي "db.rpc is not a function" — استثناء
  // غير متوقع/غير ممسوك كان بيسرّب unhandled rejection يضرب تستات تانية في نفس
  // الملف. افتراضيًا بترجع نجاح ({error:null})؛ تقدر تتحكم فيها بـ
  // setResult('rpc:record_fee_payment', {...}).
  // 🆕 (٣-هـ، ٥ سبتمبر ٢٠٢٦): useFeesActions.ts بقى بينادي .abortSignal(...)
  // على db.rpc(...) (نفس نمط createFetchGuard المستخدم فى كل نداءات القراءة
  // فى الملف — راجع systemHealth.ts::recordWriteFailure) — الموك القديم كان
  // بيرجّع Promise مباشر (مفيهوش .abortSignal خالص)، فكان هيرمي
  // "rpc(...).abortSignal is not a function". دلوقتي بيرجّع chain بسيط
  // (thenable + abortSignal ترجّع نفس الـthenable) زي buildSelectChain فوق.
  const rpc = vi.fn((name: string, params: unknown) => {
    rpcSpy(name, params);
    const result = get(`rpc:${name}`) ?? { data: null, error: null };
    const chain = {
      abortSignal: vi.fn(() => chain),
      then: (resolve: (r: Result) => void) => resolve(result),
    };
    return chain;
  });

  return { from, rpc, setResult, insertSpy, updateSpy, deleteSpy, rpcSpy };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    rpc: (...a: Parameters<typeof mockDb.rpc>) => mockDb.rpc(...a),
  },
}));

// 🆕 (21 يوليو — المرحلة 6): mock لـ window.__dbWrite — نفس نمط useCaseDetailActions.test.ts بالظبط.
function dbWriteMock(): ReturnType<typeof vi.fn> {
  return window.__dbWrite as unknown as ReturnType<typeof vi.fn>;
}

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const safeUpdate = vi.fn();
const logActivity = vi.fn();
// ⚡ FIX (buildFieldDiff مفقودة من الـmock — 19 أغسطس 2026): راجع نفس الفيكس في
// useCaseActions.test.ts — buildFieldDiff الحقيقية عن طريق importOriginal.
vi.mock('../../../shared/lib/dataAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/dataAccess')>();
  return {
    safeUpdate: (...a: unknown[]) => safeUpdate(...a),
    logActivity: (...a: unknown[]) => logActivity(...a),
    buildFieldDiff: actual.buildFieldDiff,
    buildAddSnapshot: actual.buildAddSnapshot,
    buildDeleteSnapshot: actual.buildDeleteSnapshot,
  };
});

import { useFeesActions, resolveCaseFeeClient } from './useFeesActions';
import { formatPartySideLine } from '../../../shared/parties/partyDisplay';

const cases: MappedCase[] = [{
  id: 'case-1', number: '1', title: 'قضية عمالية', court: '', type: 'عمالي',
  court_level: null, circuit_number: null, status: 'مفتوحة', date: '', client_id: 'client-1',
  plaintiff: null, plaintiff_role: null, defendant: null, defendant_role: null, year: 2026, updated_at: null, court_floor: null,
  court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null, secretary_mobile: null,
  plaintiff_national_id: null, plaintiff_power_of_attorney: null, defendant_national_id: null, plaintiff_address: null,
  plaintiff_legal_title: null, defendant_legal_title: null,
}, {
  // 🆕 (المرحلة 5 — 29 أغسطس 2026): قضية بلا موكل مربوط خالص — لازمة عشان
  // نختبر سيناريو "قضية بلا موكل → منع حفظ" الحقيقي تحت القاعدة الجديدة
  // (الموكل بقى مُشتق من resolveCaseFeeClient على القضية، مش من form.client_id
  // اليدوي زي ما كان قبل كده).
  id: 'case-no-client', number: '2', title: 'قضية بلا موكل', court: '', type: 'مدني',
  court_level: null, circuit_number: null, status: 'مفتوحة', date: '', client_id: null,
  plaintiff: null, plaintiff_role: null, defendant: null, defendant_role: null, year: 2026, updated_at: null, court_floor: null,
  court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null, secretary_mobile: null,
  plaintiff_national_id: null, plaintiff_power_of_attorney: null, defendant_national_id: null, plaintiff_address: null,
  plaintiff_legal_title: null, defendant_legal_title: null,
}];
const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد' } as ClientRow];
const profile = { id: 'lawyer-1' } as ProfileRow;

function makeFee(overrides: Partial<CaseFeeRow> = {}): CaseFeeRow {
  return {
    id: 'fee-1', case_id: 'case-1', client_id: 'client-1', client_name: null,
    total_fees: 1000, paid_fees: 500, status: 'deferred', notes: null,
    receiver: null, last_payment_date: null, created_at: null, updated_at: '2026-07-16T10:00:00.000Z',
    deleted_at: null, tenant_id: 'tenant-1', case_title: null, payment_note: null,
    ...overrides,
  } as CaseFeeRow;
}

async function renderFeesHook() {
  const view = renderHook(() => useFeesActions(cases, clients, 'EG', profile));
  // نستنى الـ effects بتاعة الـ mount (fetchGrandSummary/fetchStatusCounts/fetchFees) تخلص
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

// ══════════════════════════════════════════════════════════════════
// resolveCaseFeeClient — 3 حالات (المرحلة 2 من خطة تنفيذ "قفل حقل
// الموكل" — 29 أغسطس 2026). دالة صرفة (pure) — مفيش داعي لأي mock db
// أو renderFeesHook، بنستدعيها مباشرة بمدخلات مبنية يدويًا.
// ══════════════════════════════════════════════════════════════════
describe('resolveCaseFeeClient', () => {
  it('قضية بموكل حقيقي واحد مرتبط (client_id مطابق) → clientId + displayLabel باسم الموكل', () => {
    const lc: MappedCase = {
      ...cases[0],
      id: 'case-single', client_id: 'client-1',
      parties: [{ side: 'plaintiff', name: 'أحمد محمد', capacity: 'مدعي', client_id: 'client-1' }],
    };
    const result = resolveCaseFeeClient(lc, clients);
    expect(result).toEqual({ clientId: 'client-1', manualText: '', displayLabel: 'أحمد محمد' });
  });

  it('قضية فيها أكتر من شخص مسمّى على نفس جهة الموكل → manualText بالمسمى الجامع، clientId فاضي', () => {
    const lc: MappedCase = {
      ...cases[0],
      id: 'case-multi', client_id: 'client-2',
      plaintiff_legal_title: 'الورثة الشرعيون',
      parties: [
        { side: 'plaintiff', name: 'وريث أول', capacity: 'مدعي', client_id: 'client-2' },
        { side: 'plaintiff', name: 'وريث تاني', capacity: 'مدعي', client_id: null },
      ],
    };
    const expectedJoint = formatPartySideLine(
      [{ name: 'وريث أول', capacity: 'مدعي' }, { name: 'وريث تاني', capacity: 'مدعي' }],
      'الورثة الشرعيون'
    );
    const result = resolveCaseFeeClient(lc, clients);
    expect(result.clientId).toBe('');
    expect(result.manualText).toBe(expectedJoint);
    expect(result.displayLabel).toBe(expectedJoint);
  });

  it('قضية من غير أي موكل مرتبط (client_id فاضي) → EMPTY_RESOLVED_CLIENT', () => {
    const lc: MappedCase = {
      ...cases[0],
      id: 'case-no-client', client_id: null,
      parties: [{ side: 'plaintiff', name: 'موكل بدون ربط', capacity: 'مدعي', client_id: null }],
    };
    const result = resolveCaseFeeClient(lc, clients);
    expect(result).toEqual({ clientId: '', manualText: '', displayLabel: '' });
  });

  it('lc غير معرّف (undefined) → EMPTY_RESOLVED_CLIENT من غير أي throw', () => {
    const result = resolveCaseFeeClient(undefined, clients);
    expect(result).toEqual({ clientId: '', manualText: '', displayLabel: '' });
  });
});

describe('useFeesActions', () => {
  beforeEach(() => {
    mockDb = makeMockDb();
    vi.clearAllMocks();
    window.__dbWrite = vi.fn() as unknown as typeof window.__dbWrite;
  });

  describe('handleSave — فاليديشن', () => {
    it('من غير اختيار قضية → توست "حقل مطلوب"، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: '', total: '1000' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "القضية" مطلوب — يرجى اختيار القضية', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('من غير إجمالي أتعاب → توست "حقل مطلوب"، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "إجمالي الأتعاب" مطلوب', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('إجمالي أتعاب سالب → توست خطأ، مفيش أي insert', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '-500' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ خطأ: إجمالي الأتعاب لا يمكن أن يكون سالباً', true);
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    // 🆕 (طلب المستخدم — 29 أغسطس 2026): كل حقول فورم الأتعاب بقت إجبارية
    // عدا "ملاحظات". التستات دي بتغطي الحقول التلاتة الجديدة (موكل/مستلم)
    // بالإضافة لحقلي (مبلغ مدفوع/تاريخ دفعة) اللي إجباريين بس في مسار
    // الإنشاء الجديد (!editId).
    it('قضية بلا موكل مربوط → توست "القضية مش مربوطة بموكل"، مفيش أي rpc', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-no-client', receiver: 'المحاسب', total: '1000' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ القضية دي مش مربوطة بموكل — يرجى تحديد الموكل من بيانات القضية أولاً', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('من غير المستلم من المكتب → توست "حقل مطلوب"، مفيش أي rpc', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: '', total: '1000' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "المستلم من المكتب" مطلوب', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('مسار الإنشاء الجديد، من غير مبلغ مدفوع → توست "حقل مطلوب"، مفيش أي rpc', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "المبلغ المدفوع" مطلوب — أدخلي الدفعة الأولى (مقدم الأتعاب)', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('مسار الإنشاء الجديد، من غير تاريخ دفعة → توست "حقل مطلوب"، مفيش أي rpc', async () => {
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "تاريخ الدفعة" مطلوب', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleSave — إنشاء سجل أتعاب جديد', () => {
    // ⚡ FIX (المرحلة 5): إنشاء أتعاب جديدة (بدفعة مقدّمة أو من غيرها) بيعدي
    // دلوقتي عن طريق db.rpc('create_fee_with_advance', …) — نداء ذرّي واحد
    // بدل insert/insert/select/update منفصلين (راجع migration
    // 01-create-fee-with-advance-rpc.sql). حساب paid_fees/status بقى مسؤولية
    // الـRPC نفسها جوه القاعدة، مش الفرونت إند — فالتستات هنا بتتأكد من شكل
    // الـpayload المبعوت للـRPC، مش من insert/update منفصلين بعد كده.

    // 🔀 (طلب المستخدم — 29 أغسطس 2026): "المبلغ المدفوع" و"تاريخ الدفعة"
    // بقوا إجباريين في مسار الإنشاء الجديد (راجع describe الفاليديشن فوق
    // لتستات رفض الحفظ من غيرهم) — يعني مبقاش فيه سيناريو "إنشاء من غير
    // دفعة مقدّمة" ممكن يوصل لنداء الـRPC خالص؛ التست بقى بيتأكد إن
    // الدفعة المُدخلة بتتبعت لـp_paid_amount زي ما هي بدل ما يفترض 0.

    it('بدفعة مقدّمة (paid) → RPC بـ p_paid_amount والتاريخ المدخلين', async () => {
      mockDb.setResult('rpc:create_fee_with_advance', { data: { id: 'new-fee-3' }, error: null });
      const { result } = await renderFeesHook();

      act(() => {
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-07-16' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('create_fee_with_advance', expect.objectContaining({
        p_case_id: 'case-1', p_total_fees: 1000, p_paid_amount: 300, p_payment_date: '2026-07-16',
      }));
      // مفيش أي insert/update يدوي على case_fees أو fee_payments من الفرونت إند
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
      expect(mockDb.updateSpy).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('✅ تم إضافة الأتعاب');
    });

    it('فشل الـRPC → توست خطأ، مفيش تصفير للفورم', async () => {
      mockDb.setResult('rpc:create_fee_with_advance', { data: null, error: { message: 'db error' } });
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-07-16' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حفظ الأتعاب الجديدة — تحقق من الاتصال وأعد المحاولة', true);
      // فشل الـRPC لازم يوقف الفلو فورًا — مفيش logActivity ولا توست نجاح
      expect(logActivity).not.toHaveBeenCalled();
      expect(toast).not.toHaveBeenCalledWith('✅ تم إضافة الأتعاب');
    });

    // 🆕 (خطة "تصنيف الرسائل ودورة حياة العمليات" — البند ٣-هـ، ٥ سبتمبر ٢٠٢٦):
    // نفس فكرة handleAddPayment فوق — timeout على create_fee_with_advance
    // لازم يعرض توست "ambiguous" مختلف، مش توست الفشل القطعي العادي.
    it('فشل بسبب timeout → توست تحذير "قد يكون تم فعلاً" (ambiguous)، مش توست فشل قطعي', async () => {
      mockDb.setResult('rpc:create_fee_with_advance', { data: null, error: { message: 'timeout' } });
      const { result } = await renderFeesHook();

      act(() => { result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-07-16' }); });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).toHaveBeenCalledWith('⚠️ تعذّر تأكيد نتيجة الحفظ — قد يكون تم فعلاً. أعد المحاولة (لن تتكرر).', true);
      expect(toast).not.toHaveBeenCalledWith('❌ فشل حفظ الأتعاب الجديدة — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleSave — تعديل سجل موجود', () => {
    it('يستخدم safeUpdate (القفل التفاؤلي) بدل UPDATE مباشر، وبيحسب status من (total الجديد, paid الحالي)', async () => {
      safeUpdate.mockResolvedValue({ success: true, conflict: false, error: null });
      const { result } = await renderFeesHook();

      const existingFee = makeFee({ id: 'fee-edit-1', total_fees: 1000, paid_fees: 1000 });
      act(() => { result.current.setFees([existingFee]); });
      act(() => {
        result.current.setEditId('fee-edit-1');
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '2000' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(safeUpdate).toHaveBeenCalledWith(
        expect.anything(), 'case_fees', 'fee-edit-1',
        expect.objectContaining({ total_fees: 2000, status: 'deferred' }), // 1000 مدفوع من 2000 → deferred
        '2026-07-16T10:00:00.000Z',
      );
      expect(mockDb.insertSpy).not.toHaveBeenCalled();
    });

    it('تعارض (conflict:true) → بيوقف من غير toast نجاح ومن غير استكمال باقي الخطوات، مع توست تعارض صريح', async () => {
      safeUpdate.mockResolvedValue({ success: false, conflict: true, error: null });
      const { result } = await renderFeesHook();

      const existingFee = makeFee({ id: 'fee-edit-2' });
      act(() => { result.current.setFees([existingFee]); });
      act(() => {
        result.current.setEditId('fee-edit-2');
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '2000' });
      });
      await act(async () => { await result.current.handleSave(); });

      expect(toast).not.toHaveBeenCalledWith('✅ تم تحديث الأتعاب');
      expect(logActivity).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('⚠️ سجل الأتعاب ده عدّله شخص آخر بعد ما فتحته — أعد المحاولة', true);
    });
  });

  // ⚡ FIX (21 يوليو 2026 — المرحلة 6): تسجيل دفعة بقى نداء RPC ذرّي واحد
  // (record_fee_payment) بدل 3 استعلامات منفصلة (insert → select → update)
  // — التستات دلوقتي بتتأكد من الـ params المبعوتة لـ db.rpc، مش من
  // insert/update منفصلين على fee_payments/case_fees (مبقتش موجودة في
  // الكود الحقيقي خالص). الـ recompute والـ status الجديدة بقوا جوه الـ
  // transaction على مستوى القاعدة — مش ملاحظين من هنا، فمفيش تستات عليهم.
  describe('handleAddPayment', () => {
    it('مبلغ صفر أو سالب → توست تحذير فقط، من غير أي نداء rpc', async () => {
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('0'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('أدخل مبلغاً صحيحاً', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    // 🆕 (طلب المستخدم — 29 أغسطس 2026): باقي حقول فورم "تسجيل دفعة"
    // (اسم الموكل/تاريخ الدفعة/المستلم من المكتب) بقوا إجباريين عدا
    // الملاحظات (payNote) — التستات دي بتتأكد من كل واحد على حدة، وبترتيب
    // الفحص الحقيقي في الكود (موكل → تاريخ → مستلم) قبل فحص الأوفلاين
    // وتحذير تجاوز المتبقي.
    it('من غير اختيار موكل → توست "حقل مطلوب"، مفيش أي نداء rpc', async () => {
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('200'); result.current.setPayDate('2026-07-20'); result.current.setPayReceiver('المحاسب'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "اسم الموكل" مطلوب', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('من غير تاريخ دفعة → توست "حقل مطلوب"، مفيش أي نداء rpc', async () => {
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('200'); result.current.setPayClientName('client-1'); result.current.setPayReceiver('المحاسب'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "تاريخ الدفعة" مطلوب', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('من غير المستلم من المكتب → توست "حقل مطلوب"، مفيش أي نداء rpc', async () => {
      const { result } = await renderFeesHook();
      act(() => { result.current.setPayAmount('200'); result.current.setPayClientName('client-1'); result.current.setPayDate('2026-07-20'); });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ حقل "المستلم من المكتب" مطلوب', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
    });

    it('أوفلاين (مفيش نت) → توست تحذير واضح يطلب إعادة المحاولة أونلاين، من غير أي نداء rpc', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { result } = await renderFeesHook();
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('⚠️ تسجيل الدفعة يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
      expect(mockDb.rpcSpy).not.toHaveBeenCalled();
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('مبلغ أكبر من المتبقي → توست تحذير لكن بيكمل التسجيل عادي (مش حظر)', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 }); // المتبقي 500
      act(() => {
        result.current.setPayAmount('900'); // أكبر من الـ 500 المتبقي
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(toast).toHaveBeenCalledWith(expect.stringContaining('يتجاوز المتبقي'), true);
      // برضو المفروض اتسجلت فعليًا (مفيش return مبكر في الكود الحقيقي)
      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', expect.objectContaining({ p_fee_id: fee.id, p_amount: 900 }));
    });

    it('اختيار موكل من القايمة → بيتسجل p_client_id/p_client_name بتاعه (مش بتاع الأتعاب الأصلية)', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ client_id: 'client-original', client_name: 'اسم قديم' });
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', expect.objectContaining({
        p_client_id: 'client-1', p_client_name: 'أحمد محمد',
      }));
    });

    it('إدخال اسم يدوي (__manual__) → p_client_id يترجع null، p_client_name = النص المكتوب', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee();
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('__manual__');
        result.current.setPayClientNameText('اسم مكتوب يدويًا');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', expect.objectContaining({
        p_client_id: null, p_client_name: 'اسم مكتوب يدويًا',
      }));
    });

    // 🔀 (طلب المستخدم — 29 أغسطس 2026): اختيار الموكل بقى إجباري (راجع
    // hasPayClient فوق)، يعني فرع الـfallback لبيانات الأتعاب الأصلية (لو
    // المستخدم سايب الحقل فاضي) بقى كود دفاعي مش قابل للوصول من الفورم —
    // التست القديم اللي كان بيعتمد عليه اتحول لتست فاليديشن (موجود فوق:
    // "من غير اختيار موكل → توست..."). لسه فيه سيناريو واحد شرعي بيوصل
    // لنفس فرع الكود: اختيار نفس موكل الأتعاب الأصلي بالظبط من القايمة.
    it('اختيار نفس موكل الأتعاب الأصلي من القايمة → بيتسجل بياناته زي ما هي', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ client_id: 'client-1', client_name: 'اسم قديم مختلف' });
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', expect.objectContaining({
        p_client_id: 'client-1', p_client_name: 'أحمد محمد',
      }));
    });

    it('نجاح → rpc بكل الحقول الصحيحة، توست نجاح، تسجيل نشاط، وتصفير حقول الفورم', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ id: 'fee-99', client_id: 'client-1', client_name: 'اسم الأتعاب' });
      act(() => {
        result.current.setPayAmount('300');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayNote('ملاحظة الدفعة');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', {
        p_fee_id: 'fee-99', p_amount: 300, p_payment_date: '2026-07-20', p_notes: 'ملاحظة الدفعة',
        p_received_by: 'المحاسب', p_client_id: 'client-1', p_client_name: 'أحمد محمد',
        p_idempotency_key: null,
      });
      expect(toast).toHaveBeenCalledWith('✅ تم تسجيل الدفعة');
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تسجيل دفعة', expect.objectContaining({
        entity_type: 'fee', entity_id: 'fee-99', client_name: 'أحمد محمد',
      }));
      expect(result.current.payAmount).toBe('');
      expect(result.current.payDate).toBe('');
      expect(result.current.payNote).toBe('');
      expect(result.current.payReceiver).toBe('');
    });

    // 🆕 (طلب المستخدم — 29 أغسطس 2026): لو المستخدم سايب خانة الملاحظات
    // فاضية، الـRPC نفسها (مش الفرونت إند) هي اللي بتحفظ "دفعة أتعاب"
    // تلقائيًا بدل NULL (راجع migration 01-fee-payment-note-labels.sql) —
    // الفرونت إند لسه بيبعت p_notes بالقيمة الفاضية/null زي ما هي، من غير
    // أي منطق تسمية هنا، فالتست بيتأكد إن payNote الفاضي بيتبعت null زي
    // ما كان بالظبط (مفيش تغيير في سلوك الهوك نفسه).
    it('ملاحظات فاضية → بتتبعت p_notes:null زي ما كانت (التسمية الافتراضية مسؤولية الـRPC)', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ id: 'fee-100', client_id: 'client-1', client_name: 'اسم الأتعاب' });
      act(() => {
        result.current.setPayAmount('300');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
        // payNote يفضل فاضي عمدًا
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      expect(mockDb.rpcSpy).toHaveBeenCalledWith('record_fee_payment', expect.objectContaining({ p_notes: null }));
    });

    it('فشل الـ rpc → توست خطأ، من غير logActivity', async () => {
      mockDb.setResult('rpc:record_fee_payment', { error: { message: 'rpc failed' } });
      const { result } = await renderFeesHook();
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ فشل تسجيل الدفعة، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
    });

    // 🆕 (خطة "تصنيف الرسائل ودورة حياة العمليات" — البند ٣-هـ، ٥ سبتمبر ٢٠٢٦):
    // فشل بـ{message:'timeout'} (نفس نمط guard.didTimeOut() الحقيقي) لازم
    // يعرض توست "تحذير/قد تكون تمت فعلاً" مختلف عن توست الفشل القطعي العادي
    // فوق — دي أول استفادة فعلية من idempotency key (٣-د) + lastOutcome
    // (٣-هـ) مع بعض.
    it('فشل بسبب timeout → توست تحذير "قد تكون سُجّلت فعلاً" (ambiguous)، مش توست فشل قطعي', async () => {
      mockDb.setResult('rpc:record_fee_payment', { error: { message: 'timeout' } });
      const { result } = await renderFeesHook();
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-07-20');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(makeFee()); });

      expect(toast).toHaveBeenCalledWith('⚠️ تعذّر تأكيد نتيجة تسجيل الدفعة — قد تكون سُجّلت فعلاً. أعد المحاولة (لن تتكرر).', true);
      expect(toast).not.toHaveBeenCalledWith('❌ فشل تسجيل الدفعة، يرجى المحاولة مرة أخرى', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleDeletePayment', () => {
    it('بيحذف الدفعة، يعيد حساب الرصيد من المتبقي فعليًا (مش بالطرح)، وبيحدّث status', async () => {
      // بعد الحذف، دفعة واحدة بس فاضلة بـ 200 (مش 500-300 بالطرح، القيمة بترجع من DB مباشرة)
      mockDb.setResult('fee_payments:eqFeeId', { data: [{ amount: 200 }], error: null });
      dbWriteMock().mockResolvedValue({ error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 });

      await act(async () => { await result.current.handleDeletePayment('pay-1', fee); });

      expect(dbWriteMock()).toHaveBeenCalledWith({ type: 'DELETE', table: 'fee_payments', id: 'pay-1' });
      expect(dbWriteMock()).toHaveBeenCalledWith({
        type: 'UPDATE', table: 'case_fees', data: { paid_fees: 200, status: 'deferred' }, id: fee.id,
      });
      expect(toast).toHaveBeenCalledWith('🗑 تم حذف الدفعة');
    });

    it('حذف آخر دفعة (يرجع الرصيد لصفر) → status ترجع open لو total كمان صفر، أو deferred لو لسه فيه total', async () => {
      mockDb.setResult('fee_payments:eqFeeId', { data: [], error: null });
      dbWriteMock().mockResolvedValue({ error: null });
      const { result } = await renderFeesHook();
      const fee = makeFee({ total_fees: 1000, paid_fees: 500 });

      await act(async () => { await result.current.handleDeletePayment('pay-1', fee); });

      expect(dbWriteMock()).toHaveBeenCalledWith({
        type: 'UPDATE', table: 'case_fees', data: { paid_fees: 0, status: 'deferred' }, id: fee.id,
      });
    });

    it('فشل الحذف → توست خطأ، من غير أي إعادة حساب أو تحديث', async () => {
      dbWriteMock().mockResolvedValue({ error: { message: 'delete failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleDeletePayment('pay-1', makeFee()); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الدفعة، يرجى المحاولة مرة أخرى', true);
      expect(dbWriteMock()).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'UPDATE', table: 'case_fees' }));
    });
  });

  describe('handleDelete — أرشفة (soft delete)', () => {
    it('بيحدّث deleted_at بس (مش حذف فعلي)، وبيسجّل النشاط ببيانات القضية/الموكل الصح', async () => {
      dbWriteMock().mockResolvedValue({ error: null });
      const { result } = await renderFeesHook();
      const targetFee = makeFee({ id: 'fee-archive-1', client_name: 'موكل الأرشفة' });
      act(() => { result.current.setFees([targetFee]); });

      await act(async () => { await result.current.handleDelete('fee-archive-1'); });

      expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
        type: 'UPDATE', table: 'case_fees', data: { deleted_at: expect.any(String) }, id: 'fee-archive-1',
      }));
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'أرشفة أتعاب', expect.objectContaining({
        entity_type: 'fee', entity_id: 'fee-archive-1',
        client_name: 'موكل الأرشفة', case_name: 'قضية عمالية', case_type: 'عمالي',
      }));
      expect(toast).toHaveBeenCalledWith('📦 تم نقل الأتعاب للأرشيف');
    });

    it('فشل الأرشفة → توست خطأ، من غير logActivity', async () => {
      dbWriteMock().mockResolvedValue({ error: { message: 'archive failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleDelete('fee-1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل أرشفة الأتعاب — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handlePermanentDeleteFee — حذف نهائي (باتش 1.3)', () => {
    it('بيحذف صف case_fees فعليًا (مش تحديث deleted_at)، وبيسجّل النشاط ببيانات القضية/الموكل الصح', async () => {
      dbWriteMock().mockResolvedValue({ error: null });
      const { result } = await renderFeesHook();
      const targetFee = makeFee({ id: 'fee-perm-1', client_name: 'موكل الحذف النهائي' });
      act(() => { result.current.setFees([targetFee]); });

      await act(async () => { await result.current.handlePermanentDeleteFee('fee-perm-1'); });

      expect(dbWriteMock()).toHaveBeenCalledWith({ type: 'DELETE', table: 'case_fees', id: 'fee-perm-1' });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف أتعاب نهائياً', expect.objectContaining({
        entity_type: 'fee', entity_id: 'fee-perm-1',
        client_name: 'موكل الحذف النهائي', case_name: 'قضية عمالية', case_type: 'عمالي',
      }));
      expect(toast).toHaveBeenCalledWith('🗑️ تم حذف الأتعاب نهائياً');
    });

    it('فشل الحذف النهائي → توست فشل، من غير logActivity', async () => {
      dbWriteMock().mockResolvedValue({ error: { message: 'delete failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handlePermanentDeleteFee('fee-1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل حذف الأتعاب نهائياً — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('handleRestoreFee — استرجاع من الأرشيف', () => {
    it('نجاح → update({deleted_at:null})، توست نجاح، تسجيل نشاط بالنوع الصحيح', async () => {
      dbWriteMock().mockResolvedValue({ error: null });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleRestoreFee('fee-1'); });

      expect(dbWriteMock()).toHaveBeenCalledWith({ type: 'UPDATE', table: 'case_fees', data: { deleted_at: null }, id: 'fee-1' });
      expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'استرجاع أتعاب من الأرشيف', expect.objectContaining({
        entity_type: 'fee', entity_id: 'fee-1',
      }));
      expect(toast).toHaveBeenCalledWith('✅ تم استرجاع الأتعاب');
    });

    it('فشل → توست خطأ، من غير logActivity', async () => {
      dbWriteMock().mockResolvedValue({ error: { message: 'restore failed' } });
      const { result } = await renderFeesHook();

      await act(async () => { await result.current.handleRestoreFee('fee-1'); });

      expect(toast).toHaveBeenCalledWith('❌ فشل استرجاع الأتعاب — تحقق من الاتصال وأعد المحاولة', true);
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 🆕 (خطة "تصنيف الرسائل ودورة حياة العمليات" — البند ٣-د، ٥ سبتمبر 2026):
  // مفتاح idempotency بيتولّد وقت "فتح النية" (مودال تسجيل دفعة / فورم
  // إضافة أتعاب جديدة)، بيتبعت زي ما هو مع أي محاولة تانية، ويتصفّر عند
  // النجاح أو الإغلاق. التستات هنا بتتأكد من دورة الحياة دي، مش من منطق
  // الـRPC نفسه (ده بالفعل مغطى فى database migrations، مفيش وصول لقاعدة
  // بيانات حقيقية من الـsandbox).
  // ══════════════════════════════════════════════════════════════════
  describe('Idempotency keys (٣-د)', () => {
    it('فتح مودال تسجيل دفعة (setAddPaymentFor) → مفتاح بيتولّد ويتبعت لـrecord_fee_payment', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ id: 'fee-idmp-1', client_id: 'client-1' });

      act(() => { result.current.setAddPaymentFor(fee.id); });
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-09-05');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      const call = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'record_fee_payment');
      expect(call?.[1].p_idempotency_key).toEqual(expect.any(String));
      expect(call?.[1].p_idempotency_key).not.toBeNull();
    });

    it('فشل النداء → نفس المفتاح بيتبعت تاني فى إعادة المحاولة اليدوية (المودال لسه مفتوح)', async () => {
      mockDb.setResult('rpc:record_fee_payment', { data: null, error: { message: 'rpc failed' } });
      const { result } = await renderFeesHook();
      const fee = makeFee({ id: 'fee-idmp-2', client_id: 'client-1' });

      act(() => { result.current.setAddPaymentFor(fee.id); });
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-09-05');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });
      const firstKey = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'record_fee_payment')?.[1].p_idempotency_key;
      expect(firstKey).toEqual(expect.any(String));

      // إعادة محاولة يدوية بعد الفشل — المودال لسه مفتوح (مفيش setAddPaymentFor جديد)
      mockDb.rpcSpy.mockClear();
      mockDb.setResult('rpc:record_fee_payment', { data: { id: fee.id }, error: null });
      await act(async () => { await result.current.handleAddPayment(fee); });
      const secondKey = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'record_fee_payment')?.[1].p_idempotency_key;
      expect(secondKey).toBe(firstKey);
    });

    it('إغلاق المودال (setAddPaymentFor(null)) → المفتاح يترجع لـnull، فتح تاني بعده يولّد مفتاح جديد', async () => {
      const { result } = await renderFeesHook();
      const fee = makeFee({ id: 'fee-idmp-3', client_id: 'client-1' });

      act(() => { result.current.setAddPaymentFor(fee.id); });
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-09-05');
        result.current.setPayReceiver('المحاسب');
      });
      act(() => { result.current.setAddPaymentFor(null); }); // إلغاء من غير حفظ
      act(() => { result.current.setAddPaymentFor(fee.id); }); // فتح تاني — نية جديدة
      act(() => {
        result.current.setPayAmount('200');
        result.current.setPayClientName('client-1');
        result.current.setPayDate('2026-09-05');
        result.current.setPayReceiver('المحاسب');
      });
      await act(async () => { await result.current.handleAddPayment(fee); });

      const key = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'record_fee_payment')?.[1].p_idempotency_key;
      expect(key).toEqual(expect.any(String));
    });

    it('markNewFeeFormOpened → مفتاح بيتبعت لـcreate_fee_with_advance، وmarkNewFeeFormClosed بيصفّره', async () => {
      mockDb.setResult('rpc:create_fee_with_advance', { data: { id: 'new-fee-idmp' }, error: null });
      const { result } = await renderFeesHook();

      act(() => { result.current.markNewFeeFormOpened(); });
      act(() => {
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-09-05' });
      });
      await act(async () => { await result.current.handleSave(); });

      const call = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'create_fee_with_advance');
      expect(call?.[1].p_idempotency_key).toEqual(expect.any(String));

      // بعد النجاح، المفتاح اتصفّر — نداء تاني من غير فتح جديد يبعت null
      mockDb.rpcSpy.mockClear();
      act(() => {
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-09-05' });
      });
      await act(async () => { await result.current.handleSave(); });
      const secondCall = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'create_fee_with_advance');
      expect(secondCall?.[1].p_idempotency_key).toBeNull();

      // markNewFeeFormClosed بيصفّر مفتاح مفتوح من غير حفظ
      mockDb.rpcSpy.mockClear();
      act(() => { result.current.markNewFeeFormOpened(); });
      act(() => { result.current.markNewFeeFormClosed(); });
      act(() => {
        result.current.setForm({ ...result.current.form, case_id: 'case-1', client_id: 'client-1', receiver: 'المحاسب', total: '1000', paid: '300', payment_date: '2026-09-05' });
      });
      await act(async () => { await result.current.handleSave(); });
      const thirdCall = mockDb.rpcSpy.mock.calls.find((c) => c[0] === 'create_fee_with_advance');
      expect(thirdCall?.[1].p_idempotency_key).toBeNull();
    });
  });
});
