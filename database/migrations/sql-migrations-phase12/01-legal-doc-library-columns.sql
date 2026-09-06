-- ══════════════════════════════════════════════════════════════════
-- Phase 12 / 01 — مكتبة المستندات القانونية: أعمدة الملف الأصلي
-- المرجع: Sanad_Legal_Documents_Library_Transition_Plan.md (القسم 3.1، المرحلة 1.1)
--
-- قرار تسلسل مهم (اكتشاف أثناء التنفيذ، مش موجود في نص الخطة الأصلي
-- بالحرف): الخطة وصفت 1.1 كـ"تعديل template_versions (حذف body_template/
-- box_template + إضافة master_file_path/master_file_name)". نفّذناها هنا
-- كـ**إضافة بس** (additive-only) — الأعمدة القديمة (body_template/
-- box_template) بتفضل زي ما هي من غير حذف. السبب: الشاشات الحالية
-- (SourceModeSelector→DynamicFieldsForm→DocumentPreviewEditor) والكود
-- القديم (generateDocument/fillPlaceholders) لسه شغالين وبيعتمدوا على
-- الأعمدة دي لحد ما المرحلتين 3/4 (الواجهة الجديدة) يخلصوا فعليًا —
-- حذفهم دلوقتي هيكسر الفيتشر الحالي فورًا من غير بديل جاهز. الحذف
-- الفعلي اتنقل لمرحلة 6 (تنظيف الكود القديم)، بعد ما المسار الجديد
-- بالكامل يشتغل ويتأكد. راجع تحديث الخطة (القسم 7، مرحلة 6.1 الجديدة).
--
-- master_file_path/master_file_name نفسهم nullable هنا لنفس السبب:
-- القوالب الأربعة الحالية لسه معندهاش ملفات Word حقيقية (ده شغل
-- المرحلة 5)، فمينفعش نفرض NOT NULL على عمود مفيش له قيمة لأي صف
-- موجود دلوقتي.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE template_versions
  ADD COLUMN master_file_path text,   -- مسار ملف الـ Word الأصلي في باكت legal-doc-templates
  ADD COLUMN master_file_name text;   -- اسم الملف الأصلي للعرض/التحميل (مثلاً "إنذار على يد محضر.docx")

COMMENT ON COLUMN template_versions.master_file_path IS
  'مسار الملف الأصلي في Storage (باكت legal-doc-templates) — NULL لحد ما المرحلة 5 (ترحيل المحتوى) تضيفه. لما يتحدد لقالب معين، بيبقى هو مصدر الحقيقة بدل body_template.';
COMMENT ON COLUMN template_versions.body_template IS
  'DEPRECATED — هيتشال في مرحلة 6 (تنظيف الكود القديم) بعد ما مسار master_file_path يبقى شغال بالكامل. مايتضافش له استخدام جديد.';
COMMENT ON COLUMN template_versions.box_template IS
  'DEPRECATED — نفس ملحوظة body_template، هيتشال في نفس المرحلة.';
