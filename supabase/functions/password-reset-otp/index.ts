// ══════════════════════════════════════════════════════
//  Edge Function: password-reset-otp
//
//  خطوة "تأكيد الهوية" الإضافية في ResetPasswordScreen.tsx
//  (Phase 4، 2 سبتمبر 2026). بتحل مكان db.auth.signInWithOtp/
//  verifyOtp لأن قالب إيميل "Magic Link" في Supabase مقفول
//  التعديل على الخطة المجانية بدون Custom SMTP — فمش قادرين نوري
//  {{ .Token }} للمستخدم من غير توصيل SMTP خاص. الحل: نولّد الكود
//  ونبعته إحنا بنفسنا، ونخزّن الـhash بتاعه في password_reset_otps
//  للتحقق لاحقًا.
//
//  ⚡ تعديل (2 سبتمبر 2026 — قيد Resend): جرّبنا الأول إرسال الكود
//  عبر Resend API بإيميل التجربة onboarding@resend.dev، لكن اتضح إن
//  الإيميل ده بيبعت بس لإيميل صاحب حساب Resend نفسه (قيد أمان من
//  Resend لحماية سمعة الدومين، موثّق في docs.resend.com) — يعني
//  الميزة كانت هتشتغل للمطوّر بس ومش لأي حساب تاني في المكتب. بدل ما
//  نحتاج دومين مدفوع للتحقق، استبدلنا الإرسال بـ**Gmail SMTP**
//  (denomailer) — مجاني بالكامل، بيبعت لأي حد، وبيستخدم حساب Gmail
//  عادي + App Password (مش باسورد الحساب الحقيقي). حد Gmail اليومي
//  (~500 إيميل/يوم لحساب مجاني) كافي جدًا لمكتب صغير/متوسط.
//
//  action: send         { }        → يولّد كود جديد ويبعته على إيميل
//                                     المستخدم (من جلسة الـrecovery نفسها)
//  action: verify       { code }   → يتحقق من الكود المدخل
//  action: set_password { password } → يغيّر الباسورد فعليًا (عبر Admin
//                                     API بصلاحية service_role) — يترفض
//                                     تمامًا لو مفيش كود متأكَّد (consumed_at)
//                                     حديث لنفس المستخدم. ده اللي بيقفل
//                                     ثغرة تخطي شاشة الكود عن طريق نداء
//                                     مباشر لـdb.auth.updateUser من المتصفح.
//
//  ⚠️ الاتنين محتاجين Authorization header بجلسة recovery صالحة
//  (نفس الجلسة اللي Supabase بتفتحها لما المستخدم يدوس لينك
//  الاستعادة) — بنستخرج user_id/email منها عن طريق GoTrue
//  /auth/v1/user، مش من أي بيانات جاية من الفرونت إند مباشرة، عشان
//  محدش يقدر يطلب/يتحقق من كود لإيميل حساب تاني.
//
//  ⚡ self-contained (بلا استيراد من ../_shared/) بنفس نمط
//  office-login/saas-admin — عشان يتوافق مع النشر من لوحة Supabase
//  (ملف واحد لكل فانكشن). الاستثناء الوحيد: استيراد denomailer من
//  deno.land (مكتبة SMTP خفيفة، نفس الطريقة الموثّقة رسميًا في
//  أمثلة Supabase Edge Functions لإرسال إيميلات عبر SMTP).
// ══════════════════════════════════════════════════════

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

