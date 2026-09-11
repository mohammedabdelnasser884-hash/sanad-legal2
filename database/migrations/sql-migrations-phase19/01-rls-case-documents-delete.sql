-- ══════════════════════════════════════════════════════════════════
--  Migration: ربط حذف مستندات القضية (case_documents) بـcan_delete_cases
--  (متابعة خطة تفعيل الصلاحيات الناقصة — بند Backlog قسم 6.5،
--  11 سبتمبر 2026)
--
--  القرار: حذف مستند القضية يتبع نفس صلاحية حذف القضية نفسها
--  (can_delete_cases) — مفيش مفتاح صلاحية جديد. لو lawyer مايقدرش
--  يحذف القضية، مايقدرش يحذف مستند منها كمان.
--
--  السياسة الحالية على الإنتاج (موثّقة فى sql-migrations-phase5/
--  05-document-remaining-rls-policies.sql): "tenant_scoped_case_documents"
--  FOR ALL — بتتحقق من tenant_id بس، صفر فحص صلاحية. أي مستخدم
--  (viewer/lawyer) يقدر يحذف أي مستند قضية دلوقتي.
--
--  الملف ده بيقسّم السياسة الموحّدة لأربعة (select/insert/update/delete)
--  بنفس نمط case_sessions (phase18/03) — select/insert/update يفضلوا
--  زي ما هم (tenant_id بس، صفر تغيير سلوك)، والـdelete بس بياخد فحص
--  has_permission('can_delete_cases') الإضافي.
--
--  ⚠️ طبقة tenant_write_allowed (RESTRICTIVE، من phase15/08) منفصلة
--  تمامًا عن السياسة دي وبتفضل شغالة زي ما هي — الملف ده بيلمس بس
--  السياسة PERMISSIVE الأساسية.
--
--  الملف Idempotent (drop if exists + create) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tenant_scoped_case_documents" ON public.case_documents;

CREATE POLICY "case_documents_select" ON public.case_documents
  FOR SELECT
  USING (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "case_documents_insert" ON public.case_documents
  FOR INSERT
  WITH CHECK (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "case_documents_update" ON public.case_documents
  FOR UPDATE
  USING (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  )
  WITH CHECK (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

-- الفحص الفعلي المطلوب: حذف مستند بيتطلب can_delete_cases (نفس
-- صلاحية حذف القضية نفسها).
CREATE POLICY "case_documents_delete" ON public.case_documents
  FOR DELETE
  USING (
    (tenant_id = current_tenant_id() AND has_permission('can_delete_cases'))
    OR is_super_admin()
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'case_documents'
--   ORDER BY cmd, policyname;
-- المتوقع: 4 سياسات منفصلة (case_documents_select/insert/update/delete)،
-- ومفيش "tenant_scoped_case_documents" باقية. case_documents_delete
-- فيها has_permission('can_delete_cases').
