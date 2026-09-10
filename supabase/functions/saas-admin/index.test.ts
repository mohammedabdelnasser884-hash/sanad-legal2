import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stubDeno, createRoutedFetch, jsonRequest, type EdgeHandler } from '../_shared/edgeTestUtils';

// ── بيئة ثابتة للتست (قيم وهمية، مش أسرار حقيقية) ──────────────
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  SAAS_ADMIN_PASSWORD: 'correct-horse-battery-staple',
  SAAS_ADMIN_TOKEN_SECRET: 'test-jwt-secret',
};

/** حالة قابلة للتعديل من كل تست عشان تتحكم في رد fetch المزيّف */
interface FetchState {
  loginAttemptRows: Array<{ id: number }>;
  recordedAttempts: Array<{ ip_address: string; success: boolean }>;
  tenantsPostResult: unknown;
  authUsersPostOk: boolean;
  authUsersPostBody: unknown;
  profilesPostOk: boolean;
  officeSettingsPostOk: boolean;
  tenantsDeleteCalls: string[];
  queryTableRows: unknown;
  // ── resetOnboardingLock / getOnboardingStatuses ──
  tenantAdminLookupRows: Array<{ user_id: string; email?: string }>;
  onboardingLockPatchCalls: Array<{ url: string; body: Record<string, unknown> }>;
  onboardingStatusRows: unknown;
  // ── resetAdminPassword ──
  authUserPasswordPutOk: boolean;
  authUserPasswordPutCalls: Array<{ url: string; body: Record<string, unknown> }>;
  // ── getPaymentHistory / issueInvoice (خطة المدفوعات والفواتير) ──
  paymentHistoryRows: unknown;
  issueInvoicePaymentRows: Array<{ id: string; tenant_id: string; invoice_number: string | null; [k: string]: unknown }>;
  nextInvoiceNumberResult: string;
  paymentPatchCalls: Array<{ url: string; body: Record<string, unknown> }>;
  // ── confirmPayment (خطة المدفوعات والفواتير — تعديل 6/9 شهور + payment_date/transaction_details) ──
  confirmPaymentRecentPaymentRows: Array<{ created_at: string }>;
  confirmPaymentPlanLimitsRows: Array<{ max_users: number | null; max_active_cases: number | null; max_client_portal_accounts: number | null }>;
  confirmPaymentClientsRows: Array<{ id: string }>;
  confirmPaymentProfilesRows: Array<{ user_id: string }>;
  confirmPaymentCasesRows: Array<{ id: string }>;
  tenantPatchCalls: Array<{ url: string; body: Record<string, unknown> }>;
  paymentPostCalls: Array<Record<string, unknown>>;
}

function freshState(): FetchState {
  return {
    loginAttemptRows: [],
    recordedAttempts: [],
    tenantsPostResult: [{ id: 'tenant-new-1', name: 'مكتب تجريبي' }],
    authUsersPostOk: true,
    authUsersPostBody: { id: 'auth-user-1' },
    profilesPostOk: true,
    officeSettingsPostOk: true,
    tenantsDeleteCalls: [],
    queryTableRows: [{ id: 'tenant-1', name: 'تينانت 1' }],
    tenantAdminLookupRows: [{ user_id: 'admin-user-1', email: 'admin@example.com' }],
    onboardingLockPatchCalls: [],
    onboardingStatusRows: [
      { tenant_id: 'tenant-1', onboarding_status: 'pending_verification', onboarding_frozen: false, onboarding_locked_until: null, onboarding_lockout_tier: 0 },
    ],
    authUserPasswordPutOk: true,
    authUserPasswordPutCalls: [],
    paymentHistoryRows: [
      { id: 'payment-2', plan: 'office', amount_egp: 400, payment_method: 'cash', subscription_months: 1, invoice_number: null, created_at: '2026-09-05T00:00:00.000Z' },
      { id: 'payment-1', plan: 'lawyer', amount_egp: 250, payment_method: 'cash', subscription_months: 1, invoice_number: 'INV-0001', created_at: '2026-08-05T00:00:00.000Z' },
    ],
    issueInvoicePaymentRows: [
      { id: 'payment-2', tenant_id: 'tenant-1', plan: 'office', amount_egp: 400, invoice_number: null },
    ],
    nextInvoiceNumberResult: 'INV-0042',
    paymentPatchCalls: [],
    confirmPaymentRecentPaymentRows: [],
    confirmPaymentPlanLimitsRows: [{ max_users: null, max_active_cases: null, max_client_portal_accounts: null }],
    confirmPaymentClientsRows: [],
    confirmPaymentProfilesRows: [],
    confirmPaymentCasesRows: [],
    tenantPatchCalls: [],
    paymentPostCalls: [],
  };
}

