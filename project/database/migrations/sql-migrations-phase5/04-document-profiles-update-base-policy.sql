-- ══════════════════════════════════════════════════════════════
--  Migration (توثيقي فقط) — تسجيل سياسة profiles_update الأساسية
--  كملف SQL في الريبو (بند 4.4 من تقرير مراجعة الصلاحيات)
--
--  ⚠️ السياسة دي مش جديدة ومش بتتغيّر هنا — هي نفسها الموجودة على
--  الإنتاج بالفعل (اتقرأ نصها حرفيًا من تقرير المراجعة، قسم 2.1،
--  لأنها كانت السبب في ثغرة التصعيد الذاتي اللي اتقفلت بالتريجر في
--  migration 02/03). الملف ده بس بيسجّلها في الريبو عشان أي مراجعة
--  مستقبلية تلاقي نص السياسة الفعلي، بدل ما تكون موجودة بس في
--  لوحة Supabase.
--
--  idempotent: drop if exists + create بنفس المنطق، آمن يتنفذ تاني.
-- ══════════════════════════════════════════════════════════════

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (
    (user_id = auth.uid())
    or (tenant_id = current_tenant_id() and get_my_role() = 'admin')
    or is_super_admin()
  )
  with check (
    (user_id = auth.uid())
    or (tenant_id = current_tenant_id() and get_my_role() = 'admin')
    or is_super_admin()
  );

-- ── ملحوظة مهمة ──
-- السياسة دي وحدها بتسمح لأي مستخدم يعدّل صف نفسه بلا قيد على
-- الأعمدة (RLS بتشتغل على مستوى الصف مش العمود) — الحماية الفعلية
-- من التصعيد الذاتي جايّة من trigger منفصل (migration 02/03)، مش من
-- السياسة دي. متسيبش السياسة دي تتنفذ من غير التريجر.

-- ── خطوة تأكيد ──
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'profiles' and policyname = 'profiles_update';
