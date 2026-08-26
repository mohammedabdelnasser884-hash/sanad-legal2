-- ══════════════════════════════════════════════════════════════════
--  Migration: صلاحية can_generate_documents (سجل قرارات تقرير
--  المستندات القانونية، بند 6 — 26 أغسطس 2026)
--
--  القرار: توليد المستندات مقفول لدوري lawyer/admin بس بلا استثناء —
--  دور viewer ما يقدرش يولّد مستندات نهائيًا، حتى لو أدمن حاول يفتحها
--  له بقيمة صريحة في profiles.permissions. نفس نمط القفل الأساسي بتاع
--  can_view_fees/can_edit_fees (فحص الدور بيسبق أي قيمة صريحة محفوظة)،
--  مش نمط can_edit_fees الافتراضي القابل للتخصيص.
--
--  فرق جوهري عن قفل can_view_fees: هناك القفل بيرفض الكل (بما فيهم
--  lawyer)، وهنا القفل بيسمح لـlawyer صراحة (مش بس admin). يعني لازم
--  فرع IF منفصل، مش إضافة can_generate_documents لقايمة
--  ('can_view_fees','can_edit_fees') الموجودة.
--
--  الملف Idempotent (CREATE OR REPLACE للدالة، DROP POLICY IF EXISTS
--  قبل CREATE للـpolicy) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- 1) تحديث has_permission() — إضافة فرع can_generate_documents
CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_role text := get_my_role();
  v_explicit jsonb;
BEGIN
  IF is_super_admin() THEN
    RETURN true;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  -- قفل أساسي للأتعاب بلا استثناء (قرار 2.1) — أسبق من أي قيمة
  -- صريحة محفوظة، حتى لو أدمن حاول يفتحها لمستخدم معيّن.
  IF p_key IN ('can_view_fees', 'can_edit_fees') THEN
    RETURN false;
  END IF;

  -- 🆕 قفل أساسي لتوليد المستندات (بند 6) — مسموح لـlawyer بس (admin
  -- اترجع true فوق أصلاً)، مقفول تمامًا لـviewer بلا استثناء، حتى لو
  -- فيه قيمة صريحة محفوظة في profiles.permissions تحاول تفتحها.
  IF p_key = 'can_generate_documents' THEN
    RETURN v_role = 'lawyer';
  END IF;

  SELECT permissions -> p_key INTO v_explicit
  FROM profiles WHERE user_id = auth.uid();

  -- null صريح جوه الـJSON (permissions->key = 'null'::jsonb) يتعامل
  -- معاه زي المفتاح الغائب خالص، مش زي "false صريح".
  IF v_explicit IS NULL OR v_explicit = 'null'::jsonb THEN
    v_explicit := NULL;
  END IF;

  IF v_explicit IS NOT NULL THEN
    RETURN (v_explicit)::boolean;
  END IF;

  RETURN CASE
    WHEN v_role = 'lawyer' AND p_key IN
      ('can_add_cases','can_edit_cases','can_add_clients','can_view_reports')
      THEN true
    WHEN v_role = 'viewer' AND p_key = 'can_view_reports' THEN true
    ELSE false
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM anon, PUBLIC;

-- 2) تشديد INSERT policy على generated_documents — دفاع حقيقي على
-- مستوى القاعدة (مش بس إخفاء زرار في الواجهة)، بنفس فلسفة تعليق
-- "WRITE POLICIES" في 01-document-generation-schema.sql: بدون سطر
-- WITH CHECK يتضمن has_permission()، أي مستخدم داخل نفس الـtenant
-- (بما فيهم viewer) هيقدر يدرج صف في generated_documents مباشرة عبر
-- الـAPI حتى لو الواجهة مخفية عنه الزرار.
DROP POLICY IF EXISTS tenant_write_generated_docs ON generated_documents;
CREATE POLICY tenant_write_generated_docs ON generated_documents
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND has_permission('can_generate_documents')
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT has_permission('can_generate_documents'); -- lawyer/admin: true، viewer: false
--   -- تأكيد الـpolicy الجديدة:
--   SELECT polname, pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--   WHERE polrelid = 'generated_documents'::regclass AND polname = 'tenant_write_generated_docs';