function buildFetchMock(state: FetchState) {
  return createRoutedFetch([
    // isLockedOut: GET saas_admin_login_attempts?...
    {
      match: (url, init) => url.includes('/rest/v1/saas_admin_login_attempts') && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.loginAttemptRows }),
    },
    // recordAttempt: POST saas_admin_login_attempts
    {
      match: (url, init) => url.includes('/rest/v1/saas_admin_login_attempts') && init?.method === 'POST',
      respond: (_url, init) => {
        state.recordedAttempts.push(JSON.parse(init!.body as string));
        return { status: 201, body: [{ id: 1 }] };
      },
    },
    // actionCreateOffice: POST tenants
    {
      match: (url, init) => url.includes('/rest/v1/tenants') && init?.method === 'POST',
      respond: () => ({ status: 201, body: state.tenantsPostResult }),
    },
    // actionCreateOffice rollback: DELETE tenants?id=eq....
    {
      match: (url, init) => url.includes('/rest/v1/tenants') && init?.method === 'DELETE',
      respond: (url) => {
        state.tenantsDeleteCalls.push(url);
        return { status: 204, body: {} };
      },
    },
    // actionCreateOffice: POST auth/v1/admin/users
    {
      match: (url, init) => url.includes('/auth/v1/admin/users') && init?.method === 'POST',
      respond: () => (state.authUsersPostOk
        ? { status: 200, body: state.authUsersPostBody }
        : { status: 400, body: { message: 'فشل إنشاء المستخدم في Auth' } }),
    },
    // actionCreateOffice: POST profiles
    {
      match: (url, init) => url.includes('/rest/v1/profiles') && init?.method === 'POST',
      respond: () => (state.profilesPostOk
        ? { status: 201, body: [{ user_id: 'auth-user-1' }] }
        : { status: 400, body: { message: 'فشل إنشاء profile' } }),
    },
    // actionResetOnboardingLock: GET profiles?tenant_id=eq....&role=eq.admin (تدوير على الأدمن)
    {
      match: (url, init) =>
        url.includes('/rest/v1/profiles') &&
        url.includes('tenant_id=eq.') &&
        url.includes('role=eq.admin') &&
        (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.tenantAdminLookupRows }),
    },
    // actionResetOnboardingLock: PATCH profiles?user_id=eq.... (تصفير القفل/التجميد)
    {
      match: (url, init) =>
        url.includes('/rest/v1/profiles') && url.includes('user_id=eq.') && init?.method === 'PATCH',
      respond: (url, init) => {
        state.onboardingLockPatchCalls.push({ url, body: JSON.parse(init!.body as string) });
        return { status: 200, body: [{}] };
      },
    },
    // actionGetOnboardingStatuses: GET profiles?role=eq.admin&select=... (من غير tenant_id — أعمدة ضيّقة بس)
    {
      match: (url, init) =>
        url.includes('/rest/v1/profiles') &&
        url.includes('role=eq.admin') &&
        !url.includes('tenant_id=eq.') &&
        (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.onboardingStatusRows }),
    },
    // actionCreateOffice: POST office_settings
    {
      match: (url, init) => url.includes('/rest/v1/office_settings') && init?.method === 'POST',
      respond: () => (state.officeSettingsPostOk
        ? { status: 201, body: [{ tenant_id: 'tenant-new-1' }] }
        : { status: 400, body: { message: 'فشل إنشاء office_settings' } }),
    },
    // actionResetAdminPassword: PUT auth/v1/admin/users/{id}
    {
      match: (url, init) => url.includes('/auth/v1/admin/users/') && init?.method === 'PUT',
      respond: (url, init) => {
        state.authUserPasswordPutCalls.push({ url, body: JSON.parse(init!.body as string) });
        return state.authUserPasswordPutOk
          ? { status: 200, body: { id: 'admin-user-1' } }
          : { status: 400, body: { message: 'فشل تحديث كلمة السر' } };
      },
    },
    // actionQuery: أي جدول مسموح به (tenants/tenant_invoices) GET
    {
      match: (url, init) => (url.includes('/rest/v1/tenants') || url.includes('/rest/v1/tenant_invoices')) && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.queryTableRows }),
    },
    // actionConfirmPayment: GET tenant_subscription_payments?tenant_id=eq...&limit=1 (فحص الدفع المكرر خلال 5 دقايق)
    {
      match: (url, init) =>
        url.includes('/rest/v1/tenant_subscription_payments') &&
        url.includes('tenant_id=eq.') &&
        url.includes('limit=1') &&
        (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.confirmPaymentRecentPaymentRows }),
    },
    // actionGetPaymentHistory: GET tenant_subscription_payments?tenant_id=eq...&order=created_at.desc (بدون limit)
    {
      match: (url, init) =>
        url.includes('/rest/v1/tenant_subscription_payments') &&
        url.includes('tenant_id=eq.') &&
        !url.includes('limit=') &&
        (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.paymentHistoryRows }),
    },
    // actionConfirmPayment: POST tenant_subscription_payments (تسجيل الدفعة) — بيرجّع نفس الصف المبعوت + id
    {
      match: (url, init) => url.includes('/rest/v1/tenant_subscription_payments') && init?.method === 'POST',
      respond: (_url, init) => {
        const body = JSON.parse(init!.body as string);
        state.paymentPostCalls.push(body);
        return { status: 201, body: [{ id: `payment-test-${state.paymentPostCalls.length}`, ...body }] };
      },
    },
    // actionConfirmPayment: GET plan_limits?plan_key=eq....
    {
      match: (url, init) => url.includes('/rest/v1/plan_limits') && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.confirmPaymentPlanLimitsRows }),
    },
    // actionConfirmPayment: GET clients?tenant_id=eq....&select=id
    {
      match: (url, init) => url.includes('/rest/v1/clients') && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.confirmPaymentClientsRows }),
    },
    // actionConfirmPayment: GET profiles?tenant_id=eq....&select=user_id (عدّ حسابات المكتب — بدون role=eq.admin)
    {
      match: (url, init) =>
        url.includes('/rest/v1/profiles') &&
        url.includes('select=user_id') &&
        (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.confirmPaymentProfilesRows }),
    },
    // actionConfirmPayment: GET cases?tenant_id=eq....&deleted_at=is.null&select=id
    {
      match: (url, init) => url.includes('/rest/v1/cases') && (!init?.method || init.method === 'GET'),
      respond: () => ({ status: 200, body: state.confirmPaymentCasesRows }),
    },
    // actionConfirmPayment: PATCH tenants?id=eq.... (تحديث الباقة/الميعاد)
    {
      match: (url, init) => url.includes('/rest/v1/tenants') && url.includes('id=eq.') && init?.method === 'PATCH',
      respond: (url, init) => {
        state.tenantPatchCalls.push({ url, body: JSON.parse(init!.body as string) });
        return { status: 200, body: [{}] };
      },
    },
    // actionIssueInvoice: GET tenant_subscription_payments?id=eq....
    {
      match: (url, init) =>
        url.includes('/rest/v1/tenant_subscription_payments') &&
        url.includes('id=eq.') &&
        (!init?.method || init.method === 'GET'),
      respond: (url) => {
        const id = new URL(url).searchParams.get('id')?.replace('eq.', '');
        const row = state.issueInvoicePaymentRows.find((p) => p.id === id) ?? null;
        return { status: 200, body: row ? [row] : [] };
      },
    },
    // actionIssueInvoice: POST rpc/next_tenant_invoice_number
    {
      match: (url, init) => url.includes('/rest/v1/rpc/next_tenant_invoice_number') && init?.method === 'POST',
      respond: () => ({ status: 200, body: state.nextInvoiceNumberResult }),
    },
    // actionIssueInvoice: PATCH tenant_subscription_payments?id=eq.... (تسجيل رقم الفاتورة)
    {
      match: (url, init) => url.includes('/rest/v1/tenant_subscription_payments') && init?.method === 'PATCH',
      respond: (url, init) => {
        state.paymentPatchCalls.push({ url, body: JSON.parse(init!.body as string) });
        return { status: 200, body: [{}] };
      },
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
  vi.useRealTimers();
});

