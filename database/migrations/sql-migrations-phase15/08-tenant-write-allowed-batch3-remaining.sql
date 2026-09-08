-- ============================================================
-- 15-08 (C3 — دفعة 3/3) — باقي الجداول
-- ============================================================
-- نفس أسلوب دفعتي 1 و2 بالظبط: RESTRICTIVE policies إضافية جديدة
-- (INSERT/UPDATE/DELETE بس حسب الموجود فعليًا من PERMISSIVE policies
-- لكل جدول — مفيش داعي لإضافة RESTRICTIVE لعملية مفيش أصلاً أي
-- PERMISSIVE policy بتسمح بيها، هتفضل مرفوضة زي ما هي)، صفر لمس لأي
-- policy موجودة، SELECT مش متأثر خالص.
--
-- الأعمدة اتأكدت من src/database.types.ts (الملف المولّد فعليًا من
-- schema الإنتاج الحقيقي)، مش تخمين.
--
-- ⚠️ activity_log اتسحب من الدفعة دي عمدًا — بند مفتوح محتاج قرارك،
-- راجع الملاحظة في آخر الملف قبل ما تتخذ قرار بشأنه.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- القسم أ: جداول بعمود tenant_id مباشر (نفس نمط دفعة 1 و2 حرفيًا)
-- case_notes, case_documents, case_events, reminders, whatsapp_logs,
-- office_settings, invoices (INSERT بس — الجدول ده سجل فواتير ثابت،
-- مفيش أي PERMISSIVE policy لـUPDATE/DELETE عليه أصلاً حاليًا، فمفيش
-- داعي RESTRICTIVE ليهم)، generated_documents (INSERT+UPDATE بس، مفيش
-- DELETE), document_templates (INSERT+UPDATE بس؛ tenant_id نفسه ممكن
-- يكون NULL للقوالب النظامية، لكن الكتابة الفعلية من الواجهة دايمًا
-- بـtenant_id حقيقي حسب الـpolicy الموجودة tenant_write_templates،
-- فمفيش تعارض).
-- ────────────────────────────────────────────────────────────

-- case_notes
DROP POLICY IF EXISTS "tenant_write_allowed_case_notes_insert" ON public.case_notes;
CREATE POLICY "tenant_write_allowed_case_notes_insert"
  ON public.case_notes AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_notes_update" ON public.case_notes;
CREATE POLICY "tenant_write_allowed_case_notes_update"
  ON public.case_notes AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_notes_delete" ON public.case_notes;
CREATE POLICY "tenant_write_allowed_case_notes_delete"
  ON public.case_notes AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- case_documents
DROP POLICY IF EXISTS "tenant_write_allowed_case_documents_insert" ON public.case_documents;
CREATE POLICY "tenant_write_allowed_case_documents_insert"
  ON public.case_documents AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_documents_update" ON public.case_documents;
CREATE POLICY "tenant_write_allowed_case_documents_update"
  ON public.case_documents AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_documents_delete" ON public.case_documents;
CREATE POLICY "tenant_write_allowed_case_documents_delete"
  ON public.case_documents AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- case_events
DROP POLICY IF EXISTS "tenant_write_allowed_case_events_insert" ON public.case_events;
CREATE POLICY "tenant_write_allowed_case_events_insert"
  ON public.case_events AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_events_update" ON public.case_events;
CREATE POLICY "tenant_write_allowed_case_events_update"
  ON public.case_events AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_case_events_delete" ON public.case_events;
CREATE POLICY "tenant_write_allowed_case_events_delete"
  ON public.case_events AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- reminders
DROP POLICY IF EXISTS "tenant_write_allowed_reminders_insert" ON public.reminders;
CREATE POLICY "tenant_write_allowed_reminders_insert"
  ON public.reminders AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_reminders_update" ON public.reminders;
CREATE POLICY "tenant_write_allowed_reminders_update"
  ON public.reminders AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_reminders_delete" ON public.reminders;
CREATE POLICY "tenant_write_allowed_reminders_delete"
  ON public.reminders AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- whatsapp_logs
DROP POLICY IF EXISTS "tenant_write_allowed_whatsapp_logs_insert" ON public.whatsapp_logs;
CREATE POLICY "tenant_write_allowed_whatsapp_logs_insert"
  ON public.whatsapp_logs AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_whatsapp_logs_update" ON public.whatsapp_logs;
