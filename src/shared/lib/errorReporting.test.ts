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
