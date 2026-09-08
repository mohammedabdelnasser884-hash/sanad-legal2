-- ============================================================
-- 15-07 (C3 — دفعة 2/3) — تطبيق tenant_write_allowed() على
-- case_sessions + case_fees + fee_payments + case_parties
-- ============================================================
-- نفس أسلوب دفعة 1 بالظبط (15-06): RESTRICTIVE policies إضافية
-- جديدة، مربوطة بس بـFOR INSERT/UPDATE/DELETE (مش FOR ALL) —
-- صفر لمس لأي policy موجودة وشغالة على الجداول التلاتة دي، وSELECT
-- (C4) مش متأثر خالص.
--
-- الجداول التلاتة (case_sessions/case_fees/fee_payments/case_parties)
-- عندها عمود tenant_id مباشر (uuid NOT NULL REFERENCES tenants(id))
-- زي cases/clients بالظبط، فنفس الشكل ينطبق حرفيًا.
--
-- ⚠️ ملاحظة تاريخية اتلاقت في migration قديم (case-parties-backfill-
-- migration.sql, يوليو 2026): وقت الـbackfill كان فيه احتمال صفوف
-- case_sessions.tenant_id = NULL قديمة. لو لسه موجودة فعليًا (نادر
-- ومش متوقع)، الصف ده مش هيقدر يتعدّل/يتمسح لحد ما tenant_id يتصحّح،
-- لأن tenant_write_allowed(NULL) بترجع NULL وWITH CHECK/USING بيرفض
-- NULL زي false بالظبط. ده سلوك صح فعليًا (صف من غير تينانت مفروض
-- يتصحّح مش يتعدّل عادي)، مش باگ، لكن لو حصل رفض غريب على جلسة قديمة
-- تحديدًا، ده السبب الأرجح.
-- ============================================================

-- ── case_sessions ──
DROP POLICY IF EXISTS "tenant_write_allowed_case_sessions_insert" ON public.case_sessions;
CREATE POLICY "tenant_write_allowed_case_sessions_insert"
  ON public.case_sessions AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_sessions_update" ON public.case_sessions;
CREATE POLICY "tenant_write_allowed_case_sessions_update"
  ON public.case_sessions AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_sessions_delete" ON public.case_sessions;
CREATE POLICY "tenant_write_allowed_case_sessions_delete"
  ON public.case_sessions AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ── case_fees ──
DROP POLICY IF EXISTS "tenant_write_allowed_case_fees_insert" ON public.case_fees;
CREATE POLICY "tenant_write_allowed_case_fees_insert"
  ON public.case_fees AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_fees_update" ON public.case_fees;
CREATE POLICY "tenant_write_allowed_case_fees_update"
  ON public.case_fees AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_fees_delete" ON public.case_fees;
CREATE POLICY "tenant_write_allowed_case_fees_delete"
  ON public.case_fees AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ── fee_payments ──
DROP POLICY IF EXISTS "tenant_write_allowed_fee_payments_insert" ON public.fee_payments;
CREATE POLICY "tenant_write_allowed_fee_payments_insert"
  ON public.fee_payments AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_fee_payments_update" ON public.fee_payments;
CREATE POLICY "tenant_write_allowed_fee_payments_update"
  ON public.fee_payments AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_fee_payments_delete" ON public.fee_payments;
CREATE POLICY "tenant_write_allowed_fee_payments_delete"
  ON public.fee_payments AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ── case_parties ──
DROP POLICY IF EXISTS "tenant_write_allowed_case_parties_insert" ON public.case_parties;
CREATE POLICY "tenant_write_allowed_case_parties_insert"
  ON public.case_parties AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_parties_update" ON public.case_parties;
CREATE POLICY "tenant_write_allowed_case_parties_update"
  ON public.case_parties AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_case_parties_delete" ON public.case_parties;
CREATE POLICY "tenant_write_allowed_case_parties_delete"
  ON public.case_parties AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- ============================================================
-- ✅ بعد تشغيل الملف ده: مكتب عادي (active/grace/تجربة يوم 1-14)
-- المفروض يفضل قادر يضيف/يعدّل/يمسح جلسات، رسوم، دفعات، أطراف عادي
-- بلا أي فرق. C6 (Regression) لازم يتشغّل قبل أي نشر للإنتاج —
-- زي بالظبط ما اتعمل بعد دفعة 1.
-- بعد التأكيد، أكمل دفعة 3 (باقي الجداول: activity_log, reminders,
-- office_settings, generated_documents, document_templates,
-- client_messages, client_portal_pins, case_notes, case_events,
-- case_documents, case_document_links, template_fields,
-- template_versions, whatsapp_logs, invoices).
-- ============================================================
