-- ══════════════════════════════════════════════════════════════════
-- Phase 8 / 01 — إزالة تصنيف "توكيلات" من الإنتاج
-- المرجع: Sanad_Legal_Documents_Master_Report.md (قسم 23.2/23.3)
--
-- القرار: جيمي قرر إزالة "توكيلات" بالكامل من الإنتاج (مش بس من
-- التقرير) — الكود اتعدّل بالفعل (useDocumentTemplates.ts,
-- TemplateCard.tsx, CategoryPicker.tsx, caseTypeCategoryPriority.ts)
-- عشان يشيل التصنيف من الويزارد والترتيب الذكي.
--
-- ⚠️ الطريقة هنا: ARCHIVE مش DELETE. السبب (نقطة قرار 23.3 بند 3 من
-- التقرير، محسومة هنا فعليًا):
--   1. لو أي مكتب ولّد "توكيل عام" فعليًا قبل كده، الصف موجود كـ FK في
--      generated_documents.template_id (بدون ON DELETE CASCADE من
--      الجدول ده تحديدًا — راجع 01-document-generation-schema.sql) —
--      يعني DELETE فعلي ممكن يفشل بـ foreign key violation لو فيه أي
--      استخدام سابق، أو يحتاج CASCADE يمسح سجلات مستندات فعلية بلا داعي.
--   2. ARCHIVE (status='archived') كافي تمامًا: getActiveTemplates()
--      بيفلتر على status='active' بس (templatesApi.ts)، فالتصنيف
--      بيختفي من الويزارد فورًا من غير أي خطر على البيانات القديمة —
--      أي مستند "توكيل عام" اتولّد قبل كده يفضل زي ما هو تمامًا في
--      case_documents/generated_documents.
--   3. مفيش قرار إضافي مطلوب منك بخصوص "مسح المستندات القديمة ولا
--      لأ" — القرار ده أصلاً مش مطروح، لأن الـarchive مايمسحش حاجة خالص.
--
-- الأثر: قالب "توكيل عام" (category='توكيلات') بس. مفيش تغيير على أي
-- تصنيف تاني، ومفيش تغيير على schema (نفس chk_status الموجود أصلاً
-- بيسمح بـ'archived').
-- ══════════════════════════════════════════════════════════════════

UPDATE document_templates
SET status = 'archived',
    updated_at = now()
WHERE category = 'توكيلات'
  AND status = 'active';

-- تأكيد يدوي بعد التشغيل (شغّله وشوف النتيجة):
-- SELECT id, category, name_ar, status FROM document_templates WHERE category = 'توكيلات';
-- المتوقع: صف واحد ("توكيل عام")، status = 'archived'.
