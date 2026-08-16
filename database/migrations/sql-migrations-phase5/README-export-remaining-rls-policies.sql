-- ══════════════════════════════════════════════════════════════
--  ✅ تم التنفيذ (16 أغسطس 2026) — النتيجة موثّقة في
--  05-document-remaining-rls-policies.sql (case_documents,
--  case_sessions, cases, clients, profiles_delete, profiles_select).
--  ⚠️ النتيجة ماكانتش فيها أي سياسة على fees — محتاج تأكيد هل
--  الجدول ده فعلاً بدون RLS ولا النتيجة كانت مقصوصة.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
--  استعلام SELECT فقط (مش migration) — بند 4.4 المتبقي
--
--  اللي اتوثّق لحد دلوقتي في مجلد phase5: profiles_insert
--  (migration 11)، trigger منع التصعيد الذاتي (02/03)، profiles_update
--  (04 — نصها معروف من التقرير). الباقي (profiles_select,
--  profiles_delete، وكل سياسات cases/clients/fees/case_sessions...)
--  مش موثّق كملفات SQL في الريبو، وأنا معنديش وصول مباشر لقاعدة
--  الإنتاج عشان أسحب نصها الحقيقي — أي محاولة مني أكتبها من الذاكرة
--  هتكون تخمين، وده خطر (ممكن حد يشغّلها على الإنتاج لاحقًا معتقد
--  إنها التوثيق الرسمي وهي مش مطابقة).
--
--  شغّل الاستعلام ده في SQL Editor بتاع Supabase وابعتلي النتيجة،
--  وهكتب migration files دقيقة مطابقة للموجود فعليًا (بنفس أسلوب
--  04-document-profiles-update-base-policy.sql).
-- ══════════════════════════════════════════════════════════════

select
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'cases', 'clients', 'fees', 'case_sessions', 'case_documents')
order by tablename, cmd, policyname;
