import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ClientRow, ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';

// ══════════════════════════════════════════════════════════════════
// Mock db (supabaseClient) — بيغطي بس سلسلة الاستدعاء اللي recalcNextHearing
// (dataAccess.ts، Mock مماثل تحت) بتستخدمها فعليًا:
//   - db.from('case_sessions').select('session_date').eq('case_id', x)
//   - db.from('cases').update({next_hearing}).eq('id', x)
// 🆕 المرحلة 6.5 (توسيع الأوفلاين — H-3، تكملة ثالثة): handleAddSession/
// handleDeleteSession/handleUpdateSession بقوا بينادوا window.__dbWrite بدل
// db.from(...)/safeUpdate مباشرة — نفس نمط useCaseDetailActions.test.ts
// (case_notes) بالظبط. mockDb هنا بقى مسؤول بس عن recalcNextHearing.
// ══════════════════════════════════════════════════════════════════
type Result = { data?: unknown; error?: unknown };

function makeMockDb() {
  const configured: Record<string, Result> = {};
  const updateSpy = vi.fn();
  const selectEqSpy = vi.fn();

  const setResult = (key: string, result: Result) => { configured[key] = result; };
  const get = (key: string, fallback: Result) => configured[key] ?? fallback;

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        selectEqSpy(table, col, val);
        return Promise.resolve(get(`${table}:select`, { data: [], error: null }));
      }),
    })),
    update: vi.fn((payload: unknown) => {
      updateSpy(table, payload);
      return { eq: vi.fn(() => Promise.resolve(get(`${table}:update`, { error: null }))) };
    }),
  }));

  // 🆕 (فيكس atomicity — phase23): handleFinalJudgment/handleDeleteFinalJudgment
  // بقوا بينادوا db.rpc('record_final_judgment'|'undo_final_judgment', …) بدل
  // __dbWrite مرتين. rpc منفصل عن vi.fn() ثابت (rpcSpy تحت) بدل مرور بـ
  // configured/get زي from فوق — عشان التستات تقدر تستخدم mockResolvedValueOnce
  // بالتتابع (سيناريوهات conflict/فشل) بنفس أسلوب dbWriteMock() الموجود.
  const rpc = vi.fn();

  return { from, setResult, updateSpy, selectEqSpy, rpc };
}

let mockDb = makeMockDb();
vi.mock('../../../supabaseClient', () => ({
  db: {
    from: (...a: Parameters<typeof mockDb.from>) => mockDb.from(...a),
    rpc: (...a: unknown[]) => mockDb.rpc(...a),
  },
}));

// 🆕 المرحلة 6.5: mock لـ window.__dbWrite — نفس نمط useCaseDetailActions.test.ts
// (dbWriteMock() بترجع نفس الـ vi.fn ثابتة عبر إعادة إسنادها في beforeEach).
function dbWriteMock(): ReturnType<typeof vi.fn> {
  return window.__dbWrite as unknown as ReturnType<typeof vi.fn>;
}