async function login(password: string, extraHeaders: Record<string, string> = {}) {
  const req = jsonRequest({ action: 'login', password }, extraHeaders);
  return handler(req);
}

describe('saas-admin — CORS preflight', () => {
  it('OPTIONS بيرجع رد فاضي بهيدرز CORS من غير ما يدخل منطق الأكشن', async () => {
    const req = new Request('https://edge-function.local/', { method: 'OPTIONS' });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('saas-admin — تسجيل الدخول (actionLogin)', () => {
  it('من غير password → 400', async () => {
    const res = await login('');
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('كلمة المرور مطلوبة');
  });

  it('IP معروف (x-forwarded-for) اتعمله lockout (5 محاولات فاشلة أو أكتر) → 429 حتى لو الباسورد صح', async () => {
    state.loginAttemptRows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const res = await login(ENV.SAAS_ADMIN_PASSWORD, { 'x-forwarded-for': '9.9.9.9' });
    expect(res.status).toBe(429);
  });

  it('IP مجهول (من غير أي هيدر IP) → الـ lockout بيتجاهل عمدًا (سلوك موثّق في الكود نفسه)، حتى لو فيه محاولات فاشلة كتير مسجّلة', async () => {
    state.loginAttemptRows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const res = await login(ENV.SAAS_ADMIN_PASSWORD);
    expect(res.status).toBe(200); // مش 429 — الكود بيستثني IP='unknown' من فحص الـ lockout عمدًا
  });

  it('باسورد غلط → 401 + تسجيل محاولة فاشلة', async () => {
    const res = await login('wrong-password');
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('كلمة المرور غير صحيحة');
    expect(state.recordedAttempts).toEqual([{ ip_address: 'unknown', success: false }]);
  });

  it('باسورد صح → 200 + token + تسجيل محاولة ناجحة', async () => {
    const res = await login(ENV.SAAS_ADMIN_PASSWORD);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.')).toHaveLength(3); // JWT: header.payload.signature
    expect(state.recordedAttempts).toEqual([{ ip_address: 'unknown', success: true }]);
  });

  it('بيستخدم x-forwarded-for كـ IP لو موجود (أول قيمة في القايمة)', async () => {
    const res = await login('wrong-password', { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(res.status).toBe(401);
    expect(state.recordedAttempts).toEqual([{ ip_address: '1.2.3.4', success: false }]);
  });
});

describe('saas-admin — بوابة التحقق من التوكن للعمليات المحمية', () => {
  it('action=query من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'query', path: 'tenants' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة');
  });

  it('token مش شكله صح (مش JWT) → 401', async () => {
    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token: 'garbage-not-a-jwt' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('token صالح ومنتهي (بعد 8 ساعات من إصداره) → 401', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T00:00:00.000Z'));
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();

    // نتخطى 8 ساعات + ثانية (TOKEN_TTL_MS في الكود الفعلي)
    vi.setSystemTime(new Date('2026-07-16T08:00:01.000Z'));

    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة منتهية، سجّل الدخول من جديد');
  });

  it('token صالح وسليم → بيكمل للأكشن المطلوب', async () => {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();

    const res = await handler(jsonRequest({ action: 'query', path: 'tenants', token }));
    expect(res.status).toBe(200);
  });
});

describe('saas-admin — action=query (REST proxy بـ whitelist)', () => {
  async function queryWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'query', token, ...body }));
  }

  it('من غير path → 400', async () => {
    const res = await queryWithToken({});
    expect(res.status).toBe(400);
  });

  it('جدول برة الـ whitelist (مثلاً profiles) → 403', async () => {
    const res = await queryWithToken({ path: 'profiles?select=*' });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('غير مسموح بالوصول لـ "profiles"');
  });

  it('DELETE من غير فلتر id=eq. → 403 (منع حذف جماعي عن طريق البروكسي)', async () => {
    const res = await queryWithToken({ path: 'tenants', method: 'DELETE' });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('حذف بدون فلتر ID غير مسموح');
  });

  it('DELETE بفلتر id=eq. على جدول مسموح → بيكمل عادي', async () => {
    const res = await queryWithToken({ path: 'tenants?id=eq.tenant-1', method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('جدول مسموح (tenants) → 200 وبيرجع البيانات زي ما هي', async () => {
    const res = await queryWithToken({ path: 'tenants?select=*' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(state.queryTableRows);
  });
});

describe('saas-admin — action=createOfficeWithAdmin', () => {
  async function createOfficeWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'createOfficeWithAdmin', token, ...body }));
  }

  it('من غير اسم مكتب (tenant.name) → 400', async () => {
    const res = await createOfficeWithToken({ tenant: {}, adminEmail: 'a@b.com' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('اسم المكتب مطلوب');
  });

  it('من غير adminEmail → 400', async () => {
    const res = await createOfficeWithToken({ tenant: { name: 'مكتب جديد' } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('البريد الإلكتروني للأدمن مطلوب');
  });

  it('مسار النجاح الكامل → بيرجع tenant + tempPassword، وبينشئ auth user + profile + office_settings', async () => {
    const res = await createOfficeWithToken({
      tenant: { name: 'مكتب جديد' },
      adminEmail: 'admin@newoffice.com',
      adminName: 'أدمن المكتب',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenant).toEqual(state.tenantsPostResult[0]);
    expect(typeof data.tempPassword).toBe('string');
    expect(data.tempPassword.length).toBeGreaterThanOrEqual(14);
    expect(state.tenantsDeleteCalls).toEqual([]); // مفيش rollback حصل
  });

  it('فشل إنشاء حساب Auth → بيعمل rollback (حذف الـ tenant) فعليًا، والرد بيرجع JSON لطيف بحالة 500', async () => {
    // ✅ الباگ اتصلح (17 يوليو 2026): case 'createOfficeWithAdmin' بقى
    // `return await actionCreateOffice(rest);` جوه try/catch — أي استثناء
    // داخلي بقى بيتلقط صح ويرجع كـ Response بحالة 500 بدل rejection خام.
    state.authUsersPostOk = false;
    const res = await createOfficeWithToken({
      tenant: { name: 'مكتب جديد' },
      adminEmail: 'admin@newoffice.com',
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('فشل إنشاء المستخدم في Auth');
    // الـ rollback (حذف الـ tenant) بيحصل جوه actionCreateOffice قبل
    // الـ throw مباشرة، فبيتنفذ فعليًا وبيوصل الرد اللطيف كمان
    expect(state.tenantsDeleteCalls.length).toBe(1);
    expect(state.tenantsDeleteCalls[0]).toContain('tenant-new-1');
  });
});

describe('saas-admin — action=resetOnboardingLock', () => {
  async function resetLockWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'resetOnboardingLock', token, ...body }));
  }

  it('من غير token → 401 (نفس بوابة التحقق العامة لباقي الأكشنز المحمية)', async () => {
    const res = await handler(jsonRequest({ action: 'resetOnboardingLock', tenantId: 'tenant-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('الجلسة مطلوبة');
  });

  it('من غير tenantId → 400', async () => {
    const res = await resetLockWithToken({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('tenantId مطلوب');
  });

  it('مفيش حساب أدمن مرتبط بالـtenant ده → 404، ومفيش أي PATCH بيتنفذ', async () => {
    state.tenantAdminLookupRows = [];
    const res = await resetLockWithToken({ tenantId: 'tenant-ghost' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('تعذر العثور على حساب أدمن مرتبط بهذا المكتب');
    expect(state.onboardingLockPatchCalls).toEqual([]);
  });

  it('مسار النجاح → بيدوّر على الأدمن بالـtenantId، يصفّر القفل/التجميد الثلاثة، ويرجع { ok: true }', async () => {
    state.tenantAdminLookupRows = [{ user_id: 'admin-user-9' }];
    const res = await resetLockWithToken({ tenantId: 'tenant-9' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });

    expect(state.onboardingLockPatchCalls).toHaveLength(1);
    expect(state.onboardingLockPatchCalls[0].url).toContain('user_id=eq.admin-user-9');
    expect(state.onboardingLockPatchCalls[0].body).toEqual({
      onboarding_lockout_tier: 0,
      onboarding_locked_until: null,
      onboarding_frozen: false,
    });
  });
});

describe('saas-admin — action=resetAdminPassword', () => {
  async function resetPasswordWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'resetAdminPassword', token, ...body }));
  }

  it('من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'resetAdminPassword', tenantId: 'tenant-1' }));
    expect(res.status).toBe(401);
  });

  it('من غير tenantId → 400', async () => {
    const res = await resetPasswordWithToken({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('tenantId مطلوب');
  });

  it('مفيش حساب أدمن مرتبط بالـtenant ده → 404، ومفيش أي PUT بيتنفذ', async () => {
    state.tenantAdminLookupRows = [];
    const res = await resetPasswordWithToken({ tenantId: 'tenant-ghost' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('تعذر العثور على حساب أدمن مرتبط بهذا المكتب');
    expect(state.authUserPasswordPutCalls).toEqual([]);
  });

  it('فشل تحديث الباسورد في Auth → بيرجّع رسالة الخطأ من Auth API', async () => {
    state.authUserPasswordPutOk = false;
    const res = await resetPasswordWithToken({ tenantId: 'tenant-9' });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('فشل تحديث كلمة السر');
  });

  it('مسار النجاح → بيدوّر على الأدمن بالـtenantId، يحدّث كلمة السر في Auth، ويرجع { newPassword, adminEmail }', async () => {
    state.tenantAdminLookupRows = [{ user_id: 'admin-user-9', email: 'owner@example.com' }];
    const res = await resetPasswordWithToken({ tenantId: 'tenant-9' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.adminEmail).toBe('owner@example.com');
    expect(typeof data.newPassword).toBe('string');
    expect(data.newPassword.length).toBe(14);

    expect(state.authUserPasswordPutCalls).toHaveLength(1);
    expect(state.authUserPasswordPutCalls[0].url).toContain('/auth/v1/admin/users/admin-user-9');
    expect(state.authUserPasswordPutCalls[0].body).toEqual({ password: data.newPassword });
  });
});

describe('saas-admin — action=getOnboardingStatuses', () => {
  async function getStatusesWithToken() {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'getOnboardingStatuses', token }));
  }

  it('من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'getOnboardingStatuses' }));
    expect(res.status).toBe(401);
  });

  it('token صالح → 200 وبيرجع صفوف onboarding الأدمنز زي ما هي (أعمدة ضيّقة بس)', async () => {
    const res = await getStatusesWithToken();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(state.onboardingStatusRows);
  });

  it('مفيش صفوف (كل المكاتب completed) → مصفوفة فاضية، مش خطأ', async () => {
    state.onboardingStatusRows = [];
    const res = await getStatusesWithToken();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

describe('saas-admin — action=confirmPayment، تحقق subscriptionMonths (خطة المدفوعات والفواتير)', () => {
  async function confirmPaymentWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'confirmPayment', token, ...body }));
  }

  it('مدة اشتراك غير معروفة (مش 1/3/6/9/12) → 400 قبل أي نداء لقاعدة البيانات', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'cash', subscriptionMonths: 7,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('مدة اشتراك غير معروفة');
  });

  it.each([1, 3, 6, 9, 12])('subscriptionMonths=%i مقبولة (بعد توسيع 6/9، ملاحظات جيمي 10 سبتمبر)', async (months) => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'cash', subscriptionMonths: months,
    });
    expect(res.status).not.toBe(400);
  });

  it('طريقة دفع غير معروفة (مش cash/e_wallet/bank_transfer) → 400', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'vodafone_cash', subscriptionMonths: 1,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('طريقة الدفع');
  });

  it.each(['cash', 'e_wallet', 'bank_transfer'])('paymentMethod=%s مقبولة', async (method) => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: method, subscriptionMonths: 1,
    });
    expect(res.status).not.toBe(400);
  });

  it('transactionDetails اختياري — من غيره الطلب ينجح عادي (مثلاً كاش)', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'cash', subscriptionMonths: 1,
    });
    expect(res.status).not.toBe(400);
    const data = await res.json();
    expect(data.payment?.transaction_details ?? null).toBeNull();
  });

  it('transactionDetails لو اتبعت بيتسجل زي ما هو على صف الدفعة', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'bank_transfer',
      subscriptionMonths: 1, transactionDetails: 'تحويل انستاباي رقم 123456',
    });
    const data = await res.json();
    expect(data.payment?.transaction_details).toBe('تحويل انستاباي رقم 123456');
  });

  it('paymentDate اختياري — لو متبعتش بياخد تاريخ اليوم', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'cash', subscriptionMonths: 1,
    });
    const data = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(data.payment?.payment_date).toBe(today);
  });

  it('paymentDate لو اتبعت بتتسجل زي ما هي (منفصلة عن period_start/period_end)', async () => {
    const res = await confirmPaymentWithToken({
      tenantId: 'tenant-1', plan: 'lawyer', amountEgp: 250, paymentMethod: 'cash',
      subscriptionMonths: 1, paymentDate: '2026-09-08',
    });
    const data = await res.json();
    expect(data.payment?.payment_date).toBe('2026-09-08');
  });
});

