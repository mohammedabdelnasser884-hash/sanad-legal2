-- ============================================================
-- 29-01 — تطبيق tenant_write_allowed() على profiles (سد ثغرة الاستعادة)
-- ============================================================
-- نفس أسلوب دفعات 15-06/07/08 بالحرف: RESTRICTIVE policies إضافية
-- (مش تعديل الـpolicies الموجودة). صفر لمس لـ"profiles_update"
-- أو "profiles_insert_super_admin_only" الحاليين — الـRESTRICTIVE
-- الجديدة بتتجمّع بـAND فوقهم، من غير أي تغيير في منطقهم.
--
-- ⚠️ السبب: عملية استعادة الباك أب (performRestoreSteps فى
-- useAdminBackup.ts) بتعمل upsert على profiles، وهو الجدول الوحيد
-- من ضمن جداول الاستعادة اللي معندوش حماية tenant_write_allowed —
-- يعني مكتب فى وضع readonly/locked كان لسه يقدر يعدّي من خلاله.
--
-- INSERT + UPDATE بس (زي ما التقرير نص) — مفيش أي PERMISSIVE policy
-- لـDELETE على profiles أصلًا حاليًا، فمفيش داعي RESTRICTIVE ليها.
--
-- ⚠️ فرق جوهري عن باقي الجداول (موثّق فى التقرير): RLS مفيهاش مفهوم
-- "استثناء عملية استعادة معيّنة" — القفل هيتطبّق على أي تعديل لصف
-- profiles لمكتب readonly/locked، بما فيه heartbeat.ts (تحديث
-- last_seen لأي مستخدم). القرار المتفق عليه: مقبول، لأن heartbeat
-- أصلًا best-effort وفشله صامت (console.error بس، مفيش تأثير على
-- المستخدم أو أي وظيفة أساسية).
-- ============================================================

DROP POLICY IF EXISTS "tenant_write_allowed_profiles_insert" ON public.profiles;
CREATE POLICY "tenant_write_allowed_profiles_insert"
  ON public.profiles AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_write_allowed(tenant_id));

DROP POLICY IF EXISTS "tenant_write_allowed_profiles_update" ON public.profiles;
CREATE POLICY "tenant_write_allowed_profiles_update"
  ON public.profiles AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_write_allowed(tenant_id))
  WITH CHECK (public.tenant_write_allowed(tenant_id));

-- ============================================================
-- ✅ بعد تشغيل الملف ده: Regression لازم يتأكد فيه:
--   1. مكتب عادي (active/grace/تجربة يوم 1-14) — استعادة باك أب
--      (upsert على profiles) لازم تفضل شغالة زي ما هي تمامًا.
--   2. مكتب readonly/locked — محاولة استعادة باك أب لازم تترفض على
--      مستوى الداتابيز كمان (مش بس رسالة المنع فى الواجهة اللي
--      اتضافت قبل كده) — upsert على profiles يرجع الخطأ المتوقع.
--   3. heartbeat.ts (تحديث last_seen) لمستخدم فى مكتب readonly/locked
--      لازم يفشل بصمت (زي ما هو متوقع ومقبول) من غير أي تأثير على
--      باقي الشاشة أو رسائل خطأ ظاهرة للمستخدم.
--   4. SELECT على profiles (تسجيل الدخول، useAuthProfile.ts، عرض
--      المستخدمين فى لوحة الأدمن) مش متأثر خالص — الـRESTRICTIVE هنا
--      مربوطة بـINSERT/UPDATE بس.
-- ============================================================
