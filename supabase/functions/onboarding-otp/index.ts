// ══════════════════════════════════════════════════════
//  Edge Function: onboarding-otp
//
//  خطوة "تحقق الإيميل" في تدفق انضمام مكتب جديد (Onboarding)،
//  راجع Sanad_Office_Onboarding_Plan.md. بتحل مكان أي تأكيد
//  تلقائي — المكتب الجديد لازم يأكد إيميله بكود قبل ما يقدر
//  يعدّي لشاشة تعيين الباسورد + بيانات المكتب.
//
//  ⚡ نفس آلية إرسال الكود المستخدمة فعليًا في password-reset-otp
//  (Brevo عبر HTTPS API عادي — مفيش SMTP)، بس لغرض مختلف تمامًا
//  (تفعيل حساب لأول مرة، مش استعادة باسورد) وبمنطق cooldown/lockout
//  مختلف بالكامل (escalating، راجع القسم 2.4 من الخطة) — عشان كده
//  جدول onboarding_verifications منفصل عن password_reset_otps ومفيش
//  أي تشارك كود بينهم غير النمط العام.
//
//  action: send     { }                        → يبعت كود جديد،
//                                                  أو يرفض بقفل/تجميد
//  action: verify   { code }                    → يتحقق من الكود،
//                                                  onboarding_status
//                                                  يبقى 'pending_setup'
//  action: complete { password, officeSettings } → باسورد جديد دائم +
//                                                  بيانات المكتب،
//                                                  onboarding_status
//                                                  يبقى 'completed'
//
//  ⚠️ الثلاثة actions محتاجين Authorization header بجلسة صالحة —
//  المستخدم عدّى بالفعل office-login بالباسورد المؤقت، فمعاه session
//  عادية (access_token) زي أي مستخدم تاني. بنستخرج user_id/email من
//  الجلسة نفسها (GoTrue /auth/v1/user)، مش من أي بيانات جاية من
//  الفرونت إند مباشرة.
//
//  ⚡ self-contained (بلا استيراد من ../_shared/) بنفس نمط
//  password-reset-otp/office-login/saas-admin.
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

// ── إعدادات Brevo — نفس secrets المضبوطة بالفعل لـ password-reset-otp ──
const BREVO_API_KEY      = Deno.env.get('BREVO_API_KEY');
const BREVO_SENDER_EMAIL = Deno.env.get('BREVO_SENDER_EMAIL');
const BREVO_SENDER_NAME  = Deno.env.get('BREVO_SENDER_NAME') || 'سَنَد';

const OTP_TTL_MINUTES     = 15; // نفس مدة password-reset-otp
const MAX_VERIFY_ATTEMPTS = 5;  // نفس MAX_VERIFY_ATTEMPTS الحالي

// ── سلم إعادة الإرسال المتصاعد (القسم 2.4) — index = resend_stage الجديد ──
const RESEND_WAIT_SEC: Record<number, number> = { 1: 45, 2: 120, 3: 900 };

// ── دورات القفل المتصاعدة (القسم 2.4) — index = onboarding_lockout_tier الجديد ──
const LOCK_DURATIONS_MS: Record<number, number> = {
  1: 24 * 60 * 60 * 1000,
  2: 72 * 60 * 60 * 1000,
  3: 7 * 24 * 60 * 60 * 1000,
};

const SUPPORT_TAIL =
  'للتواصل مع الدعم: sanad-nizam-site.vercel.app | facebook.com/sanadnizam | sanadnizam@gmail.com';

const FROZEN_MESSAGE = `تم تجميد هذا الحساب مؤقتًا لحين تدخل الدعم الفني. ${SUPPORT_TAIL}`;