// ── إعدادات Gmail SMTP (مجانية بالكامل) ──
// SMTP_USER: إيميل Gmail بتاع المكتب/المشروع (نفس الإيميل اللي عملت
// عليه App Password). SMTP_PASS: الكود المكوّن من 16 حرف من
// myaccount.google.com/apppasswords (مش باسورد الحساب نفسه).
// SMTP_HOST/SMTP_PORT ليهم قيمة افتراضية لـGmail، فمش لازم تتحطّ إلا
// لو غيّرت مزوّد الإيميل لاحقًا (مثلاً لدومين خاص).
const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') || '465');
const SMTP_USER = Deno.env.get('SMTP_USER');
const SMTP_PASS = Deno.env.get('SMTP_PASS');
const SMTP_FROM = Deno.env.get('SMTP_FROM') || (SMTP_USER ? `سَنَد <${SMTP_USER}>` : '');

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
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP_USER/SMTP_PASS غير مضبوطين في إعدادات المشروع (Edge Function secrets)');

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: true,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  });

  try {
    await client.send({
      from: SMTP_FROM,
      to: email,
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
    });
  } finally {
    // ⚠️ لازم نقفل الاتصال دايمًا (حتى لو send فشلت) وإلا الفانكشن
    // ممكن تعلّق لحد الـtimeout بدل ما ترجع رد فورًا.
    await client.close();
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

// ── تغيير الباسورد الفعلي — لازم كود متأكَّد (consumed_at) حديث ──
// ⚡ NEW (2 سبتمبر 2026 — إغلاق ثغرة تخطي واجهة الكود): قبل كده كان
// الفرونت إند بينده على db.auth.updateUser مباشرة من المتصفح — يعني
// مرحلة "تأكيد الكود" كانت بتتحكم في الشاشة بس، من غير ما السيرفر
// يتأكد فعليًا إن الكود اتأكد قبل قبول تغيير الباسورد. أي حد معاه
// جلسة الـrecovery (access token) كان يقدر يغيّر الباسورد بنداء
// مباشر من غير ما يمر على الكود خالص. دلوقتي تغيير الباسورد بيتم من
// هنا بس (بصلاحية service_role عبر Admin API)، وبيترفض تمامًا لو
// مفيش صف OTP متأكَّد (consumed_at) لنفس المستخدم خلال آخر
// SET_PASSWORD_WINDOW_MINUTES دقيقة.
const SET_PASSWORD_WINDOW_MINUTES = 10;

function mapAdminPasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('different from the old password')) {
    return 'الباسورد الجديد لازم يكون مختلف عن الباسورد القديم. اختار باسورد تاني.';
  }
  if (m.includes('password') && m.includes('at least')) {
    return 'الباسورد قصير جدًا. اختار باسورد أطول.';
  }
  return 'تعذّر تحديث كلمة المرور. حاول مرة أخرى، أو اطلب لينك استعادة جديد.';
}

async function actionSetPassword(req: Request, password: string) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  if (!password || password.length < 8) {
    return json({ error: 'الباسورد لازم يكون 8 أحرف على الأقل' }, 400);
  }

  // ── الشرط الأهم: لازم كود متأكَّد حديثًا لنفس المستخدم ──
  const rows = await rest(
    `password_reset_otps?user_id=eq.${caller.id}&select=*&order=created_at.desc&limit=1`,
  );
  const otpRow = Array.isArray(rows) ? rows[0] : null;

  if (!otpRow || !otpRow.consumed_at) {
    return json({ error: 'لازم تأكيد كود التحقق أولًا قبل تعيين باسورد جديد' }, 403);
  }
  const minutesSinceVerified = (Date.now() - new Date(otpRow.consumed_at).getTime()) / 60000;
  if (minutesSinceVerified > SET_PASSWORD_WINDOW_MINUTES) {
    return json({ error: 'انتهت مهلة تأكيد الكود — أعد طلب كود جديد وتأكيده مرة أخرى' }, 410);
  }

  // ── تغيير الباسورد فعليًا عبر Admin API بصلاحية service_role ──
  // (مش عبر GoTrue self-service /auth/v1/user، عشان محدش يقدر يستدعي
  // نفس المسار مباشرة من المتصفح ويتخطى الشرط اللي فوق).
  const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${caller.id}`, {
    method: 'PUT',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  const adminData = await adminRes.json().catch(() => ({}));
  if (!adminRes.ok) {
    const rawMsg = adminData?.msg || adminData?.message || adminData?.error_description || String(adminRes.status);
    console.error('actionSetPassword admin update failed:', rawMsg);
    return json({ error: mapAdminPasswordError(rawMsg) }, adminRes.status);
  }

  // نجح التغيير — نمسح صف الكود عشان مايتقدرش يُستخدم تاني لتغيير
  // باسورد إضافي من غير ما يعدّي على كود جديد.
  await rest(`password_reset_otps?id=eq.${otpRow.id}`, 'DELETE').catch(() => {});

  return json({ success: true });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, string>;
    const { action, code, password } = body;

    if (action === 'send') return await actionSend(req);
    if (action === 'verify') return await actionVerify(req, code);
    if (action === 'set_password') return await actionSetPassword(req, password);

    return json({ error: `action غير معروف: ${action}` }, 400);
  } catch (e) {
    console.error('password-reset-otp unexpected error:', e instanceof Error ? e.message : String(e));
    return json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' }, 500);
  }
});
