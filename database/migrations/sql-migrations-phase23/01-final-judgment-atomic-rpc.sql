-- ══════════════════════════════════════════════════════════════════
--  Phase 23 / 01 — record_final_judgment() + undo_final_judgment()
--
--  الباگ اللي بيتعالج: handleFinalJudgment/handleDeleteFinalJudgment
--  (useCaseSessions.ts) كانوا بيعملوا كتابتين منفصلتين عبر الشبكة —
--  UPDATE على case_sessions ثم UPDATE على cases.status — من غير أي
--  transaction تجمعهم. لو الكتابة الأولى نجحت والتانية فشلت فشل حقيقي
--  (خطأ DB فعلي راجع من Supabase، مش استثناء اتلقط وقيّد أوفلاين)،
--  مفيش أي rollback للأولى: كان بينتج جلسة عليها منطوق حكم والقضية
--  لسه "متداولة" (أو العكس بالظبط مع الحذف — قضية "منتهية" من غير
--  حكم مسجّل على آخر جلسة).
--
--  الحل: نقل العمليتين لـPostgres function واحدة بتتنفذ في transaction
--  حقيقية — إما الاتنين ينجحوا مع بعض أو يترجعوا مع بعض تلقائيًا.
--  نفس نمط record_fee_payment بالظبط (phase4/phase15) — بما في ذلك:
--  فحص النطاق (tenant_id)، فحص tenant_write_allowed، فحص has_permission،
--  وفحص optimistic locking (updated_at) جوه الدالة نفسها بدل الكود.
--
--  ⚠️ قرار عمل (بنفس منطق record_fee_payment/handleAddPayment —
--  راجع التعليق في src/lib/offlineQueue.ts سطر ٢٥-٣٣): نظام طابور
--  الأوفلاين (__dbWrite) بيدعم بس INSERT/UPDATE/DELETE على جدول واحد،
--  مش نداء RPC متعدد الجداول. الحكم النهائي (تسجيل/إلغاء) بقى ممنوع
--  بالكامل أوفلاين (رسالة صريحة في الكود) بدل ما نبني نسخة أوفلاين
--  معقدة وترجعنا لمشكلة الـpartial-save اللي الحل ده أصلاً بيقفلها.
--
--  الملف Idempotent (CREATE OR REPLACE)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
--  record_final_judgment — تسجيل حكم نهائي (UPDATE جلسة + UPDATE قضية)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_final_judgment(
  p_session_id              uuid,
  p_case_id                 uuid,
  p_verdict_text            text,
  p_judgment_date           date DEFAULT NULL,
  p_known_session_updated_at timestamptz DEFAULT NULL,
  p_known_case_updated_at    timestamptz DEFAULT NULL
)
 RETURNS TABLE (session_updated_at timestamptz, case_updated_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_session case_sessions;
  v_case    cases;
BEGIN
  IF p_verdict_text IS NULL OR btrim(p_verdict_text) = '' THEN
    RAISE EXCEPTION 'منطوق الحكم مطلوب';
  END IF;

  SELECT * INTO v_session FROM case_sessions
    WHERE id = p_session_id AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة أو خارج نطاق مكتبك';
  END IF;

  SELECT * INTO v_case FROM cases
    WHERE id = p_case_id AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القضية غير موجودة أو خارج نطاق مكتبك';
  END IF;

  IF v_session.case_id IS DISTINCT FROM p_case_id THEN
    RAISE EXCEPTION 'الجلسة لا تنتمي لهذه القضية';
  END IF;

  IF NOT public.tenant_write_allowed(v_case.tenant_id) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  END IF;

  IF NOT has_permission('can_edit_sessions') OR NOT has_permission('can_edit_cases') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تسجيل حكم نهائي';
  END IF;

  -- Optimistic locking — نفس منطق knownUpdatedAt اللي كان في __dbWrite،
  -- دلوقتي جوه الدالة نفسها عشان يتحقق من الاتنين في نفس اللحظة.
  IF p_known_session_updated_at IS NOT NULL AND v_session.updated_at IS NOT NULL
     AND v_session.updated_at > p_known_session_updated_at THEN
    RAISE EXCEPTION 'conflict:session';
  END IF;
  IF p_known_case_updated_at IS NOT NULL AND v_case.updated_at IS NOT NULL
     AND v_case.updated_at > p_known_case_updated_at THEN
    RAISE EXCEPTION 'conflict:case';
  END IF;

  -- ⚠️ صفر تغيير سلوك عن الكود القديم: مبنلمسش judgment_type هنا عمدًا —
  -- handleFinalJudgment الأصلي (قبل الفيكس ده) ما كانش بيحطها خالص (بعكس
  -- handlePreliminaryJudgment اللي بتحط 'تمهيدي'). ده هدفه إصلاح الـ
  -- atomicity بس، مش إضافة سلوك جديد غير مطلوب.
  UPDATE case_sessions SET
    result = p_verdict_text,
    session_date = COALESCE(p_judgment_date, session_date),
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE cases SET
    status = 'منتهية',
    updated_at = now()
  WHERE id = p_case_id
  RETURNING * INTO v_case;

  RETURN QUERY SELECT v_session.updated_at, v_case.updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_final_judgment(uuid, uuid, text, date, timestamptz, timestamptz)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_final_judgment(uuid, uuid, text, date, timestamptz, timestamptz)
  TO authenticated;

-- ────────────────────────────────────────────────────────────
--  undo_final_judgment — إلغاء حكم نهائي (عكس record_final_judgment
--  بالظبط: تصفير result+is_judgment_reserved على الجلسة + رجوع
--  cases.status لـ"نشطة")
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.undo_final_judgment(
  p_session_id              uuid,
  p_case_id                 uuid,
  p_known_session_updated_at timestamptz DEFAULT NULL,
  p_known_case_updated_at    timestamptz DEFAULT NULL
)
 RETURNS TABLE (session_updated_at timestamptz, case_updated_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_session case_sessions;
  v_case    cases;
BEGIN
  SELECT * INTO v_session FROM case_sessions
    WHERE id = p_session_id AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الجلسة غير موجودة أو خارج نطاق مكتبك';
  END IF;

  SELECT * INTO v_case FROM cases
    WHERE id = p_case_id AND (tenant_id = current_tenant_id() OR is_super_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القضية غير موجودة أو خارج نطاق مكتبك';
  END IF;

  IF v_session.case_id IS DISTINCT FROM p_case_id THEN
    RAISE EXCEPTION 'الجلسة لا تنتمي لهذه القضية';
  END IF;

  IF NOT public.tenant_write_allowed(v_case.tenant_id) THEN
    RAISE EXCEPTION 'الحساب في وضع مشاهدة فقط دلوقتي (الاشتراك محتاج تجديد، أو التجربة في مرحلة المشاهدة) — التعديل مش متاح. كلّم الإدارة لتأكيد الدفع أو ترقية الباقة.';
  END IF;

  IF NOT has_permission('can_edit_sessions') OR NOT has_permission('can_edit_cases') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية إلغاء حكم نهائي';
  END IF;

  IF p_known_session_updated_at IS NOT NULL AND v_session.updated_at IS NOT NULL
     AND v_session.updated_at > p_known_session_updated_at THEN
    RAISE EXCEPTION 'conflict:session';
  END IF;
  IF p_known_case_updated_at IS NOT NULL AND v_case.updated_at IS NOT NULL
     AND v_case.updated_at > p_known_case_updated_at THEN
    RAISE EXCEPTION 'conflict:case';
  END IF;

  -- ⚠️ صفر تغيير سلوك عن الكود القديم (نفس الملاحظة فوق): مبنلمسش
  -- judgment_type هنا برضه.
  UPDATE case_sessions SET
    result = NULL,
    is_judgment_reserved = false,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE cases SET
    status = 'نشطة',
    updated_at = now()
  WHERE id = p_case_id
  RETURNING * INTO v_case;

  RETURN QUERY SELECT v_session.updated_at, v_case.updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.undo_final_judgment(uuid, uuid, timestamptz, timestamptz)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_final_judgment(uuid, uuid, timestamptz, timestamptz)
  TO authenticated;

-- ── للتحقق بعد التشغيل ──
--   SELECT proname FROM pg_proc WHERE proname IN ('record_final_judgment','undo_final_judgment');
--   -- لازم الاتنين يظهروا، وGRANT يبقى authenticated بس (مفيش anon/PUBLIC)
