-- ══════════════════════════════════════════════════════════════════
--  Migration: ربط clients_update/clients_delete بـhas_permission()
--  (خطة تفعيل الصلاحيات الناقصة — الموكلين، 11 سبتمبر 2026، قسم 4
--  المرحلة 1، خطوة 2)
--
--  السياسة الحالية على الإنتاج (موثّقة في sql-migrations-phase6/
--  02-rls-split-cases-clients-fees-payments.sql) بتتحقق من tenant_id
--  بس — أي مستخدم داخل المكتب (viewer/lawyer) يقدر يعدّل أو يمسح أي
--  موكل. الملف ده بيحل محلها بنفس نمط cases_update/cases_delete
--  بالظبط.
--
--  ⚠️ لازم يتشغّل بعد 01-has-permission-new-keys-...sql مباشرة (نفس
--  النشرة) — تشغيله لوحده من غير الدالة المحدّثة هيخلي has_permission
--  ترجع false للكل (المفتاح مش معرّف فى النسخة القديمة) وتقفل حتى
--  الأدمن (لأ، الأدمن بيتحل duo فوق فى الدالة نفسها ويرجع true دايمًا
--  بغض النظر عن المفتاح — بس lawyer هيتقفل تمامًا لحد ما الدالة تتحدّث).
--
--  الملف Idempotent (drop if exists + create) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE
  USING (
    (tenant_id = current_tenant_id() AND has_permission('can_edit_clients'))
    OR is_super_admin()
  )
  WITH CHECK (
    (tenant_id = current_tenant_id() AND has_permission('can_edit_clients'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE
  USING (
    (tenant_id = current_tenant_id() AND has_permission('can_delete_clients'))
    OR is_super_admin()
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'clients'
--   ORDER BY cmd, policyname;
-- المتوقع: clients_update وclients_delete فيهم has_permission('can_edit_clients')
-- وhas_permission('can_delete_clients') على التوالي.
