-- ══════════════════════════════════════════════════════════════════
--  Phase 24 / 01 — record_preliminary_judgment()
--
--  الباگ اللي بيتعالج: handlePreliminaryJudgment (useCaseSessions.ts)
--  كانت بتعمل كتابتين منفصلتين عبر الشبكة — UPDATE على case_sessions
--  (تسجيل منطوق الحكم التمهيدي + judgment_type='تمهيدي' على الجلسة
--  الحالية) ثم INSERT على case_sessions (إنشاء الجلسة القادمة) — من
--  غير أي transaction تجمعهم. نفس فئة الباگ اللي كانت في
--  handleFinalJudgment (راجع sql-migrations-phase23/01)، لكن هنا
--  خطورتها أقل بكتير: مفيش لمس لـcases.status خالص (القضية تفضل
--  "متداولة" في المسارين)، وأسوأ حالة ممكنة = جلسة قادمة ناقصة (مش
--  بيانات تالفة قانونيًا)، والكود القديم كان بيبلّغ المستخدم بتوست
--  دقيق يوضح بالظبط إيه اللي حصل. اتقفلت برضو عشان الاتساق مع
--  handleFinalJudgment ومنع أي تحذير خالص حتى لو نادر.
--
--  الحل: نقل العمليتين لـPostgres function واحدة بتتنفذ في transaction
--  حقيقية — إما الاتنين ينجحوا مع بعض أو يترجعوا مع بعض تلقائيًا.
--  نفس نمط record_final_judgment بالظبط (phase23) — بما في ذلك: فحص
--  النطاق (tenant_id)، فحص tenant_write_allowed، فحص optimistic
--  locking (updated_at) جوه الدالة نفسها بدل الكود.
--
--  ⚠️ فرق واحد مهم عن record_final_judgment: صلاحية can_edit_cases
--  بس (مش can_edit_sessions زيها)، لأن case_sessions_update (RLS،
--  phase18/03) بتتبع can_edit_cases لأي جلسة ليها case_id — وده حال
--  الجلستين هنا (case_id دايمًا حقيقي، الدالة مقصورة على قضايا حقيقية
--  فقط — راجع تعليق handlePreliminaryJudgment في الكود). مفيش تعديل
--  على cases نفسها هنا، فمفيش داعي لفحص صلاحية القضية التانية.
--
--  ⚠️ نفس قرار العمل بتاع phase23 (راجع التعليق في
--  src/lib/offlineQueue.ts سطر ٢٥-٣٣): __dbWrite/طابور الأوفلاين
--  بيدعم بس INSERT/UPDATE/DELETE على جدول واحد، مش نداء RPC متعدد
--  الخطوات. تسجيل الحكم التمهيدي بقى ممنوع بالكامل أوفلاين (رسالة
--  صريحة في الكود) بدل ما نبني نسخة أوفلاين معقدة.
--
--  الملف Idempotent (CREATE OR REPLACE)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_preliminary_judgment(
  p_session_id              uuid,
  p_case_id                 uuid,
  p_verdict_text            text,
  p_next_session_date       date,
  p_known_session_updated_at timestamptz DEFAULT NULL
)
 RETURNS TABLE (session_updated_at timestamptz, next_session_id uuid, next_session_created_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_session     case_sessions;
  v_case        cases;
  v_new_session case_sessions;
BEGIN
  IF p_verdict_text IS NULL OR btrim(p_verdict_text) = '' THEN
    RAISE EXCEPTION 'منطوق الحكم مطلوب';
  END IF;

  IF p_next_session_date IS NULL THEN
    RAISE EXCEPTION 'تاريخ الجلسة القادمة مطلوب';
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

  -- ⚠️ can_edit_cases بس (مش can_edit_sessions زي record_final_judgment) —
  -- راجع تعليق الملف فوق للسبب: الجلستين هنا ليهم case_id حقيقي دايمًا،
  -- وRLS الفعلية (case_sessions_update) بتتبع can_edit_cases في الحالة دي.
  IF NOT has_permission('can_edit_cases') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تسجيل حكم تمهيدي';
  END IF;

  -- Optimistic locking على الجلسة الحالية بس (مفيش تعديل على cases هنا).
  IF p_known_session_updated_at IS NOT NULL AND v_session.updated_at IS NOT NULL
     AND v_session.updated_at > p_known_session_updated_at THEN
    RAISE EXCEPTION 'conflict:session';
  END IF;

  UPDATE case_sessions SET
    result = p_verdict_text,
    judgment_type = 'تمهيدي',
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- ⚠️ صفر تغيير سلوك عن الكود القديم: is_judgment_reserved=false دايمًا
  -- على الجلسة الجديدة (بدل توريث القيمة القديمة)، عشان القضية تفضل
  -- "متداولة" وكأنها محصلش فيها حكم — نفس منطق handlePreliminaryJudgment
  -- الأصلي بالظبط.
  INSERT INTO case_sessions (
    case_id, session_date, session_time, session_floor, session_hall,
    court_level, secretary_hall, secretary_name, secretary_mobile,
    is_judgment_reserved, tenant_id
  ) VALUES (
    p_case_id, p_next_session_date, v_session.session_time, v_session.session_floor, v_session.session_hall,
    v_session.court_level, v_session.secretary_hall, v_session.secretary_name, v_session.secretary_mobile,
    false, v_case.tenant_id
  )
  RETURNING * INTO v_new_session;

  RETURN QUERY SELECT v_session.updated_at, v_new_session.id, v_new_session.created_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_preliminary_judgment(uuid, uuid, text, date, timestamptz)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_preliminary_judgment(uuid, uuid, text, date, timestamptz)
  TO authenticated;

-- ── للتحقق بعد التشغيل ──
--   SELECT proname FROM pg_proc WHERE proname = 'record_preliminary_judgment';
--   -- لازم يظهر، وGRANT يبقى authenticated بس (مفيش anon/PUBLIC)
