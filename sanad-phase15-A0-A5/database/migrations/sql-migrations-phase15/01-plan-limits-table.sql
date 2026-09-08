-- ============================================================
-- 15-01 (A1) — جدول plan_limits: مصدر واحد لحدود كل باقة
-- ملحوظة: A0 (رجوع خيار "تجربة" وقت التسجيل) اتأكد إنه موجود فعلاً
-- في الكود الحالي (offices-portal.html + saas-admin/index.ts) —
-- status='trial' + subscription_plan افتراضي 'lawyer' + trial_ends_at
-- بيتحسب تلقائيًا. مفيش تعديل كود مطلوب لـA0، القرار كان تأكيد فقط.
-- ============================================================
-- نفس فلسفة PLANS array في offices-portal.html: أي تعديل حد
-- مستقبلي (عدد قضايا/محامين/بوابة موكل) يتعمل في صف واحد هنا،
-- وتُقرأ منه الـ triggers مباشرة (B1-B3) بدل أرقام Hardcoded
-- متكررة في كذا مكان.
--
-- max_* = NULL يعني "بلا حد" (unlimited)، مش صفر.
-- key='trial' مستقلة تمامًا عن subscription_plan (تجربة مش قيمة
-- enum باقة، هي status='trial' منفصلة — راجع تقرير المرحلة 15).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_key                   text PRIMARY KEY,
  label_ar                   text NOT NULL,
  monthly_price_egp          numeric,              -- NULL لباقة التجربة (مش مدفوعة)
  max_users                  integer,              -- إجمالي كل الحسابات (admin/lawyer/viewer) — NULL = بلا حد
  max_active_cases           integer,              -- القضايا النشطة بس (deleted_at IS NULL) — NULL = بلا حد
  max_client_portal_accounts integer,              -- client_portal_pins.is_active = true — NULL = بلا حد
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);

INSERT INTO public.plan_limits
  (plan_key, label_ar, monthly_price_egp, max_users, max_active_cases, max_client_portal_accounts)
VALUES
  ('lawyer',     'باقة المحامي',   250,  1,  50,   10),
  ('office',     'باقة المكاتب',   400,  5,  NULL, 50),
  ('enterprise', 'باقة المؤسسية', 1000, 15,  NULL, NULL),
  ('trial',      'تجربة مجانية',  NULL,  1,  30,   5)
ON CONFLICT (plan_key) DO UPDATE SET
  label_ar                   = EXCLUDED.label_ar,
  monthly_price_egp          = EXCLUDED.monthly_price_egp,
  max_users                  = EXCLUDED.max_users,
  max_active_cases           = EXCLUDED.max_active_cases,
  max_client_portal_accounts = EXCLUDED.max_client_portal_accounts,
  updated_at                 = now();

-- قراءة فقط لكل مستخدم مسجّل دخول (الحدود نفسها مش سرّية، وكل الـ
-- triggers/الفرونت إند محتاجين يقروها). الكتابة تفضل عن طريق SQL
-- Editor يدويًا فقط دلوقتي (مفيش واجهة تعديل حدود من بوابة الإدارة
-- في نطاق المرحلة دي).
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_read_plan_limits" ON public.plan_limits;
CREATE POLICY "authenticated_can_read_plan_limits"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (true);
