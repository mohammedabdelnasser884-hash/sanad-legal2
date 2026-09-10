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
//   resetOnboardingLock   { token, tenantId }
//     → { ok }  — يصفّر onboarding_lockout_tier/onboarding_locked_until/
//                 onboarding_frozen لحساب أدمن المكتب ده، الحل الوحيد
//                 بعد تجميد كامل (frozen). ياخد tenantId (مش userId)
//                 عشان الواجهة أصلًا معاها الـtenant بس، وبيدوّر داخليًا
//                 على الأدمن المرتبط بيه من profiles.
//
//   resetAdminPassword    { token, tenantId }
//     → { newPassword, adminEmail } — يولّد كلمة سر مؤقتة جديدة لحساب
//                 أدمن المكتب ده ويحدّثها في Supabase Auth، للحالة اللي
//                 كلمة السر الأصلية ضاعت قبل ما توصل للعميل.
//
//   getOnboardingStatuses { token }
//     → [{ tenant_id, onboarding_status, onboarding_frozen,
//          onboarding_locked_until, onboarding_lockout_tier }]
//     عمود ضيّق بس من profiles (حسابات الأدمن) — مش وصول عام للجدول،
//     غرضه الوحيد إظهار شارة "مجمّد/مقفول" وزرار الفك في اللوحة.
//
//   confirmPayment { token, tenantId, plan, amountEgp, paymentMethod,
//                     subscriptionMonths?, transactionDetails?, paymentDate? }
//     → { tenant, payment }  — (D1) تسجيل دفعة يدوية (نقدي/محفظة
//                 إلكترونية/تحويل بنكي)، يرفض لو العدد الحالي فوق حد
//                 الباقة الجديدة، وبيحسب subscription_due_at الجديد
//                 (تجديد عادي: n شهر من آخر ميعاد قديم / ترقية أو أول
//                 تفعيل: n شهر من النهارده) — n = subscriptionMonths
//                 (1/3/6/9/12، افتراضي 1 لو متبعتش — راجع خطة المدفوعات
//                 والفواتير 10 سبتمبر، عُدّلت لاحقًا لإضافة 6/9).
//                 transactionDetails: نص حر اختياري (رقم عملية/تفاصيلها،
//                 مفيش داعي له غالبًا مع الكاش). paymentDate: تاريخ توثيق
//                 الدفعة الفعلي (YYYY-MM-DD)، منفصل تمامًا عن حساب
//                 subscription_due_at — افتراضي النهارده لو متبعتش.
//                 بيصفّر trial_ends_at (المكتب بقى مدفوع، مبقاش تجربة)،
//                 وبيرفض العملية لو فيه دفعة اتسجلت لنفس المكتب من أقل
//                 من DUPLICATE_PAYMENT_WINDOW_MS (حماية من تأكيد مكرر بغلط).
//
//   undoLastPayment { token, tenantId }
//     → { ok, restoredDueAt }  — (D4) تراجع عن آخر تأكيد دفع، يمسح
//                 آخر سجل في tenant_subscription_payments ويرجّع
//                 subscription_due_at للقيمة قبله.
//
//   getPaymentHistory { token, tenantId }
//     → [{ id, plan, amount_egp, payment_method, subscription_months,
//          period_start, period_end, invoice_number, payment_date,
//          transaction_details, created_at, ... }]
//                 (خطة المدفوعات والفواتير) كل دفعات مكتب معيّن، الأحدث
//                 أولًا — لعرض تاب "سجل المدفوعات" في تفاصيل المكتب.
//
//   issueInvoice { token, paymentId }
//     → { payment, invoiceNumber }  — (خطة المدفوعات والفواتير)
//                 get-or-create لرقم فاتورة دفعة معيّنة: لو الدفعة دي
//                 طبعت قبل كده بيرجّع نفس الرقم القديم من غير أي تغيير،
//                 لو مرة أولى بياخد رقم جديد من next_tenant_invoice_number()
//                 (ميجريشن 17) ويسجّله على صف الدفعة نفسه. بيرجّع كل
//                 بيانات الدفعة جاهزة لواجهة الطباعة.
//
//  الأمان:
//   - الباسورد بيتقارن من SAAS_ADMIN_PASSWORD (env secret)
//   - الـ token: JWT موقّع بـ SAAS_JWT_SECRET، صلاحيته 8 ساعات
//   - query مسموح بيه على tenants جدول بس (whitelist)
// ══════════════════════════════════════════════════════

