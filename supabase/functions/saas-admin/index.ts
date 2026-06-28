// ══════════════════════════════════════════════════════
//  Edge Function: saas-admin
//
//  بوابة السوبر أدمن لإدارة المكاتب (offices-portal.html).
//  كل العمليات بتتم بـ service_role على السيرفر — مفيش
//  credentials حساسة في المتصفح.
//
//  actions:
//   login                 { password }
//     → { token }
//
//   query                 { token, path, method, body }
//     → REST proxy على Supabase (tenants فقط)
//
//   createOfficeWithAdmin { token, tenant, adminEmail, adminName }
//     → { tenant, tempPassword }
//
//  الأمان:
//   - الباسورد بيتقارن من SAAS_ADMIN_PASSWORD (env secret)
//   - الـ token: JWT موقّع بـ SAAS_JWT_SECRET، صلاحيته 8 ساعات
//   - query مسموح بيه على tenants جدول بس (whitelist)
// ══════════════════════════════════════════════════════

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_PASSWORD     = Deno.env.get('SAAS_ADMIN_PASSWORD') ?? 'change-me-in-env';
const JWT_SECRET         = Deno.env.get('SAAS_ADMIN_TOKEN_SECRET') ?? 'saas-admin-secret-change-me';
const TOKEN_TTL_MS       = 8 * 60 * 60 * 1000; // 8 ساعات

// جداول مسموح بيها في الـ query action (whitelist)
const ALLOWED_TABLES = ['tenants'];

// ── helpers ──────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function supabaseRest(path: string, method = 'GET', body: unknown = null) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? data?.error ?? String(r.status));
  return data;
}

// ── JWT بسيط HMAC-SHA256 ─────────────────────────────

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })));
  const key    = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${sig}`;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const [header, body, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`),
    );
    if (!valid) return false;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Date.now()) return false;
    return payload.role === 'saas_admin';
  } catch {
    return false;
  }
}

// توليد كلمة سر عشوائية آمنة
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % chars.length]).join('');
}

// ── actions ──────────────────────────────────────────

/** login: تحقق من الباسورد وأعد token */
async function actionLogin(body: Record<string, string>) {
  const { password } = body;
  if (!password) return json({ error: 'كلمة المرور مطلوبة' }, 400);

  // مقارنة constant-time لتجنب timing attacks
  const enc = new TextEncoder();
  const a = enc.encode(password);
  const b = enc.encode(ADMIN_PASSWORD);

  if (a.length !== b.length) return json({ error: 'كلمة المرور غير صحيحة' }, 401);

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return json({ error: 'كلمة المرور غير صحيحة' }, 401);

  const token = await signToken({ role: 'saas_admin' });
  return json({ token });
}

/** query: REST proxy على جداول الـ whitelist */
async function actionQuery(body: Record<string, unknown>) {
  const { path, method = 'GET', body: reqBody } = body as { path?: string; method?: string; body?: unknown };

  if (!path || typeof path !== 'string') return json({ error: 'path مطلوب' }, 400);

  // تحقق من إن الـ path يبدأ بجدول مسموح بيه
  const tableName = path.split('?')[0].split('/')[0];
  if (!ALLOWED_TABLES.includes(tableName)) {
    return json({ error: `غير مسموح بالوصول لـ "${tableName}"` }, 403);
  }

  // منع DELETE المباشر من الـ proxy (محتاج action خاص)
  if (method === 'DELETE' && !path.includes('id=eq.')) {
    return json({ error: 'حذف بدون فلتر ID غير مسموح' }, 403);
  }

  const data = await supabaseRest(path, method as string, reqBody ?? null);
  return json(data);
}

/** createOfficeWithAdmin: إنشاء مكتب جديد + حساب أدمن */
async function actionCreateOffice(body: Record<string, unknown>) {
  const { tenant, adminEmail, adminName } = body as {
    tenant?: Record<string, unknown>;
    adminEmail?: string;
    adminName?: string;
  };

  if (!tenant?.name) return json({ error: 'اسم المكتب مطلوب' }, 400);
  if (!adminEmail)    return json({ error: 'البريد الإلكتروني للأدمن مطلوب' }, 400);

  // 1. إنشاء الـ tenant في جدول tenants
  const tenantRows = await supabaseRest('tenants', 'POST', tenant);
  const newTenant = Array.isArray(tenantRows) ? tenantRows[0] : tenantRows;
  if (!newTenant?.id) throw new Error('فشل إنشاء سجل المكتب');

  // 2. إنشاء حساب Auth للأدمن
  const tempPassword = generatePassword(14);
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName || adminEmail },
    }),
  });

  if (!authRes.ok) {
    const authErr = await authRes.json().catch(() => ({}));
    // rollback: احذف الـ tenant اللي اتعمل
    await supabaseRest(`tenants?id=eq.${newTenant.id}`, 'DELETE').catch(() => {});
    throw new Error(authErr?.message ?? 'فشل إنشاء حساب الأدمن');
  }

  const authUser = await authRes.json();
  const userId = authUser.id ?? authUser.user?.id;

  // 3. إنشاء profile للمستخدم مرتبط بالـ tenant
  await supabaseRest('profiles', 'POST', {
    user_id: userId,
    tenant_id: newTenant.id,
    full_name: adminName || adminEmail,
    email: adminEmail,
    role: 'admin',
    is_active: true,
    force_password_change: true, // إجباري يغير الباسورد أول دخول
  });

  // 4. إنشاء صف office_settings افتراضي خاص بالمكتب الجديد — لازم يتعمل
  // هنا عشان كل مكتب يكون عنده صف مستقل من أول لحظة (راجع
  // multi-tenant-office-settings-migration.sql)، وميشاركش صف مكتب تاني
  // أو يرجع فاضي بسبب عدم وجود صف خالص له.
  await supabaseRest('office_settings', 'POST', {
    tenant_id: newTenant.id,
    name: tenant?.name,
  }).catch(() => { /* لو فشل، لوحة الإعدادات هتنشئه تلقائيًا أول مرة يحفظ فيها الأدمن */ });

  return json({ tenant: newTenant, tempPassword });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, token, ...rest } = body;

    // action بدون توثيق
    if (action === 'login') return actionLogin(rest as Record<string, string>);

    // باقي الـ actions محتاجة token صالح
    if (!token || typeof token !== 'string') {
      return json({ error: 'الجلسة مطلوبة' }, 401);
    }
    const valid = await verifyToken(token);
    if (!valid) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    switch (action) {
      case 'query':                return actionQuery(rest);
      case 'createOfficeWithAdmin': return actionCreateOffice(rest);
      default:                     return json({ error: `action غير معروف: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    return json({ error: msg }, 500);
  }
});
