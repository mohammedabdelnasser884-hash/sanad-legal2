// ══════════════════════════════════════════════════════
//  Edge Function: client-portal-api
//
//  بوابة موكلي سَنَد — كل طلبات client-portal.html بتعدّي هنا.
//  مفيش اتصال مباشر بـ Supabase من المتصفح: التحقق من PIN وجلب
//  البيانات كله على السيرفر باستخدام service_role.
//
//  actions:
//   find              { contact }               → { client_name }
//   verify            { contact, pin }          → { token, client }
//   getCases          { token }                 → { data: Case[] }
//   getClient         { token }                 → { data: Client }
//   getCaseFees       { token, caseId }         → { data: Fee[] }
//   getCaseSessions   { token, caseId }         → { data: Session[] }
//   getCaseDocuments  { token, caseId }         → { data: Doc[] }
//   getMessages       { token }                 → { data: Message[] }
//   sendMessage       { token, content }        → { ok: true }
//
//  الـ token: JWT موقّع بـ JWT_SECRET يحمل { client_id, tenant_id }
//  صلاحيته 7 أيام — مش JWT خاص بـ Supabase Auth.
// ══════════════════════════════════════════════════════

// ── CORS مدمج هنا بدل الاستيراد من ../_shared/cors.ts ──
// (عشان النشر من لوحة Supabase مباشرة كملف واحد من غير مشاكل استيراد)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET         = Deno.env.get('CLIENT_PORTAL_TOKEN_SECRET') ?? 'sanad-portal-secret-change-me';
const TOKEN_TTL_MS       = 7 * 24 * 60 * 60 * 1000; // 7 أيام

// ── حماية من تجربة كل أرقام PIN (brute-force) ─────────
// بعد MAX_ATTEMPTS محاولة فاشلة خلال WINDOW_MINUTES دقيقة على نفس
// الـ contact (أو نفس الـ IP) يتم قفل الدخول مؤقتًا لمدة LOCKOUT_MINUTES.
const MAX_ATTEMPTS      = 5;
const WINDOW_MINUTES     = 15;
const LOCKOUT_MINUTES    = 15;

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** هل الـ contact أو IP ده مقفول حاليًا بسبب محاولات فاشلة كتير؟ */
async function isLockedOut(contact: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const [byContact, byIp] = await Promise.all([
    rest(`portal_pin_attempts?contact=eq.${encodeURIComponent(contact)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`),
    ip !== 'unknown'
      ? rest(`portal_pin_attempts?ip_address=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`)
      : Promise.resolve([]),
  ]);
  return byContact.length >= MAX_ATTEMPTS || byIp.length >= MAX_ATTEMPTS;
}

async function recordAttempt(contact: string, ip: string, success: boolean) {
  try {
    await rest('portal_pin_attempts', 'POST', { contact, ip_address: ip, success });
  } catch {
    // تسجيل المحاولة لا يجب أن يُسقط الطلب لو فشل لأي سبب
  }
}

// ── helpers ──────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function rest(path: string, method = 'GET', body: unknown = null) {
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

// ── JWT بسيط بدون مكتبة خارجية (HMAC-SHA256) ────────

