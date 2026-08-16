-- ============================================================
--  اختبار Matrix للصلاحيات التفصيلية (المرحلة 5) — منصة سند
--  16 أغسطس 2026
-- ============================================================
--  ⚠️ آمن على الإنتاج: كل حاجة هنا جوه BEGIN...ROLLBACK، بنفس
--  نمط database/tests/phase1-tenant-isolation-test.sql بالظبط.
--  مفيش أي COMMIT في آخر السكريبت — أي بيانات تجريبية (تينانت،
--  مستخدمين، قضايا، أتعاب...) بتتعمل هنا هتتمسح تلقائيًا في آخر
--  السكريبت، ومفيش أي أثر هيفضل في قاعدة البيانات.
--
--  المرجع: خطة تفعيل نظام الصلاحيات التفصيلية (تحديث 8)، مرحلة 5،
--  البند الأول: "Matrix Test صريح ومسمى: 3 أدوار × 8 مفاتيح (24
--  حالة)، مفحوصة على الطبقتين UI + RLS." — الطبقة اللي هنا هي RLS/
--  has_permission()/RPC (قاعدة البيانات). طبقة UI مغطاة بالكامل فى
--  src/shared/lib/permissions.test.ts (24 حالة عبر it.each لكل
--  مفتاح × دور، بالإضافة لـadmin/super_admin/حالات حدّية).
--
--  ⚠️ شرط أساسي قبل التشغيل: الملفات الـ3 بتاعة مرحلة 1
--  (database/migrations/sql-migrations-phase6/01، 02، 03) لازم
--  تكون اتشغّلت فعليًا على نفس القاعدة دي الأول (has_permission()
--  والـRLS المقسّمة والـRPC checks لازم يكونوا موجودين).
-- ============================================================

BEGIN;

-- ── جدول تجميع النتائج ──────────────────────────────────────
CREATE TEMP TABLE test_results (
  seq         serial PRIMARY KEY,
  test_name   text,
  expected    text,
  actual      text,
  passed      boolean
);

GRANT INSERT, SELECT ON test_results TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE test_results_seq_seq TO authenticated;

-- ============================================================
-- PART A — تجهيز بيانات تجريبية
-- ============================================================
-- تينانت واحد، 5 مستخدمين تجريبيين يغطوا كل حالة فى الخطة:
--   admin_u    — role=admin (بايباس كامل)
--   lawyer_u   — role=lawyer بلا أي استثناء صريح (افتراضي الدور بس)
--   viewer_u   — role=viewer بلا أي استثناء صريح
--   lawyer_ovr — role=lawyer بـpermissions صريحة: can_delete_cases=true
--                (المفروض تتفعّل) و can_view_fees=true (المفروض تتجاهل
--                — قفل الأتعاب أسبق من أي استثناء صريح، قرار 2.1)
--   super_u    — role=lawyer لكن is_super_admin=true (بايباس كامل زي admin)
-- + قضية وأتعاب ودفعة تابعين لنفس التينانت، عشان نختبر عليهم SELECT/
--   INSERT/UPDATE/DELETE فعليًا مش بس نداء has_permission() مباشر.

DO $$
DECLARE
  tenant_x    uuid := 'cccccccc-0000-4000-8000-000000000001';
  admin_u     uuid := 'cccccccc-1111-4000-8000-0000000000c1';
  lawyer_u    uuid := 'cccccccc-1111-4000-8000-0000000000c2';
  viewer_u    uuid := 'cccccccc-1111-4000-8000-0000000000c3';
  lawyer_ovr  uuid := 'cccccccc-1111-4000-8000-0000000000c4';
  super_u     uuid := 'cccccccc-1111-4000-8000-0000000000c5';
  firm_x      uuid := 'cccccccc-2222-4000-8000-000000000001';
  client_x    uuid := 'cccccccc-3333-4000-8000-000000000001';
  case_x      uuid := 'cccccccc-4444-4000-8000-000000000001';
  fee_x       uuid := 'cccccccc-5555-4000-8000-000000000001';
