-- ============================================================
-- 15-17 (خطة المدفوعات والفواتير — المرحلة B، 10 سبتمبر 2026)
-- دالة next_tenant_invoice_number() — RPC لتوليد رقم الفاتورة
-- التسلسلي العام من الـsequence اللي اتعمل في ميجريشن 16
-- ============================================================
-- ليه محتاجين الميجريشن ده تحديدًا (تفصيلة تقنية لسه ملحوظة في
-- خطة المرحلة A نفسها): فانكشن saas-admin بتتكلم مع الداتابيز عن
-- طريق PostgREST REST API بس (نفس أي فانكشن تانية في المشروع)،
-- ومفيش وصول لتشغيل SQL خام (زي SELECT nextval(...)) منها مباشرة.
-- الحل المتبع بالفعل في نفس المشروع لحالة مشابهة تمامًا (فواتير
-- الأتعاب الداخلية لكل مكتب): دالة plpgsql بـSECURITY DEFINER
-- بتتنادى عن طريق /rest/v1/rpc/<اسم الدالة> — نفس نمط
-- generate_invoice_number(p_tenant_id) الموجودة فعلاً
-- (database/migrations/sql-migrations-phase2/06b-create-new-invoices.sql).
-- الفرق هنا: مفيش tenant_id باراميتر خالص لأن السلسلة عامة لكل
-- النظام (جيمي/سَند كمزوّد خدمة واحد)، مش لكل مكتب.
--
-- الصيغة: 'INV-' + الرقم مبطّن بأصفار لـ4 خانات (INV-0001،
-- INV-0002، ...). لو الرقم عدّى 9999 يوم ما، هيطول تلقائيًا
-- (INV-10000) من غير أي مشكلة — lpad مبيقصّش، بس بيكمل الطول
-- الأصلي أو أكتر.
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_tenant_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_next bigint;
BEGIN
    v_next := nextval('public.tenant_invoice_number_seq');
    RETURN 'INV-' || lpad(v_next::text, 4, '0');
END;
$$;

-- تنفيذ الدالة مسموح بيه لدور service_role بس (نفس الفانكشن اللي
-- بتستخدمه هو saas-admin عبر SUPABASE_SERVICE_ROLE_KEY) — مش عام
-- لأي مستخدم موثّق عادي، لأن ده رقم فواتير SaaS-admin مش جزء من
-- تطبيق سند العادي.
REVOKE ALL ON FUNCTION public.next_tenant_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_tenant_invoice_number() TO service_role;
