-- ══════════════════════════════════════════════════════════════════
--  Migration: تقسيم سياسات RLS (FOR ALL) لأوامر منفصلة مربوطة
--  بـhas_permission() (خطة تفعيل الصلاحيات التفصيلية، مرحلة 1، قسم 3.3)
--
--  ⚠️ بيحل محل السياسات الموثّقة فى sql-migrations-phase5/
--  05-document-remaining-rls-policies.sql لجداول cases/clients/
--  case_fees بس (case_documents/case_sessions من غير تغيير — قرار
--  "بدون مفتاح مخصص ليهم"). fee_payments سياستها الحالية على الإنتاج
--  (tenant_scoped_fee_payments، FOR ALL) بتتقسم هنا كمان (قرار 2.6).
--
--  المبدأ فى كل جدول: تنقسم الأوامر، كل سياسة لسه بتحافظ على عزل
--  الـtenant (أو is_super_admin) + تضيف فحص has_permission المناسب
--  للأوامر المذكورة فى الخطة بس — الأوامر الغير مذكورة تفضل تينانت
--  فقط (بدون مفتاح صلاحية إضافي)، عشان viewer يقدر يشوف القضايا/
--  الموكلين لكن مايعدلش/يمسحش غير المسموح بيه.
--
--  الملف Idempotent (drop if exists + create) — آمن يتشغل أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- ── cases: DELETE ← can_delete_cases، INSERT ← can_add_cases، UPDATE ← can_edit_cases ──
drop policy if exists "tenant_scoped_cases" on public.cases;
drop policy if exists "cases_select" on public.cases;
drop policy if exists "cases_insert" on public.cases;
drop policy if exists "cases_update" on public.cases;
drop policy if exists "cases_delete" on public.cases;

create policy "cases_select" on public.cases
  for select
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

create policy "cases_insert" on public.cases
  for insert
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_add_cases'))
    or is_super_admin()
  );

create policy "cases_update" on public.cases
  for update
  using (
    (tenant_id = current_tenant_id() and has_permission('can_edit_cases'))
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_edit_cases'))
    or is_super_admin()
  );

create policy "cases_delete" on public.cases
  for delete
  using (
    (tenant_id = current_tenant_id() and has_permission('can_delete_cases'))
    or is_super_admin()
  );

-- ── clients: INSERT ← can_add_clients (باقي الأوامر تينانت فقط) ──
drop policy if exists "tenant_scoped_clients" on public.clients;
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_select" on public.clients
  for select
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

create policy "clients_insert" on public.clients
  for insert
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_add_clients'))
    or is_super_admin()
  );

create policy "clients_update" on public.clients
  for update
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

create policy "clients_delete" on public.clients
  for delete
  using (
    (tenant_id = current_tenant_id())
    or is_super_admin()
  );

-- ── case_fees: SELECT/INSERT/UPDATE/DELETE محكومين بالأتعاب (قرار 2.6/3.3) ──
-- SELECT ← can_view_fees، الباقي ← can_edit_fees. can_view_fees/
-- can_edit_fees مقفولين تمامًا لغير admin جوه has_permission نفسها
-- (قرار 2.1) — القفل هنا بيفرض النتيجة دي فعليًا على مستوى الصفوف.
drop policy if exists "tenant_scoped_case_fees" on public.case_fees;
drop policy if exists "case_fees_select" on public.case_fees;
drop policy if exists "case_fees_insert" on public.case_fees;
drop policy if exists "case_fees_update" on public.case_fees;
drop policy if exists "case_fees_delete" on public.case_fees;

create policy "case_fees_select" on public.case_fees
  for select
  using (
    (tenant_id = current_tenant_id() and has_permission('can_view_fees'))
    or is_super_admin()
  );

create policy "case_fees_insert" on public.case_fees
  for insert
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

create policy "case_fees_update" on public.case_fees
  for update
  using (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

create policy "case_fees_delete" on public.case_fees
  for delete
  using (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

-- ── fee_payments: نفس نطاق case_fees بالظبط (قرار 2.6) ──
-- سياسة الإنتاج الحالية (تأكدت منها مباشرة قبل الملف ده):
--   tenant_scoped_fee_payments، FOR ALL،
--   USING/WITH CHECK: ((tenant_id = current_tenant_id()) OR is_super_admin())
drop policy if exists "tenant_scoped_fee_payments" on public.fee_payments;
drop policy if exists "fee_payments_select" on public.fee_payments;
drop policy if exists "fee_payments_insert" on public.fee_payments;
drop policy if exists "fee_payments_update" on public.fee_payments;
drop policy if exists "fee_payments_delete" on public.fee_payments;

create policy "fee_payments_select" on public.fee_payments
  for select
  using (
    (tenant_id = current_tenant_id() and has_permission('can_view_fees'))
    or is_super_admin()
  );

create policy "fee_payments_insert" on public.fee_payments
  for insert
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

create policy "fee_payments_update" on public.fee_payments
  for update
  using (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  )
  with check (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

create policy "fee_payments_delete" on public.fee_payments
  for delete
  using (
    (tenant_id = current_tenant_id() and has_permission('can_edit_fees'))
    or is_super_admin()
  );

-- ── خطوة تأكيد بعد التنفيذ ──
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('cases','clients','case_fees','fee_payments')
--   order by tablename, cmd, policyname;
-- المتوقع: مفيش أي سياسة FOR ALL باقية على الأربعة دول — كلها مقسّمة
-- لـ4 سياسات منفصلة (select/insert/update/delete) لكل جدول.
--
-- ⚠️ ملحوظة تنفيذ: نفّذ الملف ده مع 01-has-permission-function.sql
-- و03-fee-rpc-permission-checks.sql مع بعض فى نفس النشرة — تقسيم
-- السياسات من غير الدالة أو من غير فحص الـRPC بيسيب ثغرة مؤقتة.