// ⚠️ الكود ده اتحوّل لنسخة قائمة بذاتها (self-contained) — كان بيستورد
// corsHeaders/handleCors من ../_shared/cors.ts، لكن لوحة النشر بتاعتنا
// (Supabase Dashboard، ملف واحد لكل فانكشن) مش بتدعم مجلدات مشتركة بين
// الفانكشنز. نفس نمط admin-actions/index.ts الموجود عندك بالفعل.
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
const ANON_KEY           = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_PASSWORD     = Deno.env.get('SAAS_ADMIN_PASSWORD');
const JWT_SECRET         = Deno.env.get('SAAS_ADMIN_TOKEN_SECRET');
const TOKEN_TTL_MS       = 8 * 60 * 60 * 1000; // 8 ساعات

// لا تعتمد أبدًا على قيم افتراضية لأسرار السوبر أدمن — لو الـ secrets
// دول مش مضبوطة فعليًا في Supabase Edge Function Secrets، رفض التشغيل
// تمامًا بدل ما تقبل بصمت كلمة سر/JWT secret معروفين من الكود نفسه.
if (!ADMIN_PASSWORD) {
  throw new Error('SAAS_ADMIN_PASSWORD غير مضبوط في إعدادات الفانكشن — لا يمكن التشغيل بدونه');
}
if (!JWT_SECRET) {
  throw new Error('SAAS_ADMIN_TOKEN_SECRET غير مضبوط في إعدادات الفانكشن — لا يمكن التشغيل بدونه');
}

// جداول مسموح بيها في الـ query action (whitelist)
const ALLOWED_TABLES = ['tenants', 'tenant_invoices'];

// ── الباقات المسموح بيها فعليًا (بعد إلغاء الباقة المجانية الدايمة) ──
// أي مكتب جديد بيبدأ بتجربة شهر (status=trial) — مش باقة "مجانية" منفصلة.
// الباقة هنا هي الباقة اللي المكتب هيدفعها بعد ما التجربة تخلص.
const ALLOWED_PLANS = ['lawyer', 'office', 'enterprise'];
const TRIAL_DAYS = 30; // مدة التجربة المجانية بالأيام (شهر واحد)

// نافذة زمنية لاعتبار تأكيد دفع جديد "مكرر بغلط" لنفس المكتب (راجع D1)
const DUPLICATE_PAYMENT_WINDOW_MS = 5 * 60 * 1000; // 5 دقايق

function computeTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toISOString();
}

// (A5) ميعاد التجديد الأول لمكتب بيتعمله إنشاء مباشر بباقة مدفوعة —
// شهر من تاريخ الإنشاء نفسه. نفس منطق A4 (الميجريشن اللي بتعبي
// subscription_due_at للمكاتب الحالية)، لكن هنا وقت الإنشاء الفعلي.
function computeSubscriptionDueDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// n شهر من تاريخ معيّن (مش النهارده بالضرورة) — مستخدمة في D1/خطة
// المدفوعات والفواتير لحساب ميعاد التجديد الجديد وقت "تجديد عادي"
// (n شهر من آخر ميعاد قديم، مش من تاريخ التأكيد نفسه). كانت
// addOneMonth (شهر ثابت بالكود) قبل تعميم مدة الاشتراك (1/3/12 شهر)
// في خطة المدفوعات والفواتير — راجع ALLOWED_SUBSCRIPTION_MONTHS.
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// المدد المسموح بيها لتسجيل دفعة (شهر / 3 / 6 / 9 شهور / سنة) — من
// واجهة offices-portal.html بس، لكن العمود subscription_months نفسه
// مش مقيّد بقيم بعينها في القاعدة (راجع تعليق الميجريشن 16). وُسّعت
// من [1,3,12] لإضافة 6 و9 (ملاحظات جيمي، 10 سبتمبر) — خصم السنة (10
// شهور بدل 12) فضل هو الوحيد اللي فيه خصم، الباقي سعر شهري × العدد.
const ALLOWED_SUBSCRIPTION_MONTHS = [1, 3, 6, 9, 12];

// وسائل الدفع المقبولة يدويًا (مفيش بوابة دفع إلكتروني) — 'e_wallet'
// عامة (مش مربوطة بمزوّد بعينه زي فودافون كاش)، حلّت محل القيمة
// القديمة 'vodafone_cash' (ميجريشن 18 حوّل الصفوف القديمة تلقائيًا).
// 'bank_transfer' إضافة جديدة (ملاحظات جيمي، 10 سبتمبر).
const PAYMENT_METHODS = ['cash', 'e_wallet', 'bank_transfer'];

