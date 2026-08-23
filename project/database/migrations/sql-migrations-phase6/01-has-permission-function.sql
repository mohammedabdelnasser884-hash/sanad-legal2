-- ══════════════════════════════════════════════════════════════════
--  Migration: has_permission(key text) — دالة SQL مركزية لفحص
--  الصلاحيات التفصيلية (خطة تفعيل نظام الصلاحيات التفصيلية، مرحلة 1)
--
--  المرجع: خطة-تفعيل-نظام-الصلاحيات-التفصيلية (تحديث 5)، قسم 3.2.
--
--  تعريف get_my_role()/is_super_admin() الفعلي على الإنتاج (تأكّد
--  منه قبل كتابة الملف ده):
--    get_my_role()    → SELECT role FROM profiles WHERE user_id = auth.uid() LIMIT 1
--    is_super_admin() → coalesce((select is_super_admin from profiles
--                        where user_id = auth.uid()), false)
--
--  منطق الدالة (بالترتيب):
--    1) سوبر أدمن → true دايمًا (بايباس كامل).
--    2) role = 'admin' → true دايمًا (بايباس كامل، بما فيه الأتعاب).
--    3) can_view_fees/can_edit_fees → false دايمًا لغير الأدمن، بلا
--       استثناء حتى لو فيه قيمة صريحة محفوظة في profiles.permissions
--       (قرار 2.1 — القفل ده أساسي وأسبق من فحص الاستثناء الصريح).
--    4) قيمة صريحة محفوظة في profiles.permissions -> key بتلغي
--       الافتراضي (قرار 2.2) — null صريح جوه الـJSON يتعامل معاه
--       زي المفتاح الغائب (مش "false صريح").
--    5) من غير قيمة صريحة ولا مفتاح أتعاب → افتراضي الدور (مصفوفة
--       قسم 2.1 من الخطة).
--
--  الملف Idempotent (CREATE OR REPLACE) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_role text := get_my_role();
  v_explicit jsonb;
BEGIN
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- قفل أساسي للأتعاب بلا استثناء (قرار 2.1) — أسبق من أي قيمة
  -- صريحة محفوظة، حتى لو أدمن حاول يفتحها لمستخدم معيّن.
  IF p_key IN ('can_view_fees', 'can_edit_fees') THEN
    RETURN false;
  END IF;

  SELECT permissions -> p_key INTO v_explicit
  FROM profiles WHERE user_id = auth.uid();

  -- null صريح جوه الـJSON (permissions->key = 'null'::jsonb) يتعامل
  -- معاه زي المفتاح الغائب خالص، مش زي "false صريح".
  IF v_explicit IS NULL OR v_explicit = 'null'::jsonb THEN
    v_explicit := NULL;
  END IF;

  IF v_explicit IS NOT NULL THEN
    RETURN (v_explicit)::boolean;
  END IF;

  RETURN CASE
    WHEN v_role = 'lawyer' AND p_key IN
      ('can_add_cases','can_edit_cases','can_add_clients','can_view_reports')
      THEN true
    WHEN v_role = 'viewer' AND p_key = 'can_view_reports' THEN true
    ELSE false
  END;
END;
$function$;

-- قفل التنفيذ على authenticated بس (نفس نمط باقي الدوال الحساسة فى
-- المشروع — شيل anon و PUBLIC).
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM anon, PUBLIC;

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT grantee, privilege_type FROM information_schema.routine_privileges
--   WHERE routine_name = 'has_permission';
-- المتوقع: authenticated و service_role و postgres بس (من غير anon/PUBLIC).
--
--   -- اختبار يدوي سريع بحساب lawyer/viewer تجريبي (بعد الدخول بيه):
--   SELECT has_permission('can_view_fees');   -- المتوقع: false دايمًا لغير admin
--   SELECT has_permission('can_add_cases');   -- lawyer: true، viewer: false
--   SELECT has_permission('can_view_reports');-- lawyer/viewer: true
