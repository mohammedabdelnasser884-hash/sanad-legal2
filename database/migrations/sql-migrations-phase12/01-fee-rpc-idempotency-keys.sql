-- ══════════════════════════════════════════════════════════════════
--  Migration: Idempotency keys لـ record_fee_payment / create_fee_with_advance
--  (خطة "تصنيف الرسائل ودورة حياة العمليات" — البند ٣-د، ٥ سبتمبر ٢٠٢٦)
--
--  المشكلة (موثّقة بالتفصيل في تقرير ٣-أ): الدالتين ذرّيتين (transaction
--  واحدة) لكن مش idempotent — لو الطلب اتنفذ فعليًا على السيرفر والرد
--  ضاع فى الطريق للعميل (قطع اتصال لحظي)، المستخدم بيضغط الزرار تاني
--  يدويًا ظانًا إن العملية فشلت بالكامل → دفعة/سجل أتعاب مكرر حقيقي.
--
--  الحل: مفتاح idempotency اختياري (uuid) بيتولّد مرة واحدة فى
--  الفرونت إند لكل "نية" (فتح فورم/مودال)، بيتبعت زي ما هو فى كل
--  محاولة (الأولى وأي إعادة محاولة يدوية بعدها). أول نداء ناجح بمفتاح
--  معيّن بيسجّله؛ أي نداء تاني بنفس المفتاح بيرجّع نفس النتيجة القديمة
--  من غير أي INSERT جديد.
--
--  ⚠️ باراميتر جديد فى آخر التوقيع بـDEFAULT NULL — استدعاءات قديمة
--  (من غير المفتاح) تفضل شغالة زي ما هي بالظبط، بس من غير أي حماية
--  idempotency (نفس السلوك الحالي تمامًا).
--
--  الملف Idempotent (CREATE OR REPLACE + IF NOT EXISTS) — آمن يتشغل
--  أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) أعمدة + فهارس فريدة (نطاق: لكل مكتب على حدة) ──

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE case_fees    ADD COLUMN IF NOT EXISTS idempotency_key uuid;

-- شرط WHERE idempotency_key IS NOT NULL عشان الصفوف القديمة (من غير
-- مفتاح، وكل الصفوف اللي جاية من نداءات قديمة بلا الباراميتر الجديد)
-- متتصادمش ببعض تحت نفس الفهرس الفريد.
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_idempotency_key_uidx
  ON fee_payments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS case_fees_idempotency_key_uidx
  ON case_fees (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 2) create_fee_with_advance: فحص idempotency قبل أي INSERT ──
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

REVOKE EXECUTE ON FUNCTION public.create_fee_with_advance(uuid, text, uuid, text, text, numeric, text, numeric, date, uuid)
  FROM anon, PUBLIC;

-- ── 3) record_fee_payment: فحص idempotency قبل أي INSERT ──
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

REVOKE EXECUTE ON FUNCTION public.record_fee_payment(uuid, numeric, date, text, text, uuid, text, uuid)
  FROM anon, PUBLIC;

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('fee_payments','case_fees') AND column_name = 'idempotency_key';
--   SELECT indexname FROM pg_indexes
--     WHERE indexname IN ('fee_payments_idempotency_key_uidx','case_fees_idempotency_key_uidx');
--   -- تأكدي كمان إن استدعاء قديم (من غير آخر باراميتر) لسه شغال:
--   -- SELECT record_fee_payment('<fee-id>'::uuid, 10, CURRENT_DATE, NULL, 'test', NULL, NULL);