function formatDuration(ms: number): string {
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours} ساعة`;
  return `${Math.ceil(hours / 24)} يوم`;
}

function lockedMessage(remainingMs: number): string {
  return `الحساب مقفول مؤقتًا لمدة أقصاها ${formatDuration(remainingMs)} بسبب محاولات إعادة إرسال كثيرة. ${SUPPORT_TAIL}`;
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

// ── يستخرج user_id/email من الـAuthorization header الحالي (نفس نمط password-reset-otp) ──
async function getCallerUser(req: Request): Promise<{ id: string; email: string } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return { error: 'الجلسة مطلوبة، سجّل الدخول من جديد', status: 401 };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!userRes.ok) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id || !user?.email) return { error: 'تعذر التعرف على حسابك، سجّل الدخول من جديد', status: 401 };
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
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_API_KEY/BREVO_SENDER_EMAIL غير مضبوطين في إعدادات المشروع (Edge Function secrets)');
  }

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
      to: [{ email }],
      subject: 'كود تفعيل حسابك — سَنَد',
      htmlContent: `
        <div style="font-family:sans-serif;direction:rtl;text-align:right;max-width:420px;margin:0 auto">
          <h2 style="margin-bottom:8px">تفعيل حسابك في سَنَد</h2>
          <p style="color:#444;line-height:1.6">
            استخدم الكود ده لتأكيد إيميلك وتفعيل حساب مكتبك في سَنَد.
            الكود صالح لمدة ${OTP_TTL_MINUTES} دقيقة فقط.
          </p>
          <div style="font-size:32px;font-weight:900;letter-spacing:8px;text-align:center;
                      background:#f4f4f5;border-radius:12px;padding:16px;margin:20px 0">
            ${code}
          </div>
          <p style="color:#888;font-size:12px">
            لو مطلبتش الكود ده، تجاهل الرسالة.
          </p>
        </div>
      `,
    }),
  });

  if (!r.ok) {
    const errBody = await r.json().catch(() => ({}));
    throw new Error(errBody?.message || `Brevo rejected the request (status ${r.status})`);
  }
}

// ── action: send ─────────────────────────────────────
async function actionSend(req: Request) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  const profiles = await rest(
    `profiles?user_id=eq.${caller.id}&select=onboarding_status,onboarding_frozen,onboarding_locked_until,onboarding_lockout_tier&limit=1`,
  );
  const profile = profiles[0];
  if (!profile) return json({ error: 'تعذر العثور على بيانات الحساب' }, 404);

  if (profile.onboarding_status !== 'pending_verification') {
    return json({ error: 'لا يوجد تحقق مطلوب لهذا الحساب حاليًا' }, 400);
  }

  if (profile.onboarding_frozen) {
    return json({ error: FROZEN_MESSAGE }, 423);
  }

  if (profile.onboarding_locked_until && new Date(profile.onboarding_locked_until) > new Date()) {
    const remainingMs = new Date(profile.onboarding_locked_until).getTime() - Date.now();
    return json({ error: lockedMessage(remainingMs) }, 429);
  }

  const rows = await rest(
    `onboarding_verifications?user_id=eq.${caller.id}&select=*&order=created_at.desc&limit=1`,
  );
  const lastRow = Array.isArray(rows) ? rows[0] : null;

  // لو مفيش صف قبل كده، أو آخر صف هو اللي سبب دورة قفل (locked_until
  // متسجل عليه) وعدّت مدتها بالفعل (اتأكدنا فوق) → دورة جديدة من الصفر.
  const freshCycle = !lastRow || !!lastRow.locked_until;
  let nextStage = 0;

  if (!freshCycle) {
    nextStage = lastRow.resend_stage + 1;

    if (nextStage > 3) {
      // تجاوز السقف (3 إعادة إرسال) — تصعيد دورة قفل جديدة
      const newTier = (profile.onboarding_lockout_tier || 0) + 1;

      // نسجل على آخر صف إنه سبب انتهاء الدورة عشان الطلب الجاي يبدأ من الصفر
      await rest(`onboarding_verifications?id=eq.${lastRow.id}`, 'PATCH', {
        locked_until: new Date().toISOString(),
      }).catch(() => {});

      if (newTier >= 4) {
        await rest(`profiles?user_id=eq.${caller.id}`, 'PATCH', { onboarding_frozen: true });
        return json({ error: FROZEN_MESSAGE }, 423);
      }

      const lockMs = LOCK_DURATIONS_MS[newTier];
      const lockedUntil = new Date(Date.now() + lockMs).toISOString();
      await rest(`profiles?user_id=eq.${caller.id}`, 'PATCH', {
        onboarding_lockout_tier: newTier,
        onboarding_locked_until: lockedUntil,
      });
      return json({ error: lockedMessage(lockMs) }, 429);
    }

    const requiredWaitSec = RESEND_WAIT_SEC[nextStage];
    const secondsSince = (Date.now() - new Date(lastRow.created_at).getTime()) / 1000;
    if (secondsSince < requiredWaitSec) {
      return json({ error: `انتظر ${Math.ceil(requiredWaitSec - secondsSince)} ثانية قبل ما تطلب كود جديد` }, 429);
    }
  }

  const code = generateCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const inserted = await rest('onboarding_verifications', 'POST', {
    user_id: caller.id,
    email: caller.email,
    code_hash: codeHash,
    expires_at: expiresAt,
    resend_stage: nextStage,
  });
  const row = Array.isArray(inserted) ? inserted[0] : inserted;

  try {
    await sendCodeEmail(caller.email, code);
  } catch (e) {
    if (row?.id) await rest(`onboarding_verifications?id=eq.${row.id}`, 'DELETE').catch(() => {});
    console.error('sendCodeEmail failed:', e instanceof Error ? e.message : String(e));
    return json({ error: 'تعذّر إرسال كود التحقق حاليًا. حاول مرة أخرى بعد لحظات.' }, 502);
  }

  return json({ success: true, resend_stage: nextStage });
}

// ── action: verify ───────────────────────────────────
async function actionVerify(req: Request, code: string) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  if (!code || !/^\d{6}$/.test(code)) {
    return json({ error: 'أدخل كود مكوّن من 6 أرقام' }, 400);
  }

  const rows = await rest(
    `onboarding_verifications?user_id=eq.${caller.id}&consumed_at=is.null&select=*&order=created_at.desc&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) return json({ error: 'لا يوجد كود صالح — اطلب كود جديد' }, 404);
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    return json({ error: 'تم تجاوز عدد المحاولات المسموح — اطلب كود جديد' }, 429);
  }
  if (new Date(row.expires_at) < new Date()) {
    return json({ error: 'انتهت صلاحية الكود — اطلب كود جديد' }, 410);
  }

  const codeHash = await sha256Hex(code);
  if (codeHash !== row.code_hash) {
    await rest(`onboarding_verifications?id=eq.${row.id}`, 'PATCH', { attempts: row.attempts + 1 }).catch(() => {});
    return json({ error: 'الكود غير صحيح' }, 401);
  }

  await rest(`onboarding_verifications?id=eq.${row.id}`, 'PATCH', { consumed_at: new Date().toISOString() });

  // نجاح فعلي — تصفير عداد دورات القفل، مفيش داعي يفضل شغال بعد كده
  await rest(`profiles?user_id=eq.${caller.id}`, 'PATCH', {
    onboarding_status: 'pending_setup',
    onboarding_lockout_tier: 0,
    onboarding_locked_until: null,
  });

  return json({ success: true });
}

