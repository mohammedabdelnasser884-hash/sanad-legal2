// ══════════════════════════════════════════════════════
//  Edge Function: process-law-extract
//
//  المهمة:
//   1. تحميل ملف PDF للقانون من Supabase Storage
//   2. استخراج النص الكامل منه
//   3. تقسيمه إلى مواد قانونية منفصلة
//   4. تخزين كل مادة كسجل مستقل في law_articles
//      (بدون embeddings — هذه مهمة embed-batch التالية)
//
//  الإدخال: { law_id: string }
// ══════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { splitIntoArticles } from '../_shared/splitArticles.ts';
import { getAuthorizedCaller } from '../_shared/auth.ts';

const SUPABASE_URL_ENV = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY_ENV = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── معالجة قانون كامل (تحميل PDF + استخراج نص + حذف/إدراج مواد) عملية
  // إدارية حصرية — نتحقق إن الطالب admin/super_admin قبل أي شيء ──
  const authResult = await getAuthorizedCaller(req, SUPABASE_URL_ENV, ANON_KEY, SERVICE_ROLE_KEY_ENV);
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { caller } = authResult;
  if (caller.is_super_admin !== true && caller.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'غير مسموح لك بتنفيذ هذه العملية' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let law_id: string | undefined;

  try {
    const body = await req.json();
    law_id = body?.law_id;
    if (!law_id) throw new Error('law_id مطلوب');

    // 1) جلب بيانات القانون
    const { data: law, error: lawErr } = await supabase
      .from('laws')
      .select('*')
      .eq('id', law_id)
      .single();
    if (lawErr || !law) throw new Error('القانون غير موجود');
    if (!law.file_path) throw new Error('لا يوجد ملف PDF مرفوع لهذا القانون');

    await supabase.from('laws')
      .update({ status: 'processing', processing_error: null })
      .eq('id', law_id);

    // 2) تحميل الملف من Storage
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from('legal-library')
      .download(law.file_path);
    if (dlErr || !fileBlob) throw new Error('فشل تحميل ملف القانون من المخزن');

    // 3) استخراج النص من PDF
    const buffer = new Uint8Array(await fileBlob.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join('\n') : (text as string);

    if (!fullText || fullText.trim().length < 20) {
      throw new Error(
        'تعذر استخراج نص من الملف. قد يكون الملف عبارة عن صور ممسوحة (Scanned) بدون نص قابل للقراءة.',
      );
    }

    // 4) تقسيم النص إلى مواد
    const articles = splitIntoArticles(fullText);
    if (articles.length === 0) {
      const sample = fullText.slice(0, 800);
      throw new Error('لم يتم العثور على أي مادة بصيغة "مادة (رقم)" داخل النص المستخرج. عينة من النص: ' + sample);
    }

    // 5) حذف المواد القديمة (في حالة إعادة المعالجة) وإدخال الجديدة
    const { error: delErr } = await supabase.from('law_articles').delete().eq('law_id', law_id);
    if (delErr) throw delErr;

    const rows = articles.map((a) => ({
      law_id,
      article_number: a.article_number,
      order_index: a.order_index,
      article_text: a.article_text,
      article_preview: a.article_preview,
    }));

    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await supabase.from('law_articles').insert(rows.slice(i, i + CHUNK));
      if (insErr) throw insErr;
    }

    // 6) تحديث عدد المواد في جدول القوانين
    await supabase.rpc('refresh_law_articles_count', { p_law_id: law_id });

    // 7) المعالجة اكتملت فعليًا هنا — المساعد القانوني يعتمد على بحث نصي
    // (search_law_articles RPC) لا على embeddings، فلا داعٍ لانتظار أي
    // خطوة لاحقة (embed-batch) قبل اعتبار القانون "مكتمل المعالجة".
    // ملحوظة: embed-batch لسه موجودة وممكن تتفعّل مستقبلاً لو احتجنا بحث
    // دلالي (semantic search) بجانب البحث النصي الحالي، لكنها خطوة اختيارية
    // منفصلة ومش شرط لظهور القانون كمكتمل أو لعمل المساعد القانوني.
    await supabase.from('laws')
      .update({ status: 'completed', processing_error: null })
      .eq('id', law_id);

    return new Response(
      JSON.stringify({ success: true, articles_count: articles.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (law_id) {
      await supabase.from('laws')
        .update({ status: 'failed', processing_error: message })
        .eq('id', law_id);
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