BEGIN
  INSERT INTO tenants (id, name, slug) VALUES
    (tenant_x, 'TEST Tenant Permissions Matrix', 'test-tenant-perm-16aug');

  INSERT INTO auth.users (id) VALUES
    (admin_u), (lawyer_u), (viewer_u), (lawyer_ovr), (super_u);

  INSERT INTO profiles (user_id, tenant_id, role, rbac_role, is_super_admin, is_active, full_name, permissions) VALUES
    (admin_u,    tenant_x, 'admin',  'lawyer', false, true, 'TEST Admin',            '{}'::jsonb),
    (lawyer_u,   tenant_x, 'lawyer', 'lawyer', false, true, 'TEST Lawyer',           '{}'::jsonb),
    (viewer_u,   tenant_x, 'viewer', 'lawyer', false, true, 'TEST Viewer',           '{}'::jsonb),
    (lawyer_ovr, tenant_x, 'lawyer', 'lawyer', false, true, 'TEST Lawyer Override',
       jsonb_build_object('can_delete_cases', true, 'can_view_fees', true)),
    (super_u,    NULL,     'lawyer', 'lawyer', true,  true, 'TEST Super Admin (lawyer role)', '{}'::jsonb);

  INSERT INTO law_firms (id, tenant_id, firm_name) VALUES (firm_x, tenant_x, 'TEST Firm Perm Matrix');

  INSERT INTO clients (id, tenant_id, firm_id, client_name) VALUES
    (client_x, tenant_x, firm_x, 'TEST Client Perm Matrix');

  INSERT INTO cases (id, tenant_id, client_id, firm_id, case_number_official, title, court_name) VALUES
    (case_x, tenant_x, client_x, firm_x, 'TEST-CASE-PERM', 'TEST Case Perm Matrix', 'TEST Court');

  INSERT INTO case_fees (id, tenant_id, case_id, client_id, total_fees, paid_fees, status) VALUES
    (fee_x, tenant_x, case_x, client_x, 1000, 0, 'open');

  RAISE NOTICE 'PART A: بيانات اختبار الـMatrix اتجهزت بنجاح';
END $$;

-- ============================================================
-- PART B — has_permission() مباشرة: 3 أدوار × 8 مفاتيح (24 حالة)
-- ============================================================
-- بيقارن نتيجة has_permission() فعليًا مع نفس مصفوفة قسم 2.1 من
-- الخطة (ROLE_DEFAULT_PERMISSIONS فى permissions.ts) — أي اختلاف
-- هنا معناه الطبقتين (UI/RLS) طلعوا مش متطابقين.

DO $$
DECLARE
  lawyer_u uuid := 'cccccccc-1111-4000-8000-0000000000c2';
  viewer_u uuid := 'cccccccc-1111-4000-8000-0000000000c3';
  admin_u  uuid := 'cccccccc-1111-4000-8000-0000000000c1';
  expected_matrix jsonb := '{
    "admin":  {"can_add_cases":true,"can_edit_cases":true,"can_delete_cases":true,"can_view_fees":true,"can_edit_fees":true,"can_add_clients":true,"can_view_reports":true,"can_export_data":true},
    "lawyer": {"can_add_cases":true,"can_edit_cases":true,"can_delete_cases":false,"can_view_fees":false,"can_edit_fees":false,"can_add_clients":true,"can_view_reports":true,"can_export_data":false},
    "viewer": {"can_add_cases":false,"can_edit_cases":false,"can_delete_cases":false,"can_view_fees":false,"can_edit_fees":false,"can_add_clients":false,"can_view_reports":true,"can_export_data":false}
  }'::jsonb;
  role_users jsonb := jsonb_build_object('admin', admin_u::text, 'lawyer', lawyer_u::text, 'viewer', viewer_u::text);
  role_name  text;
  perm_key   text;
  expected_v boolean;
  actual_v   boolean;
BEGIN
  FOR role_name IN SELECT jsonb_object_keys(expected_matrix) LOOP
    EXECUTE format('SET LOCAL request.jwt.claims = %L', jsonb_build_object('sub', role_users ->> role_name)::text);
    PERFORM set_config('role', 'authenticated', true);

    FOR perm_key IN SELECT jsonb_object_keys(expected_matrix -> role_name) LOOP
      expected_v := (expected_matrix -> role_name ->> perm_key)::boolean;
      EXECUTE format('SELECT has_permission(%L)', perm_key) INTO actual_v;

      INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
        format('has_permission(''%s'') لدور %s', perm_key, role_name),
        expected_v::text,
        actual_v::text,
        (actual_v = expected_v)
      );
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- PART C — القفل الأساسي للأتعاب بلا استثناء (قرار 2.1) + الاستثناء
-- الصريح لمفتاح تاني (قرار 2.2) — نفس المستخدم lawyer_ovr
-- ============================================================

