import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyError, runTrackedOperation, trackQueryOutcome, getServiceStatus, recordSuccess, recordError } from './systemHealth';

beforeEach(() => {
  localStorage.clear();
});

describe('classifyError', () => {
  it('رسالة فيها JWT/session/refresh_token → session', () => {
    expect(classifyError({ message: 'JWT expired' })).toBe('session');
    expect(classifyError({ message: 'invalid refresh_token' })).toBe('session');
  });

  it('code === 42501 أو رسالة فيها permission denied/RLS → permission', () => {
    expect(classifyError({ code: '42501', message: 'x' })).toBe('permission');
    expect(classifyError({ message: 'permission denied for table cases' })).toBe('permission');
    expect(classifyError({ message: 'new row violates RLS policy' })).toBe('permission');
  });

  it("message === 'timeout' بالحرف (نفس نمط guard.didTimeOut() الفعلي في المشروع) → timeout", () => {
    expect(classifyError({ message: 'timeout' })).toBe('timeout');
  });

  it('خطأ عادي فيه كلمة timeout جوه جملة أطول لا يُصنَّف timeout (المطابقة حرفية بالظبط، مش substring)', () => {
    expect(classifyError({ message: 'request timeout after 8s' })).not.toBe('timeout');
  });

  it('session أعلى أولوية من permission لو الخطأ فيه الاتنين', () => {
    expect(classifyError({ code: '42501', message: 'JWT expired' })).toBe('session');
  });

  it('navigator.onLine === false ومفيش أي دليل تاني → network (آخر فحص، مش أول حاجة)', () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(classifyError({ message: 'Failed to fetch' })).toBe('network');
    onLineSpy.mockRestore();
  });

  it('navigator.onLine === false لكن فيه دليل session قوي → session تكسب (evidence-first مش network-first)', () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(classifyError({ message: 'JWT expired' })).toBe('session');
    onLineSpy.mockRestore();
  });

  it('مفيش أي دليل ومفيش أوفلاين → server (fallback أخير)', () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(classifyError({ message: 'unexpected 500' })).toBe('server');
    onLineSpy.mockRestore();
  });

  it('rawError فاضي (null/undefined) → server من غير ما يرمي استثناء', () => {
    expect(classifyError(null)).toBe('server');
    expect(classifyError(undefined)).toBe('server');
  });

  it('نص خام (string) بدل object → server (مش بيقرأ .message من نص)', () => {
    expect(classifyError('plain string error')).toBe('server');
  });
});

