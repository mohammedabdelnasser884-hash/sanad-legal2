-- ══════════════════════════════════════════════════════════════════
--  Migration: إضافة 6 مفاتيح صلاحيات جديدة لـhas_permission()
--  (can_edit_clients, can_delete_clients, can_edit_reminders,
--  can_delete_reminders, can_edit_sessions, can_delete_sessions)
--
--  المرجع: خطة-تفعيل-الصلاحيات-الناقصة-الموكلين-والتذكيرات-والجلسات
--  (11 سبتمبر 2026)، قسم 3 + قسم 6.7 (القرار النهائي بخصوص الجلسات).
--
--  ⚠️ ملاحظة مهمة بخصوص can_edit_sessions/can_delete_sessions:
--  المفتاحين دول بيتحكموا في الجلسات *المستقلة* بس (case_id IS NULL).
--  جلسات القضايا (case_id IS NOT NULL) لسه بتتبع can_edit_cases/
--  can_delete_cases زي ما هي — الفرق ده بيتطبق على مستوى سياسة RLS
--  نفسها (02-rls-case-sessions-split.sql) مش هنا جوه الدالة، لأن
--  has_permission() مالهاش وصول لـcase_id بتاع الصف. الدالة هنا
--  بترجع بس "هل عند المستخدم can_edit_sessions/can_delete_sessions
--  كمفتاح مستقل؟" — تفسيره (جلسة مستقلة بس) بيحصل فى الـRLS.
--
--  نفس نمط can_edit_cases بالظبط: من غير قفل أساسي (زي الأتعاب)،
--  قابل للتخصيص لكل مستخدم عبر profiles.permissions، مع افتراضي
--  لكل دور. admin/is_super_admin بيتحل فوق زي العادة (بايباس كامل).
--
--  مصفوفة الافتراضي (قسم 3 من الخطة):
--    can_edit_clients:     admin=true  lawyer=true   viewer=false
--    can_delete_clients:   admin=true  lawyer=false  viewer=false
--    can_edit_reminders:   admin=true  lawyer=true   viewer=false
--    can_delete_reminders: admin=true  lawyer=true   viewer=false
--    can_edit_sessions:    admin=true  lawyer=true   viewer=false
--    can_delete_sessions:  admin=true  lawyer=false  viewer=false
--  (viewer=false في الكل بيتغطى تلقائيًا بـELSE false الموجودة أصلًا،
--  فمحتاجين نضيف بس فروع lawyer=true للمفاتيح الأربعة اللي true ليه.)
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
      ('can_add_cases','can_edit_cases','can_add_clients','can_view_reports',
       -- ⚡ NEW (خطة تفعيل صلاحيات الموكلين/التذكيرات/الجلسات، 11 سبتمبر 2026):
       'can_edit_clients','can_edit_reminders','can_delete_reminders','can_edit_sessions')
      THEN true
    WHEN v_role = 'viewer' AND p_key = 'can_view_reports' THEN true
    ELSE false
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM anon, PUBLIC;

-- ── خطوة تأكيد بعد التنفيذ ──
--   -- اختبار يدوي سريع بحساب lawyer/viewer تجريبي (بعد الدخول بيه):
--   SELECT has_permission('can_edit_clients');     -- lawyer: true،  viewer: false
--   SELECT has_permission('can_delete_clients');    -- lawyer: false، viewer: false
--   SELECT has_permission('can_edit_reminders');    -- lawyer: true،  viewer: false
--   SELECT has_permission('can_delete_reminders');  -- lawyer: true،  viewer: false
--   SELECT has_permission('can_edit_sessions');     -- lawyer: true،  viewer: false
--   SELECT has_permission('can_delete_sessions');   -- lawyer: false، viewer: false
