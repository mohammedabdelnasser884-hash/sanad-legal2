-- ══════════════════════════════════════════════════════════════════
--  Phase 27 (فيكس) — تصحيح باگ "COALESCE types date and text cannot
--  be matched" في record_final_judgment
--
--  السبب: عمود case_sessions.session_date فعليًا من نوع text (مش date)
--  في الداتابيز، بينما p_judgment_date في الدالة معرّف date. لما الكود
--  بيعمل COALESCE(p_judgment_date, session_date) — Postgres مبيقدرش
--  يوحّد نوع الاتنين تلقائيًا جوه COALESCE (بعكس INSERT العادي اللي
--  بيقبل assignment cast من date لـtext من غير مشاكل)، فبيرمي الخطأ ده
--  في كل نداء فيه p_judgment_date قيمة فعلية (مش NULL) — يعني عمليًا في
--  كل مرة حد يسجّل حكم نهائي وبيدخل تاريخ الحكم (وده الحالة العادية دايمًا).
--
--  الحل: نعمل cast صريح لـp_judgment_date لـtext قبل الـCOALESCE، عشان
--  الاتنين يبقوا نفس النوع. صفر تغيير على أي سلوك تاني في الدالة —
--  فيكس نوع بيانات بس.
--
--  الملف Idempotent (CREATE OR REPLACE)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

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

  IF p_known_session_updated_at IS NOT NULL AND v_session.updated_at IS NOT NULL
     AND v_session.updated_at > p_known_session_updated_at THEN
    RAISE EXCEPTION 'conflict:session';
  END IF;
  IF p_known_case_updated_at IS NOT NULL AND v_case.updated_at IS NOT NULL
     AND v_case.updated_at > p_known_case_updated_at THEN
    RAISE EXCEPTION 'conflict:case';
  END IF;

  -- 🔧 الفيكس: cast صريح لـp_judgment_date::text عشان يتطابق مع نوع
  -- عمود session_date الفعلي (text)، بدل ما نسيب Postgres يحاول يوحّد
  -- date مع text جوه COALESCE فيرمي خطأ نوع.
  UPDATE case_sessions SET
    result = p_verdict_text,
    session_date = COALESCE(p_judgment_date::text, session_date),
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

-- ── للتحقق بعد التشغيل ──
--   جرّب تسجيل حكم نهائي بتاريخ حكم فعلي (مش فاضي) من الواجهة — المفروض
--   ينجح من غير أي "COALESCE types date and text cannot be matched".
