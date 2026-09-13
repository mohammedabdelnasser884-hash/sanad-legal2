import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

interface FetchState {
  callerAuthOk: boolean;
  callerAuthBody: { id?: string };
  profile: { is_active?: boolean } | null;
  formById: Record<string, { id: string; file_path: string; file_name: string; download_count: number }>;
  signOk: boolean;
  patchCalls: Array<{ id: string; body: Record<string, unknown> }>;
  patchOk: boolean;
}

function freshState(): FetchState {
  return {
    callerAuthOk: true,
    callerAuthBody: { id: 'caller-1' },
    profile: { is_active: true },
    formById: {
      'form-1': { id: 'form-1', file_path: 'cat-1/form-1.pdf', file_name: 'صحيفة دعوى.pdf', download_count: 3 },
    },
    signOk: true,
    patchCalls: [],
    patchOk: true,
  };
}

function extractRowId(url: string): string {
  const m = url.match(/[?&]id=eq\.([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // getCaller
    {
      match: (url) => url.includes('/auth/v1/user'),
      respond: () => (state.callerAuthOk
        ? { status: 200, body: state.callerAuthBody }
        : { status: 401, body: {} }),
    },
    // getCallerProfile
    {
      match: (url) => url.includes('/rest/v1/profiles') && url.includes('user_id=eq.'),
      respond: () => (state.profile ? { status: 200, body: [state.profile] } : { status: 200, body: [] }),
    },
    // encyclopedia_forms GET by id
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && (init?.method === 'GET' || !init?.method) && /[?&]id=eq\./.test(url),
      respond: (url) => {
        const id = extractRowId(url);
        const row = state.formById[id];
        return { status: 200, body: row ? [row] : [] };
      },
    },
    // encyclopedia_forms PATCH (download_count increment)
    {
      match: (url, init) => url.includes('/rest/v1/encyclopedia_forms') && init?.method === 'PATCH',
      respond: (url, init) => {
        const id = extractRowId(url);
        const parsed = JSON.parse(init!.body as string);
        state.patchCalls.push({ id, body: parsed });
        return state.patchOk
          ? { status: 200, body: [parsed] }
          : { status: 400, body: { message: 'تعذر تحديث العداد' } };
      },
    },
    // storage sign: POST /storage/v1/object/sign/encyclopedia-forms/<path>
    {
      match: (url, init) => url.includes('/storage/v1/object/sign/encyclopedia-forms/') && init?.method === 'POST',
      respond: (url) => {
        const path = url.split('/storage/v1/object/sign/encyclopedia-forms/')[1];
        return state.signOk
          ? { status: 200, body: { signedURL: `/object/sign/encyclopedia-forms/${path}?token=abc` } }
          : { status: 400, body: { message: 'فشل التوقيع' } };
      },
    },
  ]);
}

describe('encyclopedia-download', () => {
  let handler: EdgeHandler;
  let state: FetchState;

  beforeEach(async () => {
    state = freshState();
    const box = stubDeno(ENV);
    vi.stubGlobal('fetch', buildFetchMock(state));
    vi.resetModules();
    await import('./index.ts');
    handler = box.handler!;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('يرفض طلب من غير جلسة صالحة', async () => {
    state.callerAuthOk = false;
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('الجلسة منتهية');
  });

  it('يرفض حساب معطّل — من غير اشتراط سوبر أدمن (متاح لأي مستخدم فعّال)', async () => {
    state.profile = { is_active: false };
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('معطّل');
  });

  it('يقبل مستخدم عادي (مش سوبر أدمن) طالما حسابه فعّال — الفرق الجوهري عن encyclopedia-admin', async () => {
    // مفيش أي حقل is_super_admin في الملف الشخصي هنا أصلاً — الفانكشن
    // منعزلة تمامًا عن مفهوم السوبر أدمن.
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('يرفض طلب من غير form_id', async () => {
    const res = await handler(jsonRequest({}));
    const data = await res.json();
    expect(data.error).toContain('غير محدد');
  });

  it('يرجّع خطأ واضح لو النموذج مش موجود', async () => {
    const res = await handler(jsonRequest({ form_id: 'ghost' }));
    const data = await res.json();
    expect(data.error).toContain('غير موجود');
  });

  it('بينجح: بيرجّع رابط موقّع واسم الملف، وبيزوّد عداد التحميلات بواحد', async () => {
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.url).toBe('https://project.supabase.co/storage/v1/object/sign/encyclopedia-forms/cat-1/form-1.pdf?token=abc');
    expect(data.file_name).toBe('صحيفة دعوى.pdf');
    expect(state.patchCalls).toEqual([{ id: 'form-1', body: { download_count: 4 } }]);
  });

  it('لو توليد الرابط الموقّع فشل، بيرجّع خطأ ومبيحاولش يزوّد العداد', async () => {
    state.signOk = false;
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    const data = await res.json();
    expect(data.error).toContain('تعذر توليد رابط التحميل');
    expect(state.patchCalls.length).toBe(0);
  });

  it('لو تحديث عداد التحميلات فشل، التحميل نفسه ينجح برضو (best-effort)', async () => {
    state.patchOk = false;
    const res = await handler(jsonRequest({ form_id: 'form-1' }));
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.url).toContain('cat-1/form-1.pdf');
  });
});
