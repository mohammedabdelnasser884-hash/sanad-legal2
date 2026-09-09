-- ══════════════════════════════════════════════════════════════════
--  15-13 (G1 + G2) — تدقيق أمني: قفل الكتابة داخل دوال SECURITY
--  DEFINER + سياسات Storage (8 سبتمبر 2026)
-- ══════════════════════════════════════════════════════════════════
--  الخلفية (من تقرير المرحلة 15، قسم "ثغرات فنية لازم تُغطى"):
--  الدفعات C3 (06/07/08) ضافت RESTRICTIVE policies بتستخدم
--  tenant_write_allowed(tenant_id) على INSERT/UPDATE/DELETE لمعظم
--  الجداول. لكن الدوال دي كلها SECURITY DEFINER:
--    - create_fee_with_advance  (phase12/01)
--    - record_fee_payment       (phase12/01)
--    - set_portal_pin           (phase13/01)
--  وSECURITY DEFINER بتتخطى RLS بالكامل (بتشتغل بصلاحية مالك الدالة،
--  مش المستخدم المستدعي) — يعني RESTRICTIVE policies اللي اتضافت على
--  case_fees/fee_payments/client_portal_pins (07، 08) مالهاش أي تأثير
--  على الدوال دي خالص. مكتب read-only كان لسه يقدر يسجّل دفعة أتعاب
--  أو يفعّل بوابة موكل عن طريق الـRPC مباشرة، والقفل هيبقى شكلي.
--
--  الحل (G1): إضافة تحقق صريح IF NOT tenant_write_allowed(...) جوه
--  كل دالة من التلاتة، بعد فحص عزل الـtenant الموجود مباشرة وقبل أي
--  INSERT/UPDATE. نفس رسالة الخطأ المستخدمة فعليًا في errorReporting.ts
--  لحالة 42501 (تجربة موحّدة للمستخدم، سواء الرفض جاله من RLS أو من
--  الـRPC).
--
--  🔴 اكتشاف جانبي أثناء المراجعة (مش قرار منتج، ثغرة حقيقية اتلقت):
--  فحص idempotency في create_fee_with_advance/record_fee_payment
--  (phase12/01) وset_portal_pin (phase13/01، إصلاح search_path) كانوا
--  بادلين جسم الدالة كامل بـCREATE OR REPLACE من نسخة phase5/phase4
--  (قبل ما phase6/03 يضيف فحص has_permission('can_edit_fees'))، مش
--  من نسخة phase6/03/phase9 اللي فيها الفحص ده. النتيجة: فحص الصلاحية
--  ("ليس لديك صلاحية تعديل الأتعاب") كان لسه متسجّل فى الريبو كـmigration
--  قديم، لكن *مش موجود فعليًا* فى نسخة الدالة الشغالة على الإنتاج من
--  phase9 لحد دلوقتي — أي lawyer (حتى لو صلاحية can_edit_fees متلغاة
--  عنه صراحة) كان يقدر يسجّل/يعدّل أتعاب عن طريق الـRPC. الملف ده بيرجّع
--  فحص has_permission('can_edit_fees') تاني كمان (مش قرار إضافي، ده
--  استرجاع لحماية كانت متفق عليها ومنفذة فعلاً فى phase6 وانمسحت
--  بالغلط فى إعادة الكتابة اللاحقة).
--
--  G2: نفس المنطق على storage.objects لباكتات case-docs/client-docs
--  (تفاصيل تحت، قبل قسم G2 من الملف ده).
--
--  الملف Idempotent (CREATE OR REPLACE + DROP POLICY IF EXISTS) —
--  آمن يتشغل أكتر من مرة. صفر تغيير على توقيعات الدوال (نفس
--  الباراميترات بالظبط) — أي استدعاء موجود من الفرونت إند يفضل شغال
--  زي ما هو.
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
--  G1.1 — create_fee_with_advance (نسخة كاملة من phase12/01 +
--  فحص القفل + استرجاع فحص الصلاحية)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_fee_with_advance(
  p_case_id           uuid,
  p_case_title        text,
  p_client_id         uuid,
  p_client_name       text,
  p_receiver          text,
  p_total_fees        numeric,
  p_notes             text,
  p_paid_amount       numeric,
  p_payment_date      date,
  p_idempotency_key   uuid DEFAULT NULL
)
 RETURNS case_fees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_fee     case_fees;
  v_paid    numeric;
  v_status  text;
  v_tenant  uuid;
