-- ─────────────────────────────────────────────────────────────────────────
-- تنظيف يدوي لمرة واحدة: بقايا بيانات من قبل تصحيح الماركر في
-- desktop-walkthrough.spec.ts و permissions-matrix.spec.ts.
--
-- السبب: global-teardown.ts بيمسح بناءً على MARKER = '%اختبار E2E%' بس.
-- الملفين دول كانوا بيستخدموا عناوين من غيره:
--   - desktop-walkthrough.spec.ts:  "جولة فيديو — قضية/جلسة/تذكير ..."
--   - permissions-matrix.spec.ts:   "قضية اختبار صلاحيات - ..." (القضية بس؛
--     أسماء المستخدمين فيها فعلاً "اختبار E2E" ومتنضفة بـdeleteTestUser)
--
-- السكريبت ده بيتبع بالظبط نفس ترتيب المسح (children الأول) الموجود في
-- global-teardown.ts، لكن بيستهدف الأنماط القديمة دي تحديدًا. آمن للتشغيل
-- أكتر من مرة (لو مفيش صفوف مطابقة، كل حذف بيرجع 0).
--
-- ⚠️ شغّله بمفتاح service role (أو من SQL Editor في Supabase Studio اللي
-- بيتخطى RLS تلقائيًا) عشان يقدر يمسح صفوف تينانتات مختلفة.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- الأنماط المستهدفة (نفس فكرة MARKER بس بالتحديد لهذين الملفين)
-- PATTERN_WALKTHROUGH يغطي القضية + الجلسة المستقلة + التذكير الثلاثتهم
-- لأن الثلاثة بادئين بنفس "جولة فيديو —".
-- PATTERN_PERMISSIONS يغطي عنوان القضية بس من permissions-matrix.spec.ts.

CREATE TEMP TABLE _target_cases AS
SELECT id FROM cases
WHERE title ILIKE '%جولة فيديو%'
   OR title ILIKE '%قضية اختبار صلاحيات%';

CREATE TEMP TABLE _target_standalone_sessions AS
SELECT id FROM case_sessions
WHERE case_id IS NULL
  AND title ILIKE '%جولة فيديو%';

CREATE TEMP TABLE _target_case_sessions AS
SELECT cs.id FROM case_sessions cs
WHERE cs.case_id IN (SELECT id FROM _target_cases);

CREATE TEMP TABLE _target_all_sessions AS
SELECT id FROM _target_standalone_sessions
UNION
SELECT id FROM _target_case_sessions;

CREATE TEMP TABLE _target_fees AS
SELECT id FROM case_fees
WHERE case_id IN (SELECT id FROM _target_cases);

CREATE TEMP TABLE _target_payments AS
SELECT id FROM fee_payments
WHERE fee_id IN (SELECT id FROM _target_fees);

-- (اختياري) لو فيه مستندات مرتبطة بالقضايا دي، لازم مستندات الـstorage
-- تتمسح يدويًا بعد كده من bucket 'case-docs' — السكريبت ده بيمسح صفوف
-- الجدول بس، مش الملفات الفعلية. شوف الاستعلام في آخر الملف ده لجيب
-- storage_path قبل الحذف لو محتاجه.

-- ترتيب الحذف: الأبناء الأول (نفس منطق global-teardown.ts بالظبط)
DELETE FROM invoices WHERE fee_payment_id IN (SELECT id FROM _target_payments);
DELETE FROM invoices WHERE case_id IN (SELECT id FROM _target_cases);
DELETE FROM fee_payments WHERE id IN (SELECT id FROM _target_payments);
DELETE FROM case_fees WHERE id IN (SELECT id FROM _target_fees);
DELETE FROM case_documents WHERE case_id IN (SELECT id FROM _target_cases);
DELETE FROM case_notes WHERE case_id IN (SELECT id FROM _target_cases);
DELETE FROM case_events WHERE case_id IN (SELECT id FROM _target_cases);
DELETE FROM case_parties WHERE case_id IN (SELECT id FROM _target_cases);
DELETE FROM case_parties WHERE session_id IN (SELECT id FROM _target_all_sessions);
DELETE FROM case_sessions WHERE id IN (SELECT id FROM _target_all_sessions);
DELETE FROM cases WHERE id IN (SELECT id FROM _target_cases);

-- activity_log: بنفس الأنماط على case_name/client_name
DELETE FROM activity_log
WHERE case_name ILIKE '%جولة فيديو%'
   OR case_name ILIKE '%قضية اختبار صلاحيات%'
   OR client_name ILIKE '%جولة فيديو%'
   OR client_name ILIKE '%قضية اختبار صلاحيات%';

-- reminders: "جولة فيديو — تذكير ..." من createReminder في desktop-walkthrough
DELETE FROM reminders
WHERE title ILIKE '%جولة فيديو%';

-- ملحوظة: مفيش صفوف clients جديدة محتاجة هنا — الأطراف
-- ("موكل جلسة مستقلة E2E" / "موكل اختبار E2E") بتتسجل في case_parties
-- بس (اتمسحوا فوق)، ومفيش عميل حقيقي بيتربط بيهم في المسارين دول.
-- لو ظهر عميل تجريبي فعلاً برقم الهاتف الوهمي 01000000000 ومحدش مسحه،
-- ده أصلاً متغطي بشرط clients الموجود في global-teardown.ts نفسه.

DROP TABLE _target_cases;
DROP TABLE _target_standalone_sessions;
DROP TABLE _target_case_sessions;
DROP TABLE _target_all_sessions;
DROP TABLE _target_fees;
DROP TABLE _target_payments;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- لو حابب تتأكد الأول قبل التنفيذ الفعلي (dry run)، شيل COMMIT فوق وحط
-- ROLLBACK بدالها مؤقتًا، أو شغّل الاستعلام ده لوحده الأول لتعرف حجم
-- البقايا قبل ما تمسح حاجة:
--
-- SELECT 'cases' AS tbl, count(*) FROM cases
--   WHERE title ILIKE '%جولة فيديو%' OR title ILIKE '%قضية اختبار صلاحيات%'
-- UNION ALL
-- SELECT 'standalone_sessions', count(*) FROM case_sessions
--   WHERE case_id IS NULL AND title ILIKE '%جولة فيديو%'
-- UNION ALL
-- SELECT 'reminders', count(*) FROM reminders
--   WHERE title ILIKE '%جولة فيديو%';
-- ─────────────────────────────────────────────────────────────────────────
