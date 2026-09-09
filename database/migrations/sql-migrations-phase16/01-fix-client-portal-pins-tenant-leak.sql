-- ══════════════════════════════════════════════════════════════
--  16-01 — تحصين قراءة (SELECT) جدول client_portal_pins بالتينانت
--
--  الثغرة (مسجّلة فى تقرير 9 سبتمبر 2026، قسم "اكتشاف تسريب بيانات
--  بوابة الموكل بين المكاتب"):
--
--  جدول client_portal_pins مالوش عمود tenant_id مباشر — الربط
--  بالمكتب بيحصل بس بشكل غير مباشر عن طريق client_id → clients.tenant_id.
--  الـpolicy القديمة (admins_manage_portal_pins, من admin-panel-migration.sql)
--  كانت بتتحقق بس إن المستخدم "أدمن" — من غير أي ربط بمكتبه هو
--  تحديدًا:
--
--    USING (EXISTS (SELECT 1 FROM profiles
--                    WHERE profiles.user_id = auth.uid()
--                      AND profiles.role = 'admin'))
--
--  يعني أي أدمن، فى أي مكتب، بيشوف كل صفوف الجدول (اسم/إيميل/حالة
--  تفعيل بوابة الموكل) بتاعة كل المكاتب على النظام. الكود اللي بيقرا
--  من الجدول ده (useAdminPortal.ts) بيعمل select عادى من غير فلتر
--  tenant_id فى الاستعلام نفسه، فمعتمد بالكامل على الـRLS المكسورة دى.
--
--  ملحوظة: مسار الكتابة (set_portal_pin RPC، من 12-secure-set-portal-
--  pin.sql) آمن فعلاً وفيه تحقق صريح جوه الدالة نفسها — المكشوف هو
--  القراءة/العرض بس. هذا الملف بيصلّح القراءة فقط، من غير أي لمس
--  لمسار set_portal_pin.
--
--  الحل المُطبَّق هنا (الخيار 2 من التقرير — بدون تعديل شكل الجدول):
--  تحويل الـpolicy لتتحقق عن طريق JOIN صريح على clients.tenant_id،
--  بنفس أسلوب الفحص المستخدم فعلاً جوه set_portal_pin نفسها
--  (tenant_id = current_tenant_id() OR is_super_admin()).
--
--  الأثر: صفر تغيير على مسار الكتابة (set_portal_pin لسه زى ما هو،
--  عنده تحققه الخاص). التغيير الوحيد: أدمن عادى (مش سوبر أدمن) بقى
--  يشوف بس صفوف client_portal_pins اللي client_id بتاعها تابع لمكتبه.
--  سوبر أدمن يفضل يشوف الكل (زى الحالة الحالية).
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "admins_manage_portal_pins" ON public.client_portal_pins;

CREATE POLICY "admins_manage_portal_pins"
  ON public.client_portal_pins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = client_portal_pins.client_id
          AND clients.tenant_id = public.current_tenant_id()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
        AND profiles.role = 'admin'
    )
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.clients
        WHERE clients.id = client_portal_pins.client_id
          AND clients.tenant_id = public.current_tenant_id()
      )
    )
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS with_check_expr
--   FROM pg_policy
--   WHERE polrelid = 'public.client_portal_pins'::regclass;
--
--  اختبار يدوي إلزامي على staging قبل الإنتاج:
--   1. أدمن مكتب A يفتح "الإدارة → بوابة الموكل": يجب أن يشوف بس
--      عملاء مكتب A (مش عملاء أي مكتب تاني).
--   2. أدمن مكتب A يحفظ/يعدّل PIN لعميل تابع لمكتبه: يجب أن يشتغل
--      عادي (مسار set_portal_pin لم يتغيّر أصلاً).
--   3. لو فيه حساب super admin: يجب أن يفضل يشوف صفوف كل المكاتب
--      (سلوك سوبر أدمن لم يتغيّر).
--   4. مفيد أيضًا تشغيل database/tests/phase1-tenant-isolation-test.sql
--      كامل على staging زي أي تعديل RLS تاني فى النظام، تأكيدًا إن
--      التعديل ده معزول ومش مكسّر عزل تينانت شغال فى جداول تانية.
-- ══════════════════════════════════════════════════════════════