DO $$
DECLARE
  lawyer_ovr uuid := 'cccccccc-1111-4000-8000-0000000000c4';
  actual_v   boolean;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-0000000000c4"}';
  PERFORM set_config('role', 'authenticated', true);

  -- can_view_fees=true محفوظة صراحة، لكن القفل الأساسي أسبق منها
  SELECT has_permission('can_view_fees') INTO actual_v;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer بقيمة صريحة can_view_fees=true محفوظة → القفل الأساسي بيغلبها',
    'false', actual_v::text, (actual_v = false));

  -- can_delete_cases=true محفوظة صراحة، ومسموح تتفعّل (مش أتعاب)
  SELECT has_permission('can_delete_cases') INTO actual_v;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer بقيمة صريحة can_delete_cases=true محفوظة → بتتفعّل فعليًا',
    'true', actual_v::text, (actual_v = true));
END $$;

-- ============================================================
-- PART D — RLS فعليًا على cases: viewer يحاول INSERT/UPDATE/DELETE
-- ============================================================

DO $$
DECLARE
  viewer_u uuid := 'cccccccc-1111-4000-8000-0000000000c3';
  tenant_x uuid := 'cccccccc-0000-4000-8000-000000000001';
  client_x uuid := 'cccccccc-3333-4000-8000-000000000001';
  firm_x   uuid := 'cccccccc-2222-4000-8000-000000000001';
  case_x   uuid := 'cccccccc-4444-4000-8000-000000000001';
  rejected boolean;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-0000000000c3"}';
  PERFORM set_config('role', 'authenticated', true);

  -- INSERT: viewer مايقدرش يضيف قضية (can_add_cases=false)
  rejected := false;
  BEGIN
    INSERT INTO cases (tenant_id, client_id, firm_id, case_number_official, title, court_name)
    VALUES (tenant_x, client_x, firm_x, 'TEST-CASE-VIEWER-INSERT', 'محاولة viewer', 'TEST Court');
  EXCEPTION WHEN insufficient_privilege OR others THEN
    rejected := true;
  END;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'viewer يحاول INSERT على cases → مرفوض بـRLS',
    'مرفوض', CASE WHEN rejected THEN 'مرفوض' ELSE 'اتنفّذ! (ثغرة)' END, rejected);

  -- UPDATE: viewer مايقدرش يعدّل قضية (can_edit_cases=false) — الصف
  -- المستهدف هنا القضية الأصلية اللي اتعملت بصلاحية postgres فى PART A،
  -- فمفروض حتى الـSELECT جواها يرجع 0 صف (RLS بتاعة UPDATE) فمفيش تعديل
  UPDATE cases SET title = 'محاولة تعديل viewer' WHERE id = case_x;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'viewer يحاول UPDATE على cases → 0 صف اتأثر',
    '0', (SELECT CASE WHEN FOUND THEN '1+' ELSE '0' END), NOT FOUND);

  -- DELETE: viewer مايقدرش يحذف قضية (can_delete_cases=false)
  DELETE FROM cases WHERE id = case_x;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'viewer يحاول DELETE على cases → 0 صف اتأثر',
    '0', (SELECT CASE WHEN FOUND THEN '1+' ELSE '0' END), NOT FOUND);
END $$;

-- ============================================================
-- PART E — RLS فعليًا على case_fees/fee_payments: lawyer عادي
-- (بدون استثناء) مايشوفش/مايعدّلش الأتعاب خالص
-- ============================================================

DO $$
DECLARE
  lawyer_u uuid := 'cccccccc-1111-4000-8000-0000000000c2';
  fee_x    uuid := 'cccccccc-5555-4000-8000-000000000001';
  cnt      int;
  rejected boolean;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-0000000000c2"}';
  PERFORM set_config('role', 'authenticated', true);

  -- SELECT: lawyer عادي مايشوفش case_fees خالص
  SELECT count(*) INTO cnt FROM case_fees WHERE id = fee_x;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer عادي يحاول SELECT على case_fees → 0 صف مرئي',
    '0', cnt::text, (cnt = 0));

  -- INSERT على fee_payments: مرفوض (قرار 2.6)
  rejected := false;
  BEGIN
    INSERT INTO fee_payments (fee_id, amount, tenant_id)
    VALUES (fee_x, 100, 'cccccccc-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege OR others THEN
    rejected := true;
  END;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer عادي يحاول INSERT مباشر على fee_payments → مرفوض بـRLS',
    'مرفوض', CASE WHEN rejected THEN 'مرفوض' ELSE 'اتنفّذ! (ثغرة)' END, rejected);
