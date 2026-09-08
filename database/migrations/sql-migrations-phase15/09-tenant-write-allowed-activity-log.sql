-- ============================================================
-- 15-09 (C3 — البند المفتوح) — تطبيق tenant_write_allowed() على activity_log
-- ============================================================
-- القرار (تأكدت منك): activity_log هيتقفل زي باقي الجداول — نفس آلية
-- tenant_write_allowed()، بدل ما يفضل بلا قفل. يعني وقت read-only
-- (فترة سماح/تجربة مشاهدة/قفل)، سجل النشاط نفسه مش هيتسجل هو كمان،
-- زي أي جدول تشغيلي تاني في النظام — أبسط وأكثر اتساقًا.
--
-- نفس الأسلوب بالظبط زي الدفعات التلاتة اللي فاتت: RESTRICTIVE policy
-- إضافية على INSERT بس (activity_log مفيهوش UPDATE/DELETE policies
-- أصلاً — سجل النشاط INSERT-only بطبيعته)، صفر لمس للـpolicy الموجودة
-- ("authenticated_can_insert_activity").
--
-- ⚠️ فرق واحد عن باقي الجداول: tenant_id على activity_log NULLABLE
-- (سجلات قديمة قبل migration الـtenant_id، أو أي مسار كتابة مستقبلي
-- من غير tenant واضح). tenant_write_allowed(NULL) بترجع NULL (مفيش
-- صف في tenants بـ id = NULL)، والـWITH CHECK بيتعامل مع NULL كفشل
-- (يرفض الإدراج) — عشان كده لازم نسمح صراحةً بحالة tenant_id IS NULL
-- (زي ما كانت شغالة قبل الميجريشن ده)، ونطبّق القفل بس لما tenant_id
-- موجود فعليًا.
-- ============================================================

DROP POLICY IF EXISTS "tenant_write_allowed_activity_log_insert" ON public.activity_log;
CREATE POLICY "tenant_write_allowed_activity_log_insert"
  ON public.activity_log AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    tenant_id IS NULL
    OR public.tenant_write_allowed(tenant_id)
  );

-- ============================================================
-- ✅ بعد تشغيل الملف ده: C3 بالكامل يبقى خلص (13+1 من 14 جدول، زي
-- ما اتفقنا). خطوة C6 (Regression) بعد كده على كل الدفعات الأربعة
-- سوا قبل أي اعتماد نهائي، ثم D1-D5 (بوابة الإدارة).
--
-- اختبار C6 خاص بالملف ده: مكتب read-only (تجربة يوم 15+ أو باقة
-- متأخرة) — حاول تعمل أي عملية بتسجل نشاط (مثلاً تعديل قضية، هتترفض
-- هي نفسها من C3 السابقة، بس جرّب INSERT مباشر لـactivity_log لو
-- ينفع) وتأكد إنها بترفض. مكتب active عادي — تأكد إن سجل النشاط لسه
-- بيتسجل عادي زي قبل الميجريشن (إضافة/تعديل قضية، دفعة، إلخ).
-- ============================================================
