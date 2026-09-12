-- ══════════════════════════════════════════════════════════════════
--  Phase 25 / 01 — تشديد سياسة INSERT على case_sessions (دفاع في العمق)
--
--  الثغرة: سياسة "case_sessions_insert" (phase18/03) كانت بتتحقق بس من
--  tenant_id = current_tenant_id() — من غير أي فحص has_permission، بعكس
--  case_sessions_update/case_sessions_delete اللي بيفرّقوا حسب case_id
--  (can_edit_cases لجلسة تابعة لقضية، can_edit_sessions لجلسة مستقلة).
--  النتيجة: أي مستخدم في التينانت، حتى لو صلاحياته "مشاهدة فقط"
--  (can_edit_cases=false)، كان يقدر يعمل INSERT جلسة جديدة على أي قضية
--  في مكتبه عن طريق نداء مباشر لـSupabase client (من غير ما يمر على
--  الواجهة/الأزرار خالص) — RLS هي خط الدفاع الأخير جوه الداتابيز،
--  مستقلة تمامًا عن إخفاء/إظهار الأزرار في الواجهة.
--
--  اتكشفت أثناء مراجعة كودية لفيكس phase24 (record_preliminary_judgment)
--  — مش مرتبطة بباگ الـatomicity نفسه، نطاقها صلاحيات/أمان مستقل.
--
--  ⚠️ مأمّن ومبيكسرش حاجة موجودة:
--  - `record_final_judgment`/`record_preliminary_judgment` (phase23/24)
--    شغالين SECURITY DEFINER — بيتنفذوا بصلاحيات مالك الدالة (postgres)
--    اللي بيتجاوز RLS تلقائيًا في Supabase، فمش هيتأثروا بالسياسة دي.
--  - الإدخالين المباشرين في useCaseCrudActions.ts (تسجيل الجلسة الأولى
--    وقت إنشاء قضية، وجلسة جديدة وقت تعديل تاريخها) بيحصلوا بعد نجاح
--    عملية cases تانية (إنشاء/تعديل) أصلاً محتاجة can_edit_cases — يعني
--    أي مستخدم وصل للسطر ده أصلاً عنده الصلاحية، فمش هيتأثر عمليًا.
--
--  الملف Idempotent (DROP + CREATE)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "case_sessions_insert" ON public.case_sessions;

CREATE POLICY "case_sessions_insert" ON public.case_sessions
  FOR INSERT
  WITH CHECK (
    (
      tenant_id = current_tenant_id()
      AND (
        (case_id IS NOT NULL AND has_permission('can_edit_cases'))
        OR (case_id IS NULL AND has_permission('can_edit_sessions'))
      )
    )
    OR is_super_admin()
  );

-- ── للتحقق بعد التشغيل ──
--   SELECT tablename, policyname, cmd, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'case_sessions' AND cmd = 'INSERT';
--   -- المتوقع: with_check يتضمّن has_permission('can_edit_cases')/('can_edit_sessions')،
--   -- مش بس tenant_id.
--
--   -- اختبار يدوي: بحساب viewer (can_edit_cases=false)، محاولة INSERT
--   -- جلسة على قضية حقيقية (case_id موجود) لازم ترفض.
--   -- بحساب lawyer (can_edit_cases=true)، نفس المحاولة لازم تنجح.