BEGIN
  IF p_total_fees IS NULL OR p_total_fees < 0 THEN
    RAISE EXCEPTION 'إجمالي الأتعاب لا يمكن أن يكون سالباً';
  END IF;

  SELECT tenant_id INTO v_tenant FROM cases
    WHERE id = p_case_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القضية غير موجودة أو خارج نطاق مكتبك';
  END IF;

  -- 🆕 G1: نفس قفل tenant_write_allowed() المطبّق على RLS — لازم يتفحص
  -- صراحة هنا لأن الدالة SECURITY DEFINER (بتتخطى RESTRICTIVE policies
  -- الموجودة على case_fees/fee_payments بالكامل).
  IF NOT public.tenant_write_allowed(v_tenant) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  END IF;

  -- 🔧 استرجاع فحص كان موجود فى phase6/03 وانمسح سهوًا فى إعادة كتابة
  -- الدالة (phase9/phase12) — راجع ملاحظة "اكتشاف جانبي" فوق.
  IF NOT has_permission('can_edit_fees') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الأتعاب';
  END IF;

  -- 🆕 فحص idempotency: نفس الطلب جالنا قبل كده ونجح؟ رجّع نفس السجل
  -- من غير أي INSERT جديد.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_fee FROM case_fees
      WHERE tenant_id = v_tenant AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_fee;
    END IF;
  END IF;

  v_paid := CASE WHEN p_paid_amount > 0 THEN p_paid_amount ELSE 0 END;
  v_status := CASE
    WHEN COALESCE(p_total_fees, 0) <= 0 THEN 'open'
    WHEN v_paid >= p_total_fees THEN 'collected'
    ELSE 'deferred'
  END;

  BEGIN
    INSERT INTO case_fees (
      case_id, case_title, client_id, client_name, receiver,
      total_fees, notes, paid_fees, status, tenant_id, idempotency_key
    ) VALUES (
      p_case_id, p_case_title, p_client_id, p_client_name, p_receiver,
      p_total_fees, p_notes, 0, CASE WHEN COALESCE(p_total_fees,0) <= 0 THEN 'open' ELSE 'deferred' END,
      v_tenant, p_idempotency_key
    ) RETURNING * INTO v_fee;
  EXCEPTION WHEN unique_violation THEN
    -- Race نادر: نداءين فعليين بنفس المفتاح فى نفس اللحظة. رجّع السجل
    -- اللي فاز بدل ما نفشل العملية.
    SELECT * INTO v_fee FROM case_fees
      WHERE tenant_id = v_tenant AND idempotency_key = p_idempotency_key;
    RETURN v_fee;
  END;

  IF p_paid_amount IS NOT NULL AND p_paid_amount > 0 THEN
    INSERT INTO fee_payments (fee_id, amount, payment_date, notes, received_by, client_id, client_name, tenant_id)
    VALUES (v_fee.id, p_paid_amount, COALESCE(p_payment_date, CURRENT_DATE), 'دفعة أولى مقدم أتعاب', p_receiver, p_client_id, p_client_name, v_tenant);

    SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM fee_payments WHERE fee_id = v_fee.id;

    v_status := CASE
      WHEN COALESCE(p_total_fees, 0) <= 0 THEN 'open'
      WHEN v_paid >= p_total_fees THEN 'collected'
      ELSE 'deferred'
    END;

    UPDATE case_fees SET
      paid_fees = v_paid,
      status = v_status,
      last_payment_date = COALESCE(p_payment_date, CURRENT_DATE),
      updated_at = now()
    WHERE id = v_fee.id
    RETURNING * INTO v_fee;
  END IF;

  RETURN v_fee;
END;
$function$;

-- REVOKE فضل زي ما هو من phase12/01 (CREATE OR REPLACE مبيغيّرش
-- الصلاحيات الممنوحة/الملغاة أصلًا على الدالة، مفيش داعي نكرره).

