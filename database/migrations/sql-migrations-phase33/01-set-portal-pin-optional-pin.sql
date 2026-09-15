-- ══════════════════════════════════════════════════════════════
--  33-1 — خلي p_pin اختياري في set_portal_pin (مشكلة #2 من تقرير
--  تشخيص بوابة الموكل، 15 سبتمبر 2026)
--
--  المشكلة: set_portal_pin كانت بترفض أي نداء من غير PIN صريح 4
--  أرقام، حتى لو الهدف الوحيد هو تبديل is_active بس. وبما إن الـ
--  PIN القديم متشفّر (hash) ومش بيترجع للعرض، فتح المودال لعميل
--  عنده وصول بالفعل بيسيب حقل الـPIN فاضي، فمفيش طريقة تعدّل حالة
--  التفعيل من غير ما تولّد/تكتب PIN جديد بالغلط.
--
--  الحل: p_pin بقى ممكن يبقى NULL — لما يبقى NULL *وفيه صف قائم
--  بالفعل* لنفس العميل، بيتم تحديث is_active/client_name/email بس
--  والـpin_hash القديم يفضل زي ما هو من غير أي لمس. لو مفيش صف
--  قائم أصلاً (أول مرة تتفعّل بوابة العميل ده)، لازم PIN صريح —
--  مفيش PIN قديم نحتفظ بيه أصلاً. باقي المنطق (تحقق الـtenant، قفل
--  tenant_write_allowed، تحقق شكل الـPIN لو اتبعت) زي ما هو بالظبط
--  من نسخة phase15/13 (G1.3) — آخر نسخة شغالة فعليًا على الإنتاج.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_portal_pin(
  p_client_id uuid, p_pin text, p_is_active boolean,
  p_client_name text, p_email text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  v_tenant uuid;
  v_exists boolean;
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients
    WHERE id = p_client_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'غير مصرح بتعديل بوابة عميل خارج مكتبك';
  END IF;

  IF NOT public.tenant_write_allowed(v_tenant) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  END IF;

  -- 🆕 p_pin بقى اختياري: NULL معناها "سيب الـPIN الحالي زي ما هو".
  -- لو اتبعت PIN فعلي، لازم يفضل بالشكل الصحيح (4 أرقام بالظبط).
  IF p_pin IS NOT NULL AND (length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$') THEN
    RAISE EXCEPTION 'PIN يجب أن يكون 4 أرقام بالضبط';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM client_portal_pins WHERE client_id = p_client_id
  ) INTO v_exists;

  IF p_pin IS NULL AND NOT v_exists THEN
    RAISE EXCEPTION 'لازم تكتب PIN من 4 أرقام أول مرة تفعّل فيها بوابة الموكل';
  END IF;

  IF v_exists THEN
    UPDATE client_portal_pins SET
      pin_hash    = CASE
                       WHEN p_pin IS NOT NULL
                       THEN extensions.crypt(p_pin, extensions.gen_salt('bf'))
                       ELSE pin_hash
                     END,
      is_active   = p_is_active,
      client_name = p_client_name,
      email       = p_email
    WHERE client_id = p_client_id;
  ELSE
    INSERT INTO client_portal_pins (client_id, pin_hash, is_active, client_name, email)
    VALUES (
      p_client_id,
      extensions.crypt(p_pin, extensions.gen_salt('bf')),
      p_is_active, p_client_name, p_email
    );
  END IF;
END;
$function$;

-- REVOKE فضل زي ما هو من migration 12 (CREATE OR REPLACE مبيغيّرش
-- الصلاحيات الممنوحة/الملغاة أصلًا على الدالة، مفيش داعي نكرره).

-- ── خطوة تأكيد بعد التنفيذ ──
--   1) عميل عنده وصول بالفعل: افتح "بوابة الموكل" من غير ما تكتب
--      PIN، بدّل حالة التفعيل بس، احفظ. المفروض ينجح وis_active
--      يتحدث فى قاعدة البيانات، وتسجيل الدخول القديم بنفس الـPIN
--      القديم يفضل شغال زي ما هو (يعني pin_hash فعلاً ما اتلمسش).
--   2) نفس العميل: اكتب PIN جديد 4 أرقام واحفظ — المفروض pin_hash
--      يتغيّر فعلاً (تسجيل الدخول بالـPIN القديم يفشل بعدها، الجديد
--      ينجح).
--   3) عميل مالوش بوابة مفعّلة أصلاً: جرّب تحفظ من غير PIN — المفروض
--      يرجع الخطأ "لازم تكتب PIN من 4 أرقام أول مرة...".
--   4) عميل خارج مكتبك (لو معاك حساب مكتب تاني للاختبار): لازم يفضل
--      يرفض بـ"غير مصرح بتعديل بوابة عميل خارج مكتبك" زي الأول.
