-- ══════════════════════════════════════════════════════════════
--  Migration (توثيقي فقط) — تسجيل باقي سياسات RLS الأساسية
--  كملفات SQL في الريبو (بند 7 من تقرير مراجعة الصلاحيات)
--
--  ⚠️ السياسات دي مش جديدة ومش بتتغيّر هنا — هي نفسها الموجودة على
--  الإنتاج بالفعل. نصها اتاخد حرفيًا من نتيجة تشغيل
--  README-export-remaining-rls-policies.sql على قاعدة الإنتاج
--  (16 أغسطس 2026)، مش من الذاكرة أو تخمين.
--
--  اللي اتوثّق هنا: tenant_scoped_* على الجداول الأربعة (عزل عادي
--  بين المكاتب، نفس النمط)، بالإضافة لـ profiles_delete
--  و profiles_select (كانوا الوحيدين الناقصين على profiles؛
--  profiles_update اتوثّقت في 04، profiles_insert_super_admin_only
--  اتوثّقت في migration 11).
--
--  ⚠️ ملحوظة: نتيجة الاستعلام رجّعت بس 4 جداول (case_documents,
--  case_sessions, cases, clients) + profiles. جدول fees ماكانش
--  موجود في النتيجة اللي اتبعتت — يعني إما مفيهوش سياسات RLS مفعّلة
--  خالص، أو النتيجة كانت مقصوصة. محتاج تأكيد قبل ما نعتبره موثّق.
--
--  idempotent: drop if exists + create بنفس المنطق، آمن يتنفذ تاني.
-- ══════════════════════════════════════════════════════════════

-- ── عزل التينانت القياسي (case_documents / case_sessions / cases / clients / case_fees) ──
-- نفس النمط في الخمسة: أي عملية (ALL) مسموحة بس لو الصف تابع
-- لتينانت المستخدم الحالي، أو المستخدم سوبر أدمن.
-- ملحوظة: الجدول الفعلي اسمه case_fees مش fees (استعلام pg_policies
-- الأول كان بيدوّر على اسم غلط "fees" فرجع فاضي؛ اتأكد case_fees
-- عليها RLS مفعّلة relrowsecurity=true، والسياسة اتسحبت بعدها).

drop policy if exists "tenant_scoped_case_documents" on public.case_documents;
create policy "tenant_scoped_case_documents" on public.case_documents
  for all
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

drop policy if exists "tenant_scoped_case_sessions" on public.case_sessions;
create policy "tenant_scoped_case_sessions" on public.case_sessions
  for all
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

drop policy if exists "tenant_scoped_cases" on public.cases;
create policy "tenant_scoped_cases" on public.cases
  for all
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

drop policy if exists "tenant_scoped_clients" on public.clients;
create policy "tenant_scoped_clients" on public.clients
  for all
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

drop policy if exists "tenant_scoped_case_fees" on public.case_fees;
create policy "tenant_scoped_case_fees" on public.case_fees
  for all
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

-- ── profiles: باقي السياسات (DELETE / SELECT) ──
-- profiles_update موثّقة في 04، profiles_insert_super_admin_only
-- موثّقة في migration 11 (phase2) — مش متكررين هنا.

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete
  using (
    ((tenant_id = current_tenant_id()) and (get_my_role() = 'admin'))
    or is_super_admin()
  );

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select
  using (
    (user_id = auth.uid())
    or (tenant_id = current_tenant_id())
    or is_super_admin()
  );

-- ── خطوة تأكيد ──
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('case_documents','case_sessions','cases','clients','case_fees','profiles')
--   order by tablename, cmd, policyname;
-- تأكد إن النص طابق الملف ده حرفيًا.
