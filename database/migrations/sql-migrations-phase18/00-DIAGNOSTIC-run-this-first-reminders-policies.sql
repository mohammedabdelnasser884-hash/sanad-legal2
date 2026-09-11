-- ══════════════════════════════════════════════════════════════════
--  استعلام SELECT فقط (مش migration) — شغّله في Supabase SQL Editor
--  الأول وابعتلي النتيجة قبل ما نطبّق 04-rls-reminders-split.sql.
--
--  السبب: على عكس clients/cases/case_sessions (اللي سياستهم
--  الأساسية موثّقة فى sql-migrations-phase5/
--  05-document-remaining-rls-policies.sql)، جدول reminders معندوش
--  أي سياسة PERMISSIVE أساسية موثّقة فى أي ملف مايجريشن بالريبو —
--  الموجود بس هو RESTRICTIVE (tenant_write_allowed_reminders_*،
--  phase15/08) اللي بتضيف شرط "قفل الاشتراك" فوق سياسة تانية غير
--  موثّقة. لازم نعرف نصها الحقيقي (الاسم + qual) قبل ما نستبدلها،
--  وإلا أي تخمين هيكون خطر لو اتشغّل على الإنتاج.
--
--  04-rls-reminders-split.sql مكتوب بطريقة idempotent تسحب وتمسح
--  أي policy موجودة على الجدول ديناميكيًا (مش بالاسم)، فهيشتغل صح
--  حتى لو النتيجة مختلفة عن المتوقع — بس برضو محتاج أشوف النتيجة
--  قبل التشغيل للتأكد مفيش حاجة غريبة (مثلاً سياسة بتفلتر بـuser_id
--  مش موثّقة في الكود، أو RLS مش مفعّلة أصلاً على الجدول).
-- ══════════════════════════════════════════════════════════════════

SELECT
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual        AS using_expression,
  with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'reminders'
ORDER BY cmd, policyname;

-- كمان تأكد إن RLS نفسها مفعّلة على الجدول:
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'reminders' AND relnamespace = 'public'::regnamespace;
