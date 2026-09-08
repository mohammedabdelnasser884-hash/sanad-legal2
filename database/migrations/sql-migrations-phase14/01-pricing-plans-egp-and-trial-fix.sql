-- ============================================================
-- 14-01 - إعادة ضبط الباقات (جنيه مصري) + إغلاق ثغرة "التجربة اللي
-- متنتهيش" في current_tenant_id()
-- ============================================================
-- الخلفية: البوابة كانت شغالة بـ 4 باقات بالدولار (free/individual/
-- small_firm/enterprise)، بباقة مجانية دايمة منفصلة عن حالة "تجريبي".
-- الاتفاق الجديد: 3 باقات مدفوعة بالجنيه بس (lawyer/office/enterprise)
-- + تجربة مجانية شهر واحد (status='trial') بدون باقة مجانية دايمة.
--
-- الملف ده بيعمل 3 حاجات:
--   1) يعيد تسمية أي قيمة subscription_plan قديمة للتسمية الجديدة.
--   2) يعبّي trial_ends_at لأي مكتب status='trial' وعنده trial_ends_at
--      فاضي (كانت التجربة بتفضل شغالة للأبد في الحالة دي).
--   3) يعدّل current_tenant_id() عشان مكتب تجريبي بتاريخ انتهاء فاضي
--      يتقفل (زي التجربة المنتهية بالظبط) بدل ما يتعامل كأنه نشط للأبد
--      — آمن دلوقتي بعد خطوة (2) فوق، لأن مفيش تجربة المفروض تفضل
--      من غير تاريخ بعد الميجريشن ده.
-- ============================================================

-- ── 1) إعادة تسمية قيم الباقات القديمة ──
-- 'free' معندهاش مقابل مدفوع مباشر — بنحطها 'lawyer' (أرخص باقة) كنقطة
-- بداية منطقية، وبنحوّل حالتها لـ'trial' لو مكانتش أصلاً موقوفة، عشان
-- ميبقاش فيه مكتب باقته مدفوعة (lawyer) بس من غير ما يكون دافع فعلاً.
update public.tenants
   set status = 'trial'
 where subscription_plan = 'free'
   and status is distinct from 'suspended'
   and status is distinct from 'trial';

update public.tenants set subscription_plan = 'lawyer' where subscription_plan in ('free', 'individual');
update public.tenants set subscription_plan = 'office'  where subscription_plan = 'small_firm';
-- 'enterprise' بياخد نفس الاسم زي ما هو — مفيش تغيير مطلوب له.

-- ── 2) تعبئة trial_ends_at الفاضي لأي مكتب لسه تجريبي ──
-- بنديله شهر من تاريخ إنشاء المكتب (created_at) لو موجود، وإلا شهر من
-- النهارده — أرحم اختيار ممكن (مش رجعي بالكامل) عشان منقفلش مكتب فجأة
-- بأثر رجعي من غير إنذار.
update public.tenants
   set trial_ends_at = coalesce(created_at, now()) + interval '30 days'
 where status = 'trial'
   and trial_ends_at is null;

-- ── 3) إغلاق ثغرة current_tenant_id(): تجربة بتاريخ فاضي = منتهية ──
-- الفرق الوحيد عن النسخة القديمة (phase2/07): شيلنا شرط
-- "t.trial_ends_at is null" اللي كان بيدي وصول دايم لأي تجربة من غير
-- تاريخ. دلوقتي أي مكتب status='trial' لازم يكون عنده trial_ends_at
-- صريح ومش فات، وإلا بيتقفل زي المكتب الموقوف بالظبط.
create or replace function public.current_tenant_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.user_id = auth.uid()
    -- مكتب من غير status محدد (لسه مبعتش/default) → نعتبره شغال،
    -- عشان منقفلش مكاتب جديدة بالغلط لسه ما اتصنفتش
    and (t.status is null or t.status <> 'suspended')
    -- تجربة لازم يكون ليها تاريخ انتهاء صريح ومش فات — تجربة بتاريخ
    -- فاضي بقت زي التجربة المنتهية بالظبط (مقفولة)، مش زي النشطة.
    and (t.status is distinct from 'trial' or t.trial_ends_at >= now())
$function$;

-- ── للتراجع (لو احتجت ترجع للسلوك القديم بسرعة) ──
-- create or replace function public.current_tenant_id()
--  returns uuid language sql stable security definer set search_path to 'public'
-- as $function$
--   select p.tenant_id from public.profiles p join public.tenants t on t.id = p.tenant_id
--   where p.user_id = auth.uid()
--     and (t.status is null or t.status <> 'suspended')
--     and (t.status is distinct from 'trial' or t.trial_ends_at is null or t.trial_ends_at >= now())
-- $function$;
