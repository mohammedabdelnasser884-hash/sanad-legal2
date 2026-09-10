// ══════════════════════════════════════════════════════
//  Edge Function: forgot-password-gate
//
//  هدفها الوحيد: "تفتح الباب" لمسار استعادة كلمة المرور (وأنت خارج
//  النظام في LoginScreen.tsx) — تتأكد إن الإيميل المُدخَل يخص أدمن
//  مكتب (profiles.role === 'admin') قبل ما الفرونت إند ينادي
//  db.auth.resetPasswordForEmail الفعلية.
//
//  راجع: docs/reports/features/sanad-forgot-password-gate-plan-2.md
//  (القرارات النهائية، 10 سبتمبر 2026) للخلفية الكاملة.
//
//  action: check { email }
//    → { status: 'admin_confirmed' | 'not_admin' | 'not_found' }  (200)
//    → { error }  (429 لو lockout، 400 لمدخلات ناقصة)
//
//  ⚠️ الفانكشن دي بس بتـ"تأكد" — هي اللي بتفتح الباب بس، مش هي اللي
//  بترسل رابط الاستعادة. لو الرد admin_confirmed، الفرونت إند
//  (LoginScreen.tsx) هو اللي بينادي db.auth.resetPasswordForEmail
//  بعد كده بالظبط زي ما بيحصل دلوقتي من غير أي تغيير في آلية
//  الإرسال نفسها (قرار نهائي 1 في الخطة).
//
//  ⚠️ حالة/قفل الحساب (is_active / is_locked) أو حالة اشتراك المكتب
//  مالهاش أي تأثير على القرار هنا عمدًا — المعيار الوحيد هو
//  role === 'admin' (قرار نهائي 2 في الخطة). is_active/is_locked
//  بيتجابوا في الـselect بس للتوثيق/تشخيص مستقبلي، مش مستخدمين في
//  أي شرط تحت.
//
//  ⚠️ نسخة self-contained (بلا استيراد من ../_shared/) بنفس نمط
//  office-login — عشان تتوافق مع النشر من لوحة Supabase (ملف واحد
//  لكل فانكشن).
// ══════════════════════════════════════════════════════

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

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── حماية من إساءة الاستخدام (تجربة إيميلات كتير) ───────
// نفس قيم office-login بالظبط (MAX_ATTEMPTS=5 / LOCKOUT_MINUTES=15)
// عشان الاتساق — راجع القرارات النهائية، بند 3، في الخطة.
// جدول منفصل (forgot_password_gate_attempts) عن office_login_attempts
// عمدًا عشان ميتخلطش مع محاولات تسجيل الدخول العادي.
const MAX_ATTEMPTS    = 5;
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

async function isLockedOut(email: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const [byEmail, byIp] = await Promise.all([
    rest(`forgot_password_gate_attempts?email=eq.${encodeURIComponent(email)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`),
    ip !== 'unknown'
      ? rest(`forgot_password_gate_attempts?ip_address=eq.${encodeURIComponent(ip)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=id`)
      : Promise.resolve([]),
  ]);
  return (Array.isArray(byEmail) && byEmail.length >= MAX_ATTEMPTS)
      || (Array.isArray(byIp) && byIp.length >= MAX_ATTEMPTS);
}

async function recordAttempt(email: string, ip: string, success: boolean) {
  try {
    await rest('forgot_password_gate_attempts', 'POST', { email, ip_address: ip, success });
  } catch (e) {
    console.error('recordAttempt failed:', e instanceof Error ? e.message : String(e));
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

async function actionCheck(email: string, ip: string) {
  if (await isLockedOut(email, ip)) {
    return json({ error: `محاولات كثيرة، حاول مرة أخرى بعد ${LOCKOUT_MINUTES} دقيقة` }, 429);
  }

  // ── هل الإيميل ده مرتبط بأدمن مكتب؟ ──
  // profiles.email جاهز فعلاً في الـschema، فREST query واحد كفاية —
  // مفيش حاجة لنداء GoTrue Admin API (راجع "الوضع الحالي" في الخطة).
  const profiles = await rest(
    `profiles?email=eq.${encodeURIComponent(email)}&select=user_id,role,tenant_id,is_active,is_locked&limit=1`,
  );
  const profile = profiles[0];

  if (!profile) {
    await recordAttempt(email, ip, false);
    return json({ status: 'not_found' });
  }

  if (profile.role !== 'admin') {
    await recordAttempt(email, ip, false);
    return json({ status: 'not_admin' });
  }

  await recordAttempt(email, ip, true);
  return json({ status: 'admin_confirmed' });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const { action, email } = body;
    const ip = getClientIp(req);

    if (action !== 'check') {
      return json({ error: `action غير معروف: ${action}` }, 400);
    }
    if (!email) {
      return json({ error: 'يرجى إدخال البريد الإلكتروني' }, 400);
    }

    return await actionCheck(email.trim(), ip);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'خطأ غير متوقع';
    // ⚠️ ما بنرجعش msg الخام للمستخدم (نفس منطق office-login) — بنسجلها
    // في اللوج للتشخيص، والرد اللي بيرجع للمستخدم رسالة ثابتة موحّدة.
    console.error('forgot-password-gate unexpected error:', msg);
    return json({ error: 'تعذّر التحقق من البريد الإلكتروني. حاول مرة أخرى.' }, 500);
  }
});