describe('saas-admin — action=getPaymentHistory (خطة المدفوعات والفواتير)', () => {
  async function getHistoryWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'getPaymentHistory', token, ...body }));
  }

  it('من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'getPaymentHistory', tenantId: 'tenant-1' }));
    expect(res.status).toBe(401);
  });

  it('من غير tenantId → 400', async () => {
    const res = await getHistoryWithToken({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('tenantId مطلوب');
  });

  it('مسار النجاح → بيرجع دفعات المكتب زي ما هي (الأحدث أولًا حسب الترتيب المطلوب في الاستعلام)', async () => {
    const res = await getHistoryWithToken({ tenantId: 'tenant-1' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(state.paymentHistoryRows);
  });

  it('مفيش دفعات لهذا المكتب → مصفوفة فاضية، مش خطأ', async () => {
    state.paymentHistoryRows = [];
    const res = await getHistoryWithToken({ tenantId: 'tenant-جديد' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

describe('saas-admin — action=issueInvoice (خطة المدفوعات والفواتير)', () => {
  async function issueInvoiceWithToken(body: Record<string, unknown>) {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    return handler(jsonRequest({ action: 'issueInvoice', token, ...body }));
  }

  it('من غير token → 401', async () => {
    const res = await handler(jsonRequest({ action: 'issueInvoice', paymentId: 'payment-2' }));
    expect(res.status).toBe(401);
  });

  it('من غير paymentId → 400', async () => {
    const res = await issueInvoiceWithToken({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('paymentId مطلوب');
  });

  it('دفعة غير موجودة → 404', async () => {
    const res = await issueInvoiceWithToken({ paymentId: 'payment-ghost' });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('الدفعة غير موجودة');
  });

  it('الدفعة اتطبعت قبل كده (invoice_number موجود) → بيرجّع نفس الرقم القديم من غير أي RPC أو PATCH', async () => {
    state.issueInvoicePaymentRows = [
      { id: 'payment-1', tenant_id: 'tenant-1', invoice_number: 'INV-0001' },
    ];
    const res = await issueInvoiceWithToken({ paymentId: 'payment-1' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invoiceNumber).toBe('INV-0001');
    expect(data.payment.invoice_number).toBe('INV-0001');
    expect(state.paymentPatchCalls).toEqual([]); // مفيش PATCH حصل، والرقم القديم اتحافظ عليه
  });

  it('أول طباعة (invoice_number = NULL) → بياخد رقم جديد من next_tenant_invoice_number() ويسجّله على الدفعة', async () => {
    const res = await issueInvoiceWithToken({ paymentId: 'payment-2' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invoiceNumber).toBe('INV-0042');
    expect(data.payment.invoice_number).toBe('INV-0042');

    expect(state.paymentPatchCalls).toHaveLength(1);
    expect(state.paymentPatchCalls[0].url).toContain('id=eq.payment-2');
    expect(state.paymentPatchCalls[0].body).toEqual({ invoice_number: 'INV-0042' });
  });
});

describe('saas-admin — action غير معروف', () => {
  it('action مش من ضمن query/createOfficeWithAdmin → 400', async () => {
    const loginRes = await login(ENV.SAAS_ADMIN_PASSWORD);
    const { token } = await loginRes.json();
    const res = await handler(jsonRequest({ action: 'deleteEverything', token }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('action غير معروف: deleteEverything');
  });
});
