-- ══════════════════════════════════════════════════════════════════
--  Migration: تقسيم "tenant_scoped_case_sessions" (FOR ALL) لأوامر
--  منفصلة، مع تفرقة حسب case_id (خطة تفعيل الصلاحيات الناقصة —
--  الجلسات، 11 سبتمبر 2026، قسم 4 المرحلة 1 خطوة 3 + قسم 6.7 القرار
--  النهائي المعتمد — خيار ب).
--
--  case_sessions جدول واحد بيخدم جلسات القضايا (case_id IS NOT NULL)
--  والجلسات المستقلة (case_id IS NULL) مع بعض. القرار المعتمد:
--    - جلسة مرتبطة بقضية  → تتبع can_edit_cases/can_delete_cases
--      (صلاحية القضية نفسها، زي ما اللوجيك متوقّع منها أصلاً).
--    - جلسة مستقلة (case_id IS NULL) → تاخد can_edit_sessions/
--      can_delete_sessions الجديدين المستقلين.
--
--  السياسة الحالية على الإنتاج (موثّقة في sql-migrations-phase5/
--  05-document-remaining-rls-policies.sql) اسمها "tenant_scoped_case_sessions"،
--  FOR ALL، تينانت بس من غير أي فحص صلاحية — الملف ده بيحل محلها.
--
--  ⚠️ ملاحظة: سياسات tenant_write_allowed_case_sessions_*
--  (sql-migrations-phase15/07) هي RESTRICTIVE منفصلة وبتفضل شغالة
--  زي ما هي (بتتحقق من قفل الاشتراك) — مفيش تعارض، الاتنين
--  (PERMISSIVE هنا + RESTRICTIVE هناك) بيتجمعوا بـAND زي المفروض.
--
--  ⚠️ لازم يتشغّل بعد 01-has-permission-new-keys-...sql فى نفس
--  النشرة (نفس ملاحظة ملف 02).
--
--  الملف Idempotent (drop if exists + create) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tenant_scoped_case_sessions" ON public.case_sessions;

CREATE POLICY "case_sessions_select" ON public.case_sessions
  FOR SELECT
  USING (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "case_sessions_insert" ON public.case_sessions
  FOR INSERT
  WITH CHECK (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "case_sessions_update" ON public.case_sessions
  FOR UPDATE
  USING (
    (
      tenant_id = current_tenant_id()
      AND (
        (case_id IS NOT NULL AND has_permission('can_edit_cases'))
        OR (case_id IS NULL AND has_permission('can_edit_sessions'))
      )
    )
    OR is_super_admin()
  )
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

CREATE POLICY "case_sessions_delete" ON public.case_sessions
  FOR DELETE
  USING (
    (
      tenant_id = current_tenant_id()
      AND (
        (case_id IS NOT NULL AND has_permission('can_delete_cases'))
        OR (case_id IS NULL AND has_permission('can_delete_sessions'))
      )
    )
    OR is_super_admin()
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'case_sessions'
--   ORDER BY cmd, policyname;
-- المتوقع: مفيش "tenant_scoped_case_sessions" (FOR ALL) باقية —
-- بدالها 4 سياسات منفصلة (select/insert/update/delete).
--
--   -- اختبار يدوي: بحساب lawyer، جلسة مستقلة (case_id NULL):
--   -- المفروض يقدر يعدّل (can_edit_sessions=true افتراضيًا)
--   -- ومايقدرش يمسح (can_delete_sessions=false افتراضيًا).
--   -- نفس الحساب، جلسة تابعة لقضية (case_id NOT NULL):
--   -- بتتبع can_edit_cases/can_delete_cases القديمين زي ما هم.
