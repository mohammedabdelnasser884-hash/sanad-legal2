-- ============================================================
-- 15-04 (B1→B6) — إنفاذ فعلي لحدود الباقات (plan_limits) عبر Triggers
-- ============================================================
-- الخلفية: حدود الباقات (عدد القضايا/المحامين/بوابة الموكل) كانت
-- نصوص عرض بس في offices-portal.html، مفيش إنفاذ حقيقي في الكود.
-- الملف ده بيضيف الإنفاذ على مستوى قاعدة البيانات نفسها (مش فرونت
-- إند بس)، عشان مينفعش يتخطى حتى لو الطلب راح مباشرة للـ API.
--
-- المصدر الوحيد للحدود = جدول plan_limits (A1). أي تعديل حد
-- مستقبلي يتعمل هناك بس، والـ triggers هنا بتقرا منه، مفيش أرقام
-- Hardcoded هنا خالص.
--
-- INSERT triggers (B1-B3): بتمنع "إضافة عنصر جديد" لو العدد الحالي
-- (قبل الإضافة) وصل للحد.
-- UPDATE triggers (B4-B6): بتمنع "رجوع لنشط" (استرجاع من الأرشيف /
-- تفعيل حساب / تفعيل بوابة موكل) لو نفس الحد وصل بالظبط.
-- ============================================================

