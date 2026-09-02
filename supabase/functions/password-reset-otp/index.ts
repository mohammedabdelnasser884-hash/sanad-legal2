// ══════════════════════════════════════════════════════
//  Edge Function: password-reset-otp
//
//  خطوة "تأكيد الهوية" الإضافية في ResetPasswordScreen.tsx
//  (Phase 4، 2 سبتمبر 2026). بتحل مكان db.auth.signInWithOtp/
//  verifyOtp لأن قالب إيميل "Magic Link" في Supabase مقفول
//  التعديل على الخطة المجانية بدون Custom SMTP — فمش قادرين نوري
//  {{ .Token }} للمستخدم من غير توصيل SMTP خاص. الحل: نولّد الكود
//  ونبعته إحنا بنفسنا عبر Resend، ونخزّن الـhash بتاعه في
//  password_reset_otps للتحقق لاحقًا.
//
//  action: send   { }        → يولّد كود جديد ويبعته على إيميل
//                               المستخدم (من جلسة الـrecovery نفسها)
//  action: verify { code }   → يتحقق من الكود المدخل
//
//  ⚠️ الاتنين محتاجين Authorization header بجلسة recovery صالحة
//  (نفس الجلسة اللي Supabase بتفتحها لما المستخدم يدوس لينك
//  الاستعادة) — بنستخرج user_id/email منها عن طريق GoTrue
//  /auth/v1/user، مش من أي بيانات جاية من الفرونت إند مباشرة، عشان
//  محدش يقدر يطلب/يتحقق من كود لإيميل حساب تاني.
//
//  ⚡ self-contained (بلا استيراد من ../_shared/) بنفس نمط
//  office-login/saas-admin — عشان يتوافق مع النشر من لوحة Supabase
//  (ملف واحد لكل فانكشن).
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY');
// لو مالكش دومين موثّق في Resend لسه، سيب القيمة الافتراضية دي —
// بتشتغل فورًا للتجربة. لما توثّق دومين بتاعك، غيّرها لـ secret
// RESEND_FROM_EMAIL بإيميل من الدومين بتاعك (مثلاً noreply@sanad...).
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Sanad <onboarding@resend.dev>';

const OTP_TTL_MINUTES     = 15; // نفس مدة صلاحية اللينك (Email OTP Expiration)
const RESEND_COOLDOWN_SEC = 45;
const MAX_VERIFY_ATTEMPTS = 5;

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

// ── يستخرج user_id/email من الـAuthorization header الحالي —
//    نفس فكرة _shared/auth.ts بس self-contained هنا. ──
async function getCallerUser(req: Request): Promise<{ id: string; email: string } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return { error: 'الجلسة مطلوبة، اطلب لينك استعادة جديد من شاشة الدخول', status: 401 };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!userRes.ok) return { error: 'الجلسة منتهية، اطلب لينك استعادة جديد من شاشة الدخول', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id || !user?.email) return { error: 'تعذر التعرف على حسابك، اطلب لينك استعادة جديد', status: 401 };
  return { id: user.id, email: user.email };
}

function generateCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 1_000_000).toString().padStart(6, '0');
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendCodeEmail(email: string, code: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY غير مضبوط في إعدادات المشروع');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [email],
      subject: 'كود تأكيد استعادة كلمة المرور — سَنَد',
      html: `
        <div style="font-family:sans-serif;direction:rtl;text-align:right;max-width:420px;margin:0 auto">
          <h2 style="margin-bottom:8px">تأكيد استعادة كلمة المرور</h2>
          <p style="color:#444;line-height:1.6">
            استخدم الكود ده لتأكيد هويتك قبل تعيين كلمة مرور جديدة لحسابك في سَنَد.
            الكود صالح لمدة ${OTP_TTL_MINUTES} دقيقة فقط.
          </p>
          <div style="font-size:32px;font-weight:900;letter-spacing:8px;text-align:center;
                      background:#f4f4f5;border-radius:12px;padding:16px;margin:20px 0">
            ${code}
          </div>
          <p style="color:#888;font-size:12px">
            لو مطلبتش الكود ده، تجاهل الرسالة — حسابك لسه آمن.
          </p>
        </div>
      `,
    }),
  });

  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody?.message || `Resend rejected the request (status ${r.status})`);
  }
}

async function actionSend(req: Request) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  // ── منع الإرسال المتكرر (نفس نمط brute-force الموجود في المشروع) ──
  const recent = await rest(
    `password_reset_otps?user_id=eq.${caller.id}&select=created_at&order=created_at.desc&limit=1`,
  );
  if (Array.isArray(recent) && recent[0]) {
    const secondsSince = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (secondsSince < RESEND_COOLDOWN_SEC) {
      return json({ error: `انتظر ${Math.ceil(RESEND_COOLDOWN_SEC - secondsSince)} ثانية قبل ما تطلب كود جديد` }, 429);
    }
  }

  const code = generateCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const inserted = await rest('password_reset_otps', 'POST', {
    user_id: caller.id,
    email: caller.email,
    code_hash: codeHash,
    expires_at: expiresAt,
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;

  try {
    await sendCodeEmail(caller.email, code);
  } catch (e) {
    // فشل الإرسال الفعلي — نمسح الصف عشان الـcooldown مايمنعش
    // محاولة تانية فورية لمستخدم مطلبش كود أصلًا فعليًا.
    if (row?.id) await rest(`password_reset_otps?id=eq.${row.id}`, 'DELETE').catch(() => {});
    console.error('sendCodeEmail failed:', e instanceof Error ? e.message : String(e));
    return json({ error: 'تعذّر إرسال كود التحقق حاليًا. حاول مرة أخرى بعد لحظات.' }, 502);
  }

  return json({ success: true });
}

async function actionVerify(req: Request, code: string) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  if (!code || !/^\d{6}$/.test(code)) {
    return json({ error: 'أدخل كود مكوّن من 6 أرقام' }, 400);
  }

  const rows = await rest(
    `password_reset_otps?user_id=eq.${caller.id}&consumed_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  const otpRow = Array.isArray(rows) ? rows[0] : null;

  if (!otpRow) {
    return json({ error: 'لا يوجد كود صالح — اطلب كود جديد' }, 404);
  }
  if (otpRow.attempts >= MAX_VERIFY_ATTEMPTS) {
    return json({ error: 'تم تجاوز عدد المحاولات المسموح — اطلب كود جديد' }, 429);
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    return json({ error: 'انتهت صلاحية الكود — اطلب كود جديد' }, 410);
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== otpRow.code_hash) {
    await rest(`password_reset_otps?id=eq.${otpRow.id}`, 'PATCH', { attempts: otpRow.attempts + 1 }).catch(() => {});
    return json({ error: 'الكود غير صحيح أو منتهي الصلاحية' }, 401);
  }

  await rest(`password_reset_otps?id=eq.${otpRow.id}`, 'PATCH', { consumed_at: new Date().toISOString() });
  return json({ success: true });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const { action, code } = body;

    if (action === 'send') return await actionSend(req);
    if (action === 'verify') return await actionVerify(req, code);

    return json({ error: `action غير معروف: ${action}` }, 400);
  } catch (e) {
    console.error('password-reset-otp unexpected error:', e instanceof Error ? e.message : String(e));
    return json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' }, 500);
  }
});
