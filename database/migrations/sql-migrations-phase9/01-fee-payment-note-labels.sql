-- ══════════════════════════════════════════════════════════════════
--  Migration: تسميات تلقائية لملاحظات دفعات الأتعاب
--  (طلب المستخدم — 29 أغسطس 2026)
--
--  المطلوب: أول دفعة على سجل أتعاب جديد (لو اتحطت وقت الإنشاء) لازم
--  تتسجل بملاحظة "دفعة أولى مقدم أتعاب"، وأي دفعة بعدها (زرار "تسجيل
--  دفعة") تتسجل بملاحظة "دفعة أتعاب" لو المستخدم سايب خانة الملاحظات
--  فاضية (لو كتب ملاحظة بنفسه، ملاحظته هي اللي بتتحفظ زي ما هي — مفيش
--  تغيير في السلوك ده).
--
--  التغيير:
--   1) create_fee_with_advance: الملاحظة الثابتة اتغيرت من "مقدم أتعاب"
--      لـ"دفعة أولى مقدم أتعاب".
--   2) record_fee_payment: لو p_notes فاضية (NULL أو نص فاضي/مسافات)،
--      بتتحفظ "دفعة أتعاب" بدل ما تفضل NULL. لو المستخدم كتب ملاحظة،
--      بتتحفظ زي ما هي من غير أي تعديل.
--
--  الملف Idempotent (CREATE OR REPLACE) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) create_fee_with_advance: تسمية الدفعة الأولى ──
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

  SELECT tenant_id INTO v_tenant FROM cases
    WHERE id = p_case_id
      AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القضية غير موجودة أو خارج نطاق مكتبك';
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

  IF p_paid_amount IS NOT NULL AND p_paid_amount > 0 THEN
    -- 🔀 CHANGED (29 أغسطس 2026): "مقدم أتعاب" → "دفعة أولى مقدم أتعاب"
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

REVOKE EXECUTE ON FUNCTION public.create_fee_with_advance(uuid, text, uuid, text, text, numeric, text, numeric, date)
  FROM anon, PUBLIC;

-- ── 2) record_fee_payment: تسمية افتراضية "دفعة أتعاب" لو الملاحظات فاضية ──
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
  v_notes text;
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

  -- 🆕 (29 أغسطس 2026): لو المستخدم سايب خانة الملاحظات فاضية، بتتحفظ
  -- "دفعة أتعاب" تلقائيًا بدل NULL — لو كتب أي حاجة، بتتحفظ زي ما هي.
  v_notes := CASE WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN 'دفعة أتعاب' ELSE p_notes END;

  INSERT INTO fee_payments (fee_id, amount, payment_date, notes, received_by, client_id, client_name, tenant_id)
  VALUES (p_fee_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), v_notes, p_received_by, p_client_id, p_client_name, v_fee.tenant_id);

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

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT proname, prosrc FROM pg_proc WHERE proname IN ('create_fee_with_advance','record_fee_payment');
-- تأكدي إن prosrc فيها "دفعة أولى مقدم أتعاب" و"دفعة أتعاب" بدل النصوص القديمة.