const toast = vi.fn();
vi.mock('../../../shared/lib/notifications', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const logActivity = vi.fn();
// recalcNextHearing اتنقلت لملف dataAccess.ts المشترك (قبل خطوة 6.5) — بنعمل
// mock ليها هنا بنفس منطق النسخة الحقيقية، عشان تفضل شغالة على mockDb
// الموجود فوق (بتقرأ case_sessions وتحدّث cases.next_hearing). صفر تغيير
// هنا عن قبل خطوة 6.5 — الدالة دي مالهاش علاقة بـ __dbWrite أصلاً.
// ⚡ FIX (buildFieldDiff مفقودة من الـmock — 19 أغسطس 2026): handleUpdateSession
// بقى بينادي buildFieldDiff (سجل النشاط، مرحلة 2) — كانت مفقودة من هنا فكانت
// بترمي "No buildFieldDiff export is defined". بنضيفها هنا كدالة حقيقية (نقية،
// من غير أي side effect) بنفس منطق النسخة الأصلية في dataAccess.ts.
vi.mock('../../../shared/lib/dataAccess', () => ({
  logActivity: (...a: unknown[]) => logActivity(...a),
  buildFieldDiff: (
    oldObj: Record<string, unknown> | null | undefined,
    newObj: Record<string, unknown> | null | undefined,
    fields: Record<string, { label: string; format?: (v: unknown) => string }>,
  ) => {
    const result: { field: string; label: string; old: string; new: string }[] = [];
    if (!oldObj || !newObj) return result;
    const norm = (v: unknown, format?: (v: unknown) => string) =>
      v === null || v === undefined || v === '' ? '' : format ? format(v) : String(v);
    for (const field of Object.keys(fields)) {
      const { label, format } = fields[field];
      const oldText = norm(oldObj[field], format);
      const newText = norm(newObj[field], format);
      if (oldText === newText) continue;
      result.push({ field, label, old: oldText, new: newText });
    }
    return result;
  },
  // ⚡ FIX (buildDeleteSnapshot مفقودة من الـmock — 30 أغسطس 2026): handleDeleteSession
  // بقى بينادي buildDeleteSnapshot (سجل النشاط، تغطية الحذف) — نفس منطق
  // buildAddSnapshot فوق، لكن new ثابتة '🗑️ محذوف' زي النسخة الأصلية.
  buildDeleteSnapshot: (
    record: Record<string, unknown> | null | undefined,
    fields: Record<string, { label: string; format?: (v: unknown) => string }>,
  ) => {
    const result: { field: string; label: string; old: string; new: string }[] = [];
    if (!record) return result;
    const norm = (v: unknown, format?: (v: unknown) => string) =>
      v === null || v === undefined || v === '' ? '' : format ? format(v) : String(v);
    for (const field of Object.keys(fields)) {
      const { label, format } = fields[field];
      const text = norm(record[field], format);
      if (!text) continue;
      result.push({ field, label, old: text, new: '🗑️ محذوف' });
    }
    return result;
  },
  recalcNextHearing: async (
    db: {
      from: (table: string) => {
        select: (col: string) => { eq: (col: string, val: string) => Promise<{ data: { session_date: string | null }[] | null }> };
        update: (payload: { next_hearing: string | null }) => { eq: (col: string, val: string) => Promise<unknown> };
      };
    },
    caseId: string,
  ) => {
    const { data: allSessions } = await db.from('case_sessions').select('session_date').eq('case_id', caseId);
    const todayStr = new Date().toISOString().slice(0, 10);
    let nearest: string | null = null;
    (allSessions || []).forEach((s: { session_date: string | null }) => {
      if (!s.session_date || s.session_date < todayStr) return;
      if (!nearest || s.session_date < nearest) nearest = s.session_date;
    });
    await db.from('cases').update({ next_hearing: nearest }).eq('id', caseId);
  },
}));

import { useCaseSessions } from './useCaseSessions';

const client: ClientRow = { id: 'client-1', full_name: 'أحمد محمد' } as ClientRow;
const profile: ProfileRow = { id: 'lawyer-1', full_name: 'المحامي سالم' } as ProfileRow;

function makeCase(overrides: Partial<MappedCase> = {}): MappedCase {
  return {
    id: 'case-1', number: '10', title: 'قضية مدنية', court: 'محكمة الجيزة', type: 'مدني',
    court_level: null, circuit_number: null, status: 'نشطة', date: '2026-07-01', client_id: 'client-1',
    plaintiff: null, plaintiff_role: null, defendant: null, defendant_role: null, year: 2026, updated_at: '2026-07-16T10:00:00.000Z', court_floor: null,
    court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
    ...overrides,
  } as MappedCase;
}

function renderSessionsHook(caseData: MappedCase = makeCase(), onNotify: ((m: string) => void) | undefined = vi.fn()) {
  const refetchAll = vi.fn();
  const onUpdate = vi.fn();
  const view = renderHook(() => useCaseSessions(caseData, client, profile, onNotify, refetchAll, onUpdate));
  return { ...view, refetchAll, onUpdate };
}

beforeEach(() => {
  mockDb = makeMockDb();
  vi.clearAllMocks();
  window.__dbWrite = vi.fn() as unknown as typeof window.__dbWrite;
  // افتراضي آمن لـ recalcNextHearing (بيتنادى بعد كل إضافة/حذف/تعديل ناجح أونلاين)
  mockDb.setResult('case_sessions:select', { data: [], error: null });
});

describe('useCaseSessions — recalcNextHearing', () => {
  it('بيختار أقرب تاريخ >= اليوم ويحدّث next_hearing بيه، ويتجاهل التواريخ الماضية', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const future1 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const future2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    mockDb.setResult('case_sessions:select', {
      data: [{ session_date: past }, { session_date: future1 }, { session_date: future2 }, { session_date: todayStr }],
      error: null,
    });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.recalcNextHearing('case-1'); });
    expect(mockDb.selectEqSpy).toHaveBeenCalledWith('case_sessions', 'case_id', 'case-1');
    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { next_hearing: todayStr });
  });

  it('مفيش أي جلسة قادمة (كلها ماضية أو مفيش جلسات خالص) → next_hearing = null', async () => {
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    mockDb.setResult('case_sessions:select', { data: [{ session_date: past }], error: null });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.recalcNextHearing('case-1'); });
    expect(mockDb.updateSpy).toHaveBeenCalledWith('cases', { next_hearing: null });
  });
});

