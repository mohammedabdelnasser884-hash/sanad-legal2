-- ══════════════════════════════════════════════════════════════════
--  Migration: تقسيم السياسة الأساسية على reminders لأوامر منفصلة،
--  مع ربط UPDATE/DELETE بـhas_permission('can_edit_reminders')/
--  ('can_delete_reminders') (خطة تفعيل الصلاحيات الناقصة — التذكيرات،
--  11 سبتمبر 2026، قسم 4 المرحلة 1 خطوة 3).
--
--  ⚠️ شغّل 00-DIAGNOSTIC-run-this-first-reminders-policies.sql الأول
--  وابعتلي النتيجة قبل تشغيل الملف ده على الإنتاج — التذكيرات
--  الجدول الوحيد من التلاتة (موكلين/تذكيرات/جلسات) اللي سياسته
--  الأساسية مش موثّقة فى أي ملف مايجريشن بالريبو (راجع تعليق ملف 00).
--
--  عشان كده الملف ده مكتوب دفاعيًا: بيمسح *أي* policy موجودة فعليًا
--  على public.reminders ديناميكيًا (مش بالاسم)، بدل ما يفترض اسم
--  معيّن زي "tenant_scoped_reminders" وممكن يطلع غلط ويسيب السياسة
--  القديمة شغالة جنب الجديدة (PERMISSIVE policies بتتجمع بـOR،
--  فسياسة قديمة تينانت-بس هتفضل بتفتح الباب حتى لو الجديدة مقفولة).
--
--  INSERT فضل تينانت بس (زي ما الخطة مقترحة — مفيش can_add_reminders
--  مقترح، أي عضو فى المكتب يقدر يضيف تذكير). SELECT برضو تينانت بس
--  (التذكيرات مشتركة على مستوى المكتب — قسم 6.4 من الخطة).
--
--  الملف Idempotent — آمن يتشغل أكتر من مرة (الـDO block بيمسح كل
--  policy على الجدول فى كل تشغيلة، بعدين بيعيد الإنشاء).
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reminders'
      -- سيب سياسات قفل الاشتراك (RESTRICTIVE، phase15/08) زي ما هي —
      -- دول بيضيفوا شرط إضافي فوق، مش بديل عن العزل/الصلاحية.
      AND policyname NOT LIKE 'tenant_write_allowed_reminders_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reminders', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "reminders_select" ON public.reminders
  FOR SELECT
  USING (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "reminders_insert" ON public.reminders
  FOR INSERT
  WITH CHECK (
    (tenant_id = current_tenant_id())
    OR is_super_admin()
  );

CREATE POLICY "reminders_update" ON public.reminders
  FOR UPDATE
  USING (
    (tenant_id = current_tenant_id() AND has_permission('can_edit_reminders'))
    OR is_super_admin()
  )
  WITH CHECK (
    (tenant_id = current_tenant_id() AND has_permission('can_edit_reminders'))
    OR is_super_admin()
  );

CREATE POLICY "reminders_delete" ON public.reminders
  FOR DELETE
  USING (
    (tenant_id = current_tenant_id() AND has_permission('can_delete_reminders'))
    OR is_super_admin()
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT tablename, policyname, cmd, permissive, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'reminders'
--   ORDER BY cmd, policyname;
-- المتوقع: reminders_select/insert/update/delete (PERMISSIVE) +
-- tenant_write_allowed_reminders_insert/update/delete (RESTRICTIVE)
-- بس — مفيش أي policy قديمة تانية باقية.
