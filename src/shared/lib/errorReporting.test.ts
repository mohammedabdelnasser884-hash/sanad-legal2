import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════
// Mock systemHealth (recordError/recordSuccess) و notifications (toast) —
// errorReporting.ts بيستخدمهم مباشرة، مفيش داعي لأي حاجة تانية.
// ══════════════════════════════════════════════════════════════════
const recordErrorSpy = vi.fn();
const recordSuccessSpy = vi.fn();
const toastSpy = vi.fn();

vi.mock('../../systemHealth', () => ({
  recordError: (...a: unknown[]) => recordErrorSpy(...a),
  recordSuccess: (...a: unknown[]) => recordSuccessSpy(...a),
}));
vi.mock('./notifications', () => ({
  toast: (...a: unknown[]) => toastSpy(...a),
}));

import { showErrorToast, reportOperationResult, runTracked } from './errorReporting';

beforeEach(() => {
  recordErrorSpy.mockClear();
  recordSuccessSpy.mockClear();
  toastSpy.mockClear();
});

describe('showErrorToast', () => {
  it('يسجل الخطأ الخام ويعرض رسالة التوست الآمنة', () => {
    showErrorToast('session_save', new Error('raw db failure'), 'تعذّر حفظ الجلسة.', 'حفظ الجلسة');
    expect(recordErrorSpy).toHaveBeenCalledWith('session_save', 'raw db failure', {
      label: 'حفظ الجلسة',
      message: 'تعذّر حفظ الجلسة.',
    });
    expect(toastSpy).toHaveBeenCalledWith('❌ تعذّر حفظ الجلسة.', true);
  });

  it('يتعامل مع rawError نصي وكائن بلا message بدون كراش', () => {
    showErrorToast('k1', 'raw string error', 'رسالة 1');
    expect(recordErrorSpy).toHaveBeenCalledWith('k1', 'raw string error', { label: undefined, message: 'رسالة 1' });

    showErrorToast('k2', { code: 'PGRST100' }, 'رسالة 2');
    expect(recordErrorSpy).toHaveBeenLastCalledWith('k2', '[object Object]', { label: undefined, message: 'رسالة 2' });
  });

  // 🆕 E2 + E3 (المرحلة 15 — قفل الاشتراك/حدود الباقات)
  it('E3: كود P0001 (RAISE EXCEPTION من trigger حد الباقة) → بتعرض رسالة الخطأ نفسها بدل الرسالة العامة', () => {
    const limitErr = { code: 'P0001', message: 'وصلت للحد الأقصى لعدد القضايا النشطة (50) في باقتك الحالية. رقّي الباقة لإضافة قضايا جديدة.' };
    showErrorToast('k3', limitErr, 'فشل إضافة القضية', 'إضافة قضية');
    expect(toastSpy).toHaveBeenCalledWith('❌ وصلت للحد الأقصى لعدد القضايا النشطة (50) في باقتك الحالية. رقّي الباقة لإضافة قضايا جديدة.', true);
    expect(recordErrorSpy).toHaveBeenCalledWith('k3', limitErr.message, {
      label: 'إضافة قضية',
      message: limitErr.message,
    });
  });

  it('E2: كود 42501 من tenant_write_allowed_* → رسالة "وضع مشاهدة فقط" الثابتة بدل الرسالة التقنية الخام', () => {
    const lockErr = { code: '42501', message: 'new row violates row-level security policy "tenant_write_allowed_cases_update" for table "cases"' };
    showErrorToast('k4', lockErr, 'فشل تعديل القضية', 'تعديل قضية');
    expect(toastSpy).toHaveBeenCalledWith(
      '❌ الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.',
      true,
    );
  });

  it('42501 من غير اسم tenant_write_allowed (RLS تانية غير مرتبطة بالاشتراك) → الرسالة العامة زي ما هي', () => {
    const otherRlsErr = { code: '42501', message: 'new row violates row-level security policy for table "cases"' };
    showErrorToast('k5', otherRlsErr, 'فشل تعديل القضية', 'تعديل قضية');
    expect(toastSpy).toHaveBeenCalledWith('❌ فشل تعديل القضية', true);
  });
});

describe('reportOperationResult (Operation Lifecycle)', () => {
  it('لو مفيش error: يسجل recordSuccess ويرجع true، بدون أي toast', () => {
    const ok = reportOperationResult('session_save', null, { errorMessage: 'تعذّر الحفظ.', label: 'حفظ الجلسة' });
    expect(ok).toBe(true);
    expect(recordSuccessSpy).toHaveBeenCalledWith('session_save', 'حفظ الجلسة');
    expect(recordErrorSpy).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('لو فيه error: يعمل توست خطأ + recordError عن طريق showErrorToast، ويرجع false', () => {
    const rawErr = new Error('network down');
    const ok = reportOperationResult('session_delete', rawErr, { errorMessage: 'تعذّر الحذف.', label: 'حذف الجلسة' });
    expect(ok).toBe(false);
    expect(recordErrorSpy).toHaveBeenCalledWith('session_delete', 'network down', {
      label: 'حذف الجلسة',
      message: 'تعذّر الحذف.',
    });
    expect(recordSuccessSpy).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith('❌ تعذّر الحذف.', true);
  });

  it('يتعامل مع undefined زي null (كلاهما "مفيش خطأ")', () => {
    const ok = reportOperationResult('k', undefined, { errorMessage: 'x' });
    expect(ok).toBe(true);
    expect(recordSuccessSpy).toHaveBeenCalledWith('k', undefined);
  });
});

describe('runTracked (Operation Lifecycle — نمط try/catch)', () => {
  it('لو fn نجحت: يسجل recordSuccess ويرجع نتيجتها', async () => {
    const result = await runTracked('ai_case_summary', async () => 'ok-value', {
      errorMessage: 'فشل', label: 'ملخص القضية',
    });
    expect(result).toBe('ok-value');
    expect(recordSuccessSpy).toHaveBeenCalledWith('ai_case_summary', 'ملخص القضية');
    expect(recordErrorSpy).not.toHaveBeenCalled();
  });

  it('لو fn رمت استثناء: يعمل showErrorToast ويرجع undefined بدل ما يرمي تاني', async () => {
    const result = await runTracked('ai_case_summary', async () => { throw new Error('boom'); }, {
      errorMessage: 'فشل التوليد.', label: 'ملخص القضية',
    });
    expect(result).toBeUndefined();
    expect(recordErrorSpy).toHaveBeenCalledWith('ai_case_summary', 'boom', {
      label: 'ملخص القضية',
      message: 'فشل التوليد.',
    });
    expect(toastSpy).toHaveBeenCalledWith('❌ فشل التوليد.', true);
    expect(recordSuccessSpy).not.toHaveBeenCalled();
  });
});