describe('runTrackedOperation', () => {
  it('نجاح: بيرجع { ok: true, data } ويسجل recordSuccess تلقائيًا', async () => {
    const result = await runTrackedOperation(
      'test_op_success',
      { label: 'عملية تجريبية', message: 'تعذّر تنفيذ العملية.' },
      async () => 'الناتج'
    );
    expect(result).toEqual({ ok: true, data: 'الناتج' });
    expect(getServiceStatus('test_op_success').status).toBe('ok');
  });

  it('فشل عادي (Error): بيرجع failure كامل (rawError/classification/safeMessage/operationKey/operationLabel) ويسجل recordError', async () => {
    const err = new Error('permission denied for table cases');
    const result = await runTrackedOperation(
      'test_op_permission',
      { label: 'عملية صلاحيات', message: 'تعذّر تنفيذ العملية.' },
      async () => { throw err; }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.rawError).toBe(err);
      expect(result.failure.classification).toBe('permission');
      expect(result.failure.safeMessage).toBe('تعذّر تنفيذ العملية.');
      expect(result.failure.operationKey).toBe('test_op_permission');
      expect(result.failure.operationLabel).toBe('عملية صلاحيات');
    }
    const status = getServiceStatus('test_op_permission');
    expect(status.status).toBe('error');
    expect(status.rawError).toBe(err.message);
  });

  it('PostgrestError (code + message): classification وrawError.code سليمين', async () => {
    const pgError = { code: '42501', message: 'permission denied', details: null, hint: null };
    const result = await runTrackedOperation(
      'test_op_postgrest',
      { label: 'حفظ سجل', message: 'تعذّر الحفظ.' },
      async () => { throw pgError; }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.classification).toBe('permission');
      expect((result.failure.rawError as { code?: string }).code).toBe('42501');
    }
  });

  it('FunctionsHttpError: بيستخرج الرسالة العربية الحقيقية من context.json() مش .message العام، ويسجلها في recordError', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => ({ error: 'انتهت الجلسة. سجّل الدخول تاني.' }),
      },
    };
    const result = await runTrackedOperation(
      'test_op_edgefn',
      { label: 'نداء مساعد ذكي', message: 'تعذّر تنفيذ الطلب.' },
      async () => { throw fnError; }
    );
    expect(result.ok).toBe(false);
    const status = getServiceStatus('test_op_edgefn');
    // النص المتخزَّن لازم يكون الرسالة العربية الحقيقية، مش النص العام
    expect(status.rawError).toBe('انتهت الجلسة. سجّل الدخول تاني.');
    expect(status.rawError).not.toBe(fnError.message);
  });

  it('FunctionsHttpError من غير رسالة عربية قابلة للاستخراج → fallback لـ.message العام', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => { throw new Error('invalid json'); },
      },
    };
    await runTrackedOperation(
      'test_op_edgefn_fallback',
      { label: 'نداء مساعد ذكي', message: 'تعذّر تنفيذ الطلب.' },
      async () => { throw fnError; }
    );
    const status = getServiceStatus('test_op_edgefn_fallback');
    expect(status.rawError).toBe(fnError.message);
  });

  it('timeout حقيقي (نمط guard.didTimeOut() الفعلي: { message: "timeout" }) → classification=timeout', async () => {
    const result = await runTrackedOperation(
      'test_op_timeout',
      { label: 'تحميل البيانات', message: 'تعذّر تحميل البيانات.' },
      async () => { throw { message: 'timeout' }; }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.classification).toBe('timeout');
  });

  it('نجاح لاحق بعد فشل سابق لنفس المفتاح يمسح الخطأ (نفس سلوك recordSuccess الحالي)', async () => {
    await runTrackedOperation('test_op_recover', { label: 'عملية', message: 'تعذّر.' }, async () => { throw new Error('fail'); });
    expect(getServiceStatus('test_op_recover').status).toBe('error');

    recordSuccess('test_op_recover');
    expect(getServiceStatus('test_op_recover').status).toBe('ok');
  });
});

describe('trackQueryOutcome ({error}-based، خطة "تصنيف الرسائل" الجزء الرابع)', () => {
  it('error فاضي (null) → { ok: true } ويسجل recordSuccess تلقائيًا', async () => {
    const result = await trackQueryOutcome(
      'test_query_success',
      null,
      { label: 'جلب تجريبي', message: 'تعذّر الجلب.' }
    );
    expect(result).toEqual({ ok: true });
    expect(getServiceStatus('test_query_success').status).toBe('ok');
  });

  it('error فاضي (undefined) → { ok: true } برضه', async () => {
    const result = await trackQueryOutcome(
      'test_query_success_undef',
      undefined,
      { label: 'جلب تجريبي', message: 'تعذّر الجلب.' }
    );
    expect(result).toEqual({ ok: true });
  });

  it('error موجود (PostgrestError): بيرجع failure كامل بنفس شكل runTrackedOperation ويسجل recordError', async () => {
    const pgError = { code: '42501', message: 'permission denied for table cases', details: null, hint: null };
    const result = await trackQueryOutcome(
      'test_query_permission',
      pgError,
      { label: 'جلب القضايا', message: 'تعذّر جلب القضايا.' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.rawError).toBe(pgError);
      expect(result.failure.classification).toBe('permission');
      expect(result.failure.safeMessage).toBe('تعذّر جلب القضايا.');
      expect(result.failure.operationKey).toBe('test_query_permission');
      expect(result.failure.operationLabel).toBe('جلب القضايا');
    }
    const status = getServiceStatus('test_query_permission');
    expect(status.status).toBe('error');
    expect(status.rawError).toBe(pgError.message);
  });

  it('timeout حقيقي (نمط guard.didTimeOut(): { message: "timeout" }) → classification=timeout', async () => {
    const result = await trackQueryOutcome(
      'test_query_timeout',
      { message: 'timeout' },
      { label: 'تحميل البيانات', message: 'تعذّر تحميل البيانات.' }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.classification).toBe('timeout');
  });

  it('لا يُستدعى خالص لفرع الرجوع للكاش (fetchCases، قرار ٩ أغسطس) — مش مسؤولية الدالة، القرار في الكود المستدعي', () => {
    // اختبار توثيقي: مفيش استدعاء لـtrackQueryOutcome هنا عمدًا — العقد
    // إن الكود المستدعي هو اللي بيقرر مايناديهاش في فرع الكاش، مش الدالة
    // بتتجاهل الخطأ بنفسها.
    expect(getServiceStatus('test_query_cache_fallback_not_called')).toBeUndefined();
  });

  it('FunctionsHttpError: بيستخرج الرسالة العربية الحقيقية من context.json() زي runTrackedOperation بالظبط (نفس النواة المشتركة)', async () => {
    const fnError = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => ({ error: 'انتهت الجلسة. سجّل الدخول تاني.' }) },
    };
    await trackQueryOutcome(
      'test_query_edgefn',
      fnError,
      { label: 'نداء مساعد ذكي', message: 'تعذّر تنفيذ الطلب.' }
    );
    const status = getServiceStatus('test_query_edgefn');
    expect(status.rawError).toBe('انتهت الجلسة. سجّل الدخول تاني.');
  });

  it('نجاح لاحق بعد فشل سابق لنفس المفتاح يمسح الخطأ (نفس سلوك recordSuccess)', async () => {
    await trackQueryOutcome('test_query_recover', new Error('fail'), { label: 'عملية', message: 'تعذّر.' });
    expect(getServiceStatus('test_query_recover').status).toBe('error');

    const result = await trackQueryOutcome('test_query_recover', null, { label: 'عملية', message: 'تعذّر.' });
    expect(result).toEqual({ ok: true });
    expect(getServiceStatus('test_query_recover').status).toBe('ok');
  });
});

