// ══════════════════════════════════════════════════════
//  Edge Function: embed-query
//
//  المهمة: تحويل سؤال المستخدم (نص) إلى embedding، لاستخدامه
//  في البحث الدلالي عن المواد القانونية المناسبة عبر
//  match_law_articles.
//
//  الإدخال: { text: string }
//  الخرج:   { embedding: number[] }
// ══════════════════════════════════════════════════════

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { embedText } from '../_shared/embed.ts';
import { getAuthorizedCaller } from '../_shared/auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // ── لازم تكون جلسة مستخدم حقيقية ومُفعّلة، عشان حد anon مجهول
  // ما يستهلكش استدعاءات API الـ embeddings المدفوعة ──
  const authResult = await getAuthorizedCaller(req, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY);
  if ('error' in authResult) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('text مطلوب');
    }

    const embedding = await embedText(text);

    return new Response(
      JSON.stringify({ embedding }),
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
