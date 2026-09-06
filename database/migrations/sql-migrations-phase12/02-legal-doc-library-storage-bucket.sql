-- ══════════════════════════════════════════════════════════════════
-- Phase 12 / 02 — مكتبة المستندات القانونية: صلاحيات باكت legal-doc-templates
-- المرجع: Sanad_Legal_Documents_Library_Transition_Plan.md (القسم 3.2، المرحلة 1.2)
--
-- ⚠️ خطوة يدوية مطلوبة منك قبل تشغيل هذا الملف (زي نفس نمط باقي
-- الباكتس في المشروع — case-docs/client-docs، مفيش migration بينشئهم
-- عبر SQL خالص): افتح Supabase Dashboard → Storage → أنشئ باكت جديد
-- اسمه بالظبط "legal-doc-templates"، واختار Private (مش Public).
--
-- بعد إنشاء الباكت، شغّل السطور تحت.
--
-- ليه SELECT بس (بدون INSERT/UPDATE/DELETE للمستخدمين)؟
-- مفيش شاشة إدارة قوالب في الخطة الحالية (نفس القرار الموثّق في
-- templatesApi.ts الأصلي) — رفع ملفات القوالب بيتم يدويًا منك عبر
-- Dashboard (service role)، مش من أي مستخدم تطبيق. المستخدمين محتاجين
-- بس يقدروا يولّدوا رابط موقّع للقراءة (getSignedUrl) عشان التحميل/
-- التعبئة، فده كل الصلاحية المطلوبة لأي tenant.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "allow_authenticated_select_legal_doc_templates" ON storage.objects;

CREATE POLICY "allow_authenticated_select_legal_doc_templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'legal-doc-templates');

-- ══════════════════════════════════════════════════════════════════
-- ملاحظات بعد التنفيذ
-- ══════════════════════════════════════════════════════════════════
--
-- 1. تأكد إن الباكت private فعليًا (مش Public) من Dashboard قبل رفع
--    أي ملف حقيقي عليه.
-- 2. رفع ملفات القوالب نفسها (مرحلة 5، لسه ملهاش migration هنا) هيتم
--    يدويًا عبر Dashboard → Storage → legal-doc-templates → مسار
--    system/{template_id}/{version}.docx.