describe('lastOutcome (منفصل عن status، خطة قسم ٣.٥.١)', () => {
  it('مفتاح لسه ماتسجلش له نجاح ولا فشل من الأساس → lastOutcome غير معرّف', () => {
    expect(getServiceStatus('test_op_never_touched')).toBeUndefined();
  });

  it('recordSuccess يسجل lastOutcome = success', () => {
    recordSuccess('test_op_lo_success');
    expect(getServiceStatus('test_op_lo_success').lastOutcome).toBe('success');
  });

  it('recordError (مباشر) يسجل lastOutcome = failure', () => {
    recordError('test_op_lo_failure', 'some error');
    expect(getServiceStatus('test_op_lo_failure').lastOutcome).toBe('failure');
  });

  it('runTrackedOperation ناجحة تسجل lastOutcome = success', async () => {
    await runTrackedOperation('test_op_lo_tracked_success', { label: 'عملية', message: 'تعذّر.' }, async () => 'ok');
    expect(getServiceStatus('test_op_lo_tracked_success').lastOutcome).toBe('success');
  });

  it('runTrackedOperation فاشلة تسجل lastOutcome = failure (لا "unknown" — القيمة دي محجوزة لسيناريو مستقبلي مش مستخدمة حاليًا)', async () => {
    await runTrackedOperation('test_op_lo_tracked_failure', { label: 'عملية', message: 'تعذّر.' }, async () => { throw new Error('x'); });
    expect(getServiceStatus('test_op_lo_tracked_failure').lastOutcome).toBe('failure');
  });

  it('trackQueryOutcome ناجحة (error=null) تسجل lastOutcome = success', async () => {
    await trackQueryOutcome('test_op_lo_query_success', null, { label: 'عملية', message: 'تعذّر.' });
    expect(getServiceStatus('test_op_lo_query_success').lastOutcome).toBe('success');
  });

  it('trackQueryOutcome فاشلة تسجل lastOutcome = failure', async () => {
    await trackQueryOutcome('test_op_lo_query_failure', new Error('x'), { label: 'عملية', message: 'تعذّر.' });
    expect(getServiceStatus('test_op_lo_query_failure').lastOutcome).toBe('failure');
  });

  it('نجاح لاحق بعد فشل يحدّث lastOutcome من failure لـsuccess', () => {
    recordError('test_op_lo_flip', 'err');
    expect(getServiceStatus('test_op_lo_flip').lastOutcome).toBe('failure');
    recordSuccess('test_op_lo_flip');
    expect(getServiceStatus('test_op_lo_flip').lastOutcome).toBe('success');
  });
});
