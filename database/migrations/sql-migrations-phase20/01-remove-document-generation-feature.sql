-- ══════════════════════════════════════════════════════════════════
-- Phase 20 / 01 — إزالة كاملة لقسم "المستندات القانونية" (توليد
-- المستندات من قوالب) — قرار: مسح أي أثر ليه، كأنه ماتعملش من أصله.
--
-- بيلغي بالكامل:
--   - database/migrations/sql-migrations-phase7/01-document-generation-schema.sql
--   - database/migrations/sql-migrations-phase7/02-document-generation-seed.sql
--   - database/migrations/sql-migrations-phase7/03-can-generate-documents-permission.sql
--   - database/migrations/sql-migrations-phase12/01-legal-doc-library-columns.sql
--   - database/migrations/sql-migrations-phase12/02-legal-doc-library-storage-bucket.sql
--   - جزء "generated_documents"/"document_templates"/... من
--     phase15/07 و phase15/08 (RESTRICTIVE policies — بتتشال تلقائيًا
--     مع DROP TABLE، مفيش داعي لأي أمر إضافي ليهم).
--
-- ملحوظة مهمة عن has_permission(): فحصنا كل الملفات اللي بتعمل
-- CREATE OR REPLACE للدالة دي، ولقينا إن
-- sql-migrations-phase18/01-has-permission-new-keys-... (بعد
-- phase7/03 بمراحل) عمل CREATE OR REPLACE كامل للدالة من غير ما
-- يتضمن فرع 'can_generate_documents' أصلًا — يعني الفرع ده اتشال
-- فعليًا من الدالة الحية على القاعدة من وقت phase18، وحتى قبل
-- الـmigration دي. مفيش داعي لأي تعديل على has_permission() هنا.
--
-- الملف Idempotent قدر الإمكان (DROP ... IF EXISTS)، آمن يتشغل
-- أكتر من مرة.
-- ══════════════════════════════════════════════════════════════════

-- 1) إسقاط الجداول الخمسة — بترتيب الأوراق للجذر (leaf → root) عشان
-- نتجنب الاعتماد على CASCADE قدر الإمكان، لكن مضاف CASCADE على أي
-- حال كأمان إضافي (بيسقط بس أي policy/constraint معتمد عليها، مش أي
-- جدول تاني حقيقي — مفيش جدول برّاني بيعتمد على الخمسة دول غير
-- بعضهم البعض، اتأكدنا من ده بفحص كل migrations المشروع).

DROP TABLE IF EXISTS case_document_links CASCADE;
DROP TABLE IF EXISTS generated_documents CASCADE;
DROP TABLE IF EXISTS template_fields CASCADE;
DROP TABLE IF EXISTS template_versions CASCADE;
DROP TABLE IF EXISTS document_templates CASCADE;

-- 2) إسقاط سياسة الـStorage الخاصة بباكت legal-doc-templates (مش
-- مرتبطة بأي جدول من فوق، فمابتتشالش تلقائيًا مع DROP TABLE).

DROP POLICY IF EXISTS "allow_authenticated_select_legal_doc_templates" ON storage.objects;

-- ══════════════════════════════════════════════════════════════════
-- ⚠️ خطوة يدوية متبقية (لازم تتعمل من Supabase Dashboard، مفيش SQL
-- بينشئ/بيمسح باكتات في المشروع ده أصلًا — نفس نمط باقي الباكتات):
--
--   Dashboard → Storage → احذف الباكت "legal-doc-templates" بالكامل
--   (لو فيه ملفات جواه، امسحها الأول، بعدين احذف الباكت نفسه).
--
-- بعد الخطوة دي، مفيش أي أثر متبقي لقسم "المستندات القانونية" في
-- الكود ولا قاعدة البيانات ولا الـStorage.
-- ══════════════════════════════════════════════════════════════════

-- ── خطوة تأكيد بعد التنفيذ ──
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('document_templates','template_versions',
--     'template_fields','generated_documents','case_document_links');
--   -- المتوقع: صف واحد فاضي (0 نتائج)
