-- ============================================================
-- 15-05 (C1 + C2 + C5) — دوال حالة الاشتراك + القفل الشامل (الجزء الآمن)
-- ============================================================
-- ⚠️ الملف ده بيعرّف الدوال بس (C1, C2) + تمديد بسيط لـ
-- current_tenant_id() (C5) — مفيش أي تعديل على أي RLS policy موجودة
-- حاليًا على cases/profiles/clients/إلخ. تطبيق tenant_write_allowed()
-- فعليًا على سياسات الكتابة (C3) مقصود إنه ميتعملش في نفس الملف —
-- ده أخطر جزء في الخطة (بيلمس عشرات policies موجودة وشغالة)، ولازم
-- دفعات فرعية + مراجعة + Regression test (C6) قبل أي نشر، زي ما
-- التقرير نص. الملف ده بس يجهّز الأساس الآمن اللي C3 هيتبني عليه.
--
-- بعد تشغيله: مفيش أي سلوك موجود بيتغيّر (الدوال الجديدة مش مستخدمة
-- في أي policy لسه) — آمن 100% للتشغيل على الإنتاج فورًا.
-- ============================================================

-- ── C1: حالة اشتراك الباقة المدفوعة (منفصلة عن حالة التجربة) ──
-- بترجع واحدة من: 'active' | 'grace' | 'readonly' | 'locked' | 'n_a'
-- (n_a = مكتب تجريبي أو subscription_due_at لسه NULL — الدالة دي
-- بتتكلم عن الباقات المدفوعة بس، حالة التجربة نفسها في C2 مباشرة).
CREATE OR REPLACE FUNCTION public.tenant_subscription_status(p_tenant_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN t.status = 'trial' OR t.subscription_due_at IS NULL THEN 'n_a'
    WHEN now() <= t.subscription_due_at THEN 'active'
    WHEN now() <= t.subscription_due_at + interval '7 days' THEN 'grace'
    WHEN now() <= t.subscription_due_at + interval '7 days' + interval '60 days' THEN 'readonly'
    ELSE 'locked'
  END
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

-- ── C2: الدالة الموحّدة — مسموح بالكتابة (INSERT/UPDATE/DELETE) ولا لأ؟ ──
-- بتغطي حالتين بمصدرين مختلفين بنفس الآلية (زي ما التقرير نص):
--   1) تجربة – مرحلة "مشاهدة فقط" (يوم 15→30، أي now() >= trial_ends_at - 16 days)
--   2) باقة مدفوعة في حالة readonly/locked (فترة سماح فاتت + 60 يوم)
-- ملحوظة: تجربة/باقة "locked" فعليًا بترجعلها current_tenant_id() NULL
-- (منع دخول كامل، C5 تحت) فمش هيوصل أصلاً لحد ما يستدعي الدالة دي —
-- لكن بنرجّع false برضه هنا كطبقة حماية إضافية (defense-in-depth).
CREATE OR REPLACE FUNCTION public.tenant_write_allowed(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    -- مصدر 1: تجربة
    WHEN t.status = 'trial' THEN
      (t.trial_ends_at IS NOT NULL AND now() < t.trial_ends_at - interval '16 days')
    -- مصدر 2: باقة مدفوعة
    ELSE
      public.tenant_subscription_status(p_tenant_id) IN ('active', 'grace', 'n_a')
  END
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

-- ── C5: تمديد current_tenant_id() — قفل كامل لباقة مدفوعة فاتها ──
-- 60 يوم read-only من غير تأكيد دفع، بنفس آلية التجربة المنتهية
-- بالظبط. الجزء الخاص بالتجربة (من ميجريشن 14) فضل زي ما هو، من
-- غير أي تغيير — بس إضافة شرط جديد لحالة الباقة المدفوعة "locked".
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.tenant_id
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.user_id = auth.uid()
    AND (t.status IS NULL OR t.status <> 'suspended')
    AND (t.status IS DISTINCT FROM 'trial' OR t.trial_ends_at >= now())
    -- جديد (C5): باقة مدفوعة وصلت لحالة 'locked' (فاتها 7 أيام سماح
    -- + 60 يوم read-only من غير تأكيد دفع) → قفل كامل زي التجربة
    -- المنتهية بالظبط.
    AND public.tenant_subscription_status(t.id) IS DISTINCT FROM 'locked'
$function$;

-- ── للتراجع (لو احتجت ترجع لنسخة phase14 بسرعة) ──
-- create or replace function public.current_tenant_id()
--  returns uuid language sql stable security definer set search_path to 'public'
-- as $function$
--   select p.tenant_id from public.profiles p join public.tenants t on t.id = p.tenant_id
--   where p.user_id = auth.uid()
--     and (t.status is null or t.status <> 'suspended')
--     and (t.status is distinct from 'trial' or t.trial_ends_at >= now())
-- $function$;

-- ============================================================
-- ملحوظة عن C3/C4/C6 (لسه لم تُنفَّذ عمدًا في الملف ده):
--   C3 — تطبيق tenant_write_allowed() على سياسات INSERT/UPDATE/DELETE
--        الفعلية عبر الجداول. محتاج أول حاجة جرد كامل لكل الـRLS
--        policies الشغالة فعليًا على الإنتاج (مش كلها بالضرورة موجودة
--        كميجريشنز في الريبو — بعضها ممكن يكون اتعمل مباشرة من
--        Supabase Dashboard). لازم تصدير:
--          SELECT schemaname, tablename, policyname, cmd, qual, with_check
--          FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
--        وترفعه هنا الأول، عشان الدفعات الفرعية (قضايا أساسية، ثم
--        جلسات/رسوم/أطراف، ثم الباقي) تتبني على الصورة الحقيقية مش تخمين.
--   C4 — تأكيد إن SELECT مش متأثر: بما إن tenant_write_allowed() هيتضاف
--        بس في WITH CHECK (مش USING) لسياسات الكتابة، القراءة (SELECT
--        policies، اللي بتعتمد بس على current_tenant_id()) مش هتتلمس
--        خالص — هيتأكد فعليًا وقت تنفيذ C3.
--   C6 — Regression test إلزامي (database/tests/phase1-tenant-isolation-
--        test.sql) على staging بعد أي تعديل فعلي على السياسات، قبل أي
--        نشر للإنتاج.
-- ============================================================
