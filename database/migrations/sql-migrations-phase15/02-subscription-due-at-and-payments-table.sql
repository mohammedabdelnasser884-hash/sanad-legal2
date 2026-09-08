-- ============================================================
-- 15-02 (A2 + A3) — subscription_due_at + tenant_subscription_payments
-- ============================================================
-- A2: عمود جديد على tenants — ميعاد التجديد القادم للباقات المدفوعة.
--     منفصل عن trial_ends_at الموجود لأن منطق القفل مختلف تمامًا:
--     trial_ends_at → قفل كامل مباشر بعد يوم 30 (مع مرحلة مشاهدة
--     15→30). subscription_due_at → 7 أيام سماح ثم 60 يوم read-only
--     ثم قفل كامل (تفاصيل في C1/C2 — لسه لم يبدأ، ده بس العمود).
--
-- A3: أرشيف كل عملية تأكيد دفع يدوي (نقدي/فودافون كاش) يعملها
--     الأدمن (جيمي) من بوابة إدارة المكاتب. مش لازمة لحساب أي منطق
--     قفل — للمراجعة والأرشيف بس (+ أساس لزرار "تراجع عن آخر تأكيد
--     دفع"، D4، لاحقًا).
-- ============================================================

-- ── A2 ──
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_due_at timestamptz;

COMMENT ON COLUMN public.tenants.subscription_due_at IS
  'ميعاد التجديد القادم للباقة المدفوعة (منفصل عن trial_ends_at). NULL = لسه متحسبش (مكتب تجريبي، أو قبل تشغيل A4/A5).';

-- ── A3 ──
CREATE TABLE IF NOT EXISTS public.tenant_subscription_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan           text NOT NULL,                -- الباقة وقت الدفع (lawyer/office/enterprise)
  amount_egp     numeric NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'vodafone_cash')),
  period_start   timestamptz NOT NULL,
  period_end     timestamptz NOT NULL,          -- = subscription_due_at الجديد وقت الدفع ده
  confirmed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- السوبر أدمن اللي أكّد
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_payments_tenant_id
  ON public.tenant_subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscription_payments_created_at
  ON public.tenant_subscription_payments(created_at DESC);

-- RLS: الجدول ده بيتقرا/يتكتب بس عن طريق saas-admin Edge Function
-- (اللي بتستخدم service role، بتتخطى RLS أصلاً) — مفيش أي مستخدم
-- تطبيق عادي (lawyer/viewer/admin مكتب) المفروض يشوف مدفوعات مكتب
-- تاني، فبنقفل الجدول تمامًا قدام anon/authenticated العاديين.
ALTER TABLE public.tenant_subscription_payments ENABLE ROW LEVEL SECURITY;
-- عمدًا مفيش أي policy مضافة — service role بس (تتخطى RLS) يقدر
-- يوصل للجدول ده. لو احتجنا لاحقًا نعرض سجل الدفعات جوه تطبيق سند
-- نفسه لدور admin، هتتضاف policy مخصصة وقتها.