CREATE POLICY "tenant_write_allowed_whatsapp_logs_update"
  ON public.whatsapp_logs AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_whatsapp_logs_delete" ON public.whatsapp_logs;
CREATE POLICY "tenant_write_allowed_whatsapp_logs_delete"
  ON public.whatsapp_logs AS RESTRICTIVE FOR DELETE
  USING (public.tenant_write_allowed(tenant_id));

-- office_settings (لا يوجد DELETE policy موجودة أصلاً — الجدول صف واحد لكل مكتب، مش بيتمسح)
DROP POLICY IF EXISTS "tenant_write_allowed_office_settings_insert" ON public.office_settings;
CREATE POLICY "tenant_write_allowed_office_settings_insert"
  ON public.office_settings AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_office_settings_update" ON public.office_settings;
CREATE POLICY "tenant_write_allowed_office_settings_update"
  ON public.office_settings AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

-- invoices (INSERT بس — سجل ثابت، مفيش UPDATE/DELETE policy موجودة أصلاً)
DROP POLICY IF EXISTS "tenant_write_allowed_invoices_insert" ON public.invoices;
CREATE POLICY "tenant_write_allowed_invoices_insert"
  ON public.invoices AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

-- generated_documents (INSERT+UPDATE بس — مفيش DELETE policy موجودة)
DROP POLICY IF EXISTS "tenant_write_allowed_generated_documents_insert" ON public.generated_documents;
CREATE POLICY "tenant_write_allowed_generated_documents_insert"
  ON public.generated_documents AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_generated_documents_update" ON public.generated_documents;
CREATE POLICY "tenant_write_allowed_generated_documents_update"
  ON public.generated_documents AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

-- document_templates (INSERT+UPDATE بس — مفيش DELETE policy موجودة)
DROP POLICY IF EXISTS "tenant_write_allowed_document_templates_insert" ON public.document_templates;
CREATE POLICY "tenant_write_allowed_document_templates_insert"
  ON public.document_templates AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));
DROP POLICY IF EXISTS "tenant_write_allowed_document_templates_update" ON public.document_templates;
CREATE POLICY "tenant_write_allowed_document_templates_update"
  ON public.document_templates AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

-- ────────────────────────────────────────────────────────────
-- القسم ب: جداول من غير عمود tenant_id مباشر — لازم نوصل للمكتب
-- عن طريق JOIN، بنفس منطق الـPERMISSIVE policies الموجودة فعليًا
-- على نفس الجداول دي (اتأكدت من الكود الحقيقي، مش تخمين):
--   • client_portal_pins / client_messages → عن طريق clients.tenant_id
--   • template_versions → عن طريق document_templates.tenant_id
--   • template_fields → عن طريق template_versions → document_templates
--   • case_document_links → عن طريق cases.tenant_id (زي policy
--     tenant_write_case_links الموجودة بالظبط)
-- ────────────────────────────────────────────────────────────

-- client_portal_pins (عمود client_id، مفيش tenant_id مباشر)
DROP POLICY IF EXISTS "tenant_write_allowed_client_portal_pins_insert" ON public.client_portal_pins;
CREATE POLICY "tenant_write_allowed_client_portal_pins_insert"
  ON public.client_portal_pins AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );
DROP POLICY IF EXISTS "tenant_write_allowed_client_portal_pins_update" ON public.client_portal_pins;
CREATE POLICY "tenant_write_allowed_client_portal_pins_update"
  ON public.client_portal_pins AS RESTRICTIVE FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );
DROP POLICY IF EXISTS "tenant_write_allowed_client_portal_pins_delete" ON public.client_portal_pins;
CREATE POLICY "tenant_write_allowed_client_portal_pins_delete"
  ON public.client_portal_pins AS RESTRICTIVE FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );

-- client_messages (عمود client_id بس، مفيش tenant_id مباشر — اتأكد من database.types.ts)
DROP POLICY IF EXISTS "tenant_write_allowed_client_messages_insert" ON public.client_messages;
CREATE POLICY "tenant_write_allowed_client_messages_insert"
  ON public.client_messages AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );
DROP POLICY IF EXISTS "tenant_write_allowed_client_messages_update" ON public.client_messages;
CREATE POLICY "tenant_write_allowed_client_messages_update"
  ON public.client_messages AS RESTRICTIVE FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );
DROP POLICY IF EXISTS "tenant_write_allowed_client_messages_delete" ON public.client_messages;
CREATE POLICY "tenant_write_allowed_client_messages_delete"
  ON public.client_messages AS RESTRICTIVE FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE public.tenant_write_allowed(tenant_id)
    )
  );

