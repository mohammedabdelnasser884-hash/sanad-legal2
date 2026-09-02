-- ══════════════════════════════════════════════════════════════════
--  Migration: بحث إملائي متسامح حقيقي (pg_trgm) — "مرحلة 1 توسيع"
--  (سبتمبر 2026)
--
--  الفرق عن الميزة الموجودة فعلًا (imatchOrClause في الفرونت إند):
--  imatch بيعالج تنويعات الحروف الشائعة بس (همزات/تاء مربوطة/ألف
--  مقصورة) — مش خطأ إملائي حقيقي زي حرف زيادة/ناقص/مقلوب. المطلوب هنا
--  تشابه حقيقي (trigram similarity) بيرجّع أقرب نتايج مرتبة، مش مجرد
--  تطابق/عدم تطابق.
--
--  النطاق (عمدًا محدود على 3 أعمدة الأول، زي ما اتفقنا): اسم الموكل،
--  عنوان القضية، اسم طرف الدعوى. التوسعة لباقي الأعمدة (جلسات/ملاحظات/
--  أتعاب/تذكيرات) هتيجي في migration منفصلة بعد ما تتجرب دي فعليًا.
--
--  أمان: كل دوال الـRPC هنا SECURITY INVOKER (مش DEFINER) عمدًا — يعني
--  بتفضل خاضعة لنفس سياسات RLS (tenant_id = current_tenant_id()) اللي
--  الجداول دي أصلًا محكومة بيها. حد من مكتب A مش هيقدر يشوف نتيجة من
--  مكتب B حتى لو استخدم البحث الإملائي المتسامح ده.
--
--  الملف Idempotent (CREATE EXTENSION IF NOT EXISTS، CREATE INDEX IF
--  NOT EXISTS، CREATE OR REPLACE FUNCTION) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) تفعيل الإضافة ──
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2) فهارس GIN تريجرام على الأعمدة الثلاثة ──
-- ⚠️ إنشاء الفهرس ده ممكن ياخد وقت لو الجدول كبير (لوك على الجدول وقت
-- الإنشاء العادي، مش CONCURRENTLY) — الأفضل يتشغل في وقت هادئ (مش وسط
-- ساعات ذروة استخدام المكتب) لو قاعدة البيانات فيها آلاف السجلات.
CREATE INDEX IF NOT EXISTS idx_clients_full_name_trgm
  ON public.clients USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cases_title_trgm
  ON public.cases USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_case_parties_name_trgm
  ON public.case_parties USING gin (name gin_trgm_ops);

-- ── 3) عتبة التشابه الافتراضية ──
-- word_similarity بترجع رقم من 0 (مفيش تشابه) لـ1 (تطابق تام). 0.3
-- نقطة بداية تجريبية — لو حسّيت النتايج بعيدة عن بعضها كتّر الرقم
-- (مثلاً 0.4)، لو حسّيت بتفوّت حالات قريبة قلّله (مثلاً 0.25). الرقم
-- بيتبعت كباراميتر اختياري لكل دالة تحت، مش قيمة مقفولة في الكود.
-- الافتراضي هنا 0.3 لحد ما تجرب وتقولي رأيك.

-- ── 4) search_clients_fuzzy ──
CREATE OR REPLACE FUNCTION public.search_clients_fuzzy(
  p_query      text,
  p_threshold  real DEFAULT 0.3,
  p_limit      int  DEFAULT 20
)
RETURNS TABLE (
  id            uuid,
  full_name     text,
  phone         text,
  email         text,
  national_id   text,
  contact_info  jsonb,
  cr_number     text,
  notes         text,
  type          text,
  similarity    real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id, c.full_name, c.phone, c.email, c.national_id,
    c.contact_info, c.cr_number, c.notes, c.type,
    word_similarity(p_query, c.full_name) AS similarity
  FROM public.clients c
  WHERE c.full_name IS NOT NULL
    AND word_similarity(p_query, c.full_name) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

-- ── 5) search_cases_fuzzy ──
CREATE OR REPLACE FUNCTION public.search_cases_fuzzy(
  p_query      text,
  p_threshold  real DEFAULT 0.3,
  p_limit      int  DEFAULT 20
)
RETURNS TABLE (
  id                    uuid,
  title                 text,
  case_number_official  text,
  court_name            text,
  case_type             text,
  status                text,
  client_id             uuid,
  next_hearing          date,
  court_floor           text,
  court_hall            text,
  session_hall          text,
  secretary_hall        text,
  secretary_name        text,
  court_level           text,
  circuit_number        text,
  updated_at            timestamptz,
  similarity            real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ca.id, ca.title, ca.case_number_official, ca.court_name, ca.case_type,
    ca.status, ca.client_id, ca.next_hearing, ca.court_floor, ca.court_hall,
    ca.session_hall, ca.secretary_hall, ca.secretary_name, ca.court_level,
    ca.circuit_number, ca.updated_at,
    word_similarity(p_query, ca.title) AS similarity
  FROM public.cases ca
  WHERE ca.title IS NOT NULL
    AND word_similarity(p_query, ca.title) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

-- ── 6) search_case_parties_fuzzy ──
-- بترجع case_id بس (زي منطق البحث عن أطراف الدعوى الموجود أصلًا في
-- useUniversalSearch.ts "مرحلة 9") — القضية الكاملة بتتجاب بعد كده على
-- مستوى الفرونت إند زي أي case_id تاني راجع من مطابقة اسم طرف.
CREATE OR REPLACE FUNCTION public.search_case_parties_fuzzy(
  p_query      text,
  p_threshold  real DEFAULT 0.3,
  p_limit      int  DEFAULT 20
)
RETURNS TABLE (
  case_id     uuid,
  name        text,
  similarity  real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cp.case_id, cp.name,
    word_similarity(p_query, cp.name) AS similarity
  FROM public.case_parties cp
  WHERE cp.name IS NOT NULL
    AND cp.case_id IS NOT NULL
    AND word_similarity(p_query, cp.name) >= p_threshold
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

-- ── 7) صلاحيات التنفيذ ──
-- authenticated بس — نفس مبدأ أي RPC تاني في المشروع (مفيش داعي anon
-- يقدر يستدعيها، البحث محتاج مستخدم مسجّل دخول أصلًا).
GRANT EXECUTE ON FUNCTION public.search_clients_fuzzy(text, real, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_cases_fuzzy(text, real, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_case_parties_fuzzy(text, real, int) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
--  استعلام تحقق (شغّله بعد الـmigration مباشرة، يرجّع صف واحد)
-- ══════════════════════════════════════════════════════════════════
SELECT jsonb_build_object(
  'extension_enabled', (SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')),
  'idx_clients_full_name_trgm', (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clients_full_name_trgm')),
  'idx_cases_title_trgm', (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cases_title_trgm')),
  'idx_case_parties_name_trgm', (SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_case_parties_name_trgm')),
  'fn_search_clients_fuzzy', (SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_clients_fuzzy')),
  'fn_search_cases_fuzzy', (SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_cases_fuzzy')),
  'fn_search_case_parties_fuzzy', (SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_case_parties_fuzzy'))
) AS verification;