-- ────────────────────────────────────────────────────────────
--  G1.2 — record_fee_payment (نسخة كاملة من phase12/01 + فحص
--  القفل + استرجاع فحص الصلاحية)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_fee_id            uuid,
  p_amount            numeric,
  p_payment_date      date,
  p_notes             text,
  p_received_by       text,
  p_client_id         uuid,
  p_client_name       text,
  p_idempotency_key   uuid DEFAULT NULL
)
 RETURNS case_fees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_fee   case_fees;
  v_paid  numeric;
  v_status text;
  v_notes text;
  v_existing_payment fee_payments;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
  END IF;

  SELECT * INTO v_fee FROM case_fees
    WHERE id = p_fee_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الأتعاب غير موجود أو خارج نطاق مكتبك';
  END IF;

  -- 🆕 G1: نفس قفل tenant_write_allowed() (راجع الملاحظة فى
  -- create_fee_with_advance فوق — نفس السبب بالظبط).
  IF NOT public.tenant_write_allowed(v_fee.tenant_id) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  END IF;

  -- 🔧 استرجاع فحص من phase6/03 (راجع ملاحظة "اكتشاف جانبي" فى أول
  -- الملف ده).
  IF NOT has_permission('can_edit_fees') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الأتعاب';
  END IF;

  -- 🆕 فحص idempotency: نفس الطلب جالنا قبل كده ونجح؟ رجّع سجل
  -- case_fees الحالي (بالفعل محدَّث من النداء الأول) من غير INSERT جديد.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_payment FROM fee_payments
      WHERE tenant_id = v_fee.tenant_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_fee;
    END IF;
  END IF;

  -- لو المستخدم سايب خانة الملاحظات فاضية، بتتحفظ "دفعة أتعاب" تلقائيًا.
  v_notes := CASE WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN 'دفعة أتعاب' ELSE p_notes END;

  BEGIN
    INSERT INTO fee_payments (fee_id, amount, payment_date, notes, received_by, client_id, client_name, tenant_id, idempotency_key)
    VALUES (p_fee_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), v_notes, p_received_by, p_client_id, p_client_name, v_fee.tenant_id, p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    -- Race نادر: نداءين فعليين بنفس المفتاح فى نفس اللحظة. رجّع
    -- case_fees الحالي (اللي فاز بالتحديث) بدل ما نفشل العملية.
    SELECT * INTO v_fee FROM case_fees WHERE id = p_fee_id;
    RETURN v_fee;
  END;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM fee_payments WHERE fee_id = p_fee_id;

  v_status := CASE
    WHEN COALESCE(v_fee.total_fees, 0) <= 0 THEN 'open'
    WHEN v_paid >= v_fee.total_fees THEN 'collected'
    ELSE 'deferred'
  END;

  UPDATE case_fees SET
    paid_fees = v_paid,
    status = v_status,
    client_name = CASE WHEN p_client_name IS NOT NULL OR p_client_id IS NOT NULL THEN p_client_name ELSE client_name END,
    client_id   = CASE WHEN p_client_name IS NOT NULL OR p_client_id IS NOT NULL THEN p_client_id   ELSE client_id   END,
    last_payment_date = COALESCE(p_payment_date, last_payment_date),
    updated_at = now()
  WHERE id = p_fee_id
  RETURNING * INTO v_fee;

  RETURN v_fee;
END;
$function$;

-- REVOKE فضل زي ما هو من phase12/01.

-- ────────────────────────────────────────────────────────────
--  G1.3 — set_portal_pin (نسخة كاملة من phase13/01 + فحص القفل)
-- ────────────────────────────────────────────────────────────
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
BEGIN
  SELECT tenant_id INTO v_tenant FROM clients
    WHERE id = p_client_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'غير مصرح بتعديل بوابة عميل خارج مكتبك';
  END IF;

  -- 🆕 G1: client_portal_pins معندوش tenant_id مباشر (الجدول متوصّل
  -- بـclients.tenant_id، زي ما هو موثّق فى تقرير المرحلة)، فبنستخدم
  -- v_tenant اللي جبناه من صف العميل فوق مباشرة بدل عمود مش موجود.
  IF NOT public.tenant_write_allowed(v_tenant) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
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

