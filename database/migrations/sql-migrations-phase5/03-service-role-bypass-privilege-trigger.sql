-- ══════════════════════════════════════════════════════════════
--  Migration: السماح لـ service_role بتجاوز trigger منع تصعيد
--  الصلاحيات الذاتي (البند 4 من تقرير مراجعة الصلاحيات — نقل
--  handleEditUser/toggleUserActive لتمر عبر admin-actions)
--
--  المشكلة: trigger منع تصعيد الصلاحيات الذاتي (migration 02) بيعتمد
--  على auth.uid()/get_my_role()/is_super_admin() اللي بتُقرأ من الـ
--  JWT الخاص بالطلب. لما admin-actions ينفّذ UPDATE على profiles
--  باستخدام SERVICE_ROLE_KEY (بدل جلسة المستخدم)، auth.uid() بترجع
--  null ومفيش صف profiles مرتبط بيها — يعني الشرطين اللي بيسمحوا
--  بالتعديل (سوبر أدمن / أدمن بيعدّل حساب غيره) هيفشلوا الاتنين،
--  والـ trigger هيرفض أي تعديل لعمود حساس حتى لو الطلب شرعي ومتحقق
--  منه بالكامل جوه admin-actions (authorizeOnTarget).
--
--  الحل: نسمح لـ service_role يعدي من الـ trigger، لأن admin-actions
--  نفسه بيعمل التحقق البديل (وأقوى فعليًا): بيتأكد من هوية المستدعي
--  الحقيقية عن طريق التوكن بتاعه (getCaller)، بيتحقق إنه admin/super_admin
--  فعّال (is_active)، وبيقارن tenant_id المستهدف بتاع الأدمن (authorizeOnTarget).
--  زيادة على كده، admin-actions دلوقتي (action: update_profile) بيمنع
--  صراحةً أي محاولة لتعديل role/is_active/permissions على حساب
--  المستخدم نفسه — يعني حماية منع-التصعيد-الذاتي اتنقلت بالكامل
--  لطبقة التطبيق بدل التريجر، لكن السطر الأهم: service_role تقدر
--  توصله بس عن طريق SERVICE_ROLE_KEY السري المحفوظ في متغيرات بيئة
--  الـ Edge Function، مش متاح للفرونت إند أو أي نداء مباشر من المتصفح.
--
--  ملحوظة أمان: البند ده بيوسّع الثقة في service_role، فمهم إن أي
--  إضافة مستقبلية لعمليات UPDATE على profiles عبر service_role تمر
--  حصريًا من admin-actions (أو أي Edge Function تانية بنفس نمط
--  authorizeOnTarget) — مش من أي مكان تاني بيستخدم service_role.
-- ══════════════════════════════════════════════════════════════

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 🆕 service_role (نداءات admin-actions فقط): الأذونات اتفحصت
  -- بالفعل جوه الـ Edge Function باستخدام هوية المستدعي الحقيقية
  -- قبل ما توصل هنا. auth.role() بتقرا claim الـ role من الـ JWT
  -- المستخدم فعليًا في الطلب (service_role key نفسه JWT بـ role
  -- claim = 'service_role')، مش auth.uid() اللي بترجع null هنا.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- سوبر أدمن: مفيش قيد
  if public.is_super_admin() then
    return new;
  end if;

  -- أدمن حقيقي بيعدّل حساب غيره في نفس المكتب: مفيش قيد
  if public.get_my_role() = 'admin'
     and old.tenant_id = public.current_tenant_id()
     and old.user_id is distinct from auth.uid() then
    return new;
  end if;

  -- أي حالة تانية (الأغلب: مستخدم بيعدّل صف نفسه): امنع تغيير
  -- الأعمدة الحساسة، اسمح بس بالأعمدة الآمنة (الاسم مثلًا)
  if new.role            is distinct from old.role
     or new.is_super_admin is distinct from old.is_super_admin
     or new.tenant_id      is distinct from old.tenant_id
     or new.is_active      is distinct from old.is_active
     or new.permissions    is distinct from old.permissions then
    raise exception 'غير مسموح بتعديل هذا الحقل على حسابك الشخصي';
  end if;

  return new;
end;
$$;

-- الـ trigger نفسه متعرّفش تاني — بس الدالة اتعدّلت (create or replace)
-- والـ trigger أصلاً بيستدعيها بالاسم، فمفيش داعي لإعادة drop/create.

-- ── خطوة تأكيد ──
--   select prosrc from pg_proc where proname = 'prevent_self_privilege_escalation';
-- المتوقع: يظهر فيها شرط auth.role() = 'service_role' في الأول.