// ── action: complete ─────────────────────────────────
// حقول office_settings المسموح بيها من شاشة الـonboarding فقط — نفس
// الحقول المذكورة في القسم 2.2 من الخطة (هوية/تواصل أساسية). باقي
// حقول الجدول (الضريبة/البنك/الفاتورة/تليجرام...) بتتعدل لاحقًا من
// شاشة الإعدادات العادية، مش من هنا.
const OFFICE_SETTINGS_FIELDS = [
  'name', 'slogan', 'logo_url', 'brand_color', 'accent_color',
  'phone', 'phone2', 'email', 'website', 'whatsapp',
  'address', 'city', 'country', 'facebook', 'instagram',
];

function mapAdminPasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('password') && m.includes('at least')) {
    return 'الباسورد قصير جدًا. اختار باسورد أطول.';
  }
  return 'تعذّر تحديث كلمة المرور. حاول مرة أخرى.';
}

async function actionComplete(req: Request, password: string, officeSettings: Record<string, unknown> | undefined) {
  const caller = await getCallerUser(req);
  if ('error' in caller) return json({ error: caller.error }, caller.status);

  const profiles = await rest(`profiles?user_id=eq.${caller.id}&select=onboarding_status,tenant_id&limit=1`);
  const profile = profiles[0];
  if (!profile) return json({ error: 'تعذر العثور على بيانات الحساب' }, 404);

  // بدون قيد وقت (بعكس password-reset-otp) — قرار الاستمرارية في القسم 2.3
  if (profile.onboarding_status !== 'pending_setup') {
    return json({ error: 'لازم تأكيد كود التحقق أولًا قبل إكمال الإعداد' }, 403);
  }

  if (!password || password.length < 8) {
    return json({ error: 'الباسورد لازم يكون 8 أحرف على الأقل' }, 400);
  }
  if (!officeSettings || typeof officeSettings !== 'object') {
    return json({ error: 'بيانات المكتب مطلوبة' }, 400);
  }

  // ── تعيين الباسورد الجديد فعليًا عبر Admin API ──
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
    console.error('actionComplete admin update failed:', rawMsg);
    return json({ error: mapAdminPasswordError(rawMsg) }, adminRes.status);
  }

  // ── UPSERT office_settings — whitelist الحقول بس ──
  const payload: Record<string, unknown> = { tenant_id: profile.tenant_id };
  for (const key of OFFICE_SETTINGS_FIELDS) {
    if (key in officeSettings) payload[key] = officeSettings[key];
  }

  const existing = await rest(`office_settings?tenant_id=eq.${profile.tenant_id}&select=id&limit=1`);
  const existingRow = Array.isArray(existing) ? existing[0] : null;
  if (existingRow?.id) {
    await rest(`office_settings?id=eq.${existingRow.id}`, 'PATCH', payload);
  } else {
    await rest('office_settings', 'POST', payload);
  }

  await rest(`profiles?user_id=eq.${caller.id}`, 'PATCH', { onboarding_status: 'completed' });

  return json({ success: true });
}

// ── Main handler ──────────────────────────────────────

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, code, password, officeSettings } = body as {
      action?: string;
      code?: string;
      password?: string;
      officeSettings?: Record<string, unknown>;
    };

    if (action === 'send')     return await actionSend(req);
    if (action === 'verify')   return await actionVerify(req, code || '');
    if (action === 'complete') return await actionComplete(req, password || '', officeSettings);

    return json({ error: `action غير معروف: ${action}` }, 400);
  } catch (e) {
    console.error('onboarding-otp unexpected error:', e instanceof Error ? e.message : String(e));
    return json({ error: 'حدث خطأ غير متوقع، حاول مرة أخرى' }, 500);
  }
});