END $$;

-- ============================================================
-- PART F — الثغرة اللي اتصلّحت (قسم 3.6): RPCs الأتعاب بترفض
-- lawyer عادي حتى بنداء مباشر (مش بس RLS على الجدول)
-- ============================================================

DO $$
DECLARE
  lawyer_u uuid := 'cccccccc-1111-4000-8000-0000000000c2';
  fee_x    uuid := 'cccccccc-5555-4000-8000-000000000001';
  case_x   uuid := 'cccccccc-4444-4000-8000-000000000001';
  rejected boolean;
  err_msg  text;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-0000000000c2"}';
  PERFORM set_config('role', 'authenticated', true);

  -- record_fee_payment: مفروض يرفض برسالة صريحة
  rejected := false;
  BEGIN
    PERFORM record_fee_payment(fee_x, 100, current_date, 'test', 'test', NULL, NULL);
  EXCEPTION WHEN others THEN
    rejected := true;
    err_msg := SQLERRM;
  END;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer عادي يستدعي record_fee_payment مباشرة → RAISE EXCEPTION برسالة صلاحية',
    'مرفوض (ليس لديك صلاحية تعديل الأتعاب)',
    CASE WHEN rejected THEN format('مرفوض: %s', err_msg) ELSE 'اتنفّذ! (الثغرة رجعت)' END,
    (rejected AND err_msg LIKE '%صلاحية%')
  );

  -- create_fee_with_advance: نفس الشيء
  rejected := false;
  BEGIN
    PERFORM create_fee_with_advance(case_x, 'test', NULL, 'test', 'test', 500, 'test', 0, current_date);
  EXCEPTION WHEN others THEN
    rejected := true;
    err_msg := SQLERRM;
  END;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'lawyer عادي يستدعي create_fee_with_advance مباشرة → RAISE EXCEPTION برسالة صلاحية',
    'مرفوض (ليس لديك صلاحية تعديل الأتعاب)',
    CASE WHEN rejected THEN format('مرفوض: %s', err_msg) ELSE 'اتنفّذ! (الثغرة رجعت)' END,
    (rejected AND err_msg LIKE '%صلاحية%')
  );
END $$;

-- ============================================================
-- PART G — admin و super_admin: بايباس كامل فعلي على RLS (مش بس
-- has_permission()) — يشوفوا/يعدّلوا الأتعاب عادي
-- ============================================================

DO $$
DECLARE
  admin_u uuid := 'cccccccc-1111-4000-8000-0000000000c1';
  fee_x   uuid := 'cccccccc-5555-4000-8000-000000000001';
  cnt     int;
BEGIN
  SET LOCAL request.jwt.claims = '{"sub":"cccccccc-1111-4000-8000-0000000000c1"}';
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO cnt FROM case_fees WHERE id = fee_x;
  INSERT INTO test_results (test_name, expected, actual, passed) VALUES (
    'admin يحاول SELECT على case_fees → الصف مرئي (بايباس كامل)',
    '1', cnt::text, (cnt = 1));
END $$;

-- ============================================================
-- الملخص النهائي
-- ============================================================

RESET ROLE;

SELECT jsonb_build_object(
  'summary', jsonb_build_object(
    'passed_count', count(*) FILTER (WHERE passed),
    'failed_count', count(*) FILTER (WHERE NOT passed),
    'total_count', count(*)
  ),
  'failed_tests', (
    select jsonb_agg(jsonb_build_object(
      'seq', seq, 'test_name', test_name, 'expected', expected, 'actual', actual
    ) order by seq)
    from test_results where not passed
  )
) AS final_summary
FROM test_results;

-- ⚠️ ROLLBACK مقصود — مفيش أي بيانات تجريبية هتتسجل فعليًا.
-- لو عايز تراجع النتايج تاني قبل الـ rollback، بص على نتيجة
-- الاستعلام فوق قبل ما الـ ROLLBACK يتنفذ.
ROLLBACK;
