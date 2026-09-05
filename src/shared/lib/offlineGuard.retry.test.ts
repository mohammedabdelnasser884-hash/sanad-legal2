import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runReadWithRetry } from './offlineGuard';

// ─────────────────────────────────────────────────────────────
// خطة "تصنيف الرسائل ودورة حياة العمليات" — بند ٣-ج (٥ سبتمبر ٢٠٢٦)
// اختبارات runReadWithRetry: إعادة محاولة تلقائية للقراءة بس، مقصورة
// على الأخطاء الـtransient (timeout/network) حسب classifyError الحقيقية.
// ─────────────────────────────────────────────────────────────

describe('runReadWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('نجاح من أول محاولة: صفر إعادة محاولة، attempts = 1', async () => {
    const attemptFn = vi.fn().mockResolvedValue({ error: null, result: 'ok' });
    const promise = runReadWithRetry(attemptFn);
    const res = await promise;
    expect(res).toEqual({ error: null, result: 'ok', attempts: 1 });
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('فشل timeout ثم نجاح: بتعيد المحاولة تلقائيًا وترجع النتيجة الناجحة', async () => {
    const attemptFn = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: null, result: 'ok-after-retry' });
    const onRetry = vi.fn();

    const promise = runReadWithRetry(attemptFn, { onRetry });
    // أول انتظار (backoff) قبل المحاولة التانية
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res).toEqual({ error: null, result: 'ok-after-retry', attempts: 2 });
    expect(attemptFn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(2, 2);
  });

  it("فشل بتصنيف غير transient (زي permission) — مفيش إعادة محاولة خالص", async () => {
    const attemptFn = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const res = await runReadWithRetry(attemptFn);
    expect(res.attempts).toBe(1);
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('فشل session — مفيش إعادة محاولة (إعادة المحاولة مش هتحل مشكلة جلسة منتهية)', async () => {
    const attemptFn = vi.fn().mockResolvedValue({ error: { message: 'JWT expired' } });
    const res = await runReadWithRetry(attemptFn);
    expect(res.attempts).toBe(1);
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it('وصلنا لأقصى عدد محاولات (maxAttempts) وكل المحاولات فشلت transient — بترجع آخر فشل من غير محاولة زيادة', async () => {
    const attemptFn = vi.fn().mockResolvedValue({ error: { message: 'timeout' } });
    const promise = runReadWithRetry(attemptFn, { maxAttempts: 2 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.attempts).toBe(2);
    expect(attemptFn).toHaveBeenCalledTimes(2);
    expect((res.error as { message?: string })?.message).toBe('timeout');
  });

  it('أوف لاين فعليًا (navigator.onLine=false) — مفيش إعادة محاولة حتى لو التصنيف transient', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const attemptFn = vi.fn().mockResolvedValue({ error: { message: 'Failed to fetch' } });
    const res = await runReadWithRetry(attemptFn, { maxAttempts: 3 });

    expect(res.attempts).toBe(1);
    expect(attemptFn).toHaveBeenCalledTimes(1);
    onLineSpy.mockRestore();
  });

  it('استثناء (throw) من attemptFn بيتعامل معاه زي أي error تاني (مش timeout إلا لو guard.didTimeOut فعلاً)', async () => {
    const attemptFn = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await runReadWithRetry(attemptFn);
    expect(res.attempts).toBe(1);
    expect((res.error as Error)?.message).toBe('boom');
  });

  it('onRetry بيتنادى بالرقم الصح للمحاولة الجاية قبل كل إعادة محاولة', async () => {
    const attemptFn = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: { message: 'timeout' } })
      .mockResolvedValueOnce({ error: null, result: 'ok' });
    const onRetry = vi.fn();

    const promise = runReadWithRetry(attemptFn, { maxAttempts: 3, onRetry });
    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenNthCalledWith(1, 2, 3);
    expect(onRetry).toHaveBeenNthCalledWith(2, 3, 3);
  });
});
