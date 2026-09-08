-- ============================================================
-- 15-06 (C3 — دفعة 1/3) — تطبيق tenant_write_allowed() على cases + clients
-- ============================================================
-- الأسلوب: RESTRICTIVE policies إضافية (مش تعديل الـpolicies الموجودة).
-- في Postgres RLS، الـpolicies الـPERMISSIVE (الافتراضية) بتتجمع بـ OR
-- مع بعض، لكن أي RESTRICTIVE policy بتتجمع بـAND مع كل حاجة تانية —
-- يعني لازم تتحقق هي كمان عشان العملية تتنفذ، مهما كانت الـpermissive
-- policies بتسمح. ده بالظبط اللي محتاجينه: "شرط إضافي فوق كل الموجود"
-- من غير أي لمس أو splitting لأي policy شغالة حاليًا (cases_insert/
-- cases_update/cases_delete/clients_insert/clients_update/clients_delete
-- فضلوا زي ما هم بالظبط، صفر تغيير).
--
-- ⚠️ مهم: الـRESTRICTIVE policies هنا مربوطة بـFOR INSERT/UPDATE/DELETE
-- بس (مش FOR ALL) — يعني SELECT مش هيتأثر خالص (C4: القراءة لازم تفضل
-- شغالة حتى للمكتب المقفول read-only). ده بيتأكد فعليًا في اختبار C6.
--
-- الدفعة دي: cases + clients بس (جداول القضايا الأساسية). الجلسات/
-- الرسوم/الأطراف (case_sessions/case_fees/fee_payments/case_parties)
-- في دفعة 2 لاحقة، وباقي الجداول (activity_log/reminders/إلخ) في دفعة 3.
-- ============================================================

-- ── cases ──
DROP POLICY IF EXISTS "tenant_write_allowed_cases_insert" ON public.cases;
CREATE POLICY "tenant_write_allowed_cases_insert"
  ON public.cases AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_cases_update" ON public.cases;
CREATE POLICY "tenant_write_allowed_cases_update"
  ON public.cases AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_cases_delete" ON public.cases;
CREATE POLICY "tenant_write_allowed_cases_delete"
  ON public.cases AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ── clients ──
DROP POLICY IF EXISTS "tenant_write_allowed_clients_insert" ON public.clients;
CREATE POLICY "tenant_write_allowed_clients_insert"
  ON public.clients AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_clients_update" ON public.clients;
CREATE POLICY "tenant_write_allowed_clients_update"
  ON public.clients AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_clients_delete" ON public.clients;
CREATE POLICY "tenant_write_allowed_clients_delete"
  ON public.clients AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ============================================================
-- ✅ بعد تشغيل الملف ده: لازم تتأكد بـC6 (Regression) على الحالتين:
--   1. مكتب عادي (active/grace/تجربة يوم 1-14) — إضافة/تعديل/حذف
--      قضية وموكل لازم يفضلوا شغالين زي ما هما تمامًا (مفيش أي فرق).
--   2. مكتب تجربة يوم 15+ (بدون subscription_due_at) — جرّب تحدّث
--      trial_ends_at لمكتب تجريبي تجريبي (staging بس) بحيث
--      now() >= trial_ends_at - 16 days، وتأكد إن INSERT/UPDATE/DELETE
--      على cases/clients بيترفض، لكن SELECT (فتح الصفحة، عرض القضايا)
--      لسه شغال عادي.
-- ============================================================