// 🗑️ FIX (خطة إعادة تصميم إغلاق سلسلة الجلسات، مرحلة 1، 12 سبتمبر 2026):
// describe('useCaseSessions — handleAddSession', ...) اتشال بالكامل —
// handleAddSession نفسها اتشالت من useCaseSessions.ts (راجع الملف).

describe('useCaseSessions — handleDeleteSession', () => {
  it('نجاح أونلاين → __dbWrite DELETE صحيح مع sentinel القضية، إعادة حساب next_hearing، توست نجاح، تسجيل نشاط بـ entity_id، وrefetchAll', async () => {
    dbWriteMock().mockResolvedValue({ error: null });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleDeleteSession('sess-1'); });

    expect(dbWriteMock()).toHaveBeenCalledWith({
      type: 'DELETE', table: 'case_sessions', id: 'sess-1', data: { _offlineSessionCaseId: 'case-1' },
    });
    expect(mockDb.updateSpy).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('🗑 تم حذف الجلسة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حذف جلسة', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('أوفلاين ومتقيّدة → توست "الحذف محفوظ محلياً"، من غير إعادة حساب أو تسجيل نشاط', async () => {
    dbWriteMock().mockResolvedValue({ error: null, offline: true, queued: true });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleDeleteSession('sess-1'); });

    expect(toast).toHaveBeenCalledWith('📥 الحذف محفوظ محلياً — سيُزامن عند عودة الإنترنت');
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل الحذف → توست فشل بس، من غير إعادة حساب أو تسجيل نشاط', async () => {
    dbWriteMock().mockResolvedValue({ error: { message: 'delete failed' } });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleDeleteSession('sess-1'); });

    expect(toast).toHaveBeenCalledWith('❌ فشل حذف الجلسة، حاول مرة أخرى', true);
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });
});

