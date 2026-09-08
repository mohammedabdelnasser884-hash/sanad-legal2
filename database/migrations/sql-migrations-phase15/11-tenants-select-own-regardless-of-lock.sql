-- ============================================================
-- 15-11 — قراءة صف tenants الخاص بالمستخدم مضمونة حتى لو المكتب "locked"
-- ============================================================
-- ⚠️ السبب: policy الحالية الوحيدة على SELECT في جدول tenants
-- (`users_see_own_tenant`) متكلة بالكامل على current_tenant_id()،
-- والدالة دي بترجع NULL عمدًا لما حالة المكتب تبقى 'locked' (C5).
-- يعني وقت القفل الكامل بالظبط — اللحظة اللي شاشة القفل (E4) والبانر
-- (E1) محتاجين فيها يقرو subscription_due_at/status/trial_ends_at
-- عشان يعرفوا سبب القفل ويعرضوه للمستخدم — القراءة نفسها بترفض.
--
-- الحل: دالة جديدة بتجيب tenant_id من صف profiles بتاع المستخدم
-- الحالي مباشرة (زي profiles_select تمامًا: user_id = auth.uid()،
-- من غير أي شرط مرتبط بحالة القفل)، و policy إضافية PERMISSIVE
-- جديدة بتتجمع بـ OR مع القاعدة الموجودة.
--
-- الأثر: القراءة (SELECT) بس. صفر تأثير على منطق الكتابة
-- (tenant_write_allowed) أو القفل الكامل (current_tenant_id) —
-- الاتنين فاضلين زي ما هما بالظبط. مفيش أي policy موجودة بتتلمس
-- أو بتتعدّل، بس إضافة PERMISSIVE جديدة (بتتجمع بـ OR).
-- ============================================================

-- ── دالة: تجيب tenant_id بتاع المستخدم الحالي من بروفايله مباشرة ──
-- (بدون أي شرط خاص بحالة الاشتراك/القفل — نفس فلسفة profiles_select)
CREATE OR REPLACE FUNCTION public.own_tenant_id_unconditional()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid();
$$;

-- ── Policy إضافية (PERMISSIVE) على tenants SELECT ──
-- بتتجمع بـ OR مع users_see_own_tenant الموجودة، فبتضيف مسار قراءة
-- بديل مش متكل على current_tenant_id() (اللي بترجع NULL وقت locked).
CREATE POLICY "tenants_select_own_regardless_of_lock"
ON public.tenants
FOR SELECT
USING (id = public.own_tenant_id_unconditional());

-- ============================================================
-- بعد التشغيل: مفيش أي سلوك حالي بيتغيّر لمستخدم مش مقفول (القاعدة
-- الأصلية already بتسمحله). الفرق الوحيد: مستخدم في مكتب "locked"
-- هيقدر دلوقتي يقرا صف مكتبه (SELECT بس) بدل الرفض الكامل. اختبار
-- سريع بعد التشغيل: مستخدم في مكتب تجريبي/سماح عادي لسه شغال زي
-- الأول، ومستخدم (لو موجود) في مكتب locked فعليًا يقدر يقرا صف
-- tenants بتاعه (مش يعدّله — الكتابة لسه ممنوعة).
-- ============================================================