-- REVOKE فضل زي ما هو من phase12 (اتحطت أول مرة هناك).

-- ════════════════════════════════════════════════════════════
--  G2 — قفل الكتابة على storage.objects (case-docs / client-docs)
-- ════════════════════════════════════════════════════════════
--  الخلفية: الـRESTRICTIVE policies (06/07/08) بتغطي الجداول بس.
--  storage.objects منفصل تمامًا عن نظام RLS بتاع الجداول، والسياسات
--  الحالية عليه (phase2/02 — tenant_scoped_case_client_docs_*) بتتأكد
--  من عزل الـtenant (المسار بيبدأ بـtenant_id بتاع المستخدم أو
--  is_super_admin())، لكن مفيهاش أي فحص لحالة الاشتراك. يعني مكتب
--  read-only كان لسه يقدر يرفع/يعدّل/يمسح مستندات قضايا وعملاء عادي.
--
--  التصميم: نفس أسلوب RESTRICTIVE المستخدم فى 06/07/08، لكن بدل
--  عمود tenant_id (مش موجود على storage.objects)، الـtenant بيتحدد من
--  أول جزء فى المسار (storage.foldername) — بالظبط زي منطق السياسة
--  الأساسية الموجودة فعلاً.
--
--  🔴 اكتشاف جانبي أثناء المراجعة (محتاج تأكيدك، مش اتصلح فى الملف ده):
--  كود رفع شعار المكتب (useAdminOffice.ts) بيحفظ على مسار
--  office/<tenant_id>/logo.<ext> — يعني أول جزء فى المسار حرفيًا كلمة
--  "office" مش الـtenant_id، على عكس كل باقي المسارات فى النظام
--  (مستندات قضايا/عملاء/أرشيف كلها <tenant_id>/... مباشرة، اتأكدت من
--  الكود الفعلي فى useCaseDocuments.ts/useClientActions.ts/exportApi.ts/
--  ArchiveTab.tsx). يعني سياسة phase2/02 الحالية
--  (tenant_scoped_case_client_docs_*)، اللي بتتحقق إن
--  (storage.foldername(name))[1] = current_tenant_id()::text، من
--  المفروض ترفض رفع/معاينة الشعار لأي أدمن عادي (مش سوبر أدمن) —
--  المسار مبيطابقش الشرط أصلاً. الدالة الجديدة تحت
--  (storage_object_write_allowed) بتتعامل مع الاستثناء ده صراحةً عشان
--  مانضيفش رفض إضافي جديد فوق مشكلة قائمة، لكن المشكلة الأصلية دي —
--  لو فعلاً موجودة على الإنتاج زي ما الكود بيوحي — برّه نطاق الملف ده
--  (بتلمس سياسة تانية قايمة بالفعل، مش حاجة القفل). لازم تتأكد بتجربة
--  فعلية: أدمن عادي (مش سوبر أدمن) يرفع شعار مكتب من الإعدادات، ولو
--  فشل، السياسة الأساسية (phase2/02) هي اللي محتاجة تعديل منفصل —
--  مش الملف ده.
--
--  دفاع فى العمق (deny-by-default): أي مسار مش متعارف عليه (مش
--  <uuid>/... ومش office/<uuid>/...) بيترفض تلقائيًا بدل ما يتسمح
--  بالغلط.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.storage_object_write_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_first  text := (storage.foldername(p_name))[1];
  v_second text := (storage.foldername(p_name))[2];
  v_tenant uuid;
BEGIN
  -- المسار العادي: <tenant_id>/اسم-الملف (مستندات قضايا/عملاء/أرشيف)
  BEGIN
    v_tenant := v_first::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_tenant := NULL;
  END;

  -- استثناء شعار المكتب: office/<tenant_id>/logo.ext (راجع ملاحظة
  -- "اكتشاف جانبي" فوق)
  IF v_tenant IS NULL AND v_first = 'office' AND v_second IS NOT NULL THEN
    BEGIN
      v_tenant := v_second::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_tenant := NULL;
    END;
  END IF;

  IF v_tenant IS NULL THEN
    RETURN false; -- مسار مش متعارف عليه — امنع افتراضيًا
  END IF;

  RETURN public.tenant_write_allowed(v_tenant);