describe('useCaseSessions — handleUpdateSession', () => {
  it('تعارض (conflict) → توست تعارض واضح (🆕 تحسين عن السلوك القديم — safeUpdate كانت بترجع صمت تام)، من غير إعادة حساب ولا refetchAll', async () => {
    dbWriteMock().mockResolvedValue({ error: { message: 'conflict' }, conflict: true, offline: false });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-1', { date: '2026-08-01' }); });

    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(mockDb.updateSpy).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل (error بلا conflict) → توست فشل بس', async () => {
    dbWriteMock().mockResolvedValue({ error: { message: 'update failed' } });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-1', { date: '2026-08-01' }); });

    expect(toast).toHaveBeenCalledWith('❌ فشل تعديل بيانات الجلسة — تحقق من الاتصال وأعد المحاولة', true);
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('أوفلاين ومتقيّدة → توست "التعديل محفوظ محلياً"، من غير إعادة حساب أو تسجيل نشاط', async () => {
    dbWriteMock().mockResolvedValue({ error: null, offline: true, queued: true });
    const { result, refetchAll } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-1', { date: '2026-08-01' }); });

    expect(toast).toHaveBeenCalledWith('📥 التعديل محفوظ محلياً — سيُزامن عند عودة الإنترنت');
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('الجلسة مش موجودة في الـ state المحلي (sessions فاضية) → __dbWrite بيتنادى بـ knownUpdatedAt: null', async () => {
    dbWriteMock().mockResolvedValue({ error: null });
    const { result } = renderSessionsHook();
    await act(async () => { await result.current.handleUpdateSession('sess-not-in-state', { date: '2026-08-01' }); });

    expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE', table: 'case_sessions', id: 'sess-not-in-state', knownUpdatedAt: null,
    }));
  });

  it('نجاح مع جلسة موجودة في الـ state → __dbWrite بـ updated_at الصحيح وsentinel القضية، إعادة حساب next_hearing، توست نجاح، تسجيل نشاط، ورسالة تيليجرام', async () => {
    dbWriteMock().mockResolvedValue({ error: null });
    const onNotify = vi.fn();
    const { result, refetchAll } = renderSessionsHook(makeCase(), onNotify);
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    await act(async () => {
      await result.current.handleUpdateSession('sess-1', { date: '2026-08-05', time_period: 'صباحي', description: 'تعديل الوصف' });
    });

    expect(dbWriteMock()).toHaveBeenCalledWith({
      type: 'UPDATE', table: 'case_sessions', id: 'sess-1',
      data: expect.objectContaining({ session_date: '2026-08-05', session_time: 'صباحي', description: 'تعديل الوصف', _offlineSessionCaseId: 'case-1' }),
      knownUpdatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(mockDb.updateSpy).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('✅ تم تعديل الجلسة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تعديل جلسة', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify.mock.calls[0][0] as string).toContain('تم تعديل جلسة');
    expect(refetchAll).toHaveBeenCalled();
  });
});

// 🔧 FIX (طلب جيمي، 12 سبتمبر 2026): handleFinalJudgment/handleDeleteFinalJudgment
// كانوا بيحدّثوا cases.status في الداتابيز من غير ما ينادوا onUpdate — القضية
// كانت بتفضل شكلها القديم (منتهية/متداولة) في شاشة الأب لحد خروج وريفريش يدوي.
// 🔧 FIX (باگ atomicity، phase23): handleFinalJudgment بقى بينادي RPC ذرّية
// واحدة (record_final_judgment) بدل كتابتين منفصلتين عبر __dbWrite — راجع
// database/migrations/sql-migrations-phase23/01-final-judgment-atomic-rpc.sql.
// التستات القديمة اللي كانت بتحاكي "نجاح جزئي" (تحديث جلسة نجح، تحديث قضية
// فشل) اتشالت لأن السيناريو ده مبقاش ممكن أصلاً — العمليتين بقوا داخل
// transaction واحدة في الداتابيز، فإما الاتنين ينجحوا مع بعض أو يترجعوا مع
// بعض. مفيش دعم أوفلاين خالص هنا (RPC مش table write)، فتستات forceQueue
// القديمة اتشالت برضه.
describe('useCaseSessions — handleFinalJudgment', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('نجاح → RPC بتتنادى بالبيانات الصح، onUpdate بـ"منتهية"، recalc، توست نجاح، تسجيل نشاط، refetchAll', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: null });
    const { result, onUpdate, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handleFinalJudgment('sess-1', '2026-08-01', 'حكم لصالح المدعي');
    });

    expect(mockDb.rpc).toHaveBeenCalledWith('record_final_judgment', {
      p_session_id: 'sess-1',
      p_case_id: 'case-1',
      p_verdict_text: 'حكم لصالح المدعي',
      p_judgment_date: '2026-08-01',
      p_known_session_updated_at: '2026-07-01T00:00:00.000Z',
      p_known_case_updated_at: '2026-07-16T10:00:00.000Z',
    });
    expect(returned).toEqual({ ok: true });
    expect(onUpdate).toHaveBeenCalledWith('منتهية');
    expect(toast).toHaveBeenCalledWith('✅ تم تسجيل الحكم النهائي وإغلاق القضية');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حكم نهائي', expect.objectContaining({ entity_type: 'case', entity_id: 'case-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('أوفلاين → ممنوع بالكامل، مفيش أي نداء RPC، توست يطلب اتصال إنترنت', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result, onUpdate } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handleFinalJudgment('sess-1', '2026-08-01', 'حكم لصالح المدعي');
    });

    expect(mockDb.rpc).not.toHaveBeenCalled();
    expect(returned).toEqual({ ok: false });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('⚠️ تسجيل الحكم النهائي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
  });

  it('conflict (الجلسة/القضية اتعدّلت من حد تاني) → توست تعارض، بترجع {ok:false}، onUpdate ما بينادوش', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'conflict:session' } });
    const { result, onUpdate, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handleFinalJudgment('sess-1', '2026-08-01', 'حكم لصالح المدعي');
    });

    expect(returned).toEqual({ ok: false });
    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة أو القضية عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل حقيقي (خطأ RPC عام) → توست فشل، بترجع {ok:false}، مفيش توست نجاح كاذب، onUpdate ما بينادوش', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result, onUpdate, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handleFinalJudgment('sess-1', '2026-08-01', 'حكم لصالح المدعي');
    });

    expect(returned).toEqual({ ok: false });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('تم تسجيل الحكم النهائي وإغلاق القضية'));
  });
});

