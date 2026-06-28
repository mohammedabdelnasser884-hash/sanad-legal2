// ══════════════════════════════════════════════════════
//  Edge Function: embed-batch
//
//  المهمة:
//   توليد embedding لدفعة من المواد القانونية (التي لا تملك
//   embedding بعد) التابعة لقانون معيّن، وتحديثها في قاعدة
//   البيانات.
//
//   تُستدعى بشكل متكرر (Loop) من لوحة الإدارة حتى تنتهي كل
//   المواد — وذلك لتجنب تجاوز حدود زمن تنفيذ الـ Edge Function
//   عند معالجة قوانين تحتوي آلاف المواد.
//
//  الإدخال: { law_id: string, batch_size?: number }
//  الخرج:   { done: boolean, remaining: number, total: number }
// ══════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { embedText } from '../_shared/embed.ts';
import { getAuthorizedCaller } from '../_shared/auth.ts';

const DEFAULT_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 50;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── دي عملية إدارية مكلفة (معالجة آلاف المواد + استدعاءات embedding
  // مدفوعة) بتتنادى من لوحة الإدارة فقط — نتحقق إن الطالب admin/super_admin ──
  const authResult = await getAuthorizedCaller(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY);
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

  try {
    const { law_id, batch_size } = await req.json();
    if (!law_id) throw new Error('law_id مطلوب');

    const limit = batch_size && batch_size > 0
      ? Math.min(batch_size, MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // إجمالي عدد مواد هذا القانون
    const { count: total } = await supabase
      .from('law_articles')
      .select('id', { count: 'exact', head: true })
      .eq('law_id', law_id);

    // دفعة من المواد التي تحتاج embedding
    const { data: batch, error: fetchErr } = await supabase
      .from('law_articles')
      .select('id, article_text')
      .eq('law_id', law_id)
      .is('embedding', null)
      .limit(limit);
    if (fetchErr) throw fetchErr;

    if (!batch || batch.length === 0) {
      // اكتملت كل المواد — تحديث حالة القانون
      await supabase.from('laws').update({ status: 'completed' }).eq('id', law_id);
      return new Response(
        JSON.stringify({ done: true, remaining: 0, total: total ?? 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    for (const row of batch) {
      const embedding = await embedText(row.article_text);
      // pgvector يقبل النص بصيغة "[0.1,0.2,...]" — وهي نفس صيغة JSON.stringify لمصفوفة أرقام
      const { error: updErr } = await supabase
        .from('law_articles')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', row.id);
      if (updErr) throw updErr;
    }

    const { count: remaining } = await supabase
      .from('law_articles')
      .select('id', { count: 'exact', head: true })
      .eq('law_id', law_id)
      .is('embedding', null);

    const isDone = (remaining ?? 0) === 0;
    if (isDone) {
      await supabase.from('laws').update({ status: 'completed' }).eq('id', law_id);
    }

    return new Response(
      JSON.stringify({ done: isDone, remaining: remaining ?? 0, total: total ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