-- template_versions (INSERT+UPDATE بس، زي الـPERMISSIVE الموجودة)
DROP POLICY IF EXISTS "tenant_write_allowed_template_versions_insert" ON public.template_versions;
CREATE POLICY "tenant_write_allowed_template_versions_insert"
  ON public.template_versions AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    template_id IN (
      SELECT id FROM public.document_templates WHERE public.tenant_write_allowed(tenant_id)
    )
  );
DROP POLICY IF EXISTS "tenant_write_allowed_template_versions_update" ON public.template_versions;
CREATE POLICY "tenant_write_allowed_template_versions_update"
  ON public.template_versions AS RESTRICTIVE FOR UPDATE
  USING (
    template_id IN (
      SELECT id FROM public.document_templates WHERE public.tenant_write_allowed(tenant_id)
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM public.document_templates WHERE public.tenant_write_allowed(tenant_id)
    )
  );

-- template_fields (INSERT بس، زي الـPERMISSIVE الموجودة — مفيش UPDATE/DELETE policy أصلاً)
DROP POLICY IF EXISTS "tenant_write_allowed_template_fields_insert" ON public.template_fields;
CREATE POLICY "tenant_write_allowed_template_fields_insert"
  ON public.template_fields AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    template_version_id IN (
      SELECT tv.id FROM public.template_versions tv
      JOIN public.document_templates dt ON dt.id = tv.template_id
      WHERE public.tenant_write_allowed(dt.tenant_id)
    )
  );

-- case_document_links (INSERT بس، زي الـPERMISSIVE الموجودة tenant_write_case_links بالظبط)
DROP POLICY IF EXISTS "tenant_write_allowed_case_document_links_insert" ON public.case_document_links;
CREATE POLICY "tenant_write_allowed_case_document_links_insert"
  ON public.case_document_links AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    case_id IN (
      SELECT id FROM public.cases WHERE public.tenant_write_allowed(tenant_id)
    )
  );

-- ============================================================
-- ⚠️ activity_log — اتسحب من الدفعة دي عمدًا، بند مفتوح محتاج قرارك:
--
-- activity_log عنده tenant_id (nullable)، لكن الـPERMISSIVE INSERT
-- policy الوحيدة الموجودة عليه ("authenticated_can_insert_activity")
-- بسيطة جدًا: أي مستخدم مسجّل دخول (auth.uid() IS NOT NULL) يقدر
-- يكتب سطر نشاط، من غير أي ربط بحالة الاشتراك خالص. سجل النشاط ده
-- audit trail — مش بيانات تشغيلية زي القضايا/العملاء.
--
-- لو ضفنا RESTRICTIVE tenant_write_allowed(tenant_id) عليه زي باقي
-- الجداول، النتيجة: مكتب read-only (فترة سماح/تجربة مشاهدة) مش هيقدر
-- يسجّل أي نشاط خالص طول فترة القفل — يعني لو حصل محاولة كتابة
-- اتمنعت (مثلاً حد حاول يضيف قضية وترفض)، سجل النشاط نفسه (لو الكود
-- بيحاول يسجله) هيترفض هو كمان صامتًا (logActivity() مصممة تبتلع
-- الأخطاء).
--
-- قرارين ممكنين:
--   1) نطبّق نفس القفل عليه زي باقي الجداول (يعني حتى سجل النشاط
--      يتقف وقت القفل) — أبسط وأكثر اتساقًا مع باقي النظام.
--   2) نسيبه من غير قفل خالص (زي ما هو دلوقتي) — عشان أي محاولة نشاط
--      وقت القفل (حتى لو اتمنعت هي نفسها) تفضل مسجّلة كدليل/أرشيف.
--
-- محتاج قرارك على أي الاتنين قبل ما أضيف الـpolicy بتاعته.
-- ============================================================

-- ============================================================
-- ✅ بعد تشغيل الملف ده (باستثناء activity_log المفتوح): C3 يبقى
-- مكتمل لكل الجداول التشغيلية في الخطة الأصلية. لازم C6 (Regression)
-- كامل بعد كده على كل الجداول التلاتة عشر دي مع دفعة 1 و2 قبل النشر
-- النهائي، ثم الانتقال لـD1-D5 (بوابة الإدارة) وE1-E4 (تطبيق سند).
-- ============================================================