-- ── دالة مشتركة: باقة المكتب الحالية (مفتاح plan_limits) ──
-- تجربة (status='trial') بتستخدم مفتاح 'trial' المستقل، غير كده
-- بترجع subscription_plan العادية. مفيش فحص انتهاء تجربة هنا —
-- ده شغل current_tenant_id() (منع دخول كامل)، مش شغل الدالة دي.
CREATE OR REPLACE FUNCTION public.tenant_plan_key(p_tenant_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN t.status = 'trial' THEN 'trial' ELSE t.subscription_plan::text END
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
$$;

-- ============================================================
-- B1 — حد القضايا النشطة (cases) — BEFORE INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_case_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW; -- مفيش تينانت نقيس عليه، سيبها لقيود تانية تتعامل معاها
  END IF;

  v_plan := public.tenant_plan_key(NEW.tenant_id);
  SELECT max_active_cases INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW; -- باقة غير معروفة (فيل-أوبن) أو بلا حد (NULL = unlimited)
  END IF;

  SELECT count(*) INTO v_count
  FROM public.cases
  WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'وصلت للحد الأقصى لعدد القضايا النشطة (%) في باقتك الحالية. رقّي الباقة لإضافة قضايا جديدة.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_CASES';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_limit ON public.cases;
CREATE TRIGGER trg_enforce_case_limit
  BEFORE INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_case_limit();

-- ============================================================
-- B2 — حد إجمالي الحسابات (profiles، كل الأدوار سوا) — BEFORE INSERT
-- ============================================================
-- "حد المحامين" = إجمالي كل الحسابات النشطة (admin/lawyer/viewer)
-- بأي دور — قرار محسوم في التقرير. حساب جديد بيتعمله is_active=false
-- (نادر، لكن ممكن) مبيتحسبش على الحد لحد ما يتفعّل (B5).
CREATE OR REPLACE FUNCTION public.enforce_profile_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.is_active IS FALSE THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_plan_key(NEW.tenant_id);
  SELECT max_users INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE tenant_id = NEW.tenant_id AND is_active IS TRUE;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'وصلت للحد الأقصى لعدد الحسابات (%) في باقتك الحالية. رقّي الباقة لإضافة مستخدمين جدد.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_USERS';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_limit ON public.profiles;
CREATE TRIGGER trg_enforce_profile_limit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_limit();

-- ============================================================
-- B3 — حد حسابات بوابة الموكل (client_portal_pins) — BEFORE INSERT
-- ============================================================
-- الجدول ده معندوش tenant_id مباشر — لازم نوصله عن طريق
-- clients.tenant_id (قرار محسوم: الجدول الفعلي client_portal_pins،
-- الوصلة عن طريق client_id).
CREATE OR REPLACE FUNCTION public.enforce_portal_pin_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan      text;
  v_limit     integer;
  v_count     integer;
BEGIN
  IF NEW.is_active IS NOT TRUE THEN
    RETURN NEW; -- صف غير نشط مبيتحسبش على الحد أصلاً
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.clients WHERE id = NEW.client_id;
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_plan_key(v_tenant_id);
  SELECT max_client_portal_accounts INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.client_portal_pins cpp
  JOIN public.clients c ON c.id = cpp.client_id
  WHERE c.tenant_id = v_tenant_id AND cpp.is_active IS TRUE;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'وصلت للحد الأقصى لحسابات بوابة الموكل (%) في باقتك الحالية. رقّي الباقة لتفعيل حسابات جديدة.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_PORTAL';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_portal_pin_limit ON public.client_portal_pins;
CREATE TRIGGER trg_enforce_portal_pin_limit
  BEFORE INSERT ON public.client_portal_pins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portal_pin_limit();

-- ============================================================
-- B4 — منع استرجاع قضية من الأرشيف لو تجاوز الحد — BEFORE UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_case_limit_on_restore()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  -- بس لو فعليًا بترجع من مؤرشفة (OLD.deleted_at كان له قيمة) لنشطة (NEW.deleted_at بقى NULL)
  IF OLD.deleted_at IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_plan_key(NEW.tenant_id);
  SELECT max_active_cases INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.cases
  WHERE tenant_id = NEW.tenant_id AND deleted_at IS NULL AND id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'مينفعش تسترجع القضية دي — وصلت للحد الأقصى لعدد القضايا النشطة (%) في باقتك الحالية. رقّي الباقة أو أرشف قضية تانية الأول.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_CASES';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_case_limit_on_restore ON public.cases;
CREATE TRIGGER trg_enforce_case_limit_on_restore
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_case_limit_on_restore();

-- ============================================================
-- B5 — منع تفعيل حساب (profiles.is_active false→true) لو تجاوز الحد — BEFORE UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_profile_limit_on_activate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan  text;
  v_limit integer;
  v_count integer;
BEGIN
  IF OLD.is_active IS TRUE OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW; -- مش تفعيل جديد (false→true)
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_plan_key(NEW.tenant_id);
  SELECT max_users INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.profiles
  WHERE tenant_id = NEW.tenant_id AND is_active IS TRUE AND id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'مينفعش تفعّل الحساب ده — وصلت للحد الأقصى لعدد الحسابات (%) في باقتك الحالية. رقّي الباقة أو عطّل حساب تاني الأول.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_USERS';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_limit_on_activate ON public.profiles;
CREATE TRIGGER trg_enforce_profile_limit_on_activate
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_limit_on_activate();

-- ============================================================
-- B6 — منع تفعيل بوابة موكل (client_portal_pins.is_active false→true) لو تجاوز الحد — BEFORE UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_portal_pin_limit_on_activate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_plan      text;
  v_limit     integer;
  v_count     integer;
BEGIN
  IF OLD.is_active IS TRUE OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.clients WHERE id = NEW.client_id;
  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := public.tenant_plan_key(v_tenant_id);
  SELECT max_client_portal_accounts INTO v_limit FROM public.plan_limits WHERE plan_key = v_plan;
  IF NOT FOUND OR v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.client_portal_pins cpp
  JOIN public.clients c ON c.id = cpp.client_id
  WHERE c.tenant_id = v_tenant_id AND cpp.is_active IS TRUE AND cpp.id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'مينفعش تفعّل بوابة الموكل دي — وصلت للحد الأقصى لحسابات بوابة الموكل (%) في باقتك الحالية. رقّي الباقة أو عطّل حساب بوابة تاني الأول.', v_limit
      USING ERRCODE = 'P0001', HINT = 'PLAN_LIMIT_PORTAL';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_portal_pin_limit_on_activate ON public.client_portal_pins;
CREATE TRIGGER trg_enforce_portal_pin_limit_on_activate
  BEFORE UPDATE ON public.client_portal_pins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portal_pin_limit_on_activate();

-- ============================================================
-- ملحوظة تشغيل: كل الـtriggers دي SECURITY DEFINER عشان تقدر تقرا
-- plan_limits/tenants/clients بغض النظر عن RLS بتاعة اليوزر الحالي.
-- الرسائل بترمي Postgres exception عادي (مش JSON منسّق) — الـmapper
-- بتاع E2/E3 (لسه لم يبدأ) هو اللي هيترجمها لتوست عربي واضح في
-- الفرونت إند، بنفس فكرة الـHINT (PLAN_LIMIT_CASES/USERS/PORTAL)
-- المضاف هنا عشان يبقى سهل التعرف عليه برمجيًا لاحقًا.
-- ============================================================