// 🆕 (فيكس atomicity، phase24): handlePreliminaryJudgment بقى بينادي RPC
// ذرّية واحدة (record_preliminary_judgment) بدل كتابتين منفصلتين عبر
// __dbWrite (UPDATE على الجلسة الحالية + INSERT للجلسة القادمة) — راجع
// database/migrations/sql-migrations-phase24/01-preliminary-judgment-atomic-rpc.sql.
// نفس منطق تستات handleFinalJudgment فوق بالظبط: مفيش سيناريو "نجاح جزئي"
// ممكن يحصل تاني (العمليتين جوه transaction واحدة)، مفيش دعم أوفلاين.
describe('useCaseSessions — handlePreliminaryJudgment', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('نجاح → RPC بتتنادى بالبيانات الصح، recalc، توست نجاح، تسجيل نشاط، refetchAll', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: null });
    const { result, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePreliminaryJudgment('sess-1', 'حكم بندب خبير', '2026-09-01');
    });

    expect(mockDb.rpc).toHaveBeenCalledWith('record_preliminary_judgment', {
      p_session_id: 'sess-1',
      p_case_id: 'case-1',
      p_verdict_text: 'حكم بندب خبير',
      p_next_session_date: '2026-09-01',
      p_known_session_updated_at: '2026-07-01T00:00:00.000Z',
    });
    expect(returned).toEqual({ ok: true });
    expect(toast).toHaveBeenCalledWith('⚖️ تم تسجيل الحكم التمهيدي وجدولة الجلسة القادمة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'حكم تمهيدي', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('أوفلاين → ممنوع بالكامل، مفيش أي نداء RPC، توست يطلب اتصال إنترنت', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePreliminaryJudgment('sess-1', 'حكم بندب خبير', '2026-09-01');
    });

    expect(mockDb.rpc).not.toHaveBeenCalled();
    expect(returned).toEqual({ ok: false });
    expect(refetchAll).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('⚠️ تسجيل الحكم التمهيدي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
  });

  it('conflict (الجلسة اتعدّلت من حد تاني) → توست تعارض، بترجع {ok:false}', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'conflict:session' } });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePreliminaryJudgment('sess-1', 'حكم بندب خبير', '2026-09-01');
    });

    expect(returned).toEqual({ ok: false });
    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل حقيقي (خطأ RPC عام) → توست فشل، بترجع {ok:false}، مفيش توست نجاح كاذب', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePreliminaryJudgment('sess-1', 'حكم بندب خبير', '2026-09-01');
    });

    expect(returned).toEqual({ ok: false });
    expect(refetchAll).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('تم تسجيل الحكم التمهيدي وجدولة الجلسة القادمة'));
  });
});

