// ══════════════════════════════════════════════════════
//  Edge Function: fill-document-template
//  المرجع: Sanad_Legal_Documents_Library_Transition_Plan.md
//  (القسم 3.3 — محرك التعبئة، مرحلة 2: 2.1)
//
//  المهمة: تاخد template_version_id + خريطة قيم (field_key → قيمة)،
//  تنزّل ملف الـWord الأصلي (master_file_path) من باكت
//  legal-doc-templates، تستبدل الـtags جواه بالقيم عن طريق
//  docxtemplater (مكتبة JS خالصة — بتفتح الملف كـzip/XML وتستبدل
//  الـtags من غير أي اعتماد على LibreOffice أو باينري خارجي)،
//  وترجّع ملف .docx جديد كـbinary مباشرة في الـresponse — نفس بنية
//  XML الأصلية بالكامل (فونط/تنسيق/جداول/لوجو) زي ما هي.
//
//  ⚠️ نسخة قائمة بذاتها (self-contained) — كود CORS والتحقق من
//  الهوية متضمّن هنا مباشرة بدل الاستيراد من _shared/، لأن لوحة
//  النشر (Supabase Dashboard) بتنشر كل فانكشن كملف واحد مستقل ومش
//  بتدعم مجلدات مشتركة بين الفانكشنز — نفس نمط office-secrets/
//  admin-actions/client-portal-api الموجودين بالفعل.
//
//  ⚠️ [قرار نطاق — مرحلة 2] الفانكشن دي بتعمل "تعبئة" بس (استبدال
//  tags بالقيم المُمرَّرة زي ما هي). التحقق من اكتمال الحقول المطلوبة
//  (validateRequiredFields) وحل قيم القضية (resolveCaseBindings)
//  بيفضلوا مسؤولية الواجهة (زي ما هما دلوقتي في generationApi.ts) —
//  مش مكررين هنا. لو القيم الواصلة ناقصة، الـtag المقابل هيتستبدل
//  بسطر فاضي (nullGetter تحت)، مش خطأ — نفس سلوك fillPlaceholders()
//  النصي القديم بالحرف لما تكون القيمة null/undefined.
//
//  الأمان: تحقق caller مسجّل دخول وحسابه فعّال بس (مفيش قيد role/
//  admin هنا — عكس process-law-extract — لأن قراءة/تعبئة مستند من
//  المكتبة القانونية عملية يومية عادية لأي محامي في المكتب، مش عملية
//  إدارية). القوالب نفسها نظامية بس (مفيش قوالب خاصة بمكاتب، قرار
//  مقفول — القسم 8 بند 2)، فمفيش داعي لفحص tenant_id على القالب.
// ══════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import PizZip from 'npm:pizzip@3.1.7';
import Docxtemplater from 'npm:docxtemplater@3.62.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TEMPLATES_BUCKET = 'legal-doc-templates';

// ── CORS (نفس نمط office-secrets/process-law-extract بالحرف) ──
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

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// خطأ متوقع برسالة عربية آمنة للعرض مباشرة للمستخدم — نفس نمط
// KnownError في process-law-extract/index.ts بالحرف.
class KnownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnownError';
  }
}

// ── التحقق من هوية الطالب (نفس منطق _shared/auth.ts بالظبط، منسوخ
//    محليًا للسبب الموضّح فوق) ──
interface CallerProfile {
  user_id: string;
  tenant_id: string | null;
  is_active?: boolean;
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
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${user.id}&select=user_id,tenant_id,is_active&limit=1`,
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
  );
  if (!profRes.ok) return { error: 'تعذر التحقق من الحساب', status: 500 };
  const rows = await profRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return { error: 'حساب غير معروف', status: 403 };
  if (profile.is_active === false) return { error: 'الحساب معطّل', status: 403 };

  return { caller: profile as CallerProfile };
}

// ── محرك التعبئة نفسه — دالة منفصلة (بدل ما تكون مطبوخة جوه الـhandler
//    مباشرة) عشان تفصل منطق "التعبئة" عن منطق "الشبكة/الصلاحيات"،
//    بغض النظر عن إنها بتتختبر هنا فعليًا عن طريق الـhandler الكامل
//    (index.test.ts) مش باستدعاء منفرد — docxtemplater/pizzip بيتعملهم
//    mock على مستوى الموديول ككل، مش على مستوى الدالة دي بمفردها ──
type FieldValues = Record<string, string | number | null | undefined>;

export function fillDocxTemplate(masterBuffer: Uint8Array, values: FieldValues): Uint8Array {
  const zip = new PizZip(masterBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // قيمة فاضية بدل رمي خطأ لأي tag ناقص من values — نفس سلوك
    // fillPlaceholders() النصي القديم بالحرف (value ?? '')
    nullGetter: () => '',
  });
  doc.render(values);
  return doc.getZip().generate({ type: 'uint8array' });
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') return jsonError('الطريقة غير مدعومة', 405);

  const authResult = await getAuthorizedCaller(req);
  if ('error' in authResult) return jsonError(authResult.error, authResult.status);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => null);
    const templateVersionId: string | undefined = body?.template_version_id;
    const values: FieldValues = (body?.values && typeof body.values === 'object') ? body.values : {};

    if (!templateVersionId) throw new KnownError('template_version_id مطلوب');

    const { data: version, error: versionErr } = await supabase
      .from('template_versions')
      .select('id, master_file_path, master_file_name')
      .eq('id', templateVersionId)
      .maybeSingle();
    if (versionErr) throw versionErr;
    if (!version) throw new KnownError('نسخة القالب غير موجودة');
    if (!version.master_file_path) {
      // متوقّع لحد ما مرحلة 5 (ترحيل القوالب الأربعة الحقيقية) تضيف
      // ملف Word لكل قالب — راجع تعليق nullable في 01-legal-doc-library-columns.sql
      throw new KnownError('هذا القالب لسه معندوش ملف Word مرفوع');
    }

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(TEMPLATES_BUCKET)
      .download(version.master_file_path);
    if (dlErr || !fileBlob) throw new KnownError('فشل تحميل ملف القالب من التخزين');

    const masterBuffer = new Uint8Array(await fileBlob.arrayBuffer());

    let filledBuffer: Uint8Array;
    try {
      filledBuffer = fillDocxTemplate(masterBuffer, values);
    } catch (renderErr) {
      // أخطاء docxtemplater بتيجي بشكل object مركّب (properties.errors[])
      // مش Error عادي بسيط — بنسجّل التفصيل الخام في الـlogs، ونرجّع
      // رسالة عربية عامة آمنة للمستخدم بدل تسريب تفاصيل XML/tags داخلية.
      console.error('[fill-document-template] docxtemplater render error', renderErr);
      throw new KnownError('تعذّر تعبئة القالب — تأكد إن الملف الأصلي سليم وغير تالف');
    }

    const fileName = version.master_file_name || 'مستند.docx';
    return new Response(filledBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (e) {
    const message = e instanceof KnownError
      ? e.message
      : 'تعذّر تعبئة المستند. لو المشكلة استمرت، تواصل مع الدعم.';
    if (!(e instanceof KnownError)) console.error('[fill-document-template]', e);
    return jsonError(message, e instanceof KnownError ? 400 : 500);
  }
});