// ── حماية من تجربة كل الباسوردات (brute-force) ─────────
// نفس نمط client-portal-api: بعد MAX_ATTEMPTS محاولة فاشلة من نفس
// الـ IP خلال WINDOW_MINUTES دقيقة، يتم رفض أي محاولة تانية مؤقتًا.
// بوابة saas-admin أخطر بكتير من بوابة الموكلين (وصول لكل المكاتب)
// وكانت من غير أي حماية brute-force خالص قبل الإصلاح ده.
const MAX_ATTEMPTS   = 5;
const WINDOW_MINUTES  = 15;
const LOCKOUT_MINUTES = 15;

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function isLockedOut(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false; // مش هنقفل IP مجهول تمامًا (نادر) عشان منمنعش وصول شرعي بالغلط
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const rows = await supabaseRest(
    `saas_admin_login_attempts?ip_address=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`,
  );
  return Array.isArray(rows) && rows.length >= MAX_ATTEMPTS;
}

async function recordAttempt(ip: string, success: boolean) {
  try {
    await supabaseRest('saas_admin_login_attempts', 'POST', { ip_address: ip, success });
  } catch (e) {
    // تسجيل فشل حفظ المحاولة نفسه في اللوجز (بدل ما يتبلع بصمت) —
    // مفيد لو حصلت مشكلة صلاحيات أو schema مستقبلًا. فشل الحفظ هنا
    // ميعطلش عملية الدخول نفسها عمدًا.
    console.error('recordAttempt failed:', e instanceof Error ? e.message : String(e), 'ip=', ip);
  }
}

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

// توليد slug فريد للمكتب (٨ خانات عشوائية). العمود ده NOT NULL في
// جدول tenants، ومفيش حقل ليه في فورم "إضافة مكتب جديد"، فكان الإدراج
// بيفشل بـ "null value in column slug" — بنولّده هنا تلقائيًا بدل ما
// نعتمد على الفرونت إند يبعته.
function generateSlugCandidate(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return 'office-' + Array.from(arr, b => chars[b % chars.length]).join('');
}

async function generateUniqueSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = generateSlugCandidate();
    const existing = await supabaseRest(`tenants?slug=eq.${slug}&select=id`);
    if (Array.isArray(existing) && existing.length === 0) return slug;
  }
  // fallback نادر جدًا لو الـ٥ محاولات كلها اتصادفت (شبه مستحيل إحصائيًا)
  return `office-${Date.now()}`;
}

// ── actions ──────────────────────────────────────────

