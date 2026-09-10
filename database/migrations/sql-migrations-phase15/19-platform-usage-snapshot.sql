-- ============================================================
-- 15-19 (لوحة استخدام Supabase — تاب سوبر أدمن فقط، 10 سبتمبر 2026)
-- ============================================================
-- الهدف: تاب جديد في offices-portal.html (سوبر أدمن بس) بيعرض
-- استهلاك مشروع سند الفعلي على Supabase Free Tier، عشان جيمي يعرف
-- يقرّب من حد الترقية قبل ما المستخدمين يتأثروا.
--
-- بحثنا في توثيق Supabase الرسمي (Management API + OpenAPI spec):
-- مفيش endpoint موثّق بيرجّع رقم الـEgress (نقل البيانات) — الرقم
-- ده موجود بس جوه داشبورد Supabase نفسه. Database Size وStorage Size
-- في المقابل بيتجابوا مباشرة من قاعدة البيانات نفسها من غير أي
-- توكن خارجي، فده اللي معمول هنا:
--
-- platform_usage_snapshot(): SECURITY DEFINER function بترجع
--   { db_size_bytes, storage_size_bytes } — bypass لـRLS عمدًا
--   (عشان تقدر تعد كل صفوف storage.objects بغض النظر عن أي policy)
--   لكن EXECUTE مقصور على service_role بس (مفيش وصول لأي مستخدم
--   تاني، حتى authenticated) — الفانكشن دي بتتنادى من saas-admin
--   بس، مش من تطبيق سند نفسه.
--
-- platform_manual_metrics: جدول عام صف-لكل-مقياس لأي رقم لازم
--   يتسجل يدويًا (بداية بـEgress، ممكن يتضاف مقاييس تانية بعدين من
--   غير ميجريشن جديد). key='egress_mb' هو الصف الوحيد المستخدم
--   حاليًا. RLS مفعّل بدون أي policies — يعني مفيش وصول ليه إلا من
--   service_role (اللي بيتخطى RLS تلقائيًا)، حتى لو حد غلط وحط
--   الجدول ده في whitelist بمكان تاني بالغلط.
-- ============================================================

CREATE OR REPLACE FUNCTION public.platform_usage_snapshot()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_size bigint;
  v_storage_size bigint;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_size;
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
    INTO v_storage_size
    FROM storage.objects;

  RETURN json_build_object(
    'db_size_bytes', v_db_size,
    'storage_size_bytes', v_storage_size,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_usage_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_usage_snapshot() TO service_role;

COMMENT ON FUNCTION public.platform_usage_snapshot() IS
  'بترجع حجم قاعدة البيانات وحجم الـStorage الفعليين بالبايت — لتاب "استخدام Supabase" في بوابة السوبر أدمن. EXECUTE مقصور على service_role بس.';

CREATE TABLE IF NOT EXISTS public.platform_manual_metrics (
  key         text PRIMARY KEY,
  value       numeric NOT NULL,
  unit        text NOT NULL DEFAULT 'mb',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_manual_metrics ENABLE ROW LEVEL SECURITY;
-- عمدًا من غير أي policy — الوصول لـservice_role بس (bypass تلقائي لـRLS).

COMMENT ON TABLE public.platform_manual_metrics IS
  'مقاييس بتتسجل يدويًا من تاب "استخدام Supabase" في بوابة السوبر أدمن (بداية: egress_mb) — مفيش لها API عام موثّق نجيبها بيه أوتوماتيك.';