END;
$$;

-- الشرط "bucket_id NOT IN (...) OR ..." بيضمن إن الـRESTRICTIVE policy
-- دي مالهاش أي أثر على أي باكت تاني (legal-library، legal-doc-templates)
-- — بتفضل true (no-op) لأي بكت غير case-docs/client-docs.

DROP POLICY IF EXISTS "tenant_write_allowed_storage_objects_insert" ON storage.objects;
CREATE POLICY "tenant_write_allowed_storage_objects_insert"
  ON storage.objects AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    bucket_id NOT IN ('case-docs', 'client-docs')
    OR public.storage_object_write_allowed(name)
  );

DROP POLICY IF EXISTS "tenant_write_allowed_storage_objects_update" ON storage.objects;
CREATE POLICY "tenant_write_allowed_storage_objects_update"
  ON storage.objects AS RESTRICTIVE FOR UPDATE
  USING (
    bucket_id NOT IN ('case-docs', 'client-docs')
    OR public.storage_object_write_allowed(name)
  )
  WITH CHECK (
    bucket_id NOT IN ('case-docs', 'client-docs')
    OR public.storage_object_write_allowed(name)
  );

DROP POLICY IF EXISTS "tenant_write_allowed_storage_objects_delete" ON storage.objects;
CREATE POLICY "tenant_write_allowed_storage_objects_delete"
  ON storage.objects AS RESTRICTIVE FOR DELETE
  USING (
    bucket_id NOT IN ('case-docs', 'client-docs')
    OR public.storage_object_write_allowed(name)
  );

-- ⚠️ عمدًا مفيش RESTRICTIVE policy على SELECT — القراءة (فتح/معاينة
-- مستند موجود) لازم تفضل شغالة حتى للمكتب read-only، بالظبط زي مبدأ
-- C4 المطبّق على باقي الجداول.

-- ════════════════════════════════════════════════════════════
--  خطوة تأكيد بعد التنفيذ
-- ════════════════════════════════════════════════════════════
--  1) تأكد إن الدوال التلاتة اتحدّثت (created_at الحالي مش قديم):
--       SELECT proname, prosrc ILIKE '%tenant_write_allowed%' AS has_lock_check
--       FROM pg_proc WHERE proname IN ('create_fee_with_advance','record_fee_payment','set_portal_pin');
--     المتوقع: has_lock_check = true للتلاتة.
--
--  2) تأكد من سياسات storage الجديدة:
--       SELECT policyname, cmd FROM pg_policies
--       WHERE schemaname = 'storage' AND tablename = 'objects'
--         AND policyname LIKE 'tenant_write_allowed_storage_objects_%';
--     المتوقع: 3 صفوف (insert/update/delete).
--
--  3) اختبار يدوي إلزامي (staging أو مكتب تجريبي مش حقيقي على
--     الإنتاج) — نفس انضباط C6:
--     أ) مكتب عادي (active/grace/تجربة يوم 1-14): تسجيل دفعة أتعاب،
--        إنشاء أتعاب جديدة، تفعيل/تعطيل بوابة موكل، رفع مستند قضية —
--        كل ده المفروض يفضل شغال زي الأول تمامًا (صفر فرق).
--     ب) مكتب فى وضع read-only فعلي (أو تجربة يوم 15+ للاختبار): نفس
--        العمليات الأربعة المفروض ترفض برسالة "الحساب في وضع مشاهدة
--        فقط..."، لكن معاينة/تحميل مستند موجود، وعرض قائمة الأتعاب،
--        لازم يفضلوا شغالين عادي.
--     ج) بالتحديد: جرّب رفع شعار مكتب (أدمن عادي مش سوبر أدمن) على
--        مكتب مش مقفول، وسجّل النتيجة — ده هيأكد أو ينفي الاكتشاف
--        الجانبي المذكور فوق فى G2.
--
--  4) Regression شامل (C6): تشغيل
--     database/tests/phase1-tenant-isolation-test.sql على staging
--     والتأكد من نتايجه قبل أي نشر للإنتاج — نفس الانضباط المطبّق على
--     كل تعديل سابق فى tenant_write_allowed()/سياسات الكتابة.
-- ════════════════════════════════════════════════════════════