/** login: تحقق من الباسورد وأعد token */
async function actionLogin(body: Record<string, string>, ip: string) {
  const { password } = body;
  if (!password) return json({ error: 'كلمة المرور مطلوبة' }, 400);

  if (await isLockedOut(ip)) {
    return json({ error: `محاولات كثيرة فاشلة، حاول مرة أخرى بعد ${LOCKOUT_MINUTES} دقيقة` }, 429);
  }

  // مقارنة constant-time لتجنب timing attacks
  const enc = new TextEncoder();
  const a = enc.encode(password);
  const b = enc.encode(ADMIN_PASSWORD);

  if (a.length !== b.length) {
    await recordAttempt(ip, false);
    return json({ error: 'كلمة المرور غير صحيحة' }, 401);
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    await recordAttempt(ip, false);
    return json({ error: 'كلمة المرور غير صحيحة' }, 401);
  }

  await recordAttempt(ip, true);
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

  // نفس تحقق الباقات المسموح بيها (ALLOWED_PLANS) — ده بيغطي تعديل مكتب
  // موجود (مودال "تعديل بيانات المكتب" بيعدّي من هنا، مش createOfficeWithAdmin)
  if (
    tableName === 'tenants' &&
    reqBody &&
    typeof reqBody === 'object' &&
    'subscription_plan' in (reqBody as Record<string, unknown>)
  ) {
    const plan = String((reqBody as Record<string, unknown>).subscription_plan || '');
    if (plan && !ALLOWED_PLANS.includes(plan)) {
      return json({ error: `باقة غير معروفة: "${plan}"` }, 400);
    }
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
  // slug عمود NOT NULL بدون قيمة افتراضية في القاعدة، والفورم مش بيبعته،
  // فبنولّد واحد فريد تلقائيًا لو مش موجود في الـ payload
  const tenantPayload: Record<string, unknown> = { ...tenant };
  if (!tenantPayload.slug) {
    tenantPayload.slug = await generateUniqueSlug();
  }

  // ⚠️ إنفاذ سيرفر-سايد لقواعد الباقات/التجربة — الفرونت إند (الفورم) بيبعت
  // نفس القيم دي افتراضيًا، لكن الاعتماد الحقيقي لازم يكون هنا عشان أي نداء
  // مباشر لل action ده (مش من الفورم) يفضل ملتزم بنفس القاعدة: مفيش باقة
  // مجانية دايمة، ومفيش مكتب بيتعمله تجربة من غير تاريخ انتهاء محدد.
  const requestedPlan = String(tenantPayload.subscription_plan || '').trim();
  if (requestedPlan && !ALLOWED_PLANS.includes(requestedPlan)) {
    return json({ error: `باقة غير معروفة: "${requestedPlan}"` }, 400);
  }
  if (!requestedPlan) {
    tenantPayload.subscription_plan = ALLOWED_PLANS[0]; // 'lawyer' — افتراضي
  }
  if (!tenantPayload.status) {
    tenantPayload.status = 'trial';
  }
  if (tenantPayload.status === 'trial' && !tenantPayload.trial_ends_at) {
    tenantPayload.trial_ends_at = computeTrialEndDate();
  }
  // (A5) مكتب بيتعمله إنشاء مباشر بباقة مدفوعة (status != trial) —
  // subscription_due_at لازم يتحسب وقت الإنشاء نفسه (شهر من النهارده)،
  // نفس منطق A4 بتاعت المكاتب الحالية، عشان مايفضلش NULL لحد أول
  // تأكيد دفع (D1، لسه لم يبدأ).
  if (tenantPayload.status !== 'trial' && !tenantPayload.subscription_due_at) {
    tenantPayload.subscription_due_at = computeSubscriptionDueDate();
  }
  const tenantRows = await supabaseRest('tenants', 'POST', tenantPayload);
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
    onboarding_status: 'pending_verification', // يبدأ رحلة الـonboarding — تحقق إيميل ثم إعداد باسورد+بيانات المكتب
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

/**
 * resetOnboardingLock: فك التجميد الكامل/القفل المؤقت لمكتب يدويًا — الحل
 * الوحيد بعد تجميد onboarding_frozen. بتاخد tenantId (مش userId مباشرة)
 * وتدوّر داخليًا على حساب الأدمن المرتبط بالـtenant ده — الواجهة أصلًا
 * معاها الـtenant بس من جدول tenants، ومفيش داعي تعرف user_id.
 */
async function actionResetOnboardingLock(body: Record<string, unknown>) {
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return json({ error: 'tenantId مطلوب' }, 400);

  const admins = await supabaseRest(
    `profiles?tenant_id=eq.${tenantId}&role=eq.admin&select=user_id&limit=1`,
  );
  const admin = Array.isArray(admins) ? admins[0] : null;
  if (!admin?.user_id) return json({ error: 'تعذر العثور على حساب أدمن مرتبط بهذا المكتب' }, 404);

  await supabaseRest(`profiles?user_id=eq.${admin.user_id}`, 'PATCH', {
    onboarding_lockout_tier: 0,
    onboarding_locked_until: null,
    onboarding_frozen: false,
  });

  return json({ ok: true });
}

/**
 * resetAdminPassword: يولّد كلمة سر مؤقتة جديدة لحساب أدمن المكتب ويحدّثها
 * في Supabase Auth مباشرة (Admin API) — الحل لو كلمة السر المؤقتة الأصلية
 * ضاعت (اتقفل المودال قبل ما يتنسخ منه، أو الصفحة اتعمللها ريفريش) قبل ما
 * توصل للعميل، أو لو حصل أي سبب تاني محتاج فيه ترجع للعميل بباسورد جديد.
 * مفيهاش أي شرط على onboarding_status، تشتغل في أي وقت.
 */
async function actionResetAdminPassword(body: Record<string, unknown>) {
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return json({ error: 'tenantId مطلوب' }, 400);

  const admins = await supabaseRest(
    `profiles?tenant_id=eq.${tenantId}&role=eq.admin&select=user_id,email&limit=1`,
  );
  const admin = Array.isArray(admins) ? admins[0] : null;
  if (!admin?.user_id) return json({ error: 'تعذر العثور على حساب أدمن مرتبط بهذا المكتب' }, 404);

  const newPassword = generatePassword(14);
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${admin.user_id}`, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!authRes.ok) {
    const authErr = await authRes.json().catch(() => ({}));
    throw new Error(authErr?.message ?? 'فشل تحديث كلمة السر');
  }

  return json({ newPassword, adminEmail: admin.email });
}

/**
 * getOnboardingStatuses: يرجّع حالة الـonboarding (تجميد/قفل مؤقت) لكل
 * حسابات الأدمن — أعمدة ضيّقة ومحددة بس من profiles، مش proxy عام
 * زي actionQuery (عشان كده مش محتاجة إضافة 'profiles' لـALLOWED_TABLES).
 */
async function actionGetOnboardingStatuses() {
  const rows = await supabaseRest(
    `profiles?role=eq.admin&select=tenant_id,onboarding_status,onboarding_frozen,onboarding_locked_until,onboarding_lockout_tier`,
  );
  return json(Array.isArray(rows) ? rows : []);
}

/**
 * confirmPayment (D1): تسجيل دفعة يدوية (نقدي/محفظة إلكترونية/تحويل
 * بنكي) أكّدها
 * الأدمن (جيمي) لمكتب معيّن، وحساب subscription_due_at الجديد.
 *
 *  - تجديد عادي (نفس الباقة الحالية، ومكتب كان بالفعل مدفوع من قبل
 *    — يعني عنده subscription_due_at موجود): الميعاد الجديد = n شهر من
 *    آخر ميعاد قديم (مش من تاريخ التأكيد نفسه).
 *  - ترقية/تنزيل باقة (باقة مختلفة)، أو أول تفعيل من تجربة (مفيش
 *    subscription_due_at قديم أصلاً): الميعاد الجديد = n شهر من النهارده.
 *  - n = subscriptionMonths (1/3/6/9/12)، افتراضي 1 لو الباراميتر
 *    متبعتش (توافقًا مع أي نداء قديم لسه بيبعت من غير المدة — راجع
 *    خطة المدفوعات والفواتير 10 سبتمبر 2026، عُدّلت لاحقًا لإضافة 6/9).
 *  - transactionDetails: نص حر اختياري لرقم العملية/تفاصيلها، وpaymentDate:
 *    تاريخ توثيق الدفعة الفعلي (YYYY-MM-DD) منفصل تمامًا عن حساب
 *    subscription_due_at — افتراضي تاريخ اليوم لو الباراميتر متبعتش.
 *  - Downgrade فوق حد الباقة الجديدة: يُرفض تمامًا (لازم تقليل العدد
 *    الحالي يدويًا الأول) — نفس التحقق مطبّق على أي تغيير باقة (مش
 *    بس تنزيل) كطبقة حماية موحّدة.
 *  - أي تأكيد دفع بيصفّر trial_ends_at (null) — مبقاش ليها معنى بعد
 *    التفعيل بالدفع، وسيبها موجودة كانت بتخلي البورتال يفضل يعامل
 *    مكتب مدفوع فعليًا كإنه "تجربة قربت تخلص" (تنبيهات + تفاصيل غلط).
 *  - لو فيه دفعة اتسجلت لنفس المكتب من أقل من DUPLICATE_PAYMENT_WINDOW_MS
 *    (5 دقايق)، العملية بترفض بالكامل — قبل كده كل تأكيد تاني كان
 *    بيتحسب كـ"تجديد عادي" فوق الميعاد اللي فات، فتأكيد بغلط مرتين
 *    أو تلاتة كان بيضيف شهر فوق شهر على subscription_due_at.
 */
async function actionConfirmPayment(body: Record<string, unknown>) {
  const { tenantId, plan, amountEgp, paymentMethod, subscriptionMonths, transactionDetails, paymentDate } = body as {
    tenantId?: string;
    plan?: string;
    amountEgp?: number;
    paymentMethod?: string;
    subscriptionMonths?: number;
    transactionDetails?: string;
    paymentDate?: string;
  };

  if (!tenantId) return json({ error: 'tenantId مطلوب' }, 400);
  if (!plan || !ALLOWED_PLANS.includes(plan)) return json({ error: `باقة غير معروفة: "${plan}"` }, 400);
  const amount = Number(amountEgp);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'المبلغ المدفوع لازم يكون رقم أكبر من صفر' }, 400);
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod)) {
    return json({ error: 'طريقة الدفع لازم تكون نقدي أو محفظة إلكترونية أو تحويل بنكي' }, 400);
  }
  // مدة الاشتراك اختيارية — افتراضي شهر واحد لو متبعتش (توافق النداء
  // القديم قبل خطة المدفوعات والفواتير).
  const months = subscriptionMonths == null ? 1 : Number(subscriptionMonths);
  if (!ALLOWED_SUBSCRIPTION_MONTHS.includes(months)) {
    return json({ error: `مدة اشتراك غير معروفة: "${subscriptionMonths}" (المسموح: شهر/3/6/9 شهور أو سنة)` }, 400);
  }
  // transactionDetails اختياري تمامًا (نص حر) — الكاش غالبًا مفيهوش
  // رقم عملية أصلًا، فمينفعش يتفرض كإجباري.
  const txnDetails = transactionDetails == null || transactionDetails === '' ? null : String(transactionDetails);
  // paymentDate اختياري — تاريخ توثيق الدفعة الفعلي، منفصل تمامًا عن
  // حساب subscription_due_at تحت. افتراضي تاريخ اليوم (YYYY-MM-DD)
  // لو الباراميتر متبعتش أو جه فاضي.
  const payDate = paymentDate == null || paymentDate === '' ? new Date().toISOString().slice(0, 10) : String(paymentDate);

  const tenants = await supabaseRest(`tenants?id=eq.${tenantId}&select=id,subscription_plan,subscription_due_at,status`);
  const tenant = Array.isArray(tenants) ? tenants[0] : null;
  if (!tenant) return json({ error: 'المكتب غير موجود' }, 404);

  // ── حماية من تأكيد الدفع مرتين لغلط (دبل تأكيد بعد شوية مش دبل-كليك
  // سريع بس) — لو فيه دفعة اتسجلت لنفس المكتب خلال آخر 5 دقايق، ده
  // على الأغلب نفس العملية بتتأكد تاني بغلط، مش دفعة تانية فعلاً.
  // بيرفض العملية بدل ما يكرر إضافة شهر فوق شهر على subscription_due_at.
  const recentPayments = await supabaseRest(
    `tenant_subscription_payments?tenant_id=eq.${tenantId}&order=created_at.desc&limit=1&select=created_at`,
  );
  const lastPayment = Array.isArray(recentPayments) ? recentPayments[0] : null;
  if (lastPayment?.created_at) {
    const msSinceLastPayment = Date.now() - new Date(lastPayment.created_at).getTime();
    if (msSinceLastPayment < DUPLICATE_PAYMENT_WINDOW_MS) {
      return json({
        error: 'فيه دفعة اتسجلت لنفس المكتب من أقل من 5 دقايق — لو ده تأكيد تاني بغلط لنفس الدفعة متكملش. لو فعلاً محتاج تسجل دفعة تانية دلوقتي، استنى شوية وحاول تاني.',
      }, 409);
    }
  }

  // ── تحقق حدود الباقة الجديدة قبل أي كتابة (منع الـdowngrade فوق الحد) ──
  const limitsRows = await supabaseRest(`plan_limits?plan_key=eq.${plan}&select=max_users,max_active_cases,max_client_portal_accounts`);
  const limits = Array.isArray(limitsRows) ? limitsRows[0] : null;
  if (!limits) return json({ error: `تعذر إيجاد حدود الباقة "${plan}" في plan_limits` }, 500);

  // client_portal_pins مفيهوش tenant_id مباشر — لازم نمر عن طريق clients الأول
  const clientRows = await supabaseRest(`clients?tenant_id=eq.${tenantId}&select=id`);
  const clientIds = Array.isArray(clientRows) ? clientRows.map((c: { id: string }) => c.id) : [];

  const [usersRows, casesRows, portalRows] = await Promise.all([
    supabaseRest(`profiles?tenant_id=eq.${tenantId}&select=user_id`),
    supabaseRest(`cases?tenant_id=eq.${tenantId}&deleted_at=is.null&select=id`),
    clientIds.length
      ? supabaseRest(`client_portal_pins?is_active=eq.true&client_id=in.(${clientIds.join(',')})&select=id`)
      : Promise.resolve([]),
  ]);
  const usersCount = Array.isArray(usersRows) ? usersRows.length : 0;
  const casesCount = Array.isArray(casesRows) ? casesRows.length : 0;
  const portalCount = Array.isArray(portalRows) ? portalRows.length : 0;

  const overLimit: string[] = [];
  if (limits.max_users != null && usersCount > limits.max_users) {
    overLimit.push(`عدد الحسابات الحالي (${usersCount}) أكبر من حد باقة "${plan}" (${limits.max_users})`);
  }
  if (limits.max_active_cases != null && casesCount > limits.max_active_cases) {
    overLimit.push(`عدد القضايا النشطة الحالي (${casesCount}) أكبر من حد باقة "${plan}" (${limits.max_active_cases})`);
  }
  if (limits.max_client_portal_accounts != null && portalCount > limits.max_client_portal_accounts) {
    overLimit.push(`عدد حسابات بوابة الموكل الحالي (${portalCount}) أكبر من حد باقة "${plan}" (${limits.max_client_portal_accounts})`);
  }
  if (overLimit.length) {
    return json({ error: `مينفعش تنزّل/تغيّر الباقة دي دلوقتي: ${overLimit.join('؛ ')} — لازم تقلل العدد الأول.` }, 409);
  }

  // ── نوع العملية: تجديد عادي (نفس الباقة + كان مدفوع قبل كده) ولا ترقية/أول تفعيل ──
  const wasPaidBefore = tenant.status !== 'trial' && !!tenant.subscription_due_at;
  const isSamePlan = tenant.subscription_plan === plan;
  const isNormalRenewal = wasPaidBefore && isSamePlan;

  const previousDueAt: string | null = tenant.subscription_due_at ?? null;
  // 🆕 FIX (10 سبتمبر 2026 — اكتُشف أثناء اختبار 10 اليدوي): previous_plan
  // بنفس منطق previous_due_at بالظبط، عشان undoLastPayment تحت تقدر
  // ترجّع الباقة صح كمان مش الموعد بس — راجع تعليق undoLastPayment.
  const previousPlan: string | null = tenant.subscription_plan ?? null;
  const now = new Date().toISOString();
  // تجديد عادي: n شهر من آخر ميعاد قديم. ترقية/تنزيل/أول تفعيل: n شهر من النهارده.
  const newDueAt = isNormalRenewal ? addMonths(previousDueAt as string, months) : addMonths(now, months);
  const periodStart = isNormalRenewal ? (previousDueAt as string) : now;

  // 1) تحديث المكتب
  // trial_ends_at بيتصفّر هنا عمدًا: بمجرد ما مكتب يتفعّل بالدفع، تاريخ
  // التجربة القديم بقى مالوش معنى ولازم يوقف عن الظهور في تنبيهات/تفاصيل
  // "التجربة هتخلص" — استحقاق التجديد (subscription_due_at) هو المرجع
  // الوحيد بعد كده.
  await supabaseRest(`tenants?id=eq.${tenantId}`, 'PATCH', {
    subscription_plan: plan,
    status: 'active',
    subscription_due_at: newDueAt,
    trial_ends_at: null,
  });

  // 2) تسجيل الدفعة في الأرشيف
  const paymentRows = await supabaseRest('tenant_subscription_payments', 'POST', {
    tenant_id: tenantId,
    plan,
    amount_egp: amount,
    payment_method: paymentMethod,
    subscription_months: months,
    period_start: periodStart,
    period_end: newDueAt,
    previous_due_at: previousDueAt,
    previous_plan: previousPlan,
    transaction_details: txnDetails,
    payment_date: payDate,
  });
  const payment = Array.isArray(paymentRows) ? paymentRows[0] : paymentRows;

  // ⚠️ فيكس (10 سبتمبر 2026، اكتُشف أثناء اختبار 7 اليدوي): لازم trial_ends_at
  // تتصفّر هنا كمان زي ما اتصفّرت فعليًا في الـPATCH فوق — قبل الفيكس ده،
  // الـresponse كانت بترجّع trial_ends_at القديمة (من `tenant` الأصلي، قبل
  // التحديث)، فـallTenants المحلية في offices-portal.html كانت تفضل شايلة
  // تاريخ تجربة قديم منتهي، وrenderAlerts() (منطق تنبيهات قديم منفصل تمامًا
  // عن subscription_due_at) كان بيعرض تنبيه "Grace Period" غلط لمكتب فعليًا
  // active بعد تجديد ناجح — رغم إن الداتابيز نفسها كانت سليمة 100% طول الوقت.
  return json({ tenant: { ...tenant, subscription_plan: plan, status: 'active', subscription_due_at: newDueAt, trial_ends_at: null }, payment });
}

/**
 * undoLastPayment (D4): تراجع عن آخر تأكيد دفع لمكتب معيّن — لتصحيح
 * غلطة دبل-كليك أو مبلغ/باقة غلط. بيمسح آخر سجل في
 * tenant_subscription_payments وبيرجّع subscription_due_at
 * وsubscription_plan للقيمتين قبله (previous_due_at/previous_plan
 * المسجّلتين وقت التأكيد ده بالظبط).
 *
 * 🔧 FIX (10 سبتمبر 2026 — اكتُشف أثناء اختبار 10 اليدوي): قبل كده كانت
 * بترجّع subscription_due_at بس وتسيب subscription_plan زي ما هي —
 * فبعد التراجع عن ترقية، المكتب كان بيفضل على الباقة الجديدة (الأعلى)
 * بموعد استحقاق زي لو لسه على القديمة، وده تضارب حقيقي (باقة مدفوعة
 * أعلى من اللي فعليًا مسدد). previous_plan بقى مسجّل بنفس منطق
 * previous_due_at بالظبط (ميجريشن 15-15)، فالتراجع بيرجّع الاتنين سوا.
 *
 * ⚠️ لسه ما بيرجعش status للقيمة القديمة (نادرًا ما يتغيّر برّه
 * confirmPayment نفسها، فمش جزء من "غلطة تأكيد دفع" اللي الزرار ده
 * مصمم يصلحها) — الاستخدام المقصود يفضل تصحيح آخر عملية دفع لسه طرية
 * (نفس اليوم)، مش رجوع تاريخي بعيد.
 */
async function actionUndoLastPayment(body: Record<string, unknown>) {
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return json({ error: 'tenantId مطلوب' }, 400);

  const rows = await supabaseRest(
    `tenant_subscription_payments?tenant_id=eq.${tenantId}&order=created_at.desc&limit=1&select=id,previous_due_at,previous_plan`,
  );
  const last = Array.isArray(rows) ? rows[0] : null;
  if (!last) return json({ error: 'مفيش دفعة مسجّلة لهذا المكتب أصلاً' }, 404);

  const patch: Record<string, unknown> = { subscription_due_at: last.previous_due_at ?? null };
  // previous_plan ممكن يكون NULL لدفعات قديمة اتسجلت قبل ميجريشن 15-15 —
  // في الحالة دي، مانلمسش الباقة خالص (نفس السلوك القديم تمامًا)، بدل ما
  // نحط قيمة NULL غلط في subscription_plan (عمود NOT NULL على الأرجح).
  if (last.previous_plan) patch.subscription_plan = last.previous_plan;

  await supabaseRest(`tenants?id=eq.${tenantId}`, 'PATCH', patch);
  await supabaseRest(`tenant_subscription_payments?id=eq.${last.id}`, 'DELETE');

  return json({ ok: true, restoredDueAt: last.previous_due_at ?? null, restoredPlan: last.previous_plan ?? null });
}

/**
 * getPaymentHistory (خطة المدفوعات والفواتير): كل صفوف
 * tenant_subscription_payments الخاصة بمكتب معيّن، الأحدث أولًا —
 * لتاب "سجل المدفوعات" في تفاصيل المكتب بـ offices-portal.html.
 */
async function actionGetPaymentHistory(body: Record<string, unknown>) {
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return json({ error: 'tenantId مطلوب' }, 400);

  const rows = await supabaseRest(
    `tenant_subscription_payments?tenant_id=eq.${tenantId}&order=created_at.desc&select=id,plan,amount_egp,payment_method,subscription_months,period_start,period_end,invoice_number,payment_date,transaction_details,created_at`,
  );
  return json(Array.isArray(rows) ? rows : []);
}

/**
 * issueInvoice (خطة المدفوعات والفواتير): get-or-create لرقم فاتورة
 * دفعة معيّنة — نفس فلسفة getOrCreateInvoice الموجودة فعليًا لفواتير
 * الأتعاب الداخلية (useInvoicePrinting.ts)، لكن هنا على مستوى دفعات
 * اشتراك SaaS-admin (سلسلة عامة واحدة، مش لكل مكتب).
 *
 * لو payment.invoice_number موجود بالفعل (اتطبعت قبل كده)، بيرجّعه
 * زي ما هو من غير أي نداء لـnext_tenant_invoice_number() — عشان
 * ضغطة "طباعة" تانية على نفس الدفعة متاخدش رقم جديد من السلسلة.
 * لو NULL، بياخد رقم جديد (RPC، ميجريشن 17) ويسجّله على صف الدفعة.
 */
async function actionIssueInvoice(body: Record<string, unknown>) {
  const { paymentId } = body as { paymentId?: string };
  if (!paymentId) return json({ error: 'paymentId مطلوب' }, 400);

  const rows = await supabaseRest(
    `tenant_subscription_payments?id=eq.${paymentId}&select=id,tenant_id,plan,amount_egp,payment_method,subscription_months,period_start,period_end,invoice_number,payment_date,transaction_details,created_at`,
  );
  const payment = Array.isArray(rows) ? rows[0] : null;
  if (!payment) return json({ error: 'الدفعة غير موجودة' }, 404);

  if (payment.invoice_number) {
    return json({ payment, invoiceNumber: payment.invoice_number });
  }

  const rpcResult = await supabaseRest('rpc/next_tenant_invoice_number', 'POST', {});
  const invoiceNumber = typeof rpcResult === 'string' ? rpcResult : null;
  if (!invoiceNumber) return json({ error: 'تعذر توليد رقم فاتورة جديد' }, 500);

  await supabaseRest(`tenant_subscription_payments?id=eq.${paymentId}`, 'PATCH', {
    invoice_number: invoiceNumber,
  });

  return json({ payment: { ...payment, invoice_number: invoiceNumber }, invoiceNumber });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, token, ...rest } = body;
    const ip = getClientIp(req);

    // action بدون توثيق
    if (action === 'login') return await actionLogin(rest as Record<string, string>, ip);

    // باقي الـ actions محتاجة token صالح
    if (!token || typeof token !== 'string') {
      return json({ error: 'الجلسة مطلوبة' }, 401);
    }
    const valid = await verifyToken(token);
    if (!valid) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    switch (action) {
      case 'query':                  return await actionQuery(rest);
      case 'createOfficeWithAdmin':  return await actionCreateOffice(rest);
      case 'resetOnboardingLock':    return await actionResetOnboardingLock(rest);
      case 'resetAdminPassword':     return await actionResetAdminPassword(rest);
      case 'getOnboardingStatuses':  return await actionGetOnboardingStatuses();
      case 'confirmPayment':         return await actionConfirmPayment(rest);
      case 'undoLastPayment':        return await actionUndoLastPayment(rest);
      case 'getPaymentHistory':      return await actionGetPaymentHistory(rest);
      case 'issueInvoice':           return await actionIssueInvoice(rest);
      default:                       return json({ error: `action غير معروف: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    return json({ error: msg }, 500);
  }
});