// 🆕 (فيكس atomicity + باگ حقيقي، بند 26، 12 سبتمبر 2026): handlePostponeJudgment
// بقى بينادي RPC ذرّية واحدة (record_judgment_postponement) بدل __dbWrite
// INSERT واحد كان بيسيب الجلسة القديمة is_judgment_reserved=true للأبد —
// راجع database/migrations/sql-migrations-phase26/01-postpone-judgment-atomic-rpc.sql.
// نفس منطق تستات handlePreliminaryJudgment فوق بالظبط: مفيش دعم أوفلاين.
describe('useCaseSessions — handlePostponeJudgment', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('نجاح → RPC بتتنادى بالبيانات الصح، recalc، توست نجاح، تسجيل نشاط، refetchAll', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: null });
    const { result, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePostponeJudgment('sess-1', '2026-09-01');
    });

    expect(mockDb.rpc).toHaveBeenCalledWith('record_judgment_postponement', {
      p_session_id: 'sess-1',
      p_case_id: 'case-1',
      p_next_session_date: '2026-09-01',
      p_known_session_updated_at: '2026-07-01T00:00:00.000Z',
    });
    expect(returned).toEqual({ ok: true });
    expect(toast).toHaveBeenCalledWith('⏳ تم تأجيل النطق بالحكم للجلسة القادمة');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تأجيل نطق بالحكم', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('أوفلاين → ممنوع بالكامل، مفيش أي نداء RPC، توست يطلب اتصال إنترنت', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePostponeJudgment('sess-1', '2026-09-01');
    });

    expect(mockDb.rpc).not.toHaveBeenCalled();
    expect(returned).toEqual({ ok: false });
    expect(refetchAll).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('⚠️ تأجيل النطق بالحكم يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
  });

  it('conflict (الجلسة اتعدّلت من حد تاني) → توست تعارض، بترجع {ok:false}', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'conflict:session' } });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePostponeJudgment('sess-1', '2026-09-01');
    });

    expect(returned).toEqual({ ok: false });
    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل حقيقي (خطأ RPC عام) → توست فشل، بترجع {ok:false}، مفيش توست نجاح كاذب', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result, refetchAll } = renderSessionsHook();

    let returned: { ok: boolean } | undefined;
    await act(async () => {
      returned = await result.current.handlePostponeJudgment('sess-1', '2026-09-01');
    });

    expect(returned).toEqual({ ok: false });
    expect(refetchAll).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('تم تأجيل النطق بالحكم'));
  });
});

