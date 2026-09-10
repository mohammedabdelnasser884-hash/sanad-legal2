// ══════════════════════════════════════════════════════
//  Edge Function: office-secrets
//
//  المهمة: حفظ أسرار حساسة خاصة بمكتب معيّن (حاليًا: groq_key)
//  في Supabase Vault بدل تخزينها كنص صريح في عمود عادي.
//
//  ⚠️ نسخة قائمة بذاتها (self-contained) — كود CORS والتحقق من
//  الهوية متضمّن هنا مباشرة بدل الاستيراد من _shared/، لأن لوحة
//  النشر عندنا (Supabase Dashboard) بتنشر كل فانكشن كملف واحد
//  مستقل ومش بتدعم مجلدات مشتركة بين الفانكشنز. نفس نمط
//  admin-actions/index.ts و client-portal-api/index.ts الموجودين
//  عندك بالفعل.
//
//  actions:
//   saveGroqKey       { groq_key: string }        → { ok: true }
//   saveTgDailyToken  { tg_daily_token: string }   → { ok: true }
//   saveTgInstantToken{ tg_instant_token: string } → { ok: true }
//
//  الأمان: تحقق caller مسجّل دخول، حسابه فعّال، ودوره admin أو
//  super_admin في مكتبه هو نفسه (tenant_id بياخده من الـ profile
//  بتاع الطالب، مش من البودي، عشان مينفعش حد يحقن مكتب تاني).
// ══════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── CORS ─────────────────────────────────────────────
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

// ── التحقق من هوية الطالب (نفس منطق _shared/auth.ts بالظبط) ──
interface CallerProfile {
  user_id: string;
  tenant_id: string | null;
  role?: string;
  is_active?: boolean;
  is_super_admin?: boolean;
}

async function getAuthorizedCaller(
  req: Request,
): Promise<{ caller: CallerProfile } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return { error: 'الجلسة مطلوبة، سجّل الدخول من جديد', status: 401 };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!userRes.ok) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}&select=user_id,tenant_id,role,is_active,is_super_admin&limit=1`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!profRes.ok) return { error: 'تعذر التحقق من الحساب', status: 500 };
  const rows = await profRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return { error: 'حساب غير معروف', status: 403 };
  if (profile.is_active === false) return { error: 'الحساب معطّل', status: 403 };

  return { caller: profile as CallerProfile };
}

// ── نداء دوال قاعدة البيانات (Vault RPCs) ─────────────
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
}

// 🆕 FIX (تحقيق شامل E2/E3 — 10 سبتمبر 2026): نفس منطق
// subscriptionAwareMessage فى admin-actions/index.ts بالظبط (ولازم يفضلوا
// متطابقين حرفيًا مع getSubscriptionAwareMessage فى errorReporting.ts —
// أي تعديل هنا من غير ما ينعكس فى التلاتة أماكن هيكسر الكشف فى الفرونت
// إند). قبل الفيكس ده، الـcatch العام تحت كان بيبلع أي خطأ — بما فيه
// رفض tenant_write_allowed اللي دوال set_office_* بقت بترفعه بعد فيكس
// اليوم نفسه على مستوى الداتابيز — ويرجّع رسالة عامة ثابتة دايمًا، يعني
// مودال القفل المخصص كان مستحيل يظهر لعمليات حفظ مفتاح Groq/توكنات
// التليجرام مهما كان الكشف فى الفرونت إند صح.
const READONLY_LOCK_MESSAGE =
  'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';

function subscriptionAwareMessage(rawMessage: string): string | null {
  if (!rawMessage) return null;
  if (rawMessage.includes('وصلت للحد الأقصى')) return rawMessage;
  if (rawMessage.includes('tenant_write_allowed') || rawMessage.includes('وضع مشاهدة فقط دلوقتي')) return READONLY_LOCK_MESSAGE;
  return null;
}

// ── المعالج الرئيسي ────────────────────────────────────
Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authResult = await getAuthorizedCaller(req);
    if ('error' in authResult) {
      return json({ error: authResult.error }, authResult.status);
    }
    const { caller } = authResult;
    if (caller.is_super_admin !== true && caller.role !== 'admin') {
      return json({ error: 'غير مسموح لك بتنفيذ هذه العملية' }, 403);
    }
    if (!caller.tenant_id) {
      return json({ error: 'تعذر تحديد المكتب الحالي' }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === 'saveGroqKey') {
      const groqKey = String(body.groq_key || '').trim();
      if (!groqKey) return json({ error: 'المفتاح مطلوب' }, 400);

      await rpc('set_office_groq_key', { p_tenant_id: caller.tenant_id, p_key: groqKey });
      return json({ ok: true });
    }

    if (action === 'saveTgDailyToken') {
      const token = String(body.tg_daily_token || '').trim();
      if (!token) return json({ error: 'التوكن مطلوب' }, 400);

      await rpc('set_office_tg_daily_token', { p_tenant_id: caller.tenant_id, p_token: token });
      return json({ ok: true });
    }

    if (action === 'saveTgInstantToken') {
      const token = String(body.tg_instant_token || '').trim();
      if (!token) return json({ error: 'التوكن مطلوب' }, 400);

      await rpc('set_office_tg_instant_token', { p_tenant_id: caller.tenant_id, p_token: token });
      return json({ ok: true });
    }

    return json({ error: 'action غير معروف' }, 400);
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    console.error('[office-secrets]', rawMessage);
    // 🆕 FIX (10 سبتمبر 2026): لو الرسالة معروفة وآمنة (رفض قفل read-only
    // أو حد باقة — نصوصنا الثابتة إحنا، مش مدخلات مستخدم أو تفاصيل RLS
    // تقنية) بنرجّعها زي ما هي عشان الفرونت إند يقدر يكشفها ويفتح المودال
    // المخصص. أي حاجة تانية (خطأ داخلي حقيقي غير متوقع) بتفضل برسالة
    // fallback عامة زي الأول عشان منسربش تفاصيل داخلية.
    const safeMessage = subscriptionAwareMessage(rawMessage);
    return json({ error: safeMessage ?? 'تعذّر تنفيذ العملية المطلوبة. لو المشكلة استمرت، تواصل مع الدعم.' }, 500);
  }
});
