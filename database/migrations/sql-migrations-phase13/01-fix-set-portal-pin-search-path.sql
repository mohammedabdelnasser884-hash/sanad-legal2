-- ══════════════════════════════════════════════════════════════
--  Migration 13-1 — إصلاح باج search_path كسر pgcrypto جوه
--  set_portal_pin (اكتُشف عبر e2e/admin-portal.spec.ts فى CI، ٦ سبتمبر ٢٠٢٦)
--
--  السبب الجذري (مؤكَّد من لوج CI فعلي، مش تخمين):
--  خطأ postgres حرفي كان بيرجع من كل محاولة حفظ PIN:
--    code: 42883 — "function gen_salt(unknown) does not exist"
--
--  ده حصل بسبب migration سابق (sql-migrations-phase2/12-secure-
--  set-portal-pin.sql) اللي حصّن الدالة بإضافة تحقق الـtenant + حوّلها
--  لـSECURITY DEFINER مع "SET search_path = public" — الإضافة دي (لتفادي
--  search_path hijacking، ممارسة أمنية سليمة فى الأساس) نسيت إن دالتي
--  pgcrypto (gen_salt/crypt) مركّبين فى schema اسمه extensions (سلوك
--  Supabase الافتراضي عند تفعيل الإكستنشن)، مش public — فلما search_path
--  اتقفل على public بس، الدالتين بقوا غير مرئيين من جوه set_portal_pin.
--
--  ملحوظة: verify_portal_pin (فى pin-hash-migration.sql) وverify_client_pin
--  الأقدم مالهمش SET search_path صريح (SECURITY INVOKER افتراضي)، فبيورثوا
--  search_path الجلسة العادي اللي أصلًا شامل extensions — فمش متأثرين
--  بالباج ده. الأثر محصور فى set_portal_pin بس (يعني حفظ/تعديل بوابة موكل
--  من لوحة الإدارة تحديدًا)، مش تسجيل دخول الموكل نفسه على بوابته.
--
--  الحل: إضافة extensions لـsearch_path + تأهيل الاستدعاءات بالschema
--  صراحةً (extensions.crypt / extensions.gen_salt) — طبقة حماية مزدوجة،
--  عشان الدالة تفضل شغالة حتى لو ترتيب/محتوى search_path اتغيّر مستقبلًا
--  لأي سبب. باقي منطق الدالة (تحقق الـtenant، upsert) زي ما هو بالظبط —
--  مفيش أي تغيير أمني أو سلوكي تاني غير سطر الـsearch_path واستدعاءات
--  pgcrypto.
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM clients
    WHERE id = p_client_id
      AND (tenant_id = current_tenant_id() OR is_super_admin())
  ) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل بوابة عميل خارج مكتبك';
  END IF;

  IF p_pin IS NULL OR length(p_pin) <> 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN يجب أن يكون 4 أرقام بالضبط';
  END IF;

  INSERT INTO client_portal_pins (client_id, pin_hash, is_active, client_name, email)
  VALUES (p_client_id, extensions.crypt(p_pin, extensions.gen_salt('bf')), p_is_active, p_client_name, p_email)
  ON CONFLICT (client_id) DO UPDATE
    SET pin_hash    = EXCLUDED.pin_hash,
        is_active   = EXCLUDED.is_active,
        client_name = EXCLUDED.client_name,
        email       = EXCLUDED.email;
END;
$function$;

-- REVOKE فضل زي ما هو من migration 12 (مفيش أي داعي نكرره — CREATE OR
-- REPLACE مبيغيّرش الصلاحيات الممنوحة/الملغاة أصلًا على الدالة).

-- ── خطوة تأكيد بعد التنفيذ ──
-- افتح لوحة الأدمن → بوابة الموكل → جرّب تحفظ PIN لأي موكل تجريبي،
-- المفروض يظهر توست "✅ تم حفظ إعدادات بوابة ..." بدل "❌ حدث خطأ".
-- أو شغّل e2e/admin-portal.spec.ts محليًا/فى CI وتأكد إنه بقى عدّى.
