-- ══════════════════════════════════════════════════════════════
--  Migration: منع تصعيد الصلاحيات الذاتي عبر profiles UPDATE
--  (تسجيل توثيقي — التريجر ده اتنفذ بالفعل على قاعدة الإنتاج
--  بتاريخ 16 أغسطس 2026 أثناء مراجعة أمان صلاحيات أعضاء المكتب.
--  الملف ده idempotent وآمن يتنفذ تاني حتى لو موجود بالفعل.)
--
--  المشكلة: سياسة profiles_update كانت بتسمح لأي مستخدم يعدّل صف
--  نفسه (user_id = auth.uid()) من غير أي قيد على الأعمدة، لأن RLS
--  في Postgres بيشتغل على مستوى الصف مش العمود. عمليًا أي مستخدم
--  عادي كان يقدر يغيّر role/is_super_admin/tenant_id بتاعه بنفسه
--  عن طريق نداء مباشر لـ Supabase (بدون المرور بالواجهة أصلًا)
--  ويسيطر على حسابه (أو المنصة كلها لو غيّر is_super_admin).
--
--  الحل: BEFORE UPDATE trigger بيمنع تغيير الأعمدة الحساسة إلا لو
--  المُعدِّل أدمن حقيقي بيعدّل حساب غيره في نفس المكتب، أو سوبر أدمن.
--  تعديل الحساب الشخصي (الاسم مثلًا) لسه مسموح عادي.
-- ══════════════════════════════════════════════════════════════

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists trg_prevent_self_privilege_escalation on public.profiles;
create trigger trg_prevent_self_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_self_privilege_escalation();

-- ── خطوة تأكيد ──
--   select tgname, tgrelid::regclass, tgenabled
--   from pg_trigger
--   where tgname = 'trg_prevent_self_privilege_escalation';
-- المتوقع: صف واحد، tgenabled = 'O' (مفعّل).