// 🆕 (طلب "إلغاء حجز النطق بالحكم قبل تسجيل أي حكم"، 12 سبتمبر 2026):
// عملية مختلفة تمامًا عن handleDeleteFinalJudgment تحت — كتابة واحدة بس
// على الجلسة (is_judgment_reserved: false)، من غير أي لمس لـcases.status
// (مفيش حكم اتسجّل أصلاً، فمفيش حالة قضية تترجّع).
describe('useCaseSessions — handleCancelJudgmentReservation', () => {
  it('نجاح → __dbWrite UPDATE واحد بس (is_judgment_reserved:false) بـknownUpdatedAt الصحيح، توست نجاح، تسجيل نشاط، وrefetchAll — من غير أي كتابة على جدول cases', async () => {
    dbWriteMock().mockResolvedValue({ error: null });
    const { result, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    await act(async () => {
      await result.current.handleCancelJudgmentReservation('sess-1');
    });

    expect(dbWriteMock()).toHaveBeenCalledWith({
      type: 'UPDATE', table: 'case_sessions', id: 'sess-1',
      data: { is_judgment_reserved: false },
      knownUpdatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(dbWriteMock()).toHaveBeenCalledTimes(1);
    expect(mockDb.updateSpy).not.toHaveBeenCalledWith('cases', expect.anything());
    expect(toast).toHaveBeenCalledWith('↩️ تم إلغاء حجز النطق بالحكم');
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'إلغاء حجز النطق بالحكم', expect.objectContaining({ entity_type: 'session', entity_id: 'sess-1' }));
    expect(refetchAll).toHaveBeenCalled();
  });

  it('الجلسة مش موجودة في الـstate المحلي → __dbWrite بيتنادى بـknownUpdatedAt: null', async () => {
    dbWriteMock().mockResolvedValue({ error: null });
    const { result } = renderSessionsHook();

    await act(async () => {
      await result.current.handleCancelJudgmentReservation('sess-not-in-state');
    });

    expect(dbWriteMock()).toHaveBeenCalledWith(expect.objectContaining({
      type: 'UPDATE', table: 'case_sessions', id: 'sess-not-in-state', knownUpdatedAt: null,
    }));
  });

  it('تعارض (conflict) → توست تعارض واضح، من غير تسجيل نشاط ولا refetchAll', async () => {
    dbWriteMock().mockResolvedValue({ error: { message: 'conflict' }, conflict: true, offline: false });
    const { result, refetchAll } = renderSessionsHook();

    await act(async () => {
      await result.current.handleCancelJudgmentReservation('sess-1');
    });

    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل حقيقي (error بلا offline) → توست فشل بس، من غير تسجيل نشاط ولا refetchAll', async () => {
    dbWriteMock().mockResolvedValue({ error: { message: 'update failed' } });
    const { result, refetchAll } = renderSessionsHook();

    await act(async () => {
      await result.current.handleCancelJudgmentReservation('sess-1');
    });

    expect(toast).toHaveBeenCalledWith('❌ فشل إلغاء حجز النطق بالحكم، حاول مرة أخرى', true);
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('أوفلاين ومتقيّدة → توست "الإلغاء محفوظ محليًا"، من غير تسجيل نشاط، مع refetchAll', async () => {
    dbWriteMock().mockResolvedValue({ error: null, offline: true, queued: true });
    const { result, refetchAll } = renderSessionsHook();

    await act(async () => {
      await result.current.handleCancelJudgmentReservation('sess-1');
    });

    expect(toast).toHaveBeenCalledWith('📥 تم حفظ إلغاء الحجز محليًا — سيُزامن عند عودة الإنترنت');
    expect(logActivity).not.toHaveBeenCalled();
    expect(refetchAll).toHaveBeenCalled();
  });

  it('cancelingReservationId بيتحط على id الجلسة وقت التنفيذ ويرجع null بعدها', async () => {
    let resolveWrite: (v: { error: null }) => void;
    dbWriteMock().mockReturnValue(new Promise((resolve) => { resolveWrite = resolve; }));
    const { result } = renderSessionsHook();

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleCancelJudgmentReservation('sess-1') as Promise<void>;
    });
    expect(result.current.cancelingReservationId).toBe('sess-1');

    await act(async () => {
      resolveWrite({ error: null });
      await pending;
    });
    expect(result.current.cancelingReservationId).toBeNull();
  });
});

// 🔧 FIX (باگ atomicity، phase23): نفس منطق handleFinalJudgment فوق — RPC
// ذرّية واحدة (undo_final_judgment) بدل كتابتين منفصلتين.
describe('useCaseSessions — handleDeleteFinalJudgment', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  it('نجاح → RPC بتتنادى بالبيانات الصح، onUpdate بـ"نشطة"، deletingJudgment يرجع false، recalc، refetchAll', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: null });
    const { result, onUpdate, refetchAll } = renderSessionsHook();
    act(() => { result.current.setSessions([{ id: 'sess-1', updated_at: '2026-07-01T00:00:00.000Z' } as never]); });

    await act(async () => {
      await result.current.handleDeleteFinalJudgment('sess-1');
    });

    expect(mockDb.rpc).toHaveBeenCalledWith('undo_final_judgment', {
      p_session_id: 'sess-1',
      p_case_id: 'case-1',
      p_known_session_updated_at: '2026-07-01T00:00:00.000Z',
      p_known_case_updated_at: '2026-07-16T10:00:00.000Z',
    });
    expect(onUpdate).toHaveBeenCalledWith('نشطة');
    expect(result.current.deletingJudgment).toBe(false);
    expect(toast).toHaveBeenCalledWith('↩️ تم إلغاء الحكم النهائي، والقضية رجعت للقضايا المتداولة');
    expect(refetchAll).toHaveBeenCalled();
  });

  it('أوفلاين → ممنوع بالكامل، مفيش أي نداء RPC، توست يطلب اتصال إنترنت', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result, onUpdate } = renderSessionsHook();

    await act(async () => {
      await result.current.handleDeleteFinalJudgment('sess-1');
    });

    expect(mockDb.rpc).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.current.deletingJudgment).toBe(false);
    expect(toast).toHaveBeenCalledWith('⚠️ إلغاء الحكم النهائي يتطلب اتصالاً بالإنترنت — أعد المحاولة عند توفر الاتصال', true);
  });

  it('conflict → توست تعارض، onUpdate ما بينادوش، deletingJudgment يرجع false', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'conflict:case' } });
    const { result, onUpdate, refetchAll } = renderSessionsHook();

    await act(async () => {
      await result.current.handleDeleteFinalJudgment('sess-1');
    });

    expect(toast).toHaveBeenCalledWith('⚠️ هذه الجلسة أو القضية عدّلها شخص آخر بعد ما فتحتها — أعد المحاولة', true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.current.deletingJudgment).toBe(false);
    expect(refetchAll).not.toHaveBeenCalled();
  });

  it('فشل حقيقي (خطأ RPC عام) → توست فشل، onUpdate ما بينادوش، مفيش refetchAll', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result, onUpdate, refetchAll } = renderSessionsHook();

    await act(async () => {
      await result.current.handleDeleteFinalJudgment('sess-1');
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(result.current.deletingJudgment).toBe(false);
    expect(refetchAll).not.toHaveBeenCalled();
  });
});
