// ══════════════════════════════════════════════════════
//  Edge Function: encyclopedia-download
//
//  المهمة: تحميل نموذج من "الموسوعة القانونية" — متاحة لأي مستخدم
//  مسجّل دخول وحسابه شغّال (مش مقصورة على سوبر أدمن، عكس
//  encyclopedia-admin تمامًا). القراءة على الجداول أصلاً مفتوحة لأي
//  authenticated في الـRLS، لكن باكت الـStorage (encyclopedia-forms)
//  private ومفيهوش سياسة قراءة لأي role — فلازم service_role لتوليد
//  رابط موقّع، ونفس الشيء لتحديث download_count (كتابة الجدول مقصورة
//  على سوبر أدمن في الـRLS). الفانكشن دي طبقة معزولة تمامًا عن
//  encyclopedia-admin (صفر تعديل عليها) — صلاحية مختلفة كليًا
//  (أي مستخدم فعّال، مش سوبر أدمن بس).
//
//  الإدخال: { form_id: string }
//  الخرج: { ok:true, url, file_name } أو { error: "..." }
//  (دايمًا status 200 لحالات الخطأ المعروفة، 401/403/500 لحالات
//  الجلسة/الحساب/الخطأ غير المتوقع — نفس اتفاقية encyclopedia-admin)
// ══════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUCKET = 'encyclopedia-forms';
const SIGNED_URL_TTL_SECONDS = 300; // 5 دقايق — كفاية لبدء التحميل فورًا، رابط تحميل مش معاينة طويلة

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── REST helpers (نفس نمط encyclopedia-admin) ──────────────────────────
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
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `status ${r.status}`);
  }
  return r.status === 204 ? null : r.json();
}

// مين الشخص اللي عامل الطلب ده
async function getCaller(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  return user?.id ? user : null;
}

async function getCallerProfile(callerId: string) {
  const rows = await rest(`profiles?user_id=eq.${callerId}&select=id,is_active&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

// ── رابط موقّع مؤقت لملف في باكت خاص (نفس نمط signStorageUrl في client-portal-api) ──
async function signStorageUrl(path: string, expiresIn = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
  if (!path) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.signedURL) return null;
    return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));
    const formId = String(body.form_id || '');

    const callerUser = await getCaller(req);
    if (!callerUser) return json({ error: 'الجلسة منتهية، سجّل الدخول من جديد' }, 401);

    const caller = await getCallerProfile(callerUser.id);
    if (!caller) return json({ error: 'حساب غير معروف' }, 403);
    if (caller.is_active === false) return json({ error: 'الحساب معطّل' }, 403);

    if (!formId) return json({ error: 'النموذج غير محدد' });

    const rows = await rest(`encyclopedia_forms?id=eq.${formId}&select=id,file_path,file_name,download_count`);
    const form = Array.isArray(rows) ? rows[0] : null;
    if (!form) return json({ error: 'النموذج غير موجود' });

    const url = await signStorageUrl(form.file_path);
    if (!url) return json({ error: 'تعذر توليد رابط التحميل، حاول مرة أخرى' });

    // عداد التحميلات — best-effort، فشله ميمنعش التحميل نفسه من النجاح
    try {
      await rest(`encyclopedia_forms?id=eq.${formId}`, 'PATCH', {
        download_count: (form.download_count || 0) + 1,
      });
    } catch (e) {
      console.error('[encyclopedia-download:incrementCount]', e instanceof Error ? e.message : String(e));
    }

    return json({ ok: true, url, file_name: form.file_name });
  } catch (e) {
    console.error('[encyclopedia-download] unexpected error', e instanceof Error ? e.message : String(e));
    return json({ error: 'حصل خطأ غير متوقع' }, 500);
  }
});
