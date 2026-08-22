-- ══════════════════════════════════════════════════════════════════
--  Migration: سد ثغرة — record_fee_payment/create_fee_with_advance
--  بيتخطوا RLS بالكامل (SECURITY DEFINER) وما فيهمش أي فحص صلاحية
--  (خطة تفعيل الصلاحيات التفصيلية، مرحلة 1، قسم 3.6 — 🔴 ثغرة تصميم
--  حقيقية اتلقت فى الجرد، مش قرار منتج اختياري).
--
--  المشكلة: بعد ما نقفل case_fees/fee_payments بـRLS (ملف 02)، أي
--  lawyer هيفضل يقدر يسجّل دفعة أو ينشئ أتعاب عن طريق نداء الـRPC
--  مباشرة، لأن الدالتين SECURITY DEFINER وبيتحققوا بس من عزل الـtenant
--  — القفل هيبقى شكلي من غير السطر ده.
--
--  الحل: نفس جسم الدالتين حرفيًا من phase4/01-record-fee-payment-rpc.sql
--  وphase5/01-create-fee-with-advance-rpc.sql، + سطر تحقق واحد مضاف
--  بعد فحص عزل الـtenant الموجود وقبل أي INSERT/UPDATE.
--
--  الملف Idempotent (CREATE OR REPLACE) — آمن يتشغل أكتر من مرة.
--  ⚠️ لازم يتنفذ مع has_permission() (ملف 01) موجودة الأول، وإلا
--  الدالتين هيفشلوا CREATE OR REPLACE (دالة غير معرّفة).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_fee_id       uuid,
  p_amount       numeric,
  p_payment_date date,
  p_notes        text,
  p_received_by  text,
  p_client_id    uuid,
  p_client_name  text
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر';
  END IF;

  -- ⚠️ تأكد إن سجل الأتعاب ده تابع فعلاً لمكتب المستخدم المستدعي
  -- (أو المستدعي سوبر أدمن) — نفس نمط set_portal_pin، لازم لأن
  -- الدالة SECURITY DEFINER (بتتخطى RLS، فالتحقق لازم يبقى صريح هنا).
  SELECT * INTO v_fee FROM case_fees
    WHERE id = p_fee_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الأتعاب غير موجود أو خارج نطاق مكتبك';
  END IF;

  -- 🔴 سد ثغرة (قسم 3.6): الدالة SECURITY DEFINER وبتتخطى RLS بالكامل
  -- — فحص الصلاحية لازم يبقى صريح هنا، وإلا قفل case_fees/fee_payments
  -- بـRLS هيبقى شكلي (أي lawyer هيقدر ينده الـRPC مباشرة).
  IF NOT has_permission('can_edit_fees') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الأتعاب';
  END IF;

  INSERT INTO fee_payments (fee_id, amount, payment_date, notes, received_by, client_id, client_name, tenant_id)
  VALUES (p_fee_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), p_notes, p_received_by, p_client_id, p_client_name, v_fee.tenant_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM fee_payments WHERE fee_id = p_fee_id;

  v_status := CASE
    WHEN COALESCE(v_fee.total_fees, 0) <= 0 THEN 'open'
    WHEN v_paid >= v_fee.total_fees THEN 'collected'
    ELSE 'deferred'
  END;

  UPDATE case_fees SET
    paid_fees = v_paid,
    status = v_status,
    -- نفس منطق الفرونت إند الأصلي: يتحدّث الاتنين مع بعض بس لو فيه
    -- قيمة جاية من أي منهم (بما فيها NULL مقصودة فى حالة الإدخال اليدوي)
    client_name = CASE WHEN p_client_name IS NOT NULL OR p_client_id IS NOT NULL THEN p_client_name ELSE client_name END,
    client_id   = CASE WHEN p_client_name IS NOT NULL OR p_client_id IS NOT NULL THEN p_client_id   ELSE client_id   END,
    last_payment_date = COALESCE(p_payment_date, last_payment_date),
    updated_at = now()
  WHERE id = p_fee_id
  RETURNING * INTO v_fee;

  RETURN v_fee;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_fee_payment(uuid, numeric, date, text, text, uuid, text)
  FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.create_fee_with_advance(
  p_case_id       uuid,
  p_case_title    text,
  p_client_id     uuid,
  p_client_name   text,
  p_receiver      text,
  p_total_fees    numeric,
  p_notes         text,
  p_paid_amount   numeric,
  p_payment_date  date
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

  -- ⚠️ تأكد إن القضية دي تابعة فعلاً لمكتب المستخدم المستدعي (أو
  -- المستدعي سوبر أدمن) — نفس نمط record_fee_payment/set_portal_pin،
  -- لازم لأن الدالة SECURITY DEFINER (بتتخطى RLS، فالتحقق لازم يبقى
  -- صريح هنا). بنجيب tenant_id من نفس صف القضية عشان نستخدمه فى
  -- الإدراجات الجاية (بدل الاعتماد على trigger لو مش موجود).
  SELECT tenant_id INTO v_tenant FROM cases
    WHERE id = p_case_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القضية غير موجودة أو خارج نطاق مكتبك';
  END IF;

  -- 🔴 سد ثغرة (قسم 3.6): نفس السبب بالظبط زي record_fee_payment أعلاه.
  IF NOT has_permission('can_edit_fees') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الأتعاب';
  END IF;

  v_paid := CASE WHEN p_paid_amount > 0 THEN p_paid_amount ELSE 0 END;
  v_status := CASE
    WHEN COALESCE(p_total_fees, 0) <= 0 THEN 'open'
    WHEN v_paid >= p_total_fees THEN 'collected'
    ELSE 'deferred'
  END;

  INSERT INTO case_fees (
    case_id, case_title, client_id, client_name, receiver,
    total_fees, notes, paid_fees, status, tenant_id
  ) VALUES (
    p_case_id, p_case_title, p_client_id, p_client_name, p_receiver,
    p_total_fees, p_notes, 0, CASE WHEN COALESCE(p_total_fees,0) <= 0 THEN 'open' ELSE 'deferred' END, v_tenant
  ) RETURNING * INTO v_fee;

  -- دفعة مقدّمة اختيارية — نفس شرط الفرونت إند الأصلي (initialPaidAmount > 0)
  IF p_paid_amount IS NOT NULL AND p_paid_amount > 0 THEN
    INSERT INTO fee_payments (fee_id, amount, payment_date, notes, received_by, client_id, client_name, tenant_id)
    VALUES (v_fee.id, p_paid_amount, COALESCE(p_payment_date, CURRENT_DATE), 'مقدم أتعاب', p_receiver, p_client_id, p_client_name, v_tenant);

    -- إعادة حساب من مجموع fee_payments الفعلي (زي record_fee_payment
    -- بالظبط) بدل الاعتماد على p_paid_amount مباشرة — احتياط لو فيه
    -- أي إدراج آخر حصل على نفس fee_id فى نفس اللحظة (سيناريو نظري هنا
    -- لأن السجل جديد، لكن نفس النمط الموحّد فى كل مكان فى المشروع).
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

REVOKE EXECUTE ON FUNCTION public.create_fee_with_advance(uuid, text, uuid, text, text, numeric, text, numeric, date)
  FROM anon, PUBLIC;

-- ── خطوة تأكيد بعد التنفيذ (اختبار يدوي بحساب lawyer تجريبي) ──
--   -- المتوقع: RAISE EXCEPTION 'ليس لديك صلاحية تعديل الأتعاب'
--   SELECT record_fee_payment('<fee-id-حقيقي>', 100, CURRENT_DATE, null, null, null, null);
