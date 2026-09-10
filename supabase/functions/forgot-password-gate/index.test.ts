import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  lockedOutByEmail: boolean;
  lockedOutByIp: boolean;
  recordedAttempts: Array<{ email: string; ip_address: string; success: boolean }>;
  profileRows: unknown[];
}

function freshState(): FetchState {
  return {
    lockedOutByEmail: false,
    lockedOutByIp: false,
    recordedAttempts: [],
    profileRows: [
      { user_id: 'user-1', role: 'admin', tenant_id: 'tenant-a', is_active: true, is_locked: false },
    ],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // recordAttempt: POST forgot_password_gate_attempts
    {
      match: (url, init) => new URL(url).pathname === '/rest/v1/forgot_password_gate_attempts' && init?.method === 'POST',
      respond: (_url, init) => {
        state.recordedAttempts.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{}] };
      },
    },
    // isLockedOut byEmail: GET forgot_password_gate_attempts?email=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/forgot_password_gate_attempts' && u.searchParams.has('email');
      },
      respond: () => ({ status: 200, body: state.lockedOutByEmail ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // isLockedOut byIp: GET forgot_password_gate_attempts?ip_address=eq...
    {
      match: (url) => {
        const u = new URL(url);
        return u.pathname === '/rest/v1/forgot_password_gate_attempts' && u.searchParams.has('ip_address');
      },
      respond: () => ({ status: 200, body: state.lockedOutByIp ? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] : [] }),
    },
    // profiles: GET (بحث بالإيميل)
    {
      match: (url) => new URL(url).pathname === '/rest/v1/profiles',
      respond: () => ({ status: 200, body: state.profileRows }),
    },
  ]);
}

let handler: EdgeHandler;
let state: FetchState;

beforeEach(async () => {
  state = freshState();
  vi.stubGlobal('fetch', buildFetchMock(state));
  const box = stubDeno(ENV);
  vi.resetModules();
  await import('./index.ts'); // سطر حرفي — لازم يفضل هنا (شوف تعليق stubDeno في edgeTestUtils.ts)
  if (!box.handler) throw new Error('index.ts ما نداش على Deno.serve وقت الاستيراد');
  handler = box.handler;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function checkReq(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return jsonRequest({ action: 'check', ...body }, headers);
}

describe('forgot-password-gate — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const req = new Request('https://edge-function.local/', { method: 'OPTIONS' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('forgot-password-gate — تحقق أساسي من المدخلات', () => {
  it('action غير "check" → 400 برسالة فيها اسم الأكشن', async () => {
    const res = await handler(jsonRequest({ action: 'doSomethingElse' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف: doSomethingElse');
  });

  it('من غير email → 400', async () => {
    const res = await handler(jsonRequest({ action: 'check' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('يرجى إدخال البريد الإلكتروني');
  });
});

describe('forgot-password-gate — حماية brute-force (isLockedOut)', () => {
  it('lockout بالإيميل (5 محاولات فاشلة أو أكتر، من غير أي هيدر IP) → 429', async () => {
    state.lockedOutByEmail = true;
    const res = await handler(checkReq({ email: 'admin@example.com' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe('محاولات كثيرة، حاول مرة أخرى بعد 15 دقيقة');
    expect(state.recordedAttempts).toEqual([]); // lockout بيحصل قبل أي محاولة تسجيل
  });

  it('lockout بالـ IP (5 محاولات فاشلة أو أكتر مع x-forwarded-for) → 429 حتى لو الإيميل مش مقفول', async () => {
    state.lockedOutByEmail = false;
    state.lockedOutByIp = true;
    const res = await handler(checkReq(
      { email: 'admin@example.com' },
      { 'x-forwarded-for': '9.9.9.9' },
    ));
    expect(res.status).toBe(429);
  });

  it('من غير lockout → بيكمل عادي (200)', async () => {
    const res = await handler(checkReq({ email: 'admin@example.com' }));
    expect(res.status).toBe(200);
  });
});

describe('forgot-password-gate — actionCheck: الحالات الثلاث', () => {
  it('إيميل مش مسجل خالص → status: not_found + تسجيل محاولة فاشلة', async () => {
    state.profileRows = [];
    const res = await handler(checkReq({ email: 'unknown@example.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('not_found');
    expect(state.recordedAttempts).toEqual([{ email: 'unknown@example.com', ip_address: 'unknown', success: false }]);
  });

  it('إيميل مسجل بس role !== admin → status: not_admin + تسجيل محاولة فاشلة', async () => {
    state.profileRows = [{ user_id: 'user-2', role: 'lawyer', tenant_id: 'tenant-a', is_active: true, is_locked: false }];
    const res = await handler(checkReq({ email: 'lawyer@example.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('not_admin');
    expect(state.recordedAttempts).toEqual([{ email: 'lawyer@example.com', ip_address: 'unknown', success: false }]);
  });

  it('إيميل أدمن (role === admin) → status: admin_confirmed + تسجيل محاولة ناجحة', async () => {
    const res = await handler(checkReq({ email: 'admin@example.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('admin_confirmed');
    expect(state.recordedAttempts).toEqual([{ email: 'admin@example.com', ip_address: 'unknown', success: true }]);
  });

  it('أدمن is_locked=true أو is_active=false → برضو admin_confirmed (حالة القفل/التفعيل مالهاش تأثير على القرار)', async () => {
    state.profileRows = [{ user_id: 'user-1', role: 'admin', tenant_id: 'tenant-a', is_active: false, is_locked: true }];
    const res = await handler(checkReq({ email: 'admin@example.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('admin_confirmed');
  });

  it('بيستخدم x-forwarded-for كـ IP لو موجود (أول قيمة في القايمة) وقت تسجيل المحاولة', async () => {
    const res = await handler(checkReq(
      { email: 'admin@example.com' },
      { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    ));
    expect(res.status).toBe(200);
    expect(state.recordedAttempts).toEqual([{ email: 'admin@example.com', ip_address: '1.2.3.4', success: true }]);
  });

  it('الإيميل بيتقص (trim) قبل المعالجة', async () => {
    const res = await handler(checkReq({ email: '  admin@example.com  ' }));
    expect(res.status).toBe(200);
    expect(state.recordedAttempts).toEqual([{ email: 'admin@example.com', ip_address: 'unknown', success: true }]);
  });
});