function b64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signToken(payload: Record<string, unknown>): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })));
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`)));
  return `${header}.${body}.${sig}`;
}

async function verifyToken(token: string): Promise<{ client_id: string; tenant_id: string } | null> {
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
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Date.now()) return null;
    return { client_id: payload.client_id, tenant_id: payload.tenant_id };
  } catch {
    return null;
  }
}

async function requireToken(token?: string) {
  if (!token) return null;
  return verifyToken(token);
}

// ── actions ──────────────────────────────────────────

/** بيخفي جزء من الاسم بحيث ميتسربش الاسم الكامل لأي زائر بدون تسجيل دخول */
function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (!parts.length) return '';
  const first = parts[0];
  const maskedRest = parts.slice(1).map(p => (p[0] ?? '') + '*'.repeat(Math.max(p.length - 1, 1)));
  return [first, ...maskedRest].join(' ');
}

/** find: ابحث عن موكل بالهاتف أو الإيميل */
async function actionFind(body: Record<string, string>, ip: string) {
  const contact = (body.contact ?? '').trim();
  if (!contact) return json({ error: 'أدخل رقم الهاتف' }, 400);

  // نفس حماية محاولات verify: نمنع تجربة أرقام كتير بسرعة لاكتشاف
  // أرقام عملاء حقيقيين (enumeration)
  if (await isLockedOut(`find:${contact}`, ip)) {
    return json({ error: 'محاولات كثيرة، حاول مرة أخرى بعد بعض الوقت' }, 429);
  }

  // ابحث في clients بـ phone أو email
  const rows = await rest(
    `clients?or=(phone.eq.${encodeURIComponent(contact)},email.eq.${encodeURIComponent(contact)})&select=id,full_name,phone,email,tenant_id&limit=1`,
  );
  if (!rows.length) {
    await recordAttempt(`find:${contact}`, ip, false);
    return json({ error: 'لم يُعثر على حساب بهذا الرقم' }, 404);
  }
  // لا نُرجع الاسم كاملًا بدون تسجيل دخول — جزء من الاسم فقط
  // كافٍ لتأكيد الحساب الصحيح للمستخدم الشرعي.
  return json({ client_name: maskName(rows[0].full_name) });
}

/** verify: تحقق من PIN وأعد token */
async function actionVerify(body: Record<string, string>, ip: string) {
  const contact = (body.contact ?? '').trim();
  const pin     = (body.pin ?? '').trim();
  if (!contact || !pin) return json({ error: 'بيانات ناقصة' }, 400);

  if (await isLockedOut(contact, ip)) {
    return json({ error: `محاولات كثيرة فاشلة، حاول مرة أخرى بعد ${LOCKOUT_MINUTES} دقيقة` }, 429);
  }

  const rows = await rest(
    `clients?or=(phone.eq.${encodeURIComponent(contact)},email.eq.${encodeURIComponent(contact)})&select=id,full_name,phone,email,type,tenant_id&limit=1`,
  );
  if (!rows.length) {
    await recordAttempt(contact, ip, false);
    return json({ error: 'لم يُعثر على الحساب' }, 404);
  }

  const client = rows[0];

  // ⚠️ مصدر الـ PIN الحقيقي هو جدول client_portal_pins (اللي بتكتب فيه
  // لوحة الإدارة عبر useAdminPortal.ts) — وليس عمود clients.portal_pin
  // اللي مكانش بيتحدث من أي مكان في الكود.
  const pinRows = await rest(
    `client_portal_pins?client_id=eq.${client.id}&select=pin,is_active&limit=1`,
  );
  const portalAccess = pinRows[0];

  if (!portalAccess || !portalAccess.is_active) {
    await recordAttempt(contact, ip, false);
    return json({ error: 'لم يتم تفعيل بوابتك بعد، تواصل مع المكتب' }, 403);
  }
  if (portalAccess.pin !== pin) {
    await recordAttempt(contact, ip, false);
    return json({ error: 'رمز الدخول غير صحيح ❌' }, 401);
  }

  await recordAttempt(contact, ip, true);
  const token = await signToken({ client_id: client.id, tenant_id: client.tenant_id });
  return json({ token, client });
}

/** getCases: جلب قضايا الموكل */
async function actionGetCases(claims: { client_id: string; tenant_id: string }) {
  const rows = await rest(
    `cases?client_id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id,case_number,case_type,court,status,created_at,client_name&order=created_at.desc`,
  );
  return json({ data: rows });
}

/** getClient: بيانات الموكل */
async function actionGetClient(claims: { client_id: string; tenant_id: string }) {
  const rows = await rest(
    `clients?id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id,full_name,phone,email,type&limit=1`,
  );
  return json({ data: rows[0] ?? null });
}

/** getCaseFees: رسوم قضية */
async function actionGetCaseFees(claims: { client_id: string; tenant_id: string }, body: Record<string, string>) {
  const caseId = body.caseId;
  if (!caseId) return json({ error: 'caseId مطلوب' }, 400);

  // تأكد إن القضية تابعة لنفس الموكل
  const caseRows = await rest(`cases?id=eq.${caseId}&client_id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id&limit=1`);
  if (!caseRows.length) return json({ error: 'غير مصرح' }, 403);

  const rows = await rest(
    `fees?case_id=eq.${caseId}&tenant_id=eq.${claims.tenant_id}&select=id,description,amount,paid_amount,due_date,status&order=due_date.asc`,
  );
  return json({ data: rows });
}

/** getCaseSessions: جلسات قضية */
async function actionGetCaseSessions(claims: { client_id: string; tenant_id: string }, body: Record<string, string>) {
  const caseId = body.caseId;
  if (!caseId) return json({ error: 'caseId مطلوب' }, 400);

  const caseRows = await rest(`cases?id=eq.${caseId}&client_id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id&limit=1`);
  if (!caseRows.length) return json({ error: 'غير مصرح' }, 403);

  const rows = await rest(
    `sessions?case_id=eq.${caseId}&tenant_id=eq.${claims.tenant_id}&select=id,session_date,court,room,outcome,next_action,status&order=session_date.desc`,
  );
  return json({ data: rows });
}

/** getCaseDocuments: مستندات قضية */
async function actionGetCaseDocuments(claims: { client_id: string; tenant_id: string }, body: Record<string, string>) {
  const caseId = body.caseId;
  if (!caseId) return json({ error: 'caseId مطلوب' }, 400);

  const caseRows = await rest(`cases?id=eq.${caseId}&client_id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id&limit=1`);
  if (!caseRows.length) return json({ error: 'غير مصرح' }, 403);

  const rows = await rest(
    `documents?case_id=eq.${caseId}&tenant_id=eq.${claims.tenant_id}&select=id,name,file_url,category,created_at&order=created_at.desc`,
  );
  return json({ data: rows });
}

/** getMessages: رسائل الموكل مع المكتب */
async function actionGetMessages(claims: { client_id: string; tenant_id: string }) {
  const rows = await rest(
    `portal_messages?client_id=eq.${claims.client_id}&tenant_id=eq.${claims.tenant_id}&select=id,content,sender,created_at&order=created_at.asc&limit=200`,
  );
  return json({ data: rows });
}

/** sendMessage: إرسال رسالة من الموكل */
async function actionSendMessage(claims: { client_id: string; tenant_id: string }, body: Record<string, string>) {
  const content = (body.content ?? '').trim();
  if (!content) return json({ error: 'الرسالة فاضية' }, 400);
  if (content.length > 2000) return json({ error: 'الرسالة طويلة جداً' }, 400);

  await rest('portal_messages', 'POST', {
    client_id: claims.client_id,
    tenant_id: claims.tenant_id,
    content,
    sender: 'client',
  });
  return json({ ok: true });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const { action, token, ...rest_body } = body;
    const ip = getClientIp(req);

    // Actions بدون توثيق
    if (action === 'find')   return actionFind(rest_body, ip);
    if (action === 'verify') return actionVerify(rest_body, ip);

    // Actions محتاجة token
    const claims = await requireToken(token);
    if (!claims) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    switch (action) {
      case 'getCases':          return actionGetCases(claims);
      case 'getClient':         return actionGetClient(claims);
      case 'getCaseFees':       return actionGetCaseFees(claims, rest_body);
      case 'getCaseSessions':   return actionGetCaseSessions(claims, rest_body);
      case 'getCaseDocuments':  return actionGetCaseDocuments(claims, rest_body);
      case 'getMessages':       return actionGetMessages(claims);
      case 'sendMessage':       return actionSendMessage(claims, rest_body);
      default:                  return json({ error: `action غير معروف: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    return json({ error: msg }, 500);
  }
});
