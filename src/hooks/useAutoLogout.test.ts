import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoLogout } from './useAutoLogout';
import type { ProfileRow } from '../types';

// ══════════════════════════════════════════════════════════════════
// 🔒 UPDATE (خطة قفل الشاشة بدل تسجيل الخروج التلقائي، 15 سبتمبر 2026):
// useAutoLogout.ts بقى بيستخدم:
//   - logActivity(db, 'قفل تلقائي', ...)       [لما يعدّي 30 دقيقة خمول]
//   - onLock()                                 [بدل signOut+onLogout القديمين]
//   - toast(...)                               [بعد onLock]
//   - window.addEventListener/removeEventListener مباشرة (مش عبر ref)
// مبقاش بينادي db.auth.signOut() خالص — القفل محلي بالكامل الآن (راجع
// LockScreen.tsx + lib/localAuthLock.ts)، والـsession الحقيقي فاضل زي ما هو.
// IDLE_TIMEOUT ثابت جوه الكود نفسه = 30 * 60 * 1000 (30 دقيقة) — مش قابل للتخصيص.
// ══════════════════════════════════════════════════════════════════
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const signOut = vi.fn((..._args: unknown[]) => Promise.resolve({ error: null }));
vi.mock('../supabaseClient', () => ({ db: { auth: { signOut: (...a: unknown[]) => signOut(...a) } } }));

const toast = vi.fn();
vi.mock('../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn((..._args: unknown[]) => Promise.resolve());
vi.mock('../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const PROFILE = { id: 'p1', user_id: 'user-1', tenant_id: 't1' } as unknown as ProfileRow;

describe('useAutoLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockClear();
    toast.mockClear();
    logActivity.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('profile:null → مفيش أي مستمع أحداث بيتسجل ومفيش أي قفل حتى بعد وقت طويل', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const onLock = vi.fn();
    renderHook(() => useAutoLogout(null, onLock));
    expect(addSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('profile موجود → 30 دقيقة خمول كاملة من غير أي نشاط → logActivity ثم onLock ثم toast، بنفس الترتيب (من غير أي signOut حقيقي)', async () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLogout(PROFILE, onLock));

    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);

    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'قفل تلقائي', {
      entity_type: 'user',
      details: 'قفل الشاشة تلقائيًا بعد 30 دقيقة عدم نشاط',
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('🔒 اتقفلت الشاشة بسبب عدم النشاط — ادخل كلمة السر للمتابعة', true);

    const logOrder = logActivity.mock.invocationCallOrder[0];
    const onLockOrder = onLock.mock.invocationCallOrder[0];
    expect(logOrder).toBeLessThan(onLockOrder);
  });

  it('نشاط (mousemove) قبل ما الـ 30 دقيقة تخلص بيصفّر العداد — مفيش قفل عند نقطة الـ 30 دقيقة الأصلية', async () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLogout(PROFILE, onLock));

    await vi.advanceTimersByTimeAsync(20 * 60 * 1000); // 20 دقيقة
    window.dispatchEvent(new Event('mousemove'));
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000); // لغاية 40 دقيقة من البداية، لكن 20 بس من إعادة الضبط

    expect(onLock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000); // 30 دقيقة كاملة من إعادة الضبط
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('كل نوع من أنواع الأحداث المسجلة (click مثلًا) بيصفّر العداد برضه', async () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLogout(PROFILE, onLock));

    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    window.dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('unmount قبل ما الوقت يخلص → التايمر بيتنضّف والمستمعين بيتشالوا، ومفيش قفل بعد كده خالص', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const onLock = vi.fn();
    const { unmount } = renderHook(() => useAutoLogout(PROFILE, onLock));

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    unmount();
    expect(removeSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS * 2);
    expect(onLock).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it('تغيير profile من null لموجود بين إعادتي رندر → effect بيتفعّل من جديد ويبدأ يعدّ (مفيش قفل فوري)', async () => {
    const onLock = vi.fn();
    const { rerender } = renderHook(({ profile }) => useAutoLogout(profile, onLock), {
      initialProps: { profile: null as ProfileRow | null },
    });
    rerender({ profile: PROFILE });
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1000);
    expect(onLock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('تغيير profile من موجود لـ null بين إعادتي رندر → التايمر القديم بيتلغي ومفيش قفل حتى لو الوقت الأصلي عدّى', async () => {
    const onLock = vi.fn();
    const { rerender } = renderHook(({ profile }) => useAutoLogout(profile, onLock), {
      initialProps: { profile: PROFILE as ProfileRow | null },
    });
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    rerender({ profile: null });
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS);
    expect(onLock).not.toHaveBeenCalled();
  });
});
