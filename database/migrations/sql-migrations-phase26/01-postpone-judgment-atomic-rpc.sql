-- ══════════════════════════════════════════════════════════════════
--  Phase 26 / 01 — record_judgment_postponement()
--
--  الباگ اللي بيتعالج (اتكشف بالاختبار اليدوي — المرحلة 10، اختبار 5،
--  12 سبتمبر 2026): handlePostponeJudgment (useCaseSessions.ts) كانت
--  بتعمل INSERT واحد بس للجلسة الجديدة (is_judgment_reserved=true) —
--  من غير ما تلمس الجلسة القديمة (اللي بتأجّل منها) خالص. النتيجة:
--  الجلسة القديمة تفضل is_judgment_reserved=true في القاعدة للأبد،
--  حتى بعد ما بقت مش آخر جلسة.
--
--  ده مختلف عن نفس الفكرة في record_preliminary_judgment (phase24)
--  اللي بتعمل UPDATE صريح على الجلسة القديمة (result+judgment_type)
--  قبل INSERT الجديدة — مسار التأجيل كان الوحيد اللي "ناسي" الخطوة دي.
--
--  الأثر العملي: أي جلسة "أُجّل" منها النطق بالحكم قبل كده، لو اتمسحت
--  الجلسة (الجلسات) اللي جاية بعدها، بترجع تظهر تاني كـ"محجوزة للحكم"
--  (زرار 🏛️ يفضل ظاهر عليها) رغم إنها مش آخر جلسة فعليًا — دائرة
--  "تراجع → مسح → ترجع تبقى محجوزة → تراجع → مسح..." اللي لوحظت يدويًا.
--
--  الحل: نفس نمط record_preliminary_judgment بالظبط — UPDATE الجلسة
--  القديمة (تصفير is_judgment_reserved فقط، صفر تغيير تاني في سلوكها)
--  + INSERT الجلسة الجديدة، في transaction واحدة ذرّية. بما إنها كمان
--  عمليتين منفصلتين عبر الشبكة في الكود القديم، بتتقفل كمان فرصة نفس
--  فئة باگ الـatomicity (phase23/24) كأثر جانبي مفيد.
--
--  ⚠️ نفس قرار العمل بتاع phase23/24: __dbWrite/طابور الأوفلاين بيدعم
--  بس جدول واحد لكل عملية — تأجيل النطق بالحكم بقى ممنوع بالكامل
--  أوفلاين (رسالة صريحة في الكود) زي تسجيل الحكم النهائي/التمهيدي بالظبط.
--
--  الملف Idempotent (CREATE OR REPLACE)، آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_judgment_postponement(
  p_session_id              uuid,
  p_case_id                 uuid,
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

  -- ⚠️ can_edit_cases بس (نفس record_preliminary_judgment) — مفيش تعديل
  -- على cases هنا، ومفيش منطوق حكم بيتسجل، فمفيش داعي لـcan_edit_sessions.
  IF NOT has_permission('can_edit_cases') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تأجيل النطق بالحكم';
  END IF;

  IF p_known_session_updated_at IS NOT NULL AND v_session.updated_at IS NOT NULL
     AND v_session.updated_at > p_known_session_updated_at THEN
    RAISE EXCEPTION 'conflict:session';
  END IF;

  -- 🔑 الفيكس الفعلي: تصفير is_judgment_reserved على الجلسة القديمة —
  -- ده اللي كان ناقص بالكامل في الكود القديم. مفيش أي تغيير تاني على
  -- الجلسة (result/judgment_type فاضلين زي ما هم — "تأجيل" مش "حكم").
  UPDATE case_sessions SET
    is_judgment_reserved = false,
    updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  INSERT INTO case_sessions (
    case_id, session_date, session_time, session_floor, session_hall,
    court_level, secretary_hall, secretary_name, secretary_mobile,
    is_judgment_reserved, tenant_id
  ) VALUES (
    p_case_id, p_next_session_date, v_session.session_time, v_session.session_floor, v_session.session_hall,
    v_session.court_level, v_session.secretary_hall, v_session.secretary_name, v_session.secretary_mobile,
    true, v_case.tenant_id
  )
  RETURNING * INTO v_new_session;

  RETURN QUERY SELECT v_session.updated_at, v_new_session.id, v_new_session.created_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_judgment_postponement(uuid, uuid, date, timestamptz)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_judgment_postponement(uuid, uuid, date, timestamptz)
  TO authenticated;

-- ── تنضيف البيانات المسمومة الموجودة فعلاً (تشغيل مرة واحدة، آمن يتكرر) ──
-- أي جلسة is_judgment_reserved=true لكنها مش آخر جلسة فعليًا في قضيتها
-- (فيه جلسة تانية بتاريخ أحدث في نفس القضية) هي أثر الباگ ده بالظبط —
-- لازم ترجع false. الجلسة الفعلية "الأخيرة" (لو محجوزة فعلاً) متأثرتش.
UPDATE case_sessions cs SET is_judgment_reserved = false, updated_at = now()
WHERE cs.is_judgment_reserved = true
  AND cs.case_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM case_sessions later
    WHERE later.case_id = cs.case_id
      AND later.id <> cs.id
      AND (later.session_date, later.created_at) > (cs.session_date, cs.created_at)
  );

-- ── للتحقق بعد التشغيل ──
--   SELECT proname FROM pg_proc WHERE proname = 'record_judgment_postponement';
--   -- لازم يظهر، وGRANT يبقى authenticated بس (مفيش anon/PUBLIC)
--   SELECT id, case_id, session_date, is_judgment_reserved FROM case_sessions
--     WHERE is_judgment_reserved = true;
--   -- كل صف هنا المفروض دلوقتي هو فعلاً آخر جلسة في قضيته
