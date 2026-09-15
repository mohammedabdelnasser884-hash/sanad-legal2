-- ══════════════════════════════════════════════════════════════
--  34-01 — إجبار الموكل على تغيير رمزه أول ما يدخل البوابة
--
--  الفكرة: الرمز اللي بيحدده المكتب من لوحة الإدارة رمز مؤقت (4
--  أرقام). أول ما الموكل يدخل بيه، لازم يُجبر يختار رمز/باسورد
--  خاص بيه (8 حروف/أرقام على الأقل، فيه حروف وأرقام مع بعض) قبل
--  ما يكمل لأي شاشة تانية في البوابة.
--
--  التنفيذ:
--   1. عمود جديد must_change_pin على client_portal_pins، default
--      false — العملاء الحاليين (رموزهم شغالة بالفعل) مش بيتأثروا،
--      العلم بيتحط true بس لما فيه رمز جديد فعليًا بيتكتب.
--   2. set_portal_pin (نسخة phase33) اتعدّلت عشان تحط must_change_pin
--      = true كل مرة p_pin بيتبعت فعليًا (رمز جديد من المكتب) —
--      من غير ما تلمسه لو النداء بس بيبدّل is_active (p_pin = NULL).
--   3. دالة جديدة client_change_portal_password يستخدمها الموكل
--      نفسه (عن طريق client-portal-api edge function بس، مش من أي
--      مكان تاني) عشان يغيّر رمزه بنفسه ويطفي العلم.
--
--  ⚠️ قرار أمني مهم: EXECUTE على الدالة الجديدة مقفول على service_role
--  بس (بعد ما نشيله من anon/PUBLIC/authenticated). التحقق من هوية
--  الموكل بيحصل قبل كده جوه edge function نفسها (توكن موقّع)، ومفيش
--  أي مستخدم authenticated (زي أدمن مكتب) المفروض يقدر يستخدم الدالة
--  دي مباشرة لتغيير رمز أي موكل من غير ما يمر بمسار set_portal_pin
--  المخصص للإدارة أصلاً.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE client_portal_pins
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;

-- ── set_portal_pin: زي نسخة phase33 بالظبط + سطر واحد لضبط must_change_pin ──
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

  -- p_pin اختياري: NULL معناها "سيب الـPIN الحالي زي ما هو".
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
      -- 🆕 رمز جديد فعليًا من المكتب = لازم الموكل يغيّره أول ما يدخل.
      -- لو النداء ده بس بيبدّل is_active (p_pin = NULL)، سيب العلم زي ما هو.
      must_change_pin = CASE
                           WHEN p_pin IS NOT NULL THEN true
                           ELSE must_change_pin
                         END,
      is_active   = p_is_active,
      client_name = p_client_name,
      email       = p_email
    WHERE client_id = p_client_id;
  ELSE
    INSERT INTO client_portal_pins (client_id, pin_hash, is_active, client_name, email, must_change_pin)
    VALUES (
      p_client_id,
      extensions.crypt(p_pin, extensions.gen_salt('bf')),
      p_is_active, p_client_name, p_email,
      true
    );
  END IF;
END;
$function$;

-- ── client_change_portal_password: الموكل بيغيّر رمزه بنفسه ──
-- تُستدعى فقط من client-portal-api (service_role) بعد ما تتحقق من
-- التوكن الموقّع وتحدد client_id من الـclaims — مش من جسم الطلب.
CREATE OR REPLACE FUNCTION public.client_change_portal_password(
  p_client_id     uuid,
  p_new_password  text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions
AS $function$
BEGIN
  IF p_new_password IS NULL
     OR length(p_new_password) < 8
     OR p_new_password !~ '[A-Za-z]'
     OR p_new_password !~ '[0-9]'
  THEN
    RAISE EXCEPTION 'الرمز الجديد لازم يكون 8 خانات على الأقل، وفيه حروف وأرقام مع بعض';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM client_portal_pins WHERE client_id = p_client_id) THEN
    RAISE EXCEPTION 'لا يوجد حساب بوابة لهذا الموكل';
  END IF;

  UPDATE client_portal_pins
  SET pin_hash         = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      must_change_pin  = false
  WHERE client_id = p_client_id;
END;
$function$;

-- ⚠️ قفل EXECUTE على service_role بس (+ postgres كمالك) — لا anon، لا
-- PUBLIC، ولا حتى authenticated (بعكس set_portal_pin اللي محتاجها
-- الأدمن من لوحة الإدارة عن طريق جلسة authenticated عادية).
REVOKE EXECUTE ON FUNCTION public.client_change_portal_password(uuid, text)
  FROM anon, PUBLIC, authenticated;

-- ── خطوات تأكيد بعد التنفيذ ──
--   1) SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'client_portal_pins' AND column_name = 'must_change_pin';
--      المتوقع: موجود، NOT NULL، default false.
--
--   2) من لوحة الإدارة: حدّد/جدّد رمز 4 أرقام لعميل تجريبي — تأكد إن
--      must_change_pin بقى true للصف بتاعه (استعلام SQL مباشر أو
--      من خلال useAdminPortal لو عندها عرض للعمود).
--
--   3) من نفس الشاشة: بدّل is_active بس من غير ما تكتب رمز جديد —
--      تأكد إن must_change_pin ما اتغيّرش (فضل زي ما كان).
--
--   4) SELECT grantee, privilege_type FROM information_schema.routine_privileges
--      WHERE routine_name = 'client_change_portal_password';
--      المتوقع: service_role و postgres بس (من غير anon/authenticated/PUBLIC).
--
--   5) اختبار كامل للتدفق من بوابة الموكل نفسها بعد نشر تعديلات
--      client-portal-api و client-portal.html (الخطوة الجاية).
